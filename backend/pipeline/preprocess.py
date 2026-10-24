"""
Branch B Preprocessing Module (Guide §7).

Implements the deterministic raster page preprocessing pipeline:
- Raster rendering / DPI / long-edge constraints
- Grayscale conversion
- Level L1: Color overlay / colored-ink removal (HSV saturation filter)
- Background division (flattens shadows and faint watermarks)
- Light-ink smooth ramp LUT
- Bilateral filtering (preserves stroke edges)
- Mild CLAHE (contrast enhancement)
- Single-rotation deskew (projection profile on downscaled Otsu)
- Strict 3x3 coordinate matrix composition (source px -> preprocessed px)
- Inverse bounding box mapping (preprocessed 0..1 -> original 0..1)
- Watermark detection (detect_only by default; candidate tracking)
"""

import math
from typing import Any
import cv2
import numpy as np


def rotate_keep_all(img: np.ndarray, angle: float, fill: int = 255) -> tuple[np.ndarray, np.ndarray]:
    """
    Rotate without cropping; returns (rotated_image, 3x3 forward matrix: source px -> output px).
    Strictly follows Guide §7.2.
    """
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
    cos = abs(M[0, 0])
    sin = abs(M[0, 1])
    nw = int(h * sin + w * cos)
    nh = int(h * cos + w * sin)
    M[0, 2] += (nw / 2.0) - (w / 2.0)
    M[1, 2] += (nh / 2.0) - (h / 2.0)
    
    rotated = cv2.warpAffine(
        img, M, (nw, nh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=fill
    )
    M_3x3 = np.vstack([M, [0.0, 0.0, 1.0]])
    return rotated, M_3x3


def map_bbox_to_source(b: list[float], meta: dict[str, Any]) -> list[float]:
    """
    bbox normalised on the PREPROCESSED raster -> bbox normalised on the ORIGINAL page raster (top-left origin).
    Strictly follows Guide §7.2.
    """
    W, H = meta["out_px"]
    inv = np.array(meta["M_inv"], dtype=np.float64)
    sw, sh = meta["pre_px"]
    
    # 4 corners in preprocessed pixel coordinates: top-left, top-right, bottom-right, bottom-left
    pts = np.array([
        [b[0] * W, b[1] * H, 1.0],
        [b[2] * W, b[1] * H, 1.0],
        [b[2] * W, b[3] * H, 1.0],
        [b[0] * W, b[3] * H, 1.0]
    ], dtype=np.float64).T
    
    src = inv @ pts
    xs = np.clip(src[0] / max(1.0, float(sw)), 0.0, 1.0)
    ys = np.clip(src[1] / max(1.0, float(sh)), 0.0, 1.0)
    
    return [
        round(float(xs.min()), 4),
        round(float(ys.min()), 4),
        round(float(xs.max()), 4),
        round(float(ys.max()), 4)
    ]


def estimate_skew(gray: np.ndarray, max_angle: float = 12.0) -> float:
    """
    Estimate skew angle via projection-profile on a downscaled Otsu image (borders trimmed 3%).
    Coarse sweep +-12° at 1° steps, then fine sweep +-1° at 0.1° steps.
    If the estimate lands on +-max_angle, treat as unreliable and return 0.0 (Guide §7.2).
    """
    h, w = gray.shape[:2]
    if h < 50 or w < 50:
        return 0.0

    # Trim 3% borders to remove scan margins
    y_trim = int(h * 0.03)
    x_trim = int(w * 0.03)
    cropped = gray[y_trim:h - y_trim, x_trim:w - x_trim]
    if cropped.size == 0:
        return 0.0

    # Downscale for performance
    target_w = 600
    if cropped.shape[1] > target_w:
        scale = target_w / cropped.shape[1]
        downscaled = cv2.resize(cropped, (target_w, int(cropped.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    else:
        downscaled = cropped

    # Otsu binarization (inverted: text is white/1, background is black/0)
    _, binary = cv2.threshold(downscaled, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Coarse search
    best_coarse = 0.0
    best_var = -1.0
    for a in range(-int(max_angle), int(max_angle) + 1):
        angle = float(a)
        M = cv2.getRotationMatrix2D((downscaled.shape[1] / 2.0, downscaled.shape[0] / 2.0), angle, 1.0)
        rotated = cv2.warpAffine(binary, M, (downscaled.shape[1], downscaled.shape[0]), flags=cv2.INTER_NEAREST)
        proj = np.sum(rotated, axis=1, dtype=np.float64)
        v = float(np.var(proj))
        if v > best_var:
            best_var = v
            best_coarse = angle

    # Check boundary condition: if estimate lands on +-max_angle, treat as unreliable (skip deskew)
    if abs(best_coarse) >= max_angle:
        return 0.0

    # Fine search around best_coarse +-1° at 0.1° intervals
    best_angle = best_coarse
    for step in range(-10, 11):
        angle = best_coarse + step * 0.1
        if abs(angle) > max_angle:
            continue
        M = cv2.getRotationMatrix2D((downscaled.shape[1] / 2.0, downscaled.shape[0] / 2.0), angle, 1.0)
        rotated = cv2.warpAffine(binary, M, (downscaled.shape[1], downscaled.shape[0]), flags=cv2.INTER_NEAREST)
        proj = np.sum(rotated, axis=1, dtype=np.float64)
        v = float(np.var(proj))
        if v > best_var:
            best_var = v
            best_angle = angle

    if abs(best_angle) >= max_angle:
        return 0.0

    return round(best_angle, 2)


def detect_color_overlay(bgr: np.ndarray) -> bool:
    """Detect presence of strong colored ink (stamps, signatures) using HSV saturation."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    colored_pixels = np.count_nonzero(sat > 60)
    ratio = colored_pixels / max(1, (bgr.shape[0] * bgr.shape[1]))
    return ratio > 0.015


def detect_uneven_background(gray: np.ndarray) -> bool:
    """Detect shadows or uneven lighting across page quadrants."""
    h, w = gray.shape[:2]
    q1 = np.mean(gray[:h // 2, :w // 2])
    q2 = np.mean(gray[:h // 2, w // 2:])
    q3 = np.mean(gray[h // 2:, :w // 2])
    q4 = np.mean(gray[h // 2:, w // 2:])
    diff = max(q1, q2, q3, q4) - min(q1, q2, q3, q4)
    return diff > 35.0


def remove_colored_ink(bgr: np.ndarray) -> np.ndarray:
    """Filter colored ink (blue/red stamps, signatures) to white on the derived copy."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]
    # Highlight colored regions (sat > 50 and not extremely dark black strokes)
    mask = (sat > 50) & (val > 40)
    out = bgr.copy()
    out[mask] = [255, 255, 255]
    return out


def background_division(gray: np.ndarray) -> np.ndarray:
    """Flatten shadows and uneven lighting by dividing through morphological background."""
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    dilated = cv2.dilate(gray, kernel)
    bg = cv2.medianBlur(dilated, 21)
    divided = cv2.divide(gray, bg, scale=255)
    return divided


def apply_light_ink_lut(gray: np.ndarray) -> np.ndarray:
    """Smooth ramp LUT to lift light ink without harsh threshold halos."""
    lut = np.zeros(256, dtype=np.uint8)
    for i in range(256):
        if i < 40:
            lut[i] = int(i * 0.8)
        elif i < 180:
            # Smooth S-curve boost
            lut[i] = int(min(255, i * 1.05))
        else:
            lut[i] = int(min(255, 180 + (i - 180) * 1.15))
    return cv2.LUT(gray, lut)


def detect_watermark_candidates(bgr: np.ndarray) -> list[dict[str, Any]]:
    """
    Detect faint watermark candidates on page raster (Guide §7.3).
    Default watermark mode is detect_only.
    """
    candidates = []
    # Check for large low-opacity or faint text regions
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY) if len(bgr.shape) == 3 else bgr
    faint_mask = (gray > 190) & (gray < 240)
    ratio = np.count_nonzero(faint_mask) / max(1, gray.size)
    if ratio > 0.10:
        candidates.append({
            "type": "candidate_faint_overlay",
            "coverage_ratio": round(float(ratio), 4),
            "action": "detected_not_removed"
        })
    return candidates


def preprocess_raster_page(
    bgr: np.ndarray,
    dpi: int = 300,
    requested_level: str | None = None,
) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Execute Branch B preprocessing on a single page raster (Guide §7.1).
    Input: one page raster (BGR uint8) + dpi + level (L0/L1).
    Output: (gray raster uint8, meta dict) where meta contains:
      {
        "level": 0 or 1,
        "dpi": dpi,
        "steps": list of applied transform step names,
        "pre_px": [sw, sh],
        "out_px": [W, H],
        "deskew_deg": float,
        "M": 3x3 matrix list,
        "M_inv": 3x3 inverse matrix list,
        "watermarks": candidate records
      }
    """
    sh, sw = bgr.shape[:2]
    M_total = np.eye(3, dtype=np.float64)
    steps = ["original_raster"]
    
    # Check photo upscale/downscale rules
    cur_img = bgr
    long_edge = max(sw, sh)
    if long_edge > 4200:
        scale = 4200.0 / long_edge
        nw, nh = int(sw * scale), int(sh * scale)
        cur_img = cv2.resize(cur_img, (nw, nh), interpolation=cv2.INTER_AREA)
        S_scale = np.array([
            [scale, 0.0, 0.0],
            [0.0, scale, 0.0],
            [0.0, 0.0, 1.0]
        ], dtype=np.float64)
        M_total = S_scale @ M_total
        steps.append("downscale_long_edge_4200")

    # Determine processing level L0 vs L1
    color_overlay = detect_color_overlay(cur_img)
    uneven_bg = False
    gray_initial = cv2.cvtColor(cur_img, cv2.COLOR_BGR2GRAY) if len(cur_img.shape) == 3 else cur_img
    uneven_bg = detect_uneven_background(gray_initial)
    
    if requested_level == "L1" or (requested_level is None and (color_overlay or uneven_bg)):
        level = 1
    else:
        level = 0

    watermarks = detect_watermark_candidates(cur_img)

    # 1. Color ink removal (if color overlay present and level == 1)
    if level == 1 and color_overlay and len(cur_img.shape) == 3:
        cur_img = remove_colored_ink(cur_img)
        steps.append("remove_colored_ink_hsv")

    # 2. Gray 8-bit conversion
    if len(cur_img.shape) == 3:
        gray = cv2.cvtColor(cur_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = cur_img.copy()
    steps.append("gray_8bit")

    # 3. L1 enhancements
    if level == 1:
        if uneven_bg:
            gray = background_division(gray)
            steps.append("background_division")
            gray = apply_light_ink_lut(gray)
            steps.append("light_ink_lut")
        
        # Bilateral filter to smooth background noise while keeping sharp edges
        gray = cv2.bilateralFilter(gray, d=5, sigmaColor=75, sigmaSpace=75)
        steps.append("bilateral_filter_d5")
        
        # Check contrast for mild CLAHE
        min_v, max_v = int(np.min(gray)), int(np.max(gray))
        if (max_v - min_v) < 160:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            gray = clahe.apply(gray)
            steps.append("clahe_mild")

    # 4. Deskew: estimate angle on cleaned gray image
    skew_angle = estimate_skew(gray)
    deskew_deg = 0.0
    if abs(skew_angle) >= 0.5:
        gray, M_rot = rotate_keep_all(gray, skew_angle, fill=255)
        M_total = M_rot @ M_total
        deskew_deg = skew_angle
        steps.append(f"deskew_rotate_{deskew_deg}deg")

    out_h, out_w = gray.shape[:2]
    M_inv = np.linalg.inv(M_total)

    meta = {
        "level": level,
        "dpi": dpi,
        "steps": steps,
        "pre_px": [int(sw), int(sh)],
        "out_px": [int(out_w), int(out_h)],
        "deskew_deg": deskew_deg,
        "M": M_total.tolist(),
        "M_inv": M_inv.tolist(),
        "watermarks": watermarks
    }

    return gray, meta
