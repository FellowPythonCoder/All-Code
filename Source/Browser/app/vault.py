import base64
import hashlib
import json
import secrets
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROUNDS = 200_000

class Vault:
    def __init__(self, store):
        self.store = store
        self.key = None
        self.unlocked = False

    def has_pin(self):
        pin, _ = self.store.pin_record()
        return bool(pin)

    def _derive(self, pin, salt):
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ROUNDS)
        return Fernet(base64.urlsafe_b64encode(kdf.derive(pin.encode("utf-8"))))

    def set_pin(self, pin, old=None):
        pin = (pin or "").strip()
        if len(pin) < 4:
            raise ValueError("Use at least four characters for the lock PIN")
        items = []
        if self.has_pin():
            self.unlock(old or "")
            items = self.items()
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, ROUNDS)
        self.store.save_pin(salt.hex() + "$" + digest.hex())
        self.key = self._derive(pin, salt)
        self.unlocked = True
        self._write(items)

    def unlock(self, pin):
        record, blob = self.store.pin_record()
        if not record or "$" not in record:
            raise ValueError("Set a lock PIN first")
        salt_hex, digest_hex = record.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        digest = hashlib.pbkdf2_hmac("sha256", (pin or "").encode("utf-8"), salt, ROUNDS)
        if not secrets.compare_digest(digest.hex(), digest_hex):
            raise ValueError("Wrong PIN")
        self.key = self._derive(pin, salt)
        if blob:
            try:
                self.key.decrypt(blob.encode("utf-8"))
            except InvalidToken as error:
                self.key = None
                raise ValueError("Password vault could not be opened") from error
        self.unlocked = True

    def lock(self):
        self.key = None
        self.unlocked = False

    def _read(self):
        if not self.unlocked or self.key is None:
            raise ValueError("Unlock to use saved passwords")
        _, blob = self.store.pin_record()
        if not blob:
            return []
        try:
            data = json.loads(self.key.decrypt(blob.encode("utf-8")))
        except (InvalidToken, ValueError, TypeError) as error:
            raise ValueError("Password vault could not be opened") from error
        return data if isinstance(data, list) else []

    def _write(self, items):
        if not self.unlocked or self.key is None:
            raise ValueError("Unlock to use saved passwords")
        self.store.save_vault(self.key.encrypt(json.dumps(items).encode("utf-8")).decode("utf-8"))

    def items(self, query=""):
        needle = query.lower().strip()
        result = []
        for item in self._read():
            if not isinstance(item, dict):
                continue
            hay = " ".join(str(item.get(key, "")) for key in ("title", "origin", "username")).lower()
            if needle in hay:
                result.append(item)
        return result

    def add(self, title, origin, username, password):
        items = self._read()
        items.append({"id": secrets.token_hex(8), "title": title[:200], "origin": origin[:500], "username": username[:200], "password": password[:500]})
        self._write(items)

    def update(self, identity, title, origin, username, password):
        items = self._read()
        for item in items:
            if item.get("id") == identity:
                item.update({"title": title[:200], "origin": origin[:500], "username": username[:200], "password": password[:500]})
                self._write(items)
                return
        raise ValueError("Password not found")

    def delete(self, identity):
        self._write([item for item in self._read() if item.get("id") != identity])

    def reveal(self, identity):
        for item in self._read():
            if item.get("id") == identity:
                return item
        raise ValueError("Password not found")

    def for_origin(self, origin):
        return [item for item in self._read() if item.get("origin") == origin]
