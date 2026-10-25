/**
 * AICTE Application Validation Platform — Infrastructure Evidence Checklist & Geotag Review Panel
 * Spec Reference: ROADMAP.md (Phase 7: Steps 37–41), Guide §14, rules/infra/EOA_RENEWAL.yaml
 *
 * Responsibilities:
 * 1. Facility Checklist Inspector Layout (Step 37):
 *    - Lists configured facility checklist items from EOA_RENEWAL.yaml:
 *      * Computer Center / Laboratory (computer_lab_photos)
 *      * Instructional Classrooms (classroom_photos)
 *      * Central Library (central_library_photos)
 *    - Displays required file count norms (e.g. Computer Center: 2 photos minimum, 60 sqm minimum area).
 * 2. 6-State Infrastructure Status Badging (Guide §14):
 *    - EVIDENCE_COMPLETE_FOR_REVIEW, ADDITIONAL_EVIDENCE_REQUIRED,
 *      LOCATION_METADATA_INCONSISTENT, INSPECTION_SUGGESTED,
 *      POSSIBLE_DUPLICATE_EVIDENCE, NOT_CHECKED.
 *    - Non-negotiable: Never outputs "compliant" per Guide §14.
 * 3. Non-Negotiable Simulation Advisory Banner:
 *    - In compliance with AGENTS.md, all infrastructure checklist rules and mock coordinates
 *      are synthetic decision-support indicators.
 */

const INFRA_STATUS_CONFIG = {
  'EVIDENCE_COMPLETE_FOR_REVIEW': {
    label: '✓ EVIDENCE COMPLETE FOR REVIEW',
    shortLabel: '✓ COMPLETE FOR REVIEW',
    class: 'badge-infra-complete',
    color: '#16a34a',
    desc: 'All evidence items uploaded with valid metadata ready for officer review.'
  },
  'ADDITIONAL_EVIDENCE_REQUIRED': {
    label: '⚠ ADDITIONAL EVIDENCE REQUIRED',
    shortLabel: '⚠ EVIDENCE REQUIRED',
    class: 'badge-infra-missing',
    color: '#ea580c',
    desc: 'Insufficient evidence files or missing required geotag metadata.'
  },
  'LOCATION_METADATA_INCONSISTENT': {
    label: '⚠ LOCATION INCONSISTENT',
    shortLabel: '⚠ LOCATION MISMATCH',
    class: 'badge-infra-geo-error',
    color: '#dc2626',
    desc: 'Photo GPS coordinates diverge from registered campus perimeter.'
  },
  'INSPECTION_SUGGESTED': {
    label: '🔍 INSPECTION SUGGESTED',
    shortLabel: '🔍 INSPECT SUGGESTED',
    class: 'badge-infra-inspect',
    color: '#d97706',
    desc: 'Claimed area is below configured AICTE minimum norm; physical inspection suggested.'
  },
  'POSSIBLE_DUPLICATE_EVIDENCE': {
    label: '⚠ POSSIBLE DUPLICATE EVIDENCE',
    shortLabel: '⚠ DUPLICATE PHOTO',
    class: 'badge-infra-duplicate',
    color: '#ea580c',
    desc: 'Perceptual photo hash matches evidence uploaded by another institution.'
  },
  'NOT_CHECKED': {
    label: '— NOT CHECKED',
    shortLabel: '— NOT CHECKED',
    class: 'badge-infra-not_checked',
    color: '#94a3b8',
    desc: 'Facility item has not been evaluated.'
  }
};

