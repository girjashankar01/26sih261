"""
Cryptographic trust roots and validation context for digital signatures (Guide §5.2).
Provides stand-in demo root for simulated issuer verification in Phase A.
Strictly disables network fetching (allow_fetching=False).
"""
import datetime
from asn1crypto.x509 import Certificate as Asn1Cert
from asn1crypto.keys import PrivateKeyInfo
from cryptography import x509 as cx509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pyhanko.sign.validation import ValidationContext
from pyhanko_certvalidator.registry import SimpleCertificateStore


# Pinned demo stand-in root CA certificate & private key (PEM format)
# Note: For synthetic test/demo environments only; production anchors to CCA India roots.
DEMO_CA_KEY_PEM = b"""-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQChPPv0qLiagANp
rBvlXVZnSjepjiKHIYsrEImNejmyk+JhfcutuUmZqDmMaO18z0VwfqkXJig1n/JZ
wZdSU0FBTVqNUPNwh0FMMcYYTL7VHO+7UGuW4YdXEzoL58bG/59SZcCCJwaG7Ubh
K0KcQXyHiB9mT2kSMyKd+nAx9tWNIyRSng6xdwnnUz5JgHHwDTO9C1Qmx+6pAZ7U
8TXdnp4zjwWmdpV4l9KnzyJYaHgryFKX3tNlIy7m6Zmx0YfoRie5H5x9KbGFxi5+
VJl6bJXuTKq4NLbGYO/BX8mRexrfqn9Bi5It10YFo5btpAy1pHW8iP6ao7fKoH1m
E6lNeMt9AgMBAAECggEAAdD4TJ3+8FybTTwvV0LZJ5I2NM6BVJDb6rkFt6aGEl0o
mm0Kl5MkAVtcBJkk/bgvAdCncnePUeVSm1C7NeXysPvgVoGwMFcRtPxFjT4GE0v/
ZlaGU72IIwK4L2yluFWmU40KYVzzrZ7sIrq0RiLVtoghxGsGFbqmO+3XiDSN3Mhh
OwW8Tc6wheBlYI/DVg08eHefJkQ4FFIEJDF6lgzfZs7lEEfkmL+Bva0YQp+8WKdy
JgRcp9Y7Z6o2Rtsyip7ooTlG4frQY+9UYDxwAD3m8DQ3i0p6lF2zHXMHZ4FmPzzp
JallLX/0sIoLMSZdnLqGpMKfId2dxKVXBcwAUFU/0QKBgQDP50kExVPsiFX2y3md
gHnSKrDw3seJWr11y+VkCaGW1pleP1pIDK15ZIzQFjASDiptYvwakmrqOyKMG7Js
j3VPnCIkKPpcAW6v2ByG8NibyHyZtFuUmdk2B7R7m8VV39dcemJl/Xf56iMml6tE
hTwE8x/zWDWP42ZTrYSkKQD4zQKBgQDGighggyfxDHy259QQZ2bQYSrA8mVbq1b8
UQuMo15mZqcn58abZR4beZW9l/WoIEoiE63d8eGJR5u6QJDhrGdXKDSn1V+qj8uj
52OYlkTD7cGW815sWVbsvCIfZQDX7+fO7BOkYThOn4nlCspPp7v4A1CiXf+qHBJQ
Kh3DOkrdcQKBgQCXh0UK+x+d6AhvpgHvr7IaYg8wn87i54XrEz8P2I0zuRlzPc15
cfQF5ClViLZkknqN23VPkKPoME2PvKggw7aG3Y9st4kyAcFA3Mx99ZCKimd2R6Pv
/On5nUgIR5JecpUuy+xn1YPaXLJd8HFdsZX7LZB99i6jvuPX3UItu8z/iQKBgFbn
rtkIMCCcda7edX4ktOV70uoYcHOa4X2awDJ0hGrQflTCaLY2oeIm63vNG5PXZnva
H14qda3QsYLqpkCSZb3J9JqOlMylGt+I9pihFkKpPPclWmyVAq6nf0w8uwzKj66M
ueBXSf1oakTe30XUxzu9v7sC6Fl+5ik+9j4xsvmRAoGAGzbFwLxuVDYgFepY54Ny
m0BQ4CtxcqkQf8hCZzUGC3JP+fcV2TiY/Lnrvyx+5FDVyIgbOVjGTDYfqGv1xTSv
1fCwLNFgSTuVbb4NggaZfg6iLToownbWzY05gRAtD7Aqy6gC8ZcQX5ylErNJy/7b
4D2R1qyRpeQNfd9YKB/5PW4=
-----END PRIVATE KEY-----"""

