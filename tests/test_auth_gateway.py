"""Request-level tests for default-deny authentication middleware."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from services import auth, auth_store


class AuthGatewayTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.saved_env = {key: os.environ.get(key) for key in ("AUTH_DB_PATH", "SESSION_SECRET", "COOKIE_SECURE", "APP_BASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_REDIRECT_URI")}
        os.environ["AUTH_DB_PATH"] = str(Path(self.tempdir.name) / "auth.sqlite3")
        os.environ["SESSION_SECRET"] = "test-session-pepper"
        os.environ["COOKIE_SECURE"] = "false"
        os.environ["APP_BASE_URL"] = "http://testserver"
        for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OAUTH_REDIRECT_URI"):
            os.environ.pop(key, None)
        auth_store.init_auth_store()
        self.app = FastAPI()
        self.app.add_middleware(auth.AuthMiddleware)
        self.app.include_router(auth.router)

        @self.app.get("/health")
        def health():
            return {"status": "healthy"}

        @self.app.get("/api/private")
        def private_api(request: Request):
            return {"email": request.state.user["email"]}

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
        self.assertEqual(profile.json(), {"email": "user@example.org", "name": "Test User", "picture": None})
        self.assertEqual(self.client.get("/api/private").json(), {"email": "user@example.org"})
        self.assertEqual(self.client.post("/api/private", headers={"Origin": "http://evil.example"}).status_code, 403)

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


if __name__ == "__main__":
    unittest.main()
