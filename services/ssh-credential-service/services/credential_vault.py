import os
import base64
import hashlib
import logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from typing import Tuple

logger = logging.getLogger(__name__)

# Master encryption key from environment — MUST be 32 bytes (base64-encoded)
PEM_ENCRYPTION_MASTER_KEY = os.getenv("PEM_ENCRYPTION_MASTER_KEY", "")


class CredentialVault:
    """
    Handles AES-256-GCM encryption and decryption of PEM files.
    
    Security design:
    - PEM files are encrypted with AES-256-GCM using a per-tenant key derived from master key
    - Nonce is prepended to the ciphertext for storage
    - Encrypted blobs are stored in Azure Blob Storage
    - Only metadata (fingerprint, name) is stored in PostgreSQL — never the PEM content
    - PEM content is NEVER logged
    """

    def __init__(self, master_key: str = None):
        key_b64 = master_key or PEM_ENCRYPTION_MASTER_KEY
        if not key_b64:
            logger.warning(
                "PEM_ENCRYPTION_MASTER_KEY not set. "
                "Using a deterministic fallback key — NOT SAFE FOR PRODUCTION."
            )
            # Deterministic fallback for development only
            key_b64 = base64.b64encode(b"dev-only-insecure-key-32-bytes!").decode()

        try:
            self.master_key = base64.b64decode(key_b64)
            if len(self.master_key) != 32:
                raise ValueError(f"Master key must be 32 bytes, got {len(self.master_key)}")
        except Exception as e:
            logger.error(f"Invalid master key: {e}")
            raise ValueError("PEM_ENCRYPTION_MASTER_KEY must be a valid base64-encoded 32-byte key")

    def _derive_tenant_key(self, tenant_id: str) -> bytes:
        """Derive a per-tenant encryption key from the master key using HKDF-like approach."""
        # Simple key derivation: HMAC-SHA256(master_key, tenant_id)
        import hmac
        derived = hmac.new(self.master_key, tenant_id.encode(), hashlib.sha256).digest()
        return derived  # 32 bytes

    def encrypt_pem(self, pem_content: bytes, tenant_id: str) -> bytes:
        """
        Encrypt PEM file content using AES-256-GCM.
        Returns: nonce (12 bytes) + ciphertext (includes GCM tag)
        """
        key = self._derive_tenant_key(tenant_id)
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)  # 96-bit nonce for GCM
        ciphertext = aesgcm.encrypt(nonce, pem_content, None)
        return nonce + ciphertext

    def decrypt_pem(self, encrypted_data: bytes, tenant_id: str) -> bytes:
        """
        Decrypt PEM file content.
        Input: nonce (12 bytes) + ciphertext (includes GCM tag)
        Returns: plaintext PEM content
        """
        key = self._derive_tenant_key(tenant_id)
        nonce = encrypted_data[:12]
        ciphertext = encrypted_data[12:]
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, None)

    @staticmethod
    def get_pem_fingerprint(pem_content: bytes) -> str:
        """
        Calculate SHA256 fingerprint of a PEM private key.
        This fingerprint is used to match against AWS key pairs.
        """
        try:
            private_key = load_pem_private_key(pem_content, password=None)
            # Get the public key bytes in DER format for fingerprinting
            from cryptography.hazmat.primitives.serialization import (
                Encoding, PublicFormat
            )
            public_key_der = private_key.public_key().public_bytes(
                Encoding.DER, PublicFormat.SubjectPublicKeyInfo
            )
            fingerprint = hashlib.sha256(public_key_der).hexdigest()
            return fingerprint
        except Exception as e:
            logger.error(f"Failed to compute PEM fingerprint: {e}")
            raise ValueError(f"Invalid PEM file: {e}")

    @staticmethod
    def validate_pem(pem_content: bytes) -> Tuple[bool, str]:
        """
        Validate that the provided content is a valid PEM private key.
        Returns (is_valid, error_message).
        """
        try:
            load_pem_private_key(pem_content, password=None)
            return True, ""
        except Exception as e:
            return False, f"Invalid PEM file: {str(e)}"