DEMO_CA_CERT_PEM = b"""-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgICA+kwDQYJKoZIhvcNAQELBQAwWTELMAkGA1UEBhMCSU4x
JDAiBgNVBAoMG0FJQ1RFIERlY2lzaW9uIFN1cHBvcnQgRGVtbzEkMCIGA1UEAwwb
QUlDVEUgRGVtbyBTdGFuZC1pbiBSb290IENBMB4XDTI1MDEwMTAwMDAwMFoXDTM1
MDEwMTAwMDAwMFowWTELMAkGA1UEBhMCSU4xJDAiBgNVBAoMG0FJQ1RFIERlY2lz
aW9uIFN1cHBvcnQgRGVtbzEkMCIGA1UEAwwbQUlDVEUgRGVtbyBTdGFuZC1pbiBS
b290IENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoTz79Ki4moAD
aawb5V1WZ0o3qY4ihyGLKxCJjXo5spPiYX3LrblJmag5jGjtfM9FcH6pFyYoNZ/y
WcGXUlNBQU1ajVDzcIdBTDHGGEy+1Rzvu1BrluGHVxM6C+fGxv+fUmXAgicGhu1G
4StCnEF8h4gfZk9pEjMinfpwMfbVjSMkUp4OsXcJ51M+SYBx8A0zvQtUJsfuqQGe
1PE13Z6eM48FpnaVeJfSp88iWGh4K8hSl97TZSMu5umZsdGH6EYnuR+cfSmxhcYu
flSZemyV7kyquDS2xmDvwV/JkXsa36p/QYuSLddGBaOW7aQMtaR1vIj+mqO3yqB9
ZhOpTXjLfQIDAQABoxMwETAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4IBAQCK/zsBwzriIacZo8RREd6TlwZ4MjcBJyj0mTX6qxry213Ng+dVTrI8cEL3
pQy2ZCVozHgdym21/vd8SRNGnrcOrIlm+YtJatqW+PfVFZzSuTfGK1ck6cotg/Ll
mPyZCj0MmM2+ue2SkhFK2WiwQ+wbDQaarXpegbFv1SdUf9GaS6EKcryXtkhSHywT
/vhoylivtIgjjiRnHCXJnbTBGMztEhU5oOD3SQ6QKUnr9k6uq8dP7FllsQGlMMvf
NVMH8Gh+jh9hUIq8EeAaXX/JCdtnIw58blPyBBIFWCyFtkFk6Mm8C1AAFnZ9HpdW
ymWA3dQwnYOvsxFU4CMiDblhYl/b
-----END CERTIFICATE-----"""

_DEMO_KEY = serialization.load_pem_private_key(DEMO_CA_KEY_PEM, password=None)
_DEMO_CERT = cx509.load_pem_x509_certificate(DEMO_CA_CERT_PEM)
_DEMO_CERT_DER = _DEMO_CERT.public_bytes(serialization.Encoding.DER)
_DEMO_KEY_DER = _DEMO_KEY.private_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)
DEMO_ASN1_CERT = Asn1Cert.load(_DEMO_CERT_DER)
DEMO_ASN1_KEY = PrivateKeyInfo.load(_DEMO_KEY_DER)


def get_demo_validation_context(extra_roots: list[Asn1Cert] | None = None) -> ValidationContext:
    """
    Construct pyHanko ValidationContext with stand-in demo root and network fetching disabled.
    Guide §5.2: allow_fetching=False.
    """
    roots = [DEMO_ASN1_CERT]
    if extra_roots:
        roots.extend(extra_roots)
    return ValidationContext(trust_roots=roots, allow_fetching=False)


def get_untrusted_validation_context() -> ValidationContext:
    """
    Validation context with no trusted roots, strictly enforcing allow_fetching=False.
    """
    return ValidationContext(trust_roots=[], allow_fetching=False)
