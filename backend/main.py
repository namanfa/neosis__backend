import os
import logging
import threading
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Local runs can keep credentials in the ignored deploy/.env file. Compose passes
# its environment directly, so these file values never override deployment vars.
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(project_root, "deploy", ".env"), override=False)


class OAuthAccessLogFilter(logging.Filter):
    """Keep callback codes and state out of the standard Uvicorn access log."""
    def filter(self, record):
        if record.name == "uvicorn.access" and isinstance(record.args, tuple) and len(record.args) >= 3:
            values = list(record.args)
            request_target = str(values[2])
            if request_target.startswith("/auth/callback?"):
                values[2] = "/auth/callback"
                record.args = tuple(values)
        return True


logging.getLogger("uvicorn.access").addFilter(OAuthAccessLogFilter())

# Session directory configuration:
# On Windows / local development, use the project's output/sessions directory.
# On HuggingFace Spaces / Linux containers, use /tmp/noesis_sessions.
if not os.environ.get("SESSION_BASE_DIR"):
    if os.name == "nt":
        os.environ["SESSION_BASE_DIR"] = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "output", "sessions"))
    else:
        os.environ["SESSION_BASE_DIR"] = "/tmp/noesis_sessions"

SESSION_BASE_DIR = os.environ["SESSION_BASE_DIR"]
os.makedirs(SESSION_BASE_DIR, exist_ok=True)

from services import upload_handler, inference_engine, analytics, preview, export, converter, image_extraction, library, toolkit_library, auth
from services import auth_store
from storage import get_storage
from storage.brands import get_brands

app = FastAPI(title="SKU Labeler API")
app.state.storage = get_storage()
get_brands(app.state.storage)


def _warm_inference_imports():
    try:
        import torch
        from ultralytics import YOLO
    except Exception:
        pass


@app.on_event("startup")
async def start_inference_import_warmup():
    auth_store.init_auth_store()
    threading.Thread(target=_warm_inference_imports, name="inference-import-warmup", daemon=True).start()

app.add_middleware(auth.AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["APP_BASE_URL"].rstrip("/")] if os.environ.get("APP_BASE_URL") else [],
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Requested-With"],
)

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "service": "neosis-backend"}

app.include_router(upload_handler.router, prefix="/api/sessions", tags=["Upload"])
app.include_router(inference_engine.router, prefix="/api/sessions", tags=["Inference"])
app.include_router(analytics.router, prefix="/api/sessions", tags=["Analytics"])
app.include_router(preview.router, prefix="/api/sessions", tags=["Preview"])
app.include_router(export.router, prefix="/api/sessions", tags=["Export"])
# Stateless .pt → .onnx conversion endpoint (no session needed)
app.include_router(converter.router, tags=["Convert"])
app.include_router(image_extraction.router, tags=["Image Extraction"])
app.include_router(library.router, tags=["Library Storage"])
app.include_router(toolkit_library.router)
app.include_router(auth.router)

# These source files are compiled by the browser, so always revalidate them and
# the app shell before reuse. This prevents a cached page from mixing releases.
@app.middleware("http")
async def revalidate_frontend_assets(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in {"/", "/index.html", "/login", "/login.html", "/favicon.ico", "/SKULabeler.jsx", "/ToolkitPages.jsx"} or path.startswith("/logo/"):
        response.headers["Cache-Control"] = "no-cache, max-age=0, must-revalidate"
    return response

# Serve frontend for local operation if files are present
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
index_file = os.path.join(frontend_dir, "index.html")
jsx_file = os.path.join(frontend_dir, "SKULabeler.jsx")
toolkit_jsx_file = os.path.join(frontend_dir, "ToolkitPages.jsx")
login_file = os.path.join(frontend_dir, "login.html")
logo_dir = os.path.join(frontend_dir, "logo")

if os.path.isdir(logo_dir):
    app.mount("/logo", StaticFiles(directory=logo_dir), name="logo")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)

if os.path.exists(index_file):
    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    async def serve_index():
        return FileResponse(index_file)

if os.path.exists(login_file):
    @app.get("/login", include_in_schema=False)
    @app.get("/login.html", include_in_schema=False)
    async def serve_login():
        return FileResponse(login_file)

if os.path.exists(jsx_file):
    @app.get("/SKULabeler.jsx", include_in_schema=False)
    async def serve_jsx():
        return FileResponse(jsx_file, media_type="text/javascript")

if os.path.exists(toolkit_jsx_file):
    @app.get("/ToolkitPages.jsx", include_in_schema=False)
    async def serve_toolkit_jsx():
        return FileResponse(toolkit_jsx_file, media_type="text/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=7860)
