# Neosis SKU Labeler — project guide for Claude

Read this guide and the existing code before planning or implementing a feature. Treat the repository as the source of truth; deployment notes describe several targets and may not reflect the currently live service.

## What the tool does

Neosis is a browser-based internal toolkit. It includes the YOLO pseudo-labeling flow, spreadsheet image extraction, brand-based Testing Images galleries, and Packshot reference galleries with SKU labels. The backend also exposes a separate `.pt` to ONNX conversion endpoint.

## Technology stack

| Area | Current implementation |
| --- | --- |
| Frontend | React 18 JSX in `SKULabeler.jsx` and `ToolkitPages.jsx`; React and Babel Standalone are loaded from CDNs in `index.html`. There is no npm/package.json build pipeline in the repository. |
| UI | Browser-rendered React UI with inline component styles/CSS, responsive layout, and light/dark theme state. |
| Backend/API | Python 3.12 FastAPI app, served with Uvicorn. `python-multipart` handles uploads. |
| Computer vision / ML | Ultralytics YOLO, PyTorch/TorchVision, OpenCV headless, and Pillow (Pillow is used by inference code; check the selected runtime's transitive/install dependencies). |
| Model conversion | Ultralytics ONNX export, ONNX/ONNX Slim, and ONNX Runtime dependencies. The current endpoint converts server-side and returns the resulting bytes. |
| Session storage | Local filesystem, one UUID directory per session; temporary uploads and inference outputs are separate from the persistent library. |
| Persistent image library | New storage interface with an active local filesystem backend; Cloudflare R2/S3 adapter is not active yet. No database is used. See [`CLAUDE_STORAGE_HANDOFF.md`](CLAUDE_STORAGE_HANDOFF.md). |
| Local launch | `run_local.bat` starts Uvicorn at `http://127.0.0.1:7860/` using the workspace `.venv`. |
| Deployment files | Vercel rewrite config, a Render manifest, a Hugging Face Spaces Gradio entry point, and Docker/Caddy AWS EC2 instructions are all present. These represent different deployment options/configuration history; none alone proves which one is live. |

## Local Python environment

Use Python 3.12 on Windows. Run `.\setup_env.ps1` from PowerShell to create `.venv` and install `backend/requirements.txt`, then launch `run_local.bat`. The setup script uses the workspace's ignored `.python312` installation when present, or the Python 3.12 launcher (`py -3.12`). The `.venv` and `.python312` directories are local-only and are not committed. The application dependencies include CPU PyTorch wheels through the PyTorch CPU package index in `backend/requirements.txt`.

Run backend tests with `.\.venv\Scripts\python.exe -m unittest discover -s tests -v`.

Start the app with `run_local.bat`, then open `http://127.0.0.1:7860/`. The landing page links to Testing Images and Packshots. They store files under the local library (`output/library` by default); this local-testing setup has no app-level Google login. Restart any already-running local server after changing the code.

## App structure and main flow

The existing Labeler remains a four-step flow in `SKULabeler.jsx`:

1. **Setup/upload:** choose image folder, `.pt` model, optional labels, and inference settings; create a session and upload files.
2. **Inference:** connect to a Server-Sent Events (SSE) endpoint and display model-load / processing progress.
3. **Review:** fetch analytics; rerun, browse images, or download the ZIP.
4. **Image browser:** filter and inspect uploaded/annotated images and detections.

Top-level frontend state owns the current page, theme, session ID, confidence/IoU/NMS values, and analytics. The frontend resolves its API base URL through `window.NOESIS_API_URL`, set in `index.html`. Local browser use targets `http://localhost:7860/api/sessions`; non-local use currently assumes same-origin API at `/api/sessions`.

The FastAPI app is `backend/main.py`. It configures `SESSION_BASE_DIR`, CORS, health and static frontend routes, then registers routers from `backend/services/`. `backend/app.py` is a separate Hugging Face Spaces wrapper that mounts a small Gradio status page around the FastAPI app; the actual UI/API implementation is still React and FastAPI.

The toolkit landing page, Testing Images, and Packshots live in `ToolkitPages.jsx`; `index.html` loads and transpiles it before `SKULabeler.jsx`. Hash routes are `#/`, `#/labeler`, `#/extract`, `#/testing-images`, and `#/packshots`.

## Backend API map

Routes are mounted by `backend/main.py`; paths below include the `/api` prefix where applicable.

| Method and path | Purpose | Code |
| --- | --- | --- |
| `GET /health` | Health response | `backend/main.py` |
| `POST /api/sessions` | Create UUID session and folders | `backend/services/upload_handler.py`, `session_manager.py` |
| `POST /api/sessions/{id}/upload/images` | Upload image files | `upload_handler.py` |
| `POST /api/sessions/{id}/upload/model` | Upload `.pt` model | `upload_handler.py` |
| `POST /api/sessions/{id}/upload/darknet_labels` | Upload optional `_darknet.labels` | `upload_handler.py` |
| `GET /api/sessions/{id}/infer` | Run YOLO inference and stream SSE progress | `inference_engine.py` |
| `GET /api/sessions/{id}/analytics` | Summary, histogram, class counts | `analytics.py` |
| `GET /api/sessions/{id}/images` | Per-image result records | `preview.py` |
| `GET /api/sessions/{id}/preview/{image_name}` | Serve original image for the browser | `preview.py` |
| `GET /api/sessions/{id}/detected/{image_name}` | Serve annotated image, falling back to original | `preview.py` |
| `GET /api/sessions/{id}/export` | Build or reuse a dataset ZIP | `export.py` |
| `POST /api/convert` | Convert uploaded `.pt` to ONNX and return bytes | `converter.py` |
| `POST /api/extract/columns` | Read uploaded Excel/CSV headers for the column picker | `image_extraction.py` |
| `POST /api/extract/run` | Download public images from the selected column and stream progress | `image_extraction.py` |
| `GET /api/extract/download/{job_id}` | Download completed extraction ZIP | `image_extraction.py` |
| `GET /api/tools/brands` | Shared brand list and per-tool image counts | `toolkit_library.py`, `storage/brands.py` |
| `POST /api/tools/brands` | Add a shared brand | `toolkit_library.py` |
| `GET /api/tools/testing/{brand_slug}/images` | List testing images, optionally filtered by asset | `toolkit_library.py` |
| `POST /api/tools/testing/{brand_slug}/upload` | Add testing image batches | `toolkit_library.py` |
| `POST /api/tools/packshots/prepare` | Validate and read a CSV/XLSX SKU mapping sheet | `toolkit_library.py` |
| `GET /api/tools/packshots/{brand_slug}` | List packshots and labels | `toolkit_library.py` |
| `POST /api/tools/packshots/{brand_slug}/upload` | Add a batch of packshots and update its manifest | `toolkit_library.py` |
| `POST /api/tools/packshots/{brand_slug}/{filename}/replace` | Replace one packshot while retaining its manifest row | `toolkit_library.py` |
| `GET /api/tools/packshots/{brand_slug}/download` | Download all or selected packshots in a ZIP | `toolkit_library.py` |
| `GET /api/library/objects/{key:path}` | Stream an object from the private local library | `backend/services/library.py` |

Interactive FastAPI docs are available at `/docs` when the backend is running.

## Inference and result data

The inference route loads the uploaded weights with `ultralytics.YOLO`, processes supported image formats (`png`, `jpg`, `jpeg`, `bmp`), writes normalized YOLO label lines, creates annotated images with OpenCV, and writes `results.json`. On CPU the default batch size is one; CUDA availability selects a larger default. Progress is delivered as SSE events. Results are stored in files within the session directory, not in a database.

The dataset ZIP contains annotated images under `dataset/detected_images/`, source images under `dataset/upload/`, label text files under `dataset/upload/`, and the optional `_darknet.labels` file. See `backend/services/export.py` for exact packaging behavior.

## Important files

- `index.html` — page shell, CDN dependencies, frontend loading/transpilation, and API URL setup.
- `SKULabeler.jsx` — active frontend source served by `backend/main.py`.
- `ToolkitPages.jsx` — landing, Testing Images, and Packshots pages loaded before the Labeler app.
- `SKULabeler (1).jsx` — older/alternate copy. It is not the file `main.py` serves by default. Check before editing so changes land in the active UI.
- `backend/main.py` — FastAPI application, router registration, local static serving, and session-root default.
- `backend/app.py` — Gradio wrapper used by the Spaces configuration.
- `backend/services/session_manager.py` — session directory creation and lookup.
- `backend/storage/` — storage contract, local backend, environment-based factory, and shared `brands.json` helpers.
- `backend/services/toolkit_library.py` — local-first brand, Testing Images, Packshots, manifest, and ZIP APIs.
- `backend/services/library.py` — streams private library objects through the app.
- `backend/services/upload_handler.py` — session and file upload endpoints.
- `backend/services/inference_engine.py` — model inference, SSE, label and annotated-image writing.
- `backend/services/analytics.py`, `preview.py`, `export.py`, `converter.py` — result APIs and utilities.
- `backend/requirements.txt` — Python runtime dependencies.
- `backend/render.yaml` — Render web service manifest (currently says free plan).
- `vercel.json` — frontend URL rewrites; does not itself configure the backend origin.
- `deploy/` — Docker Compose, Dockerfile, Caddy configuration, and AWS EC2 deployment instructions.
- `CLAUDE_STORAGE_HANDOFF.md` — detailed storage layout and persistence caveats.
- `tests/test_storage.py`, `tests/test_image_extraction.py`, `tests/test_toolkit_library.py` — focused `unittest` coverage; run with `python -m unittest discover -s tests -v` in a working Python environment.
- `FREE_PLAN_LIMITATIONS.md`, `DEPLOYMENT_FAILURES.md` — recorded deployment observations and analysis; read them before making platform assumptions.

## Deployment caveats

The repo contains multiple deployment paths. `deploy/README.md` documents AWS EC2 with Docker Compose and Caddy. `backend/render.yaml` describes a Render service. The backend README and `backend/app.py` describe a Gradio Space. `vercel.json` supports frontend rewrites. The current page's non-local API URL is same-origin, so a split frontend/backend deployment needs an explicit API URL or reverse proxy. Confirm the intended/live topology before changing deployment settings.

The AWS Compose setup persists session files via the host bind mount `deploy/data:/data`; the app uses `/data/sessions`. This is filesystem storage on the EC2 host's attached storage, not a database or S3. The deployment guide also describes deleting sessions older than two days. Linux defaults without an explicit `SESSION_BASE_DIR` use `/tmp/noesis_sessions`, which is temporary. Consult the storage handoff before adding persistence or retention behavior.


