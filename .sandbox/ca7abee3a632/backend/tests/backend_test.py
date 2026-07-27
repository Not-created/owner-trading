"""Enterprise AI Trading Platform - Backend regression tests."""
import os, time, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-broker-core.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
USER = "NS4039"
PWD = "40394039"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_client(client):
    r = client.post(f"{API}/auth/login", json={"login": USER, "password": PWD})
    assert r.status_code == 200, r.text
    return client


# ---------- Auth ----------
class TestAuth:
    def test_login_ok(self, client):
        r = client.post(f"{API}/auth/login", json={"login": USER, "password": PWD})
        assert r.status_code == 200
        assert "access_token" in r.cookies or "access_token" in r.cookies.get_dict() or r.json()

    def test_me(self, auth_client):
        r = auth_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        u = d.get("user", d)
        assert u.get("username") == USER

    def test_refresh(self, auth_client):
        r = auth_client.post(f"{API}/auth/refresh")
        assert r.status_code == 200, r.text

    def test_change_password_wrong(self, auth_client):
        r = auth_client.post(f"{API}/auth/change-password",
                             json={"current_password": "wrong", "new_password": "someNew123!"})
        assert r.status_code == 400, r.text

    def test_change_password_roundtrip(self, auth_client):
        new_pw = "TempPass9999!"
        r = auth_client.post(f"{API}/auth/change-password",
                             json={"current_password": PWD, "new_password": new_pw})
        assert r.status_code == 200, r.text
        # revert
        r2 = auth_client.post(f"{API}/auth/change-password",
                              json={"current_password": new_pw, "new_password": PWD})
        assert r2.status_code == 200, r2.text

    def test_logout_and_me_401(self, client):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"login": USER, "password": PWD})
        assert r.status_code == 200
        r = s.post(f"{API}/auth/logout")
        assert r.status_code in (200, 204)
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_brute_force_lockout(self):
        # Use a unique login string so parallel successful logins don't reset counter
        import uuid
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        bogus = f"lockout_{uuid.uuid4().hex[:8]}"
        codes = []
        for _ in range(10):  # allow extra for ingress IP rotation
            r = s.post(f"{API}/auth/login", json={"login": bogus, "password": "badpass"})
            codes.append(r.status_code)
        # KNOWN BUG: identifier = f"{request.client.host}:{login}" — ingress load-balances,
        # so IP rotates and lockout may not accumulate to 5 per identifier.
        assert 429 in codes, f"Expected 429 lockout, got {codes} (likely ingress-IP rotation bug)"


# ---------- AI ----------
class TestAI:
    def test_providers(self, auth_client):
        r = auth_client.get(f"{API}/ai/providers")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_health(self, auth_client):
        r = auth_client.get(f"{API}/ai/health")
        assert r.status_code == 200

    def test_chat_prompt_schema(self, auth_client):
        r = auth_client.post(f"{API}/ai/chat", json={"prompt": "Say pong"})
        assert r.status_code == 200, r.text
        d = r.json()
        # response has text somewhere
        assert any(k in d for k in ("text", "response", "content", "output"))


# ---------- Brokers ----------
class TestBrokers:
    def test_broker_plugins_alpaca_registered(self, auth_client):
        r = auth_client.get(f"{API}/brokers/plugins")
        assert r.status_code == 200
        d = r.json()
        plugins = d.get("plugins", d) if isinstance(d, dict) else d
        assert isinstance(plugins, list)
        ids = {p["plugin_id"] for p in plugins}
        assert "alpaca" in ids

    def test_create_account_nonexistent_plugin(self, auth_client):
        r = auth_client.post(f"{API}/brokers/accounts",
                             json={"plugin_id": "nonexistent", "label": "test", "credentials": {}})
        assert r.status_code == 404, r.text


# ---------- Plugins ----------
class TestPlugins:
    def test_plugin_lifecycle(self, auth_client):
        pid = "demo"
        # cleanup first (idempotent)
        auth_client.delete(f"{API}/plugins/{pid}")
        r = auth_client.post(f"{API}/plugins",
                             json={"plugin_id": pid, "name": "Demo", "version": "1.0.0", "kind": "generic"})
        assert r.status_code in (200, 201), r.text
        r = auth_client.post(f"{API}/plugins/{pid}/disable")
        assert r.status_code == 200, r.text
        r = auth_client.post(f"{API}/plugins/{pid}/enable")
        assert r.status_code == 200, r.text
        r = auth_client.delete(f"{API}/plugins/{pid}")
        assert r.status_code in (200, 204), r.text


# ---------- Settings ----------
class TestSettings:
    def test_update_and_get_system(self, auth_client):
        r = auth_client.put(f"{API}/settings/system", json={"platform_name": "TEST_Platform"})
        assert r.status_code == 200, r.text
        r = auth_client.get(f"{API}/settings/system")
        assert r.status_code == 200
        d = r.json()
        # value should be persisted
        val = d.get("platform_name") or d.get("value", {}).get("platform_name")
        assert val == "TEST_Platform", d


# ---------- Users ----------
class TestUsers:
    def test_update_display_name(self, auth_client):
        r = auth_client.patch(f"{API}/users/me/profile", json={"display_name": "TEST_Name"})
        assert r.status_code == 200, r.text
        r = auth_client.get(f"{API}/users/me")
        assert r.status_code == 200
        u = r.json().get("user", r.json())
        assert u.get("profile", {}).get("display_name") == "TEST_Name"


# ---------- Logs ----------
class TestLogs:
    def test_logs_filter(self, auth_client):
        r = auth_client.get(f"{API}/logs", params={"level": "info", "category": "auth"})
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("logs", []))
        for it in items:
            assert (it.get("level") or "").lower() == "info"
            assert (it.get("category") or "").lower() == "auth"
