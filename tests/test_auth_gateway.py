"""Request-level tests for default-deny authentication middleware."""
import os
import sys
import tempfile
import unittest
import asyncio
import base64
import types
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import auth, auth_store


class AuthGatewayTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.saved_env = {key: os.environ.get(key) for key in ("AUTH_DB_PATH", "SESSION_SECRET", "COOKIE_SECURE", "APP_BASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_REDIRECT_URI", "GOOGLE_SIGNIN_ENABLED", "MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_REDIRECT_URI", "ALLOWED_EMAIL_DOMAINS", "ALLOWED_EMAILS")}
        os.environ["AUTH_DB_PATH"] = str(Path(self.tempdir.name) / "auth.sqlite3")
        os.environ["SESSION_SECRET"] = "test-session-pepper"
        os.environ["COOKIE_SECURE"] = "false"
        os.environ["APP_BASE_URL"] = "http://testserver"
        for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_REDIRECT_URI", "GOOGLE_SIGNIN_ENABLED", "MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_REDIRECT_URI"):
            os.environ.pop(key, None)
        os.environ["ALLOWED_EMAIL_DOMAINS"] = "flick2know.com,fieldassist.in"
        auth_store.init_auth_store()
        self.app = FastAPI()
        self.app.add_middleware(auth.AuthMiddleware)
        self.app.include_router(auth.router)

        @self.app.get("/health")
        def health():
            return {"status": "healthy"}

        @self.app.get("/api/private")
        def private_api(request: Request):
            return {"email": request.state.user["email"], "role": request.state.user["role"]}

        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        for key, value in self.saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tempdir.cleanup()

    def test_only_health_and_auth_surface_are_public(self):
        self.assertEqual(self.client.get("/health").status_code, 200)
        page = self.client.get("/", follow_redirects=False)
        self.assertEqual(page.status_code, 302)
        self.assertIn("/login?", page.headers["location"])
        self.assertEqual(self.client.get("/SKULabeler.jsx", follow_redirects=False).status_code, 302)
        for asset in ("/logo/neosis-mark.svg", "/logo/fa-icon-blue.png", "/logo/fa-wordmark-blue.png"):
            with self.subTest(asset=asset):
                self.assertNotEqual(self.client.get(asset, follow_redirects=False).status_code, 302)
        self.assertEqual(self.client.get("/api/private").status_code, 401)
        self.assertEqual(self.client.get("/auth/me").status_code, 401)

    def test_unauthenticated_api_groups_return_json_401(self):
        paths = (
            ("GET", "/api/tools/brands"),
            ("GET", "/api/library/objects/private/file.jpg"),
            ("GET", "/api/sessions/00000000-0000-0000-0000-000000000000/export"),
            ("GET", "/api/extract/download/00000000-0000-0000-0000-000000000000"),
            ("POST", "/api/sessions"),
            ("POST", "/api/extract/columns"),
            ("POST", "/api/convert"),
        )
        for method, path in paths:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, headers={"Origin": "http://testserver"})
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json(), {"detail": "Authentication required"})

    def test_origin_check_and_authenticated_profile(self):
        self.assertEqual(self.client.post("/api/private").status_code, 403)
        token = auth_store.create_session("user@example.org", "Test User", "", 480, 7)
        self.client.cookies.set(auth.cookie_name(), token)
        profile = self.client.get("/auth/me")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json(), {"email": "user@example.org", "name": "Test User", "picture": None, "role": "Viewer"})
        self.assertEqual(self.client.get("/api/private").json(), {"email": "user@example.org", "role": "Viewer"})
        self.assertEqual(self.client.post("/api/private", headers={"Origin": "http://evil.example"}).status_code, 403)

    def test_role_is_rechecked_from_the_database_on_each_request(self):
        token = auth_store.create_session("user@example.org", "Test User", "", 480, 7)
        self.client.cookies.set(auth.cookie_name(), token)
        self.assertEqual(self.client.get("/api/private").json()["role"], "Viewer")
        auth_store.add_ir_member("USER@example.org")
        self.assertEqual(self.client.get("/api/private").json()["role"], "IR")
        self.assertEqual(self.client.get("/auth/me").json()["role"], "IR")
        auth_store.remove_ir_member("user@example.org")
        self.assertEqual(self.client.get("/api/private").json()["role"], "Viewer")

    def test_logout_invalidates_the_old_session_cookie(self):
        token = auth_store.create_session("user@example.org", "Test User", "", 480, 7)
        self.client.cookies.set(auth.cookie_name(), token)
        response = self.client.post("/auth/logout", headers={"Origin": "http://testserver"}, follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(self.client.get("/auth/me").status_code, 401)

    def test_missing_google_configuration_fails_closed_with_clear_state(self):
        response = self.client.get("/auth/login?next=https%3A%2F%2Fevil.example", follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertIn("error=not_configured", response.headers["location"])
        self.assertIn("next=%2F%23%2F", response.headers["location"])

    def test_health_public_and_providers_public_but_private_routes_still_require_login(self):
        self.assertEqual(self.client.get("/auth/providers").status_code, 200)
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/api/private").status_code, 401)

    def test_google_login_is_active_and_microsoft_endpoint_remains_configurable(self):
        os.environ["GOOGLE_SIGNIN_ENABLED"] = "false"
        os.environ["GOOGLE_CLIENT_ID"] = "google-client"
        os.environ["GOOGLE_CLIENT_SECRET"] = "google-secret"
        os.environ["MICROSOFT_TENANT_ID"] = "11111111-2222-4333-8444-555555555555"
        os.environ["MICROSOFT_CLIENT_ID"] = "entra-client"
        os.environ["MICROSOFT_CLIENT_SECRET"] = "entra-secret"
        os.environ["OAUTH_REDIRECT_URI"] = "http://testserver/auth/callback"
        providers = self.client.get("/auth/providers").json()
        self.assertEqual(providers, {"google": True, "microsoft": True})
        response = self.client.get("/auth/login", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?"))
        entra = self.client.get("/auth/microsoft/login", follow_redirects=False)
        self.assertEqual(entra.status_code, 302)
        self.assertIn("login.microsoftonline.com/11111111-2222-4333-8444-555555555555/", entra.headers["location"])
        self.assertIn("code_challenge=", entra.headers["location"])

    def test_google_signin_redirects_to_google_oauth(self):
        os.environ.update({"GOOGLE_CLIENT_ID":"google-client",
                           "GOOGLE_CLIENT_SECRET":"test-secret", "OAUTH_REDIRECT_URI":"http://testserver/auth/callback"})
        response = self.client.get("/auth/login", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?"))

    def test_microsoft_oidc_checks_tenant_and_allowlists_normalized_email(self):
        from unittest.mock import AsyncMock

        os.environ["MICROSOFT_TENANT_ID"] = "11111111-2222-4333-8444-555555555555"
        os.environ["ALLOWED_EMAIL_DOMAINS"] = "fieldassist.in"
        header = base64.urlsafe_b64encode(b'{"alg":"RS256","kid":"key-1"}').decode().rstrip("=")
        token = header + ".payload.signature"
        class Claims(dict):
            def validate(self, leeway=0):
                return None
        claims = Claims({"iss":"https://login.microsoftonline.com/11111111-2222-4333-8444-555555555555/v2.0", "tid":"11111111-2222-4333-8444-555555555555",
                         "aud":"entra-client", "nonce":"nonce-value", "oid":"stable-object-id",
                         "email":"USER@FieldAssist.IN", "exp":9999999999,"iat":1,"name":"User"})
        transaction = {"nonce":"nonce-value"}
        jwt = mock.Mock()
        jwt.decode.return_value = claims
        jose = types.ModuleType("authlib.jose")
        jose.JsonWebToken = mock.Mock(return_value=jwt)
        authlib = types.ModuleType("authlib")
        authlib.jose = jose
        with mock.patch.dict(sys.modules, {"authlib": authlib, "authlib.jose": jose}), \
             mock.patch.object(auth, "_microsoft_signing_keys", new=AsyncMock(return_value=object())):
            validated = asyncio.run(auth._verify_microsoft_id_token(token, transaction, "entra-client"))
        self.assertEqual(validated["oid"], "stable-object-id")
        self.assertTrue(auth._allowed_email(validated["email"].casefold()))
        claims["tid"] = "66666666-7777-4888-8999-aaaaaaaaaaaa"
        claims["iss"] = "https://login.microsoftonline.com/66666666-7777-4888-8999-aaaaaaaaaaaa/v2.0"
        with mock.patch.dict(sys.modules, {"authlib": authlib, "authlib.jose": jose}), \
             mock.patch.object(auth, "_microsoft_signing_keys", new=AsyncMock(return_value=object())):
            with self.assertRaises(ValueError):
                asyncio.run(auth._verify_microsoft_id_token(token, transaction, "entra-client"))
        self.assertFalse(auth._allowed_email("user@evil-fieldassist.in"))

    def test_microsoft_callback_creates_session_for_allowed_domain_only_with_mocked_provider(self):
        from unittest.mock import AsyncMock

        os.environ.update({"MICROSOFT_TENANT_ID":"11111111-2222-4333-8444-555555555555",
                           "MICROSOFT_CLIENT_ID":"entra-client", "MICROSOFT_CLIENT_SECRET":"test-secret",
                           "OAUTH_REDIRECT_URI":"http://testserver/auth/callback",
                           "ALLOWED_EMAIL_DOMAINS":"fieldassist.in"})
        class FakeResponse:
            def raise_for_status(self):
                return None
            def json(self):
                return {"id_token":"mocked-id-token"}
        class FakeClient:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                return False
            async def post(self, *args, **kwargs):
                return FakeResponse()
        claims = {"email":"Person@FieldAssist.IN", "oid":"verified-object-id", "name":"Person"}
        auth_store.save_oauth_transaction("microsoft-state", "nonce", "pkce-verifier", "/#/", provider="microsoft")
        with mock.patch.object(auth.httpx, "AsyncClient", return_value=FakeClient()), \
             mock.patch.object(auth, "_verify_microsoft_id_token", new=AsyncMock(return_value=claims)):
            response = self.client.get("/auth/callback?state=microsoft-state&code=mock-code", follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/#/")
        self.assertIn(auth.cookie_name(), response.cookies)
        self.client.cookies.set(auth.cookie_name(), response.cookies[auth.cookie_name()])
        self.assertEqual(self.client.get("/auth/me").json()["email"], "person@fieldassist.in")

        auth_store.save_oauth_transaction("microsoft-renamed", "nonce", "pkce-verifier", "/#/", provider="microsoft")
        renamed_claims = {"email":"Another@FieldAssist.IN", "oid":"verified-object-id", "name":"Person"}
        with mock.patch.object(auth.httpx, "AsyncClient", return_value=FakeClient()), \
             mock.patch.object(auth, "_verify_microsoft_id_token", new=AsyncMock(return_value=renamed_claims)):
            renamed = self.client.get("/auth/callback?state=microsoft-renamed&code=mock-code", follow_redirects=False)
        self.assertIn("error=microsoft_verification_failed", renamed.headers["location"])

        auth_store.save_oauth_transaction("microsoft-denied", "nonce", "pkce-verifier", "/#/", provider="microsoft")
        denied_claims = {"email":"Person@attacker.example", "oid":"verified-object-id", "name":"Person"}
        with mock.patch.object(auth.httpx, "AsyncClient", return_value=FakeClient()), \
             mock.patch.object(auth, "_verify_microsoft_id_token", new=AsyncMock(return_value=denied_claims)):
            denied = self.client.get("/auth/callback?state=microsoft-denied&code=mock-code", follow_redirects=False)
        self.assertIn("error=access_denied", denied.headers["location"])


if __name__ == "__main__":
    unittest.main()
