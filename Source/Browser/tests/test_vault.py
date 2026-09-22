from app.store import Store
from app.vault import Vault

def test_wrong_pin_rejected(tmp_path):
    store = Store(tmp_path / "sreon.sqlite")
    vault = Vault(store)
    vault.set_pin("good-pin")
    vault.lock()
    try:
        vault.unlock("nope")
        raise AssertionError("wrong pin must fail")
    except ValueError:
        pass
    assert vault.unlocked is False
    store.close()

def test_passwords_hidden_until_unlock(tmp_path):
    store = Store(tmp_path / "sreon.sqlite")
    vault = Vault(store)
    vault.set_pin("good-pin")
    vault.add("Mail", "https://mail.example", "ada", "secret")
    vault.lock()
    try:
        vault.items()
        raise AssertionError("locked vault must not list passwords")
    except ValueError:
        pass
    vault.unlock("good-pin")
    rows = vault.items()
    assert rows[0]["username"] == "ada"
    assert vault.reveal(rows[0]["id"])["password"] == "secret"
    store.close()
