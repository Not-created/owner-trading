"""
Security Engine.
- Fernet symmetric encryption for secrets at rest (broker credentials, AI keys, etc.)
- Password hashing (bcrypt)
- Secure token generation
"""
import secrets
import bcrypt
from cryptography.fernet import Fernet

from core.config import get_settings


class EncryptionService:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")


_enc: EncryptionService | None = None


def get_encryption() -> EncryptionService:
    global _enc
    if _enc is None:
        _enc = EncryptionService(get_settings().encryption_key)
    return _enc


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def secure_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)