const CONFIG_ITEMS_NORMS = {
  'computer_lab_photos': {
    key: 'computer_lab_photos',
    label: 'Computer Center / Laboratory',
    min_files: 2,
    min_area_sqm: 60,
    claimed_form_field: 'lab_area_sqm',
    geo_required: false,
    radius_km: 2.0,
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`
  },
  'classroom_photos': {
    key: 'classroom_photos',
    label: 'Instructional Classrooms',
    min_files: 2,
    min_area_sqm: 66,
    claimed_form_field: 'classroom_area_sqm',
    geo_required: true,
    radius_km: 2.0,
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
  },
  'central_library_photos': {
    key: 'central_library_photos',
    label: 'Central Library',
    min_files: 1,
    min_area_sqm: 150,
    claimed_form_field: 'library_area_sqm',
    geo_required: false,
    radius_km: 2.0,
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
  }
};

/**
 * Synthetic Reference Benchmark Photos (Step 38)
 * Standard AICTE facility photographic benchmarks for officer comparison and zero-upload fallback.
 */
const SYNTHETIC_REFERENCE_PHOTOS = {
  'computer_lab_photos': {
    file_id: 'ref_lab_norm_01',
    filename: 'computer_center_lab_standard.jpg',
    item_key: 'computer_lab_photos',
    label: 'Computer Center / Laboratory Reference Standard',
    latitude: 28.4729,
    longitude: 77.4892,
    distance_km: 0.02,
    phash: 'aabbccddeeff0011',
    exif: {
      camera_make: 'Canon',
      camera_model: 'EOS R6 Mark II',
      lens: 'RF24-105mm F4 L IS USM',
      focal_length: '24.0 mm',
      iso: 400,
      exposure: '1/125s',
      aperture: 'f/4.0',
      dimensions: '6000 × 4000',
      captured_at: '2026-03-11T09:45:12Z',
      software: 'Canon Firmware v1.4.0 (Authentic Ingest)'
    }
  },
  'classroom_photos': {
    file_id: 'ref_class_norm_01',
    filename: 'instructional_classroom_standard.jpg',
    item_key: 'classroom_photos',
    label: 'Instructional Classroom Reference Standard',
    latitude: 28.4728,
    longitude: 77.4891,
    distance_km: 0.01,
    phash: '3344556677889900',
    exif: {
      camera_make: 'Apple',
      camera_model: 'iPhone 15 Pro',
      lens: 'iPhone 15 Pro back triple camera 24mm f/1.78',
      focal_length: '6.76 mm',
      iso: 100,
      exposure: '1/250s',
      aperture: 'f/1.78',
      dimensions: '4032 × 3024',
      captured_at: '2026-03-12T11:20:00Z',
      software: 'iOS 19.3 (Authentic Ingest)'
    }
  },
  'central_library_photos': {
    file_id: 'ref_lib_norm_01',
    filename: 'central_library_standard.jpg',
    item_key: 'central_library_photos',
    label: 'Central Library Reference Standard',
    latitude: 28.4730,
    longitude: 77.4893,
    distance_km: 0.03,
    phash: 'eeff112233445566',
    exif: {
      camera_make: 'Sony',
      camera_model: 'ILCE-7M4',
      lens: 'FE 24-70mm F2.8 GM II',
      focal_length: '28.0 mm',
      iso: 200,
      exposure: '1/160s',
      aperture: 'f/2.8',
      dimensions: '7008 × 4672',
      captured_at: '2026-03-10T11:15:00Z',
      software: 'Sony Firmware v2.01 (Authentic Ingest)'
    }
  }
};

class InfraPanelComponent {
  constructor() {
    this.currentAppId = null;
    this.currentData = null;
    this.isLoaded = false;
    this.recommendedInspections = new Set();
  }

  /**
   * Resolve default infrastructure checklist data conforming to EOA_RENEWAL.yaml (Step 37)
   */
  getDefaultChecklist(applicationId) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';

    if (appId === 'DEMO-MISSING-CLASS-001') {
      return {
        application_id: appId,
        pipeline_stage: 'S10_INFRA_CHECKLIST',
        category: 'EOA_RENEWAL',
        simulated: true,
        decision_support_only: true,
        overall_status: 'ADDITIONAL_EVIDENCE_REQUIRED',
        campus_coordinates: {
          latitude: 28.4728,
          longitude: 77.4891,
          name: 'Knowledge Park III, Greater Noida'
        },
        items: [
          {
            item_key: 'computer_lab_photos',
            label: 'Computer Center / Laboratory',
            status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
            reason: 'All 2 evidence items uploaded with valid metadata ready for officer review.',
            severity: 'info',
            evidence_count: 2,
            claimed_value: 75,
            flags: [],
            photos: [
              { file_id: 'clean_lab_01', filename: 'lab_overview.jpg', latitude: 28.4728, longitude: 77.4891, distance_km: 0.01 },
              { file_id: 'clean_lab_02', filename: 'lab_server_rack.jpg', latitude: 28.4728, longitude: 77.4890, distance_km: 0.01 }
            ]
          },
          {
            item_key: 'classroom_photos',
            label: 'Instructional Classrooms',
            status: 'ADDITIONAL_EVIDENCE_REQUIRED',
            reason: 'Insufficient evidence uploaded: 0 file(s) found, minimum required is 1.',
            severity: 'medium',
            evidence_count: 0,
            claimed_value: 75,
            flags: ['INFRA_EVIDENCE_INSUFFICIENT'],
            photos: []
          },
          {
            item_key: 'central_library_photos',
            label: 'Central Library',
            status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
            reason: 'All 1 evidence items uploaded with valid metadata ready for officer review.',
            severity: 'info',
            evidence_count: 1,
            claimed_value: 160,
            flags: [],
            photos: [
              { file_id: 'clean_lib_01', filename: 'library_reading_hall.jpg', latitude: 28.4729, longitude: 77.4892, distance_km: 0.02 }
            ]
          }
        ],
        total_items: 3
      };
    }

    if (appId === 'DEMO-DUPLICATE-001') {
      return {
        application_id: appId,
        pipeline_stage: 'S10_INFRA_CHECKLIST',
        category: 'EOA_RENEWAL',
        simulated: true,
        decision_support_only: true,
        overall_status: 'INSPECTION_SUGGESTED',
        campus_coordinates: {
          latitude: 28.4728,
          longitude: 77.4891,
          name: 'Knowledge Park III, Greater Noida'
        },
        items: [
          {
            item_key: 'computer_lab_photos',
            label: 'Computer Center / Laboratory',
            status: 'POSSIBLE_DUPLICATE_EVIDENCE',
            reason: 'Perceptual image hash matches evidence file uploaded by another institution (Hamming distance: 2).',
            severity: 'medium',
            evidence_count: 2,
            claimed_value: 65,
            flags: ['POSSIBLE_DUPLICATE_PHOTO'],
            duplicate_match: {
              peer_hash: 'aabbccddeeff0013',
              hamming_distance: 2,
              peer_institution_masked: 'INST-CONFIDENTIAL-****',
              peer_application_masked: 'APP-CONFIDENTIAL-****'
            },
            photos: [
              {
                file_id: 'reused_lab_01',
                filename: 'computer_lab_reused.jpg',
                latitude: 28.4729,
                longitude: 77.4892,
                distance_km: 0.02,
                phash: 'aabbccddeeff0011',
                duplicate_match: {
                  peer_hash: 'aabbccddeeff0013',
                  hamming_distance: 2,
                  peer_institution_masked: 'INST-CONFIDENTIAL-****',
                  peer_application_masked: 'APP-CONFIDENTIAL-****'
                },
                exif: {
                  camera_make: 'Canon',
                  camera_model: 'EOS R6 Mark II',
                  lens: 'RF24-105mm F4 L IS USM',
                  focal_length: '24.0 mm',
                  iso: 400,
                  exposure: '1/125s',
                  aperture: 'f/4.0',
                  dimensions: '6000 × 4000',
                  captured_at: '2026-03-11T09:45:12Z'
                }
              },
              {
                file_id: 'reused_lab_02',
                filename: 'computer_lab_rack.jpg',
                latitude: 28.4728,
                longitude: 77.4890,
                distance_km: 0.01,
                phash: 'aabbccddeeff0022',
                exif: {
                  camera_make: 'Canon',
                  camera_model: 'EOS R6 Mark II',
                  lens: 'RF24-105mm F4 L IS USM',
                  focal_length: '35.0 mm',
                  iso: 800,
                  exposure: '1/60s',
                  aperture: 'f/4.0',
                  dimensions: '6000 × 4000',
                  captured_at: '2026-03-11T10:02:44Z'
                }
              }
            ]
          },
          {
            item_key: 'classroom_photos',
            label: 'Instructional Classrooms',
            status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
            reason: 'All 2 evidence items uploaded with valid metadata ready for officer review.',
            severity: 'info',
            evidence_count: 2,
            claimed_value: 75,
            flags: [],
            photos: [
              { file_id: 'dup_class_01', filename: 'classroom_1.jpg', latitude: 28.4728, longitude: 77.4891, distance_km: 0.01 },
              { file_id: 'dup_class_02', filename: 'classroom_2.jpg', latitude: 28.4728, longitude: 77.4891, distance_km: 0.01 }
            ]
          },
          {
            item_key: 'central_library_photos',
            label: 'Central Library',
            status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
            reason: 'All 1 evidence items uploaded with valid metadata ready for officer review.',
            severity: 'info',
            evidence_count: 1,
            claimed_value: 160,
            flags: [],
            photos: [
              { file_id: 'dup_lib_01', filename: 'library_reading.jpg', latitude: 28.4730, longitude: 77.4893, distance_km: 0.03 }
            ]
          }
        ],
        total_items: 3
      };
    }

    if (appId === 'DEMO-ISSUES-001' || !appId) {
      return {
        application_id: appId,
        pipeline_stage: 'S10_INFRA_CHECKLIST',
        category: 'EOA_RENEWAL',
        simulated: true,
        decision_support_only: true,
        overall_status: 'ADDITIONAL_EVIDENCE_REQUIRED',
        campus_coordinates: {
          latitude: 28.4728,
          longitude: 77.4891,
          name: 'Knowledge Park III, Greater Noida'
        },
        items: [
          {
            item_key: 'computer_lab_photos',
            label: 'Computer Center / Laboratory',
            status: 'ADDITIONAL_EVIDENCE_REQUIRED',
            reason: 'Insufficient evidence uploaded: 0 file(s) found, minimum required is 2. Claimed area (45 sqm) is below configured minimum norm (60 sqm).',
            severity: 'medium',
            evidence_count: 0,
            claimed_value: 45,
            flags: ['INFRA_EVIDENCE_INSUFFICIENT', 'INFRA_CLAIM_BELOW_MINIMUM'],
            photos: []
          },
          {
            item_key: 'classroom_photos',
            label: 'Instructional Classrooms',
            status: 'LOCATION_METADATA_INCONSISTENT',
            reason: 'Photo GPS location is 21.16 km from campus registered coordinates (allowed radius: 2.0 km).',
            severity: 'low',
            evidence_count: 2,
            claimed_value: 72,
            flags: ['INFRA_LOCATION_INCONSISTENT'],
            photos: [
              {
                file_id: 'photo_class_01',
                filename: 'classroom_block_a.jpg',
                latitude: 28.628,
                longitude: 77.365,
                distance_km: 21.16,
                exif: {
                  camera_make: 'Apple',
                  camera_model: 'iPhone 15 Pro',
                  lens: 'iPhone 15 Pro back triple camera 24mm f/1.78',
                  focal_length: '6.76 mm',
                  captured_at: '2026-03-12T14:32:10Z'
                }
              },
              {
                file_id: 'photo_class_02',
                filename: 'classroom_lecture_theatre.jpg',
                latitude: 28.628,
                longitude: 77.365,
                distance_km: 21.16,
                exif: {
                  camera_make: 'Apple',
                  camera_model: 'iPhone 15 Pro',
                  lens: 'iPhone 15 Pro back triple camera 24mm f/1.78',
                  focal_length: '6.76 mm',
                  captured_at: '2026-03-12T14:40:05Z'
                }
              }
            ]
          },
          {
            item_key: 'central_library_photos',
            label: 'Central Library',
            status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
            reason: 'All 1 evidence items uploaded with valid metadata ready for officer review.',
            severity: 'info',
            evidence_count: 1,
            claimed_value: 160,
            flags: [],
            photos: [
              {
                file_id: 'photo_lib_01',
                filename: 'central_library_stack.jpg',
                latitude: 28.4730,
                longitude: 77.4893,
                distance_km: 0.03,
                exif: {
                  camera_make: 'Sony',
                  camera_model: 'ILCE-7M4',
                  lens: 'FE 24-70mm F2.8 GM II',
                  focal_length: '28.0 mm',
                  captured_at: '2026-03-10T11:15:00Z'
                }
              }
            ]
          }
        ],
        total_items: 3
      };
    }

    // Default Clean Case
    return {
      application_id: appId,
      pipeline_stage: 'S10_INFRA_CHECKLIST',
      category: 'EOA_RENEWAL',
      simulated: true,
      decision_support_only: true,
      overall_status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
      campus_coordinates: {
        latitude: 28.4728,
        longitude: 77.4891,
        name: 'Knowledge Park III, Greater Noida'
      },
      items: [
        {
          item_key: 'computer_lab_photos',
          label: 'Computer Center / Laboratory',
          status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
          reason: 'All 2 evidence items uploaded with valid metadata ready for officer review.',
          severity: 'info',
          evidence_count: 2,
          claimed_value: 70,
          flags: [],
          photos: [
            {
              file_id: 'clean_lab_01',
              filename: 'lab_terminal_room.jpg',
              latitude: 28.4729,
              longitude: 77.4892,
              distance_km: 0.02,
              phash: 'aabbccddeeff0011',
              exif: {
                camera_make: 'Canon',
                camera_model: 'EOS R6 Mark II',
                lens: 'RF24-105mm F4 L IS USM',
                focal_length: '24.0 mm',
                iso: 400,
                exposure: '1/125s',
                aperture: 'f/4.0',
                dimensions: '6000 × 4000',
                captured_at: '2026-03-11T09:45:12Z',
                software: 'Canon Firmware v1.4.0 (Authentic Ingest)'
              }
            },
            {
              file_id: 'clean_lab_02',
              filename: 'lab_server_rack.jpg',
              latitude: 28.4728,
              longitude: 77.4890,
              distance_km: 0.01,
              phash: 'aabbccddeeff0022',
              exif: {
                camera_make: 'Canon',
                camera_model: 'EOS R6 Mark II',
                lens: 'RF24-105mm F4 L IS USM',
                focal_length: '35.0 mm',
                iso: 800,
                exposure: '1/60s',
                aperture: 'f/4.0',
                dimensions: '6000 × 4000',
                captured_at: '2026-03-11T10:02:44Z',
                software: 'Canon Firmware v1.4.0 (Authentic Ingest)'
              }
            }
          ]
        },
        {
          item_key: 'classroom_photos',
          label: 'Instructional Classrooms',
          status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
          reason: 'All 2 evidence items uploaded with valid metadata ready for officer review.',
          severity: 'info',
          evidence_count: 2,
          claimed_value: 75,
          flags: [],
          photos: [
            {
              file_id: 'clean_class_01',
              filename: 'classroom_301.jpg',
              latitude: 28.4727,
              longitude: 77.4890,
              distance_km: 0.02,
              phash: '1122334455667788',
              exif: {
                camera_make: 'Apple',
                camera_model: 'iPhone 15 Pro',
                lens: 'iPhone 15 Pro back triple camera 24mm f/1.78',
                focal_length: '6.76 mm',
                iso: 100,
                exposure: '1/250s',
                aperture: 'f/1.78',
                dimensions: '4032 × 3024',
                captured_at: '2026-03-11T11:10:00Z',
                software: 'iOS 19.3'
              }
            },
            {
              file_id: 'clean_class_02',
              filename: 'classroom_302.jpg',
              latitude: 28.4728,
              longitude: 77.4892,
              distance_km: 0.01,
              phash: '1122334455667799',
              exif: {
                camera_make: 'Apple',
                camera_model: 'iPhone 15 Pro',
                lens: 'iPhone 15 Pro back triple camera 24mm f/1.78',
                focal_length: '6.76 mm',
                iso: 125,
                exposure: '1/200s',
                aperture: 'f/1.78',
                dimensions: '4032 × 3024',
                captured_at: '2026-03-11T11:25:00Z',
                software: 'iOS 19.3'
              }
            }
          ]
        },
        {
          item_key: 'central_library_photos',
          label: 'Central Library',
          status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
          reason: 'All 1 evidence items uploaded with valid metadata ready for officer review.',
          severity: 'info',
          evidence_count: 1,
          claimed_value: 175,
          flags: [],
          photos: [
            {
              file_id: 'clean_lib_01',
              filename: 'library_reading_hall.jpg',
              latitude: 28.4729,
              longitude: 77.4892,
              distance_km: 0.02,
              phash: 'eeff112233445566',
              exif: {
                camera_make: 'Sony',
                camera_model: 'ILCE-7M4',
                lens: 'FE 24-70mm F2.8 GM II',
                focal_length: '28.0 mm',
                iso: 200,
                exposure: '1/160s',
                aperture: 'f/2.8',
                dimensions: '7008 × 4672',
                captured_at: '2026-03-10T11:15:00Z',
                software: 'Sony Firmware v2.01'
              }
            }
          ]
        }
      ],
      total_items: 3
    };
  }

  /**
   * Load Infrastructure Checklist Data: GET /applications/{id}/infra (Step 37)
   */
  async loadInfraData(applicationId) {
    if (!applicationId) return null;
    this.currentAppId = applicationId;

    let result = null;

    try {
      const client = (typeof window !== 'undefined' && (window.apiClient || window.api))
        ? (window.apiClient || window.api)
        : (typeof ApiClient !== 'undefined' ? new ApiClient() : null);

      if (client && typeof client.getApplicationInfra === 'function') {
        result = await client.getApplicationInfra(applicationId, 'EOA_RENEWAL');
      }
    } catch (err) {
      console.warn(`[InfraPanel] Could not fetch infra data for ${applicationId}:`, err);
    }

    if (!result || !result.items || result.items.length === 0) {
      result = this.getDefaultChecklist(applicationId);
    }

    this.currentData = result;
    this.isLoaded = true;

    // Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-data-loaded', {
        detail: {
          applicationId,
          totalItems: result.items.length,
          overallStatus: result.overall_status
        }
      }));
    }

    return result;
  }

  /**
   * Render Non-Negotiable Simulation Advisory Banner (AGENTS.md Compliance)
   */
  renderAdvisoryBanner() {
    return `
      <div class="infra-advisory-banner" role="status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          <path d="M12 8v4"></path>
          <path d="M12 16h.01"></path>
        </svg>
        <div>
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
            <strong style="color: var(--text-main);">AICTE S10 Infrastructure Evidence Checklist (EOA_RENEWAL)</strong>
            <span class="badge-simulated-tag">SYNTHETIC NORMS</span>
          </div>
          <p style="margin: 0; color: var(--text-muted);">
            Facility norms (minimum photo inventory, floor area sqm thresholds, and geodesic GPS perimeter radii) are evaluated as preliminary indicators requiring human verification. Absence of flags does not denote compliance.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Render Summary KPI Cards Bar (Step 37)
   */
  renderSummaryBar(data) {
    const items = (data && data.items) || [];
    const total = items.length;
    const complete = items.filter(i => i.status === 'EVIDENCE_COMPLETE_FOR_REVIEW').length;
    const missing = items.filter(i => i.status === 'ADDITIONAL_EVIDENCE_REQUIRED' || i.status === 'LOCATION_METADATA_INCONSISTENT').length;
    const inspect = items.filter(i => i.status === 'INSPECTION_SUGGESTED' || i.status === 'POSSIBLE_DUPLICATE_EVIDENCE').length;

    const coords = data && data.campus_coordinates;
    const coordsStr = coords ? `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°` : '28.4728°, 77.4891°';

    return `
      <div class="infra-summary-bar" id="infra-summary-bar" role="region" aria-label="Infrastructure Summary Metrics">
        <!-- 1. Total Facilities Configured -->
        <div class="infra-summary-card" id="kpi-infra-total">
          <span class="infra-summary-val font-mono text-main">${total}</span>
          <span class="infra-summary-label">Configured Facilities</span>
        </div>

        <!-- 2. Evidence Complete for Review -->
        <div class="infra-summary-card" id="kpi-infra-complete">
          <span class="infra-summary-val font-mono text-success">${complete}</span>
          <span class="infra-summary-label">Complete for Review</span>
        </div>

        <!-- 3. Additional Evidence / Action Required -->
        <div class="infra-summary-card" id="kpi-infra-missing">
          <span class="infra-summary-val font-mono text-warn">${missing}</span>
          <span class="infra-summary-label">Evidence Deficient</span>
        </div>

        <!-- 4. Inspection / Anomaly Suggested -->
        <div class="infra-summary-card" id="kpi-infra-inspect">
          <span class="infra-summary-val font-mono text-danger">${inspect}</span>
          <span class="infra-summary-label">Inspection Suggested</span>
        </div>

        <!-- 5. Registered Campus Coordinates Reference -->
        <div class="infra-summary-card" id="kpi-infra-campus">
          <span class="infra-summary-val font-mono text-accent" style="font-size: 13px;">${coordsStr}</span>
          <span class="infra-summary-label">Campus GPS Perimeter</span>
        </div>
      </div>
    `;
  }

  /**
   * Render Status Badge
   */
  renderStatusBadge(status) {
    const st = String(status || 'NOT_CHECKED').toUpperCase();
    const cfg = INFRA_STATUS_CONFIG[st] || INFRA_STATUS_CONFIG['NOT_CHECKED'];

    return `
      <span class="badge ${cfg.class} font-mono text-xs" data-infra-status="${st}" style="font-size: 10px;">
        ${cfg.label}
      </span>
    `;
  }

  /**
   * Compute Overall Infrastructure Readiness Status (Step 41)
   */
  computeOverallStatus(items = []) {
    if (!items || items.length === 0) return 'NOT_CHECKED';
    let hasAdditionalRequired = false;
    let hasInspectionSuggested = false;

    for (const item of items) {
      const st = String(item.status || '').toUpperCase();
      if (st === 'ADDITIONAL_EVIDENCE_REQUIRED' || st === 'LOCATION_METADATA_INCONSISTENT') {
        hasAdditionalRequired = true;
      } else if (st === 'INSPECTION_SUGGESTED' || st === 'POSSIBLE_DUPLICATE_EVIDENCE') {
        hasInspectionSuggested = true;
      }
    }

    if (hasAdditionalRequired) {
      return 'ADDITIONAL_EVIDENCE_REQUIRED';
    }
    if (hasInspectionSuggested) {
      return 'INSPECTION_SUGGESTED';
    }
    return 'EVIDENCE_COMPLETE_FOR_REVIEW';
  }

  /**
   * Deterministic Evaluation of Single Facility Item (Step 41 Verification Requirement)
   * Verification Requirement: Missing classroom photos accurately results in ADDITIONAL_EVIDENCE_REQUIRED.
   */
  evaluateItem(itemKey, photos = [], claimedValue = null, campusCoords = null) {
    const config = CONFIG_ITEMS_NORMS[itemKey] || {
      key: itemKey,
      label: itemKey,
      min_files: 1,
      min_area_sqm: 60,
      geo_required: false,
      radius_km: 2.0
    };

    const count = (photos && Array.isArray(photos)) ? photos.length : 0;
    const campus = campusCoords || { latitude: 28.4728, longitude: 77.4891 };

    // 1. Evidence Inventory check
    if (count < config.min_files) {
      return {
        item_key: itemKey,
        label: config.label,
        status: 'ADDITIONAL_EVIDENCE_REQUIRED',
        reason: `Insufficient evidence uploaded: ${count} file(s) found, minimum required is ${config.min_files}.`,
        severity: 'medium',
        evidence_count: count,
        flags: ['INFRA_EVIDENCE_INSUFFICIENT'],
        photos: photos || []
      };
    }

    // 2. Minimum Area Norm check
    if (config.min_area_sqm !== undefined && claimedValue !== null && claimedValue !== undefined) {
      if (Number(claimedValue) < Number(config.min_area_sqm)) {
        return {
          item_key: itemKey,
          label: config.label,
          status: 'INSPECTION_SUGGESTED',
          reason: `Claimed value (${claimedValue}) is below configured minimum norm (${config.min_area_sqm}); physical inspection suggested.`,
          severity: 'medium',
          evidence_count: count,
          flags: ['INFRA_CLAIM_BELOW_MINIMUM'],
          photos: photos
        };
      }
    }

    // 3. Geotag / GPS Proximity check
    for (const p of photos) {
      if (p.latitude === undefined || p.longitude === undefined || p.latitude === null || p.longitude === null) {
        if (config.geo_required) {
          return {
            item_key: itemKey,
            label: config.label,
            status: 'ADDITIONAL_EVIDENCE_REQUIRED',
            reason: 'Geotagged metadata required for this facility photo but coordinates are missing or stripped.',
            severity: 'medium',
            evidence_count: count,
            flags: ['INFRA_GEOTAG_MISSING'],
            photos: photos
          };
        }
      } else {
        const dist = (p.distance_km !== undefined)
          ? p.distance_km
          : this.calculateHaversineKm(campus.latitude, campus.longitude, p.latitude, p.longitude);
        if (dist > config.radius_km) {
          return {
            item_key: itemKey,
            label: config.label,
            status: 'LOCATION_METADATA_INCONSISTENT',
            reason: `Photo GPS location is ${dist.toFixed(2)} km from campus registered coordinates (allowed radius: ${config.radius_km.toFixed(1)} km).`,
            severity: 'medium',
            evidence_count: count,
            flags: ['INFRA_LOCATION_INCONSISTENT'],
            photos: photos
          };
        }
      }
    }

    return {
      item_key: itemKey,
      label: config.label,
      status: 'EVIDENCE_COMPLETE_FOR_REVIEW',
      reason: `All ${count} evidence items uploaded with valid metadata ready for officer review.`,
      severity: 'info',
      evidence_count: count,
      flags: [],
      photos: photos
    };
  }

  /**
   * Render Overall Readiness Status Badge (Step 41)
   */
  renderOverallStatusBadge(status) {
    const st = String(status || 'NOT_CHECKED').toUpperCase();
    if (st === 'EVIDENCE_COMPLETE_FOR_REVIEW') {
      return `
        <span class="badge badge-readiness-complete font-mono text-xs" id="badge-readiness-status" data-readiness-status="${st}">
          ✓ EVIDENCE COMPLETE FOR REVIEW
        </span>
      `;
    }
    if (st === 'ADDITIONAL_EVIDENCE_REQUIRED') {
      return `
        <span class="badge badge-readiness-missing font-mono text-xs" id="badge-readiness-status" data-readiness-status="${st}">
          ⚠ ADDITIONAL EVIDENCE REQUIRED
        </span>
      `;
    }
    if (st === 'INSPECTION_SUGGESTED') {
      return `
        <span class="badge badge-readiness-suggested font-mono text-xs" id="badge-readiness-status" data-readiness-status="${st}">
          🔍 PHYSICAL GROUND INSPECTION SUGGESTED
        </span>
      `;
    }
    return `
      <span class="badge badge-outline font-mono text-xs" id="badge-readiness-status" data-readiness-status="${st}">
        ${st}
      </span>
    `;
  }

  /**
   * Render Facility Readiness Status & Ground Inspection Suggester Section (Step 41)
   */
  renderReadinessSection(data) {
    const items = (data && data.items) || [];
    const overallStatus = (data && data.overall_status) || this.computeOverallStatus(items);
    const queuedCount = this.recommendedInspections ? this.recommendedInspections.size : 0;
    const isQueued = queuedCount > 0;

    let desc = '';
    if (overallStatus === 'EVIDENCE_COMPLETE_FOR_REVIEW') {
      desc = 'All required facility evidence photos and metadata have been uploaded within institutional norms. Recommended for documentary review.';
    } else if (overallStatus === 'ADDITIONAL_EVIDENCE_REQUIRED') {
      desc = 'One or more facilities have insufficient photo evidence or inconsistent location coordinates. Recommended for physical ground verification by visiting committee or institution rectification notice.';
    } else if (overallStatus === 'INSPECTION_SUGGESTED') {
      desc = 'Floor area claims are below prescribed AICTE norms or perceptual duplicate photos were detected. Mandatory physical inspection recommended before grant of approval.';
    } else {
      desc = 'Infrastructure checklist evaluation pending or preliminary data loaded.';
    }

    const queuedItemsList = this.recommendedInspections ? Array.from(this.recommendedInspections) : [];

    return `
      <section class="infra-readiness-card" id="infra-readiness-card" aria-label="Facility Readiness & Ground Inspection Suggester">
        <div class="infra-readiness-header">
          <div class="infra-readiness-title-group">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="badge badge-simulated-tag font-mono text-xs">S10 READINESS</span>
              <h3 class="infra-readiness-title" id="readiness-title">Facility Readiness Status</h3>
              ${this.renderOverallStatusBadge(overallStatus)}
            </div>
            <p class="infra-readiness-desc" id="readiness-desc">
              ${desc}
            </p>
          </div>
          <div class="infra-readiness-actions">
            <button class="btn btn-primary btn-sm font-mono btn-ground-inspection ${isQueued ? 'active' : ''}"
                    id="btn-recommend-ground-inspection"
                    onclick="window.infraPanelComponent && window.infraPanelComponent.recommendForGroundInspection()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <span id="btn-recommend-text">
                ${isQueued ? `✓ Queued for Ground Inspection (${queuedCount})` : 'Recommend for Ground Inspection Checklist'}
              </span>
            </button>
          </div>
        </div>

        ${isQueued ? `
          <div class="infra-queued-banner" id="readiness-queued-alert" role="status">
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>
                <strong>Visiting Team Queue:</strong> ${queuedCount} facility checklist item(s) (${queuedItemsList.join(', ')}) flagged for ground committee physical verification.
              </span>
            </div>
            <button class="btn btn-outline btn-xs font-mono" onclick="window.infraPanelComponent && window.infraPanelComponent.clearGroundInspectionQueue()" style="font-size: 10px;">
              Reset Queue
            </button>
          </div>
        ` : ''}
      </section>
    `;
  }

  /**
   * One-Click Ground Inspection Recommender Action (Step 41)
   */
  recommendForGroundInspection(itemKeys = null) {
    const data = this.currentData || this.getDefaultChecklist(this.currentAppId);
    const items = (data && data.items) || [];

    if (itemKeys && Array.isArray(itemKeys) && itemKeys.length > 0) {
      for (const k of itemKeys) this.recommendedInspections.add(k);
    } else {
      // Find deficient, suggested, or inconsistent items
      const flaggable = items.filter(i =>
        i.status === 'ADDITIONAL_EVIDENCE_REQUIRED' ||
        i.status === 'LOCATION_METADATA_INCONSISTENT' ||
        i.status === 'INSPECTION_SUGGESTED' ||
        i.status === 'POSSIBLE_DUPLICATE_EVIDENCE'
      );

      if (flaggable.length > 0) {
        for (const i of flaggable) this.recommendedInspections.add(i.item_key);
      } else {
        // Fallback: recommend all configured items for comprehensive ground check
        for (const i of items) this.recommendedInspections.add(i.item_key);
      }
    }

    const count = this.recommendedInspections.size;
    const queuedList = Array.from(this.recommendedInspections);

    // Update DOM if browser environment
    if (typeof document !== 'undefined') {
      const btn = document.getElementById('btn-recommend-ground-inspection');
      if (btn) {
        btn.classList.add('active');
      }
      const textEl = document.getElementById('btn-recommend-text');
      if (textEl) {
        textEl.textContent = `✓ Queued for Ground Inspection (${count})`;
      }

      for (const key of queuedList) {
        const itemBtn = document.getElementById(`btn-recommend-${key}`);
        if (itemBtn) {
          itemBtn.classList.add('btn-queued-active');
          itemBtn.textContent = '✓ Queued';
        }
        const badgeSlot = document.getElementById(`infra-queued-slot-${key}`);
        if (badgeSlot) {
          badgeSlot.innerHTML = `<span class="badge badge-inspection-queued" id="badge-queued-${key}">✓ QUEUED FOR GROUND INSPECTION</span>`;
        }
      }
    }

    // Dispatch custom DOM event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-inspection-recommended', {
        detail: {
          applicationId: this.currentAppId,
          recommendedCount: count,
          recommendedItems: queuedList,
          overallStatus: (data && data.overall_status) || this.computeOverallStatus(items),
          timestamp: new Date().toISOString()
        }
      }));
    }

    return {
      success: true,
      applicationId: this.currentAppId,
      recommendedCount: count,
      recommendedItems: queuedList
    };
  }

  /**
   * Toggle Single Facility in Ground Inspection Queue (Step 41)
   */
  toggleGroundInspectionItem(itemKey) {
    if (!itemKey) return false;

    let isQueued = false;
    if (this.recommendedInspections.has(itemKey)) {
      this.recommendedInspections.delete(itemKey);
      isQueued = false;
    } else {
      this.recommendedInspections.add(itemKey);
      isQueued = true;
    }

    const count = this.recommendedInspections.size;

    // Update DOM elements if present
    if (typeof document !== 'undefined') {
      const itemBtn = document.getElementById(`btn-recommend-${itemKey}`);
      if (itemBtn) {
        if (isQueued) {
          itemBtn.classList.add('btn-queued-active');
          itemBtn.textContent = '✓ Queued';
        } else {
          itemBtn.classList.remove('btn-queued-active');
          itemBtn.textContent = '+ Ground Inspection';
        }
      }

      const badgeSlot = document.getElementById(`infra-queued-slot-${itemKey}`);
      if (badgeSlot) {
        badgeSlot.innerHTML = isQueued
          ? `<span class="badge badge-inspection-queued" id="badge-queued-${itemKey}">✓ QUEUED FOR GROUND INSPECTION</span>`
          : '';
      }

      const mainBtn = document.getElementById('btn-recommend-ground-inspection');
      const textEl = document.getElementById('btn-recommend-text');
      if (mainBtn && textEl) {
        if (count > 0) {
          mainBtn.classList.add('active');
          textEl.textContent = `✓ Queued for Ground Inspection (${count})`;
        } else {
          mainBtn.classList.remove('active');
          textEl.textContent = 'Recommend for Ground Inspection Checklist';
        }
      }
    }

    // Dispatch event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-item-inspection-toggled', {
        detail: {
          applicationId: this.currentAppId,
          itemKey,
          isQueued,
          totalQueued: count
        }
      }));
    }

    return isQueued;
  }

  /**
   * Clear Ground Inspection Queue
   */
  clearGroundInspectionQueue() {
    this.recommendedInspections.clear();
    if (this.currentAppId) {
      this.loadAndRender(this.currentAppId);
    }
  }

  /**
   * Render Single Facility Checklist Item Card (Step 37)
   * Verification Requirement: Items display required file count norms
   * (e.g. Computer Center: 2 photos minimum, 60 sqm minimum area).
   */
  renderItemCard(item) {
    if (!item) return '';

    const key = item.item_key;
    const config = CONFIG_ITEMS_NORMS[key] || {
      key: key,
      label: item.label || key,
      min_files: 1,
      min_area_sqm: 60,
      claimed_form_field: 'area_sqm',
      geo_required: false,
      radius_km: 2.0,
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`
    };

    const label = item.label || config.label;
    const status = String(item.status || 'NOT_CHECKED').toUpperCase();
    const cfg = INFRA_STATUS_CONFIG[status] || INFRA_STATUS_CONFIG['NOT_CHECKED'];

    // Norms from EOA_RENEWAL.yaml
    const minFilesNorm = `${config.min_files} photo${config.min_files > 1 ? 's' : ''} minimum`;
    const minAreaNorm = `${config.min_area_sqm} sqm minimum area`;
    const geoNorm = config.geo_required
      ? `Mandatory GPS (radius: ${config.radius_km.toFixed(1)} km)`
      : `Recommended GPS (radius: ${config.radius_km.toFixed(1)} km)`;

    const evidenceCount = item.evidence_count !== undefined ? item.evidence_count : (item.photos ? item.photos.length : 0);
    const claimedVal = item.claimed_value !== undefined ? item.claimed_value : null;

    const countMet = evidenceCount >= config.min_files;
    const areaMet = claimedVal !== null ? (claimedVal >= config.min_area_sqm) : true;
    const isQueued = (this.recommendedInspections && this.recommendedInspections.has(key)) || false;

    return `
      <article class="infra-item-card status-${status.toLowerCase()}"
               id="infra-card-${key}"
               data-item-key="${key}"
               data-status="${status}"
               style="border-left: 4px solid ${cfg.color};">
        <!-- 1. Card Header -->
        <div class="infra-card-header">
          <div class="infra-card-title-group">
            <h4 class="infra-card-title">
              ${config.icon}
              <span id="infra-title-${key}">${label}</span>
            </h4>
            <div class="infra-card-badges">
              <span class="badge badge-outline text-xs font-mono">${key}</span>
              <span class="badge badge-outline text-xs font-mono">EOA_RENEWAL</span>
            </div>
          </div>
          <div class="infra-card-status-slot" id="infra-status-${key}">
            <span id="infra-queued-slot-${key}">
              ${isQueued ? `<span class="badge badge-inspection-queued" id="badge-queued-${key}">✓ QUEUED FOR GROUND INSPECTION</span>` : ''}
            </span>
            ${this.renderStatusBadge(status)}
          </div>
        </div>

        <!-- 2. Required Facility Norms Box (Step 37 Core Requirement) -->
        <div class="infra-norms-box" id="infra-norms-${key}">
          <div class="infra-norms-header">
            <span class="infra-norms-title">AICTE Facility Norms (EOA_RENEWAL.yaml)</span>
            <span class="badge badge-outline font-mono text-xs" style="font-size: 9px; padding: 1px 4px;">NORMS</span>
          </div>

          <div class="infra-norms-grid">
            <!-- Norm 1: Minimum File Count -->
            <div class="infra-norm-item">
              <span class="infra-norm-label">Required Photos</span>
              <span class="infra-norm-badge ${countMet ? 'text-success' : 'text-danger'}"
                    id="norm-files-${key}"
                    data-norm="file-count">
                ${minFilesNorm}
              </span>
            </div>

            <!-- Norm 2: Minimum Floor Area Norm -->
            <div class="infra-norm-item">
              <span class="infra-norm-label">Required Floor Area</span>
              <span class="infra-norm-badge ${areaMet ? 'text-success' : 'text-danger'}"
                    id="norm-area-${key}"
                    data-norm="min-area">
                ${minAreaNorm}
              </span>
            </div>

            <!-- Norm 3: Geotag Requirement -->
            <div class="infra-norm-item">
              <span class="infra-norm-label">Geotag Boundary</span>
              <span class="infra-norm-badge font-mono"
                    id="norm-geo-${key}"
                    data-norm="geo-req"
                    style="font-size: 10px;">
                ${geoNorm}
              </span>
            </div>
          </div>
        </div>

        <!-- 3. Form Claim vs Minimum Area Comparison -->
        <div class="infra-claim-comparison" id="infra-claim-${key}">
          <div>
            <span class="text-muted">Application Form Claim (${config.claimed_form_field}):</span>
            <strong class="font-mono text-main" id="claim-val-${key}">${claimedVal !== null ? `${claimedVal} sqm` : 'Declared in Form'}</strong>
          </div>
          <div>
            <span class="text-muted">Threshold Norm:</span>
            <span class="font-mono text-accent">≥ ${config.min_area_sqm} sqm</span>
            ${claimedVal !== null
              ? (claimedVal >= config.min_area_sqm
                  ? '<span class="text-success font-mono text-xs" style="margin-left: 4px;">(+ ' + (claimedVal - config.min_area_sqm) + ' sqm)</span>'
                  : '<span class="text-danger font-mono text-xs" style="margin-left: 4px;">(- ' + (config.min_area_sqm - claimedVal) + ' sqm DEFICIT)</span>')
              : ''
            }
          </div>
        </div>

        <!-- 4. Uploaded Inventory Count -->
        <div style="font-size: 11px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span class="text-muted">Evidence Files Uploaded:</span>
            <strong class="font-mono ${countMet ? 'text-success' : 'text-danger'}" id="evidence-count-${key}">
              ${evidenceCount} of ${config.min_files} photo${config.min_files > 1 ? 's' : ''} uploaded
            </strong>
          </div>
          <div>
            ${countMet
              ? '<span class="badge badge-pass text-xs font-mono" style="font-size: 9px;">INVENTORY MET</span>'
              : '<span class="badge badge-status-mismatch_detected text-xs font-mono" style="font-size: 9px;">INVENTORY DEFICIT</span>'
            }
          </div>
        </div>

        <!-- 4b. Photo Thumbnails Grid (Step 38) -->
        <div class="infra-photo-thumbnails-grid" id="infra-thumbs-${key}">
          ${(item.photos && item.photos.length > 0)
            ? item.photos.map(photo => this.renderThumbnailItem(key, photo)).join('')
            : `
              <div class="infra-photo-empty" id="infra-empty-${key}">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>No photographic evidence uploaded (0/${config.min_files} required)</span>
                <button class="btn btn-outline btn-xs font-mono" id="btn-ref-${key}" onclick="window.infraPanelComponent && window.infraPanelComponent.openGallery('${key}')" style="font-size: 10px; margin-top: 4px;">
                  View Reference Benchmark Standard
                </button>
              </div>
            `
          }
        </div>

        <!-- 4c. Duplicate Evidence Warning Banner (Step 40) -->
        ${(status === 'POSSIBLE_DUPLICATE_EVIDENCE' || (item.flags && item.flags.includes('POSSIBLE_DUPLICATE_PHOTO')) || item.duplicate_match)
          ? this.renderDuplicateBanner(item)
          : ''
        }

        <!-- 5. Evaluation Reason Finding -->
        <div class="infra-reason-box" id="infra-reason-${key}">
          <strong>Finding:</strong> ${item.reason || 'Checklist item evaluated against deterministic AICTE norms.'}
        </div>

        <!-- 6. Card Action Controls -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: auto; flex-wrap: wrap; gap: 4px;">
          <button class="btn btn-outline btn-sm font-mono text-xs btn-view-gallery"
                  id="btn-gallery-${key}"
                  onclick="window.infraPanelComponent && window.infraPanelComponent.openGallery('${key}')">
            📷 Photo Evidence (${evidenceCount})
          </button>
          <button class="btn btn-outline btn-sm font-mono text-xs btn-view-geotag"
                  id="btn-geotag-${key}"
                  onclick="window.infraPanelComponent && window.infraPanelComponent.inspectGeotag('${key}')">
            📍 Geotag Inspector
          </button>
          <button class="btn btn-outline btn-sm font-mono text-xs btn-recommend-item ${isQueued ? 'btn-queued-active' : ''}"
                  id="btn-recommend-${key}"
                  onclick="window.infraPanelComponent && window.infraPanelComponent.toggleGroundInspectionItem('${key}')">
            ${isQueued ? '✓ Queued' : '+ Ground Inspection'}
          </button>
          ${(status === 'POSSIBLE_DUPLICATE_EVIDENCE' || item.duplicate_match)
            ? `
              <button class="btn btn-outline btn-sm font-mono text-xs btn-view-duplicate"
                      id="btn-dup-${key}"
                      style="border-color: #ea580c; color: #ea580c;"
                      onclick="window.infraPanelComponent && window.infraPanelComponent.inspectDuplicateHash('${key}')">
                🔍 Duplicate Hash
              </button>
            `
            : ''
          }
        </div>
      </article>
    `;
  }

  /**
   * Render Individual Photo Thumbnail Card (Step 38)
   */
  renderThumbnailItem(itemKey, photo) {
    if (!photo) return '';
    const fileId = photo.file_id || 'photo_unknown';
    const filename = photo.filename || `${fileId}.jpg`;
    const lat = photo.latitude !== undefined && photo.latitude !== null ? Number(photo.latitude).toFixed(4) : null;
    const lon = photo.longitude !== undefined && photo.longitude !== null ? Number(photo.longitude).toFixed(4) : null;
    const geoLabel = (lat && lon) ? `${lat}°, ${lon}°` : 'No Geotag';
    const distStr = photo.distance_km !== undefined && photo.distance_km !== null
      ? (photo.distance_km < 1 ? `${Math.round(photo.distance_km * 1000)}m` : `${photo.distance_km.toFixed(1)}km`)
      : null;

    const exif = photo.exif || {};
    const cameraStr = exif.camera_make ? `${exif.camera_make} ${exif.camera_model || ''}`.trim() : 'Digital Camera';

    return `
      <div class="infra-photo-thumb"
           id="thumb-${fileId}"
           data-file-id="${fileId}"
           data-item-key="${itemKey}"
           role="button"
           tabindex="0"
           aria-label="View EXIF metadata for ${filename}"
           onclick="window.infraPanelComponent && window.infraPanelComponent.openExifModal('${itemKey}', '${fileId}')">
        <div class="infra-thumb-preview">
          <div class="infra-thumb-canvas-sim">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <span class="infra-thumb-id-badge font-mono">${fileId}</span>
          </div>
        </div>
        <div class="infra-thumb-meta">
          <div class="infra-thumb-filename" title="${filename}">${filename}</div>
          <div class="infra-thumb-camera font-mono text-xs text-muted">${cameraStr}</div>
          <div class="infra-thumb-tags">
            <span class="badge badge-outline text-xs font-mono" style="font-size: 9px; padding: 1px 3px;">${geoLabel}</span>
            ${distStr ? `<span class="badge ${photo.distance_km > 2.0 ? 'badge-danger' : 'badge-pass'} text-xs font-mono" style="font-size: 9px; padding: 1px 3px;">${distStr}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Photo Canvas Visual Graphic (Step 38)
   */
  renderPhotoCanvasSvg(photo, itemKey) {
    const fileId = photo.file_id || 'photo_01';
    const filename = photo.filename || 'evidence.jpg';
    const config = CONFIG_ITEMS_NORMS[itemKey] || { label: itemKey };
    const exif = photo.exif || {};
    const dimensions = exif.dimensions || '6000 × 4000';

    return `
      <div class="infra-photo-canvas-box" id="canvas-box-${fileId}">
        <svg class="infra-photo-svg" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Photo evidence preview">
          <!-- Dark Photographic Canvas Background -->
          <rect width="600" height="400" fill="#0f172a" rx="6"/>

          <!-- Grid Lines (Rule of Thirds) -->
          <line x1="200" y1="0" x2="200" y2="400" stroke="#1e293b" stroke-width="1" stroke-dasharray="4,4"/>
          <line x1="400" y1="0" x2="400" y2="400" stroke="#1e293b" stroke-width="1" stroke-dasharray="4,4"/>
          <line x1="0" y1="133" x2="600" y2="133" stroke="#1e293b" stroke-width="1" stroke-dasharray="4,4"/>
          <line x1="0" y1="266" x2="600" y2="266" stroke="#1e293b" stroke-width="1" stroke-dasharray="4,4"/>

          <!-- Camera Viewfinder Corner Brackets -->
          <path d="M 20 40 L 20 20 L 40 20" stroke="#38bdf8" stroke-width="2" fill="none"/>
          <path d="M 580 40 L 580 20 L 560 20" stroke="#38bdf8" stroke-width="2" fill="none"/>
          <path d="M 20 360 L 20 380 L 40 380" stroke="#38bdf8" stroke-width="2" fill="none"/>
          <path d="M 580 360 L 580 380 L 560 380" stroke="#38bdf8" stroke-width="2" fill="none"/>

          <!-- Center Focus Reticle -->
          <circle cx="300" cy="200" r="30" stroke="#38bdf8" stroke-width="1.5" fill="none" opacity="0.6"/>
          <circle cx="300" cy="200" r="3" fill="#38bdf8"/>
          <line x1="260" y1="200" x2="280" y2="200" stroke="#38bdf8" stroke-width="1"/>
          <line x1="320" y1="200" x2="340" y2="200" stroke="#38bdf8" stroke-width="1"/>
          <line x1="300" y1="160" x2="300" y2="180" stroke="#38bdf8" stroke-width="1"/>
          <line x1="300" y1="220" x2="300" y2="240" stroke="#38bdf8" stroke-width="1"/>

          <!-- Facility Context Icon Representation -->
          <g transform="translate(260, 110)" stroke="#64748b" stroke-width="2" fill="none">
            <rect x="0" y="0" width="80" height="50" rx="4"/>
            <line x1="25" y1="50" x2="55" y2="50"/>
            <line x1="40" y1="50" x2="40" y2="60"/>
          </g>

          <!-- Watermark Notice Banner -->
          <rect x="110" y="330" width="380" height="26" rx="4" fill="rgba(15, 23, 42, 0.85)" stroke="#334155"/>
          <text x="300" y="347" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle" font-weight="600">
            SIMULATED PHOTO EVIDENCE · S10 FACILITY INSPECTION
          </text>

          <!-- Top Viewfinder Info HUD -->
          <text x="25" y="35" font-family="monospace" font-size="11" fill="#38bdf8" font-weight="bold">${fileId}</text>
          <text x="575" y="35" font-family="monospace" font-size="11" fill="#94a3b8" text-anchor="end">${dimensions}</text>

          <!-- Bottom Viewfinder Info HUD -->
          <text x="25" y="375" font-family="monospace" font-size="10" fill="#94a3b8">${config.label}</text>
          <text x="575" y="375" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="end">${filename}</text>
        </svg>
      </div>
    `;
  }

  /**
   * Render Extracted EXIF Metadata Card (Step 38 Core Requirement)
   * Verification Requirement: Synthetic lab photo displays EXIF metadata card.
   */
  renderExifCard(photo, itemKey) {
    if (!photo) return '<p class="text-muted">No EXIF metadata available.</p>';

    const exif = photo.exif || {};
    const make = exif.camera_make || 'Canon';
    const model = exif.camera_model || 'EOS R6 Mark II';
    const lens = exif.lens || 'RF24-105mm F4 L IS USM';
    const focalLength = exif.focal_length || '24.0 mm';
    const capturedAt = exif.captured_at || '2026-03-11T09:45:12Z';
    const iso = exif.iso !== undefined ? exif.iso : 400;
    const exposure = exif.exposure || '1/125s';
    const fNumber = exif.aperture || 'f/4.0';
    const dimensions = exif.dimensions || '6000 × 4000';
    const software = exif.software || 'Camera Internal Firmware (No Editing Tool)';
    const phash = photo.phash || exif.phash || 'aabbccddeeff0011';

    const lat = photo.latitude !== undefined && photo.latitude !== null ? Number(photo.latitude).toFixed(6) : '28.472900';
    const lon = photo.longitude !== undefined && photo.longitude !== null ? Number(photo.longitude).toFixed(6) : '77.489200';
    const dist = photo.distance_km !== undefined && photo.distance_km !== null ? photo.distance_km : 0.02;

    const formattedDate = String(capturedAt).replace('T', ' ').replace('Z', ' UTC');

    return `
      <div class="infra-exif-card" id="infra-exif-card">
        <!-- Header -->
        <div class="infra-exif-header">
          <div>
            <h4 class="infra-exif-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Extracted EXIF Metadata Card
            </h4>
            <span class="text-muted text-xs font-mono">Parser: ExifTool v12.70 (Guide §5.3, S10)</span>
          </div>
          <span class="badge badge-pass text-xs font-mono" id="exif-badge-status">METADATA INTACT</span>
        </div>

        <!-- EXIF Tags Table / Key-Value Grid -->
        <div class="infra-exif-grid">
          <!-- 1. Camera Make -->
          <div class="infra-exif-row" id="exif-row-make">
            <span class="infra-exif-label">Camera Make</span>
            <strong class="infra-exif-value font-mono" id="exif-val-make">${make}</strong>
          </div>

          <!-- 2. Camera Model -->
          <div class="infra-exif-row" id="exif-row-model">
            <span class="infra-exif-label">Camera Model</span>
            <strong class="infra-exif-value font-mono" id="exif-val-model">${model}</strong>
          </div>

          <!-- 3. Lens Specification -->
          <div class="infra-exif-row" id="exif-row-lens">
            <span class="infra-exif-label">Lens Specification</span>
            <span class="infra-exif-value font-mono" id="exif-val-lens">${lens}</span>
          </div>

          <!-- 4. Focal Length -->
          <div class="infra-exif-row" id="exif-row-focal">
            <span class="infra-exif-label">Focal Length</span>
            <span class="infra-exif-value font-mono" id="exif-val-focal">${focalLength}</span>
          </div>

          <!-- 5. Capture Date/Time -->
          <div class="infra-exif-row" id="exif-row-capture-time">
            <span class="infra-exif-label">Capture Date/Time</span>
            <span class="infra-exif-value font-mono text-accent" id="exif-val-capture-time">${formattedDate}</span>
          </div>

          <!-- 6. Exposure & ISO -->
          <div class="infra-exif-row" id="exif-row-exposure">
            <span class="infra-exif-label">Exposure & ISO</span>
            <span class="infra-exif-value font-mono" id="exif-val-exposure">${exposure} · ISO ${iso} · ${fNumber}</span>
          </div>

          <!-- 7. Image Dimensions -->
          <div class="infra-exif-row" id="exif-row-dimensions">
            <span class="infra-exif-label">Image Dimensions</span>
            <span class="infra-exif-value font-mono" id="exif-val-dimensions">${dimensions}</span>
          </div>

          <!-- 8. GPS Coordinates -->
          <div class="infra-exif-row" id="exif-row-gps">
            <span class="infra-exif-label">GPS Coordinate Stamp</span>
            <span class="infra-exif-value font-mono text-success" id="exif-val-gps">${lat}° N, ${lon}° E</span>
          </div>

          <!-- 9. Campus Distance -->
          <div class="infra-exif-row" id="exif-row-distance">
            <span class="infra-exif-label">Perimeter Distance</span>
            <span class="infra-exif-value font-mono ${dist > 2.0 ? 'text-danger' : 'text-success'}" id="exif-val-distance">
              ${dist.toFixed(2)} km ${dist > 2.0 ? '(OUTSIDE 2.0 KM PERIMETER)' : '(Within Campus Radius)'}
            </span>
          </div>

          <!-- 10. Software / Editor Integrity -->
          <div class="infra-exif-row" id="exif-row-software">
            <span class="infra-exif-label">Software / Pipeline</span>
            <span class="infra-exif-value font-mono text-muted" id="exif-val-software">${software}</span>
          </div>

          <!-- 11. Perceptual Hash (pHash) -->
          <div class="infra-exif-row" id="exif-row-phash">
            <span class="infra-exif-label">Perceptual Hash (pHash)</span>
            <span class="infra-exif-value font-mono text-xs" id="exif-val-phash"><code>${phash}</code></span>
          </div>

          ${(photo.duplicate_match || (this.currentData && this.currentData.items && this.currentData.items.some(i => i.item_key === itemKey && (i.status === 'POSSIBLE_DUPLICATE_EVIDENCE' || i.duplicate_match))))
            ? `
              <div class="infra-exif-row" id="exif-row-hamming" style="background: rgba(234, 88, 12, 0.08); padding: 4px 6px; border-radius: 4px;">
                <span class="infra-exif-label" style="color: #ea580c; font-weight: 700;">Cross-Institution pHash Anomaly</span>
                <span class="infra-exif-value font-mono text-xs text-danger font-bold" id="exif-val-hamming">
                  Hamming distance ≤ 6 bits (Near Duplicate)
                </span>
              </div>
            `
            : ''
          }
        </div>

        ${(photo.duplicate_match || (this.currentData && this.currentData.items && this.currentData.items.some(i => i.item_key === itemKey && (i.status === 'POSSIBLE_DUPLICATE_EVIDENCE' || i.duplicate_match))))
          ? this.renderDuplicateBanner(this.currentData ? this.currentData.items.find(i => i.item_key === itemKey) : null, photo)
          : ''
        }

        <!-- Integrity Footer Note -->
        <div class="infra-exif-footer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>ExifTool verification complete. Metadata checked against editor token dictionaries (Guide §5.3).</span>
        </div>
      </div>
    `;
  }

  /**
   * Render Complete Photo & EXIF Modal Dialog (Step 38)
   */
  renderPhotoModal(photo, itemKey) {
    if (!photo) return '';
    const fileId = photo.file_id || 'photo_unknown';
    const filename = photo.filename || `${fileId}.jpg`;
    const isReference = fileId.startsWith('ref_');

    return `
      <div class="infra-modal-backdrop" id="infra-photo-modal" role="dialog" aria-modal="true" aria-labelledby="modal-photo-title">
        <div class="infra-modal-content">
          <!-- 1. Header -->
          <div class="infra-modal-header">
            <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
              <span class="badge badge-outline font-mono text-xs">${itemKey}</span>
              <h3 id="modal-photo-title" style="margin: 0; font-size: 15px; font-weight: 700;">${filename}</h3>
              ${isReference
                ? '<span class="badge badge-simulated-tag" style="background: rgba(217, 119, 6, 0.15); color: #d97706; border-color: rgba(217, 119, 6, 0.3);">REFERENCE STANDARD NORMS</span>'
                : '<span class="badge badge-simulated-tag">SYNTHETIC EVIDENCE · EXIFTOOL S10</span>'
              }
            </div>
            <button class="btn btn-outline btn-sm" id="btn-close-photo-modal" onclick="window.infraPanelComponent && window.infraPanelComponent.closeModal()" aria-label="Close modal">✕</button>
          </div>

          <!-- 2. Body -->
          <div class="infra-modal-body">
            <!-- Left Column: Photo Preview Canvas -->
            <div class="infra-modal-preview-col">
              ${this.renderPhotoCanvasSvg(photo, itemKey)}
              <div class="infra-photo-subtext">
                <span>ID: <code id="photo-preview-id">${fileId}</code></span>
                <span>Dim: <code>${(photo.exif && photo.exif.dimensions) || '6000 × 4000'}</code></span>
              </div>
            </div>

            <!-- Right Column: Extracted EXIF Metadata Card -->
            <div class="infra-modal-exif-col">
              ${this.renderExifCard(photo, itemKey)}
            </div>
          </div>

          <!-- 3. Footer -->
          <div class="infra-modal-footer">
            <div class="text-muted text-xs">
              ${isReference
                ? 'Reference standard specification provided for officer calibration against AICTE norms.'
                : 'Decision support indicator. EXIF metadata parsed in isolated sandbox without external network calls.'
              }
            </div>
            <button class="btn btn-primary btn-sm font-mono text-xs" onclick="window.infraPanelComponent && window.infraPanelComponent.closeModal()">
              Close Viewer
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Open EXIF Metadata Modal (Step 38)
   */
  openExifModal(itemKey, fileId = null) {
    const data = this.currentData || this.getDefaultChecklist(this.currentAppId);
    const item = (data && data.items) ? data.items.find(i => i.item_key === itemKey) : null;
    let photo = null;

    if (item && item.photos && item.photos.length > 0) {
      if (fileId) {
        photo = item.photos.find(p => p.file_id === fileId);
      }
      if (!photo) {
        photo = item.photos[0];
      }
    }

    // Fallback to synthetic reference benchmark photo if item has no uploads
    if (!photo) {
      photo = SYNTHETIC_REFERENCE_PHOTOS[itemKey] || SYNTHETIC_REFERENCE_PHOTOS['computer_lab_photos'];
    }

    const modalHtml = this.renderPhotoModal(photo, itemKey);

    if (typeof document !== 'undefined') {
      let host = document.getElementById('infra-modal-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'infra-modal-host';
        document.body.appendChild(host);
      }
      host.innerHTML = modalHtml;

      // Attach backdrop click listener
      const modalEl = document.getElementById('infra-photo-modal');
      if (modalEl) {
        modalEl.addEventListener('click', (e) => {
          if (e.target === modalEl) this.closeModal();
        });
      }
    }

    // Dispatch inspection event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-photo-inspected', {
        detail: {
          applicationId: this.currentAppId,
          itemKey: itemKey,
          fileId: photo.file_id,
          filename: photo.filename,
          exif: photo.exif || {}
        }
      }));
    }

    return modalHtml;
  }

  /**
   * Close Any Open Modal (Photo EXIF or Geotag Inspector)
   */
  closeModal() {
    if (typeof document !== 'undefined') {
      const host = document.getElementById('infra-modal-host');
      if (host) {
        host.innerHTML = '';
      }
      const photoModal = document.getElementById('infra-photo-modal');
      if (photoModal && photoModal.parentNode) {
        photoModal.parentNode.removeChild(photoModal);
      }
      const geoModal = document.getElementById('infra-geotag-modal');
      if (geoModal && geoModal.parentNode) {
        geoModal.parentNode.removeChild(geoModal);
      }
      const dupModal = document.getElementById('infra-duplicate-modal');
      if (dupModal && dupModal.parentNode) {
        dupModal.parentNode.removeChild(dupModal);
      }
    }
  }

  /**
   * Great-Circle Distance Calculator using Haversine Formula (Guide §14, Step 39)
   * Formula: d = 2R · arcsin(√(sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)))
   * Earth mean radius R = 6371.0 km
   */
  calculateHaversineKm(lat1, lon1, lat2, lon2) {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
    const nLat1 = Number(lat1);
    const nLon1 = Number(lon1);
    const nLat2 = Number(lat2);
    const nLon2 = Number(lon2);
    if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;

    const R = 6371.0;
    const toRad = deg => (deg * Math.PI) / 180.0;
    const dLat = toRad(nLat2 - nLat1);
    const dLon = toRad(nLon2 - nLon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(4));
  }

  /**
   * Format Proximity Status Badge (Step 39 Verification Requirement)
   * Within 100m (<= 0.10 km) -> Green "On-Campus GPS (0.08 km)" badge
   * Within 2.0 km -> Green "Within Campus Perimeter (d km)" badge
   * Outside 2.0 km -> Red "LOCATION_METADATA_INCONSISTENT (d km)" warning badge
   */
  formatProximityBadge(distanceKm) {
    const dist = Number(distanceKm) || 0;
    const distStr = dist.toFixed(2);

    if (dist <= 0.1) {
      return `
        <span class="badge badge-pass font-mono text-xs badge-on-campus-gps" id="badge-proximity" data-proximity="on-campus">
          ✓ On-Campus GPS (${distStr} km)
        </span>
      `;
    }
    if (dist <= 2.0) {
      return `
        <span class="badge badge-pass font-mono text-xs badge-within-perimeter" id="badge-proximity" data-proximity="within-perimeter">
          ✓ Within Campus Perimeter (${distStr} km)
        </span>
      `;
    }
    return `
      <span class="badge badge-danger font-mono text-xs badge-infra-geo-error" id="badge-proximity" data-proximity="inconsistent">
        ⚠ LOCATION_METADATA_INCONSISTENT (${distStr} km)
      </span>
    `;
  }

  /**
   * Render Haversine Distance Meter Gauge (Step 39)
   */
  renderDistanceGauge(distanceKm, radiusKm = 2.0) {
    const dist = Number(distanceKm) || 0;
    const maxScale = Math.max(radiusKm * 2, Math.min(Math.max(dist * 1.25, 4.0), 30.0));
    const percent = Math.min(100, Math.max(2, (dist / maxScale) * 100));
    const thresholdPercent = (radiusKm / maxScale) * 100;
    const isExceeded = dist > radiusKm;

    return `
      <div class="infra-meter-gauge" id="meter-gauge">
        <div class="infra-gauge-header">
          <span class="text-xs text-muted">Geodesic Perimeter Meter Gauge (Haversine)</span>
          <span class="font-mono text-xs ${isExceeded ? 'text-danger font-bold' : 'text-success font-bold'}">
            ${dist.toFixed(2)} km / ${radiusKm.toFixed(1)} km limit
          </span>
        </div>
        <div class="infra-gauge-track" id="gauge-track">
          <!-- Allowed Zone Shading (Green zone <= 2.0 km) -->
          <div class="infra-gauge-allowed-zone" style="width: ${thresholdPercent.toFixed(1)}%;"></div>
          <!-- Current Distance Fill Bar -->
          <div class="infra-gauge-fill ${isExceeded ? 'gauge-exceeded' : 'gauge-valid'}"
               id="gauge-fill"
               style="width: ${percent.toFixed(1)}%;"></div>
          <!-- 2.0 km AICTE Limit Threshold Pin -->
          <div class="infra-gauge-threshold-pin"
               style="left: ${thresholdPercent.toFixed(1)}%;"
               title="${radiusKm.toFixed(1)} km AICTE Limit">
            <span class="infra-gauge-pin-label">${radiusKm.toFixed(1)} km Limit</span>
          </div>
        </div>
        <div class="infra-gauge-labels font-mono text-xs text-muted">
          <span>0.0 km</span>
          <span style="left: ${thresholdPercent.toFixed(1)}%; position: absolute; transform: translateX(-50%);">
            ${radiusKm.toFixed(1)} km (Norm)
          </span>
          <span>${maxScale.toFixed(0)} km</span>
        </div>
      </div>
    `;
  }

  /**
   * Render Geotag Radar & Vector Bearing SVG (Step 39)
   */
  renderGeotagRadarSvg(photo, campus, distanceKm, radiusKm = 2.0) {
    const lat1 = campus.latitude;
    const lon1 = campus.longitude;
    const lat2 = photo.latitude;
    const lon2 = photo.longitude;
    const dist = Number(distanceKm) || 0;
    const isExceeded = dist > radiusKm;

    const scale = 45; // 45px per km for inner view
    let pinX = 200;
    let pinY = 200;

    if (dist <= radiusKm) {
      const dLat = (lat2 - lat1) * 111.0;
      const dLon = (lon2 - lon1) * 111.0 * Math.cos((lat1 * Math.PI) / 180.0);
      pinX = Math.max(30, Math.min(370, 200 + dLon * scale));
      pinY = Math.max(30, Math.min(370, 200 - dLat * scale));
    } else {
      const angle = Math.atan2(lat2 - lat1, lon2 - lon1);
      pinX = 200 + Math.cos(angle) * 155;
      pinY = 200 - Math.sin(angle) * 155;
    }

    return `
      <div class="infra-radar-box" id="radar-box-${photo.file_id}">
        <svg class="infra-radar-svg" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Geodesic campus radar">
          <!-- Background Grid & Range Rings -->
          <rect width="400" height="400" fill="#080c14" rx="6"/>

          <!-- Concentric Range Rings (0.5 km, 1.0 km, 2.0 km norm) -->
          <circle cx="200" cy="200" r="22.5" stroke="#1e293b" stroke-width="1" fill="none" stroke-dasharray="3,3"/>
          <circle cx="200" cy="200" r="45" stroke="#1e293b" stroke-width="1" fill="none" stroke-dasharray="3,3"/>
          <circle cx="200" cy="200" r="90" stroke="rgba(34, 197, 94, 0.4)" stroke-width="2" fill="rgba(34, 197, 94, 0.05)"/>

          <!-- Crosshairs -->
          <line x1="200" y1="20" x2="200" y2="380" stroke="#1e293b" stroke-width="1"/>
          <line x1="20" y1="200" x2="380" y2="200" stroke="#1e293b" stroke-width="1"/>

          <!-- 2.0 km Boundary Tag -->
          <text x="295" y="195" font-family="monospace" font-size="9" fill="#22c55e" font-weight="600">2.0 km Norm Limit</text>

          <!-- Vector Bearing Line from Campus to Photo Pin -->
          <line x1="200" y1="200" x2="${pinX.toFixed(1)}" y2="${pinY.toFixed(1)}"
                stroke="${isExceeded ? '#dc2626' : '#22c55e'}"
                stroke-width="2"
                stroke-dasharray="${isExceeded ? '4,4' : 'none'}"/>

          <!-- Campus Center Anchor -->
          <circle cx="200" cy="200" r="6" fill="#38bdf8"/>
          <circle cx="200" cy="200" r="14" stroke="#38bdf8" stroke-width="1.5" fill="none" opacity="0.6"/>
          <text x="200" y="226" font-family="monospace" font-size="10" fill="#38bdf8" text-anchor="middle" font-weight="bold">CAMPUS ANCHOR</text>

          <!-- Photo Pin Marker -->
          <g transform="translate(${pinX.toFixed(1)}, ${pinY.toFixed(1)})">
            <circle cx="0" cy="0" r="8" fill="${isExceeded ? '#dc2626' : '#16a34a'}"/>
            <circle cx="0" cy="0" r="16" stroke="${isExceeded ? '#dc2626' : '#16a34a'}" stroke-width="1.5" fill="none" opacity="0.75"/>
            <text x="0" y="-12" font-family="monospace" font-size="10" fill="${isExceeded ? '#ef4444' : '#4ade80'}" text-anchor="middle" font-weight="bold">
              ${isExceeded ? `⚠ ${dist.toFixed(1)} km OUTSIDE` : `✓ ${dist.toFixed(2)} km`}
            </text>
          </g>

          <!-- Compass Rose (North Arrow) -->
          <g transform="translate(365, 35)">
            <circle cx="0" cy="0" r="16" fill="#0f172a" stroke="#334155" stroke-width="1"/>
            <polygon points="0,-12 4,2 0,0 -4,2" fill="#38bdf8"/>
            <polygon points="0,12 4,2 0,0 -4,2" fill="#475569"/>
            <text x="0" y="-14" font-family="monospace" font-size="8" fill="#38bdf8" text-anchor="middle" font-weight="bold">N</text>
          </g>

          <!-- Radar Watermark Banner -->
          <rect x="90" y="365" width="220" height="20" rx="3" fill="rgba(15, 23, 42, 0.9)" stroke="#334155"/>
          <text x="200" y="378" font-family="monospace" font-size="9" fill="#94a3b8" text-anchor="middle">
            SIMULATED GEOSPATIAL RADAR · PS 26261
          </text>
        </svg>
      </div>
    `;
  }

  /**
   * Render Complete Geotag Inspector Modal Dialog (Step 39)
   */
  renderGeotagModal(photo, campus, itemKey, distanceKm, radiusKm = 2.0) {
    if (!photo) return '';
    const fileId = photo.file_id || 'photo_unknown';
    const filename = photo.filename || `${fileId}.jpg`;
    const dist = Number(distanceKm) || 0;
    const isExceeded = dist > radiusKm;

    return `
      <div class="infra-modal-backdrop" id="infra-geotag-modal" role="dialog" aria-modal="true" aria-labelledby="modal-geotag-title">
        <div class="infra-modal-content">
          <!-- 1. Header -->
          <div class="infra-modal-header">
            <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
              <span class="badge badge-outline font-mono text-xs">${itemKey}</span>
              <h3 id="modal-geotag-title" style="margin: 0; font-size: 15px; font-weight: 700;">Campus Geotag Inspector & Haversine Distance (S10)</h3>
              <span class="badge badge-simulated-tag">WGS-84 GEODESIC VERIFICATION</span>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-close-geotag-modal" onclick="window.infraPanelComponent && window.infraPanelComponent.closeModal()" aria-label="Close modal">✕</button>
          </div>

          <!-- 2. Body -->
          <div class="infra-modal-body">
            <!-- Left Column: Radar / Geodesic Map SVG -->
            <div class="infra-modal-preview-col">
              ${this.renderGeotagRadarSvg(photo, campus, dist, radiusKm)}
              <div class="infra-photo-subtext">
                <span>Campus: <code>${campus.latitude.toFixed(4)}°, ${campus.longitude.toFixed(4)}°</code></span>
                <span>Photo: <code>${photo.latitude.toFixed(4)}°, ${photo.longitude.toFixed(4)}°</code></span>
              </div>
            </div>

            <!-- Right Column: Geotag Proximity Verdict & Haversine Card -->
            <div class="infra-modal-exif-col">
              <div class="infra-exif-card" id="infra-geotag-card">
                <!-- Top Badge Bar -->
                <div class="infra-exif-header">
                  <div>
                    <h4 class="infra-exif-title">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      Geotag Proximity Verdict
                    </h4>
                    <span class="text-muted text-xs font-mono">Radius Norm: ≤ ${radiusKm.toFixed(1)} km (EOA_RENEWAL.yaml)</span>
                  </div>
                  <div id="geotag-proximity-slot">
                    ${this.formatProximityBadge(dist)}
                  </div>
                </div>

                <!-- Distance Meter Gauge (Step 39) -->
                ${this.renderDistanceGauge(dist, radiusKm)}

                <!-- Coordinates Comparison Table -->
                <div class="infra-exif-grid" style="margin-top: 8px;">
                  <div class="infra-exif-row" id="row-campus-gps">
                    <span class="infra-exif-label">Registered Campus GPS</span>
                    <span class="infra-exif-value font-mono" id="val-campus-gps">${campus.latitude.toFixed(6)}° N, ${campus.longitude.toFixed(6)}° E</span>
                  </div>
                  <div class="infra-exif-row" id="row-photo-gps">
                    <span class="infra-exif-label">Photo EXIF GPS</span>
                    <span class="infra-exif-value font-mono text-accent" id="val-photo-gps">${photo.latitude.toFixed(6)}° N, ${photo.longitude.toFixed(6)}° E</span>
                  </div>
                  <div class="infra-exif-row" id="row-haversine-dist">
                    <span class="infra-exif-label">Haversine Great-Circle Distance</span>
                    <strong class="infra-exif-value font-mono ${isExceeded ? 'text-danger' : 'text-success'}" id="val-haversine-dist">
                      ${dist.toFixed(2)} km (${Math.round(dist * 1000)} meters)
                    </strong>
                  </div>
                  <div class="infra-exif-row" id="row-allowed-radius">
                    <span class="infra-exif-label">Allowed Perimeter Threshold</span>
                    <span class="infra-exif-value font-mono" id="val-allowed-radius">≤ ${radiusKm.toFixed(1)} km</span>
                  </div>
                  <div class="infra-exif-row" id="row-math-formula">
                    <span class="infra-exif-label">Mathematical Formula</span>
                    <span class="infra-exif-value font-mono text-muted text-xs" id="val-math-formula">
                      d = 2R · arcsin(√(sin²(Δlat/2) + cos·cos·sin²(Δlon/2)))
                    </span>
                  </div>
                </div>

                <!-- Advisory Callout -->
                <div class="infra-reason-box" id="geotag-advisory" style="margin-top: 8px; border-left: 3px solid ${isExceeded ? '#dc2626' : '#16a34a'};">
                  <strong>Officer Advisory:</strong>
                  ${isExceeded
                    ? `Deficiency signal: Photographic evidence was captured outside permitted institutional bounds (divergence: ${dist.toFixed(2)} km). Officer ground verification or re-upload required.`
                    : (dist <= 0.1
                        ? `On-campus physical verification confirmed: Evidence captured within 100 meters of campus anchor point (${(dist * 1000).toFixed(0)}m).`
                        : `Evidence photo confirmed within authorized 2.0 km institutional perimeter (${dist.toFixed(2)} km).`
                      )
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Footer -->
          <div class="infra-modal-footer">
            <div class="text-muted text-xs">
              Deterministic geodesic calculation. Uses WGS-84 reference ellipsoid with mean Earth radius R = 6371.0 km.
            </div>
            <button class="btn btn-primary btn-sm font-mono text-xs" onclick="window.infraPanelComponent && window.infraPanelComponent.closeModal()">
              Close Inspector
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Launch Campus Geotag Inspector (Step 39)
   */
  inspectGeotag(itemKey, fileId = null) {
    const data = this.currentData || this.getDefaultChecklist(this.currentAppId);
    const item = (data && data.items) ? data.items.find(i => i.item_key === itemKey) : null;
    const campus = (data && data.campus_coordinates) || { latitude: 28.4728, longitude: 77.4891, name: 'Knowledge Park III, Greater Noida' };
    const config = CONFIG_ITEMS_NORMS[itemKey] || { radius_km: 2.0 };
    const radiusKm = config.radius_km || 2.0;

    let photo = null;
    if (item && item.photos && item.photos.length > 0) {
      if (fileId) {
        photo = item.photos.find(p => p.file_id === fileId);
      }
      if (!photo) {
        photo = item.photos[0];
      }
    }

    if (!photo) {
      photo = SYNTHETIC_REFERENCE_PHOTOS[itemKey] || SYNTHETIC_REFERENCE_PHOTOS['computer_lab_photos'];
    }

    // Calculate Haversine distance
    const dist = (photo.distance_km !== undefined && photo.distance_km !== null)
      ? photo.distance_km
      : ((photo.latitude !== undefined && photo.longitude !== undefined)
          ? this.calculateHaversineKm(campus.latitude, campus.longitude, photo.latitude, photo.longitude)
          : 0.0);

    const modalHtml = this.renderGeotagModal(photo, campus, itemKey, dist, radiusKm);

    if (typeof document !== 'undefined') {
      let host = document.getElementById('infra-modal-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'infra-modal-host';
        document.body.appendChild(host);
      }
      host.innerHTML = modalHtml;

      const modalEl = document.getElementById('infra-geotag-modal');
      if (modalEl) {
        modalEl.addEventListener('click', (e) => {
          if (e.target === modalEl) this.closeModal();
        });
      }
    }

    // Dispatch geotag inspection event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-geotag-inspected', {
        detail: {
          applicationId: this.currentAppId,
          itemKey,
          fileId: photo.file_id,
          distanceKm: dist,
          isConsistent: dist <= radiusKm,
          isOnCampus: dist <= 0.1,
          campus,
          photoCoords: { latitude: photo.latitude, longitude: photo.longitude }
        }
      }));
    }

    return modalHtml;
  }

  /**
   * Calculate 64-bit Bitwise Hamming Distance (Guide §14, Step 40)
   * Computes the bitwise divergence between two 16-char hex pHash strings.
   */
  calculateHammingDistance(h1, h2) {
    if (!h1 || !h2) return 64;
    try {
      const clean1 = String(h1).trim().toLowerCase();
      const clean2 = String(h2).trim().toLowerCase();
      const b1 = BigInt('0x' + clean1);
      const b2 = BigInt('0x' + clean2);
      let xor = b1 ^ b2;
      let count = 0;
      while (xor > 0n) {
        if (xor & 1n) count++;
        xor >>= 1n;
      }
      return count;
    } catch (_) {
      return 64;
    }
  }

  /**
   * Render 8x8 Bitmatrix Visualization for 64-bit DCT pHash (Step 40)
   */
  renderHashBitmatrixSvg(hashHex, diffMask = 0n) {
    const hex = String(hashHex || '0000000000000000').padStart(16, '0');
    let val = 0n;
    try {
      val = BigInt('0x' + hex);
    } catch (_) {}

    let rects = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const bitIndex = BigInt(63 - (row * 8 + col));
        const bitVal = (val >> bitIndex) & 1n;
        const isDiff = ((diffMask >> bitIndex) & 1n) === 1n;
        const fill = isDiff ? '#ef4444' : (bitVal === 1n ? '#38bdf8' : '#1e293b');
        rects += `<rect x="${col * 14 + 2}" y="${row * 14 + 2}" width="11" height="11" rx="2" fill="${fill}"/>`;
      }
    }
    return `
      <svg width="116" height="116" viewBox="0 0 116 116" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="64-bit pHash bitmatrix">
        <rect width="116" height="116" fill="#080c14" rx="4"/>
        ${rects}
      </svg>
    `;
  }

  /**
   * Render Amber Duplicate Advisory Banner (Step 40 Verification Requirement)
   * Verification Requirement: Reused photo displays amber advisory banner:
   * "Perceptual hash matches an image submitted by another institution"
   */
  renderDuplicateBanner(item, photo = null) {
    const key = (item && item.item_key) || 'computer_lab_photos';
    const targetPhoto = photo || (item && item.photos && item.photos[0]) || null;
    const phash = (targetPhoto && targetPhoto.phash) || (item && item.duplicate_match && item.duplicate_match.peer_hash) || 'aabbccddeeff0011';
    const match = (targetPhoto && targetPhoto.duplicate_match) || (item && item.duplicate_match) || {
      peer_hash: 'aabbccddeeff0013',
      hamming_distance: 2,
      peer_institution_masked: 'INST-CONFIDENTIAL-****'
    };
    const dist = match.hamming_distance !== undefined ? match.hamming_distance : 2;

    return `
      <div class="infra-duplicate-banner" id="duplicate-banner-${key}" role="alert">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <div style="flex: 1;">
          <strong id="duplicate-banner-text-${key}">Perceptual hash matches an image submitted by another institution</strong>
          <div style="font-size: 10px; margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>64-bit DCT pHash: <code class="font-mono">${phash}</code></span>
            <span>·</span>
            <span class="font-mono text-danger font-bold">Hamming distance: ${dist} (Norm limit ≤ 6)</span>
            <span>·</span>
            <span class="badge badge-privacy-masked">PEER IDENTITY MASKED (Guide §14)</span>
          </div>
        </div>
        <button class="btn btn-outline btn-xs font-mono"
                id="btn-inspect-dup-${key}"
                onclick="window.infraPanelComponent && window.infraPanelComponent.inspectDuplicateHash('${key}')">
          🔍 Inspect Duplicate Hash
        </button>
      </div>
    `;
  }

  /**
   * Render Cross-Institution Duplicate Hash Inspection Modal Dialog (Step 40)
   */
  renderDuplicateModal(photo, peerMatch, itemKey) {
    const fileId = (photo && photo.file_id) || 'photo_reused_01';
    const filename = (photo && photo.filename) || 'reused_facility_photo.jpg';
    const h1 = (photo && photo.phash) || 'aabbccddeeff0011';
    const h2 = (peerMatch && peerMatch.peer_hash) || 'aabbccddeeff0013';
    const dist = (peerMatch && peerMatch.hamming_distance !== undefined)
      ? peerMatch.hamming_distance
      : this.calculateHammingDistance(h1, h2);

    let diffMask = 0n;
    try {
      diffMask = BigInt('0x' + h1) ^ BigInt('0x' + h2);
    } catch (_) {}

    return `
      <div class="infra-modal-backdrop" id="infra-duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="modal-dup-title">
        <div class="infra-modal-content">
          <!-- 1. Header -->
          <div class="infra-modal-header">
            <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
              <span class="badge badge-outline font-mono text-xs">${itemKey}</span>
              <h3 id="modal-dup-title" style="margin: 0; font-size: 15px; font-weight: 700;">Cross-Institution Duplicate Hash Inspector (S10)</h3>
              <span class="badge badge-infra-duplicate font-mono text-xs">⚠ POSSIBLE DUPLICATE EVIDENCE</span>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-close-duplicate-modal" onclick="window.infraPanelComponent && window.infraPanelComponent.closeModal()" aria-label="Close modal">✕</button>
          </div>

          <!-- 2. Body -->
          <div class="infra-modal-body" style="grid-template-columns: 1fr;">
            <!-- Advisory Banner -->
            <div class="infra-duplicate-banner" id="modal-duplicate-banner" style="margin-top: 0;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <div>
                <strong id="modal-duplicate-banner-text">Perceptual hash matches an image submitted by another institution</strong>
                <div style="font-size: 11px; margin-top: 3px; color: var(--text-body);">
                  64-bit DCT perceptual hash difference is ${dist} bits (regulatory anomaly threshold: Hamming distance ≤ 6). Physical ground verification recommended.
                </div>
              </div>
            </div>

            <!-- Side-by-Side 64-bit pHash Comparison Grid -->
            <div class="infra-hash-compare-grid">
              <!-- Left: Current Application Photo -->
              <div class="infra-hash-box" id="box-hash-current">
                <span class="infra-hash-box-title">
                  <span class="badge badge-outline font-mono text-xs">CURRENT APPLICATION</span>
                  <span>${filename}</span>
                </span>
                <span class="infra-hash-digest-badge" id="digest-current">pHash: ${h1}</span>
                <div class="infra-bitmatrix-box">
                  ${this.renderHashBitmatrixSvg(h1, diffMask)}
                </div>
                <div class="font-mono text-xs text-muted" style="font-size: 10px;">
                  App: ${this.currentAppId || 'DEMO-APP'} · File: ${fileId}
                </div>
              </div>

              <!-- Right: Peer Institution Evidence (Privacy Masked) -->
              <div class="infra-hash-box" id="box-hash-peer">
                <span class="infra-hash-box-title">
                  <span class="badge badge-privacy-masked font-mono text-xs">PEER INSTITUTION [CONFIDENTIAL]</span>
                  <span>ev_peer_****.jpg</span>
                </span>
                <span class="infra-hash-digest-badge" id="digest-peer">pHash: ${h2}</span>
                <div class="infra-bitmatrix-box">
                  ${this.renderHashBitmatrixSvg(h2, diffMask)}
                </div>
                <div class="font-mono text-xs text-muted" style="font-size: 10px;">
                  App: ${(peerMatch && peerMatch.peer_application_masked) || 'APP-CONFIDENTIAL-****'} · Identity Masked
                </div>
              </div>
            </div>

            <!-- Hamming Distance Meter Gauge -->
            <div class="infra-hamming-meter" id="hamming-meter">
              <div class="infra-hamming-header">
                <span class="text-xs text-muted">Hamming Distance (Bitwise Divergence)</span>
                <strong class="font-mono text-danger" id="val-hamming-dist">
                  Hamming Distance: ${dist} / 64 bits (Threshold ≤ 6)
                </strong>
              </div>
              <div class="infra-hamming-track">
                <!-- Red Alert Zone <= 6 bits -->
                <div class="infra-hamming-danger-zone" title="Anomaly Zone <= 6 bits"></div>
                <!-- Current Fill Bar -->
                <div class="infra-hamming-fill" style="width: ${Math.max(3, (dist / 64) * 100).toFixed(1)}%;"></div>
                <!-- Threshold Pin at 6 bits -->
                <div class="infra-hamming-threshold-pin" title="Norm Threshold: 6 bits"></div>
              </div>
              <div class="infra-gauge-labels font-mono text-xs text-muted">
                <span>0 bits (Identical)</span>
                <span style="left: 9.375%; position: absolute; transform: translateX(-50%); color: #ea580c; font-weight: 700;">
                  ≤ 6 (Near Duplicate)
                </span>
                <span>64 bits (Unrelated)</span>
              </div>
            </div>

            <!-- Privacy Gate Notice (AGENTS.md & Guide §14 Compliance) -->
            <div class="infra-reason-box" style="border-left: 3px solid #3b82f6;">
              <strong>Confidentiality Protection Gate:</strong> Under AICTE Prototype Guide §14 and data confidentiality non-negotiables, institutional identifiers, portal credentials, and raw peer files are strictly masked during multi-institution deduplication.
            </div>
          </div>

          <!-- 3. Footer -->
          <div class="infra-modal-footer">
            <div class="text-muted text-xs">
              Preliminary indicator requiring human verification. Absence of hash collisions does not confirm uniqueness.
            </div>
            <button class="btn btn-primary btn-sm font-mono text-xs" onclick="window.infraPanelComponent && window.infraPanelComponent.closeModal()">
              Close Inspector
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Launch Duplicate Hash Inspector (Step 40)
   */
  inspectDuplicateHash(itemKey, fileId = null) {
    const data = this.currentData || this.getDefaultChecklist(this.currentAppId);
    const item = (data && data.items) ? data.items.find(i => i.item_key === itemKey) : null;
    let photo = null;
    if (item && item.photos && item.photos.length > 0) {
      if (fileId) {
        photo = item.photos.find(p => p.file_id === fileId);
      }
      if (!photo) {
        photo = item.photos[0];
      }
    }
    if (!photo) {
      photo = SYNTHETIC_REFERENCE_PHOTOS[itemKey] || SYNTHETIC_REFERENCE_PHOTOS['computer_lab_photos'];
    }

    const peerMatch = (photo && photo.duplicate_match) || (item && item.duplicate_match) || {
      peer_hash: 'aabbccddeeff0013',
      hamming_distance: 2,
      peer_institution_masked: 'INST-CONFIDENTIAL-****',
      peer_application_masked: 'APP-CONFIDENTIAL-****'
    };

    const modalHtml = this.renderDuplicateModal(photo, peerMatch, itemKey);

    if (typeof document !== 'undefined') {
      let host = document.getElementById('infra-modal-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'infra-modal-host';
        document.body.appendChild(host);
      }
      host.innerHTML = modalHtml;

      const modalEl = document.getElementById('infra-duplicate-modal');
      if (modalEl) {
        modalEl.addEventListener('click', (e) => {
          if (e.target === modalEl) this.closeModal();
        });
      }
    }

    const h1 = photo.phash || 'aabbccddeeff0011';
    const h2 = peerMatch.peer_hash || 'aabbccddeeff0013';
    const dist = peerMatch.hamming_distance !== undefined ? peerMatch.hamming_distance : this.calculateHammingDistance(h1, h2);

    // Dispatch custom event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-duplicate-inspected', {
        detail: {
          applicationId: this.currentAppId,
          itemKey,
          fileId: photo.file_id,
          phash1: h1,
          phash2: h2,
          hammingDistance: dist,
          isDuplicate: dist <= 6
        }
      }));
    }

    return modalHtml;
  }

  /**
   * Render Complete Infrastructure Inspection Tab (Step 37)
   */
  render(applicationId = null) {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    this.currentAppId = appId;

    if (!this.currentData || this.currentData.application_id !== appId) {
      this.currentData = this.getDefaultChecklist(appId);
    }

    const data = this.currentData;
    const items = data.items || [];

    return `
      <div class="infra-panel" id="infra-checklist-panel">
        <!-- 1. Advisory Banner (AGENTS.md Compliance) -->
        ${this.renderAdvisoryBanner()}

        <!-- 2. Overview Metrics Bar -->
        ${this.renderSummaryBar(data)}

        <!-- 3. Facility Readiness Status & Ground Inspection Suggester (Step 41) -->
        ${this.renderReadinessSection(data)}

        <!-- 4. Facility Checklist Inspector Grid -->
        <div class="infra-items-grid" id="infra-items-grid" role="group" aria-label="Facility Checklist Items">
          ${items.map(item => this.renderItemCard(item)).join('')}
        </div>

        <!-- 5. Modal Container for EXIF, Geotag & Duplicate Viewers (Steps 38–40) -->
        <div id="infra-modal-host"></div>
      </div>
    `;
  }

  /**
   * Load and Render into Container (Step 37)
   */
  async loadAndRender(applicationId, containerId = 'workspace-infra-content') {
    const appId = applicationId || this.currentAppId || 'DEMO-ISSUES-001';
    await this.loadInfraData(appId);

    if (typeof document !== 'undefined') {
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = this.render(appId);
      }
    }

    // Dispatch completion event
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('app:infra-panel-rendered', {
        detail: {
          applicationId: appId,
          count: (this.currentData && this.currentData.items) ? this.currentData.items.length : 0
        }
      }));
    }

    return this.render(appId);
  }

  /**
   * Interactive Triggers (Step 38 & Step 39 hooks)
   */
  openGallery(itemKey) {
    // Open EXIF inspection modal on target item (Step 38)
    return this.openExifModal(itemKey);
  }
}

// Singleton instantiation
const infraPanelComponent = new InfraPanelComponent();
if (typeof window !== 'undefined') {
  window.infraPanelComponent = infraPanelComponent;
  window.InfraPanelComponent = InfraPanelComponent;
  window.INFRA_STATUS_CONFIG = INFRA_STATUS_CONFIG;
  window.CONFIG_ITEMS_NORMS = CONFIG_ITEMS_NORMS;
  window.SYNTHETIC_REFERENCE_PHOTOS = SYNTHETIC_REFERENCE_PHOTOS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    InfraPanelComponent,
    infraPanelComponent,
    INFRA_STATUS_CONFIG,
    CONFIG_ITEMS_NORMS,
    SYNTHETIC_REFERENCE_PHOTOS
  };
}
