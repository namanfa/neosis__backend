import os
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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

from services import upload_handler, inference_engine, analytics, preview, export, converter

app = FastAPI(title="SKU Labeler API")


def _warm_inference_imports():
    try:
        import torch
        from ultralytics import YOLO
    except Exception:
        pass


@app.on_event("startup")
async def start_inference_import_warmup():
    threading.Thread(target=_warm_inference_imports, name="inference-import-warmup", daemon=True).start()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

# Serve frontend for local operation if files are present
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
index_file = os.path.join(frontend_dir, "index.html")
jsx_file = os.path.join(frontend_dir, "SKULabeler.jsx")
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

if os.path.exists(jsx_file):
    @app.get("/SKULabeler.jsx", include_in_schema=False)
    async def serve_jsx():
        return FileResponse(jsx_file, media_type="text/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=7860)
