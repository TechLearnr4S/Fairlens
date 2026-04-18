"""
signing.py
==========
Ed25519 digital signing layer for FairLens Studio audit logs.

Design
------
- Uses Ed25519 (RFC 8032) — modern, fast, and produces compact 64-byte signatures.
- The private key is generated **once** at server startup and persisted to disk
  at the path defined by SIGNING_KEY_PATH (default: ./fairlens_signing.key).
- If a key file already exists it is loaded, not regenerated — ensuring
  signatures remain verifiable across restarts.
- The public key is exposed via get_public_key_pem() for independent verification.

Environment variables
---------------------
  SIGNING_KEY_PATH   Path where the PEM private key is stored.
                     Default: ./fairlens_signing.key

Usage
-----
    from signing import sign_hash, verify_signature, get_public_key_pem

    signature_hex = sign_hash("deadbeef1234...")
    ok = verify_signature("deadbeef1234...", signature_hex)
    pem = get_public_key_pem()

Dependencies
------------
    pip install cryptography
"""

from __future__ import annotations

import logging
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.exceptions import InvalidSignature

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_KEY_PATH: str = os.getenv("SIGNING_KEY_PATH", "fairlens_signing.key")

# Module-level singletons — loaded/generated once
_private_key: Ed25519PrivateKey | None = None
_public_key: Ed25519PublicKey | None = None


# ---------------------------------------------------------------------------
# Key Management
# ---------------------------------------------------------------------------

def _load_or_generate_keys() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    """
    Load the Ed25519 private key from disk, or generate + persist a new one.
    Called lazily on first use.
    """
    global _private_key, _public_key

    if _private_key is not None and _public_key is not None:
        return _private_key, _public_key

    if os.path.isfile(_KEY_PATH):
        # Load existing key
        with open(_KEY_PATH, "rb") as f:
            pem_data = f.read()
        _private_key = serialization.load_pem_private_key(pem_data, password=None)
        logger.info("Signing key loaded from %s", _KEY_PATH)
    else:
        # Generate and persist a new key
        _private_key = Ed25519PrivateKey.generate()
        pem_data = _private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        with open(_KEY_PATH, "wb") as f:
            f.write(pem_data)
        # Restrict file permissions (Unix only; silently skipped on Windows)
        try:
            os.chmod(_KEY_PATH, 0o600)
        except OSError:
            pass
        logger.info("New Ed25519 signing key generated and saved to %s", _KEY_PATH)

    _public_key = _private_key.public_key()
    return _private_key, _public_key


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def sign_hash(hash_hex: str) -> str:
    """
    Sign a hex-encoded hash string using the server's Ed25519 private key.

    Parameters
    ----------
    hash_hex : str
        The hex-encoded SHA-256 hash to sign (64 hex chars).

    Returns
    -------
    str
        Hex-encoded 64-byte Ed25519 signature.
    """
    priv, _ = _load_or_generate_keys()
    # Sign the raw bytes of the hash string (not decoded — we sign the hex text)
    signature_bytes = priv.sign(hash_hex.encode("utf-8"))
    return signature_bytes.hex()


def verify_signature(hash_hex: str, signature_hex: str) -> bool:
    """
    Verify an Ed25519 signature against a hash using the server's public key.

    Parameters
    ----------
    hash_hex : str
        The original hex-encoded hash that was signed.
    signature_hex : str
        The hex-encoded signature to verify.

    Returns
    -------
    bool
        True if the signature is valid, False otherwise.
    """
    _, pub = _load_or_generate_keys()
    try:
        sig_bytes = bytes.fromhex(signature_hex)
        pub.verify(sig_bytes, hash_hex.encode("utf-8"))
        return True
    except (InvalidSignature, ValueError):
        return False


def get_public_key_pem() -> str:
    """
    Return the server's Ed25519 public key as a PEM-encoded string.
    This can be shared with third parties so they can independently
    verify audit log signatures without access to the private key.

    Returns
    -------
    str
        PEM-encoded public key (begins with '-----BEGIN PUBLIC KEY-----').
    """
    _, pub = _load_or_generate_keys()
    return pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")


def get_public_key_hex() -> str:
    """
    Return the raw Ed25519 public key as a 64-character hex string
    (convenient for embedding in API responses or QR codes).
    """
    _, pub = _load_or_generate_keys()
    raw = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return raw.hex()
