# Noesis deployment failure notes

**Prepared:** October 7, 2026  
**Project reviewed:** current Noesis SKU Labeler files in this repository

This document collects the deployment problems that can be established from the project files and the Render run notes already recorded in [`FREE_PLAN_LIMITATIONS.md`](FREE_PLAN_LIMITATIONS.md). It separates observed symptoms from likely causes: the available Render screenshots/log notes do not contain a definitive out-of-memory (OOM) message.

## Summary

The Render run reached the API and accepted the session uploads, but inference did not advance beyond `0/21` and the service later started again. The leading explanation is that the free instance was too constrained to initialize and run the uploaded PyTorch/Ultralytics model. The restart timing is consistent with resource exhaustion, but it does not prove an OOM kill.

Hugging Face Spaces is not categorically incompatible with this app. The repository contains a Gradio Space entry point and Space metadata, so it was prepared for Spaces. The problem is that the checked-in Space configuration selects CPU hardware while the app runs user-uploaded `.pt` models through PyTorch/Ultralytics. Whether a particular model will work depends on available memory, CPU time, image batch size, and the Space's storage and runtime limits. A CPU Space may start successfully and still be too slow or too small for the inference workload. The repository does not contain a captured Hugging Face build failure proving a platform-wide deployment blocker.

## Render: what failed and why

### Reported symptoms

- `POST /api/sessions` and image/model/label uploads returned HTTP `200`.
- The inference SSE endpoint returned HTTP `200`, but the browser stayed at `0/21` with “Connecting to YOLOv11 Engine.”
- The logs showed Ultralytics initializing, followed later by a new Uvicorn startup.
- The available screenshots did not show a completed model load, a processed image, or an explicit OOM message.

An HTTP `200` on the SSE route means the streaming response was opened; it does not mean inference finished. In [`backend/services/inference_engine.py`](backend/services/inference_engine.py), `YOLO(model_path)` is called before the first progress event is yielded. While that call loads the model, the UI can remain at `0/21`.

### Most likely constraint: free instance resources

The existing Render analysis records the Free service allocation as **0.1 CPU and 512 MB RAM**. The service imports PyTorch, TorchVision, Ultralytics, and OpenCV, loads an uploaded YOLO `.pt` model, decodes images, runs inference on CPU, and writes annotated outputs. The model's file size is not its total runtime memory requirement. The Python runtime, libraries, model weights, and inference tensors all need memory.

The code defaults to batch size one without CUDA, which reduces peak batch memory but does not remove the model/runtime memory requirement or make CPU inference fast. A batch of 21 images still requires 21 inference passes. The observed stall and subsequent process restart fit resource exhaustion or a kill during model initialization/inference; the available evidence cannot distinguish that from a long load, another exception, or an unrelated restart.

### Other Render Free plan limitations

- **Idle sleep and restarts:** Free services spin down after inactivity and may restart. A cold start adds delay, and an in-memory request/session can be interrupted by a restart.
- **Ephemeral local files:** Linux sessions are stored under `/tmp/noesis_sessions` by default in [`backend/main.py`](backend/main.py). Render Free does not provide a persistent disk, so uploaded images/models and generated results can disappear when the service is recycled.
- **Monthly free hours:** The shared monthly allowance can suspend services after it is exhausted. This does not explain the reported `0/21` run, but affects ongoing availability.
- **SSE opening is not inference success:** The route streams progress; an early `200` response is not evidence that the model loaded or that images were processed.

### Render deployment configuration notes

[`backend/render.yaml`](backend/render.yaml) starts `main:app`, which is the FastAPI application. This is appropriate for the Render backend path; it does not use the separate Gradio wrapper in `backend/app.py`.

The frontend configuration in [`index.html`](index.html) uses the current page's origin for non-local API traffic (`window.location.origin + /api/sessions`). That works only when the frontend and API share an origin or a reverse proxy routes `/api` to the backend. If the frontend is deployed separately (for example, on Vercel) and the backend is on Render, the browser will send API calls to the frontend host unless the API base URL is explicitly configured. This is a configuration risk to check for that topology; it is not the cause established by the reported Render run, where uploads reached the backend.

### What would confirm the Render root cause

Compare the inference request time with the Render service's memory/CPU metrics and service events. A memory graph reaching the plan limit immediately before the restart would support OOM. A larger instance is a useful diagnostic; **1 CPU / 2 GB RAM** is a starting point, not a guarantee for every user-supplied model. Persistent session storage is separately needed if data must survive restarts.

## Hugging Face Spaces: why this version may not work reliably there

### It is not a hard platform incompatibility

The repository has a Space README header declaring `sdk: gradio`, `app_file: app.py`, and `hardware: cpu-basic`. [`backend/app.py`](backend/app.py) mounts a Gradio status page at `/` and the FastAPI API alongside it. That is an intentional Spaces-compatible entry point. Therefore, the accurate conclusion is not “Hugging Face cannot deploy this code”; it is “the configured CPU Space may not have enough compute for this inference workload, and deployment still depends on its build/runtime configuration.”

### CPU-only inference and resource fit

The checked-in Space metadata selects `cpu-basic`, not a CUDA GPU. The inference code checks for CUDA and otherwise uses CPU with batch size one. It still loads PyTorch, Ultralytics, OpenCV, and the uploaded `.pt` model. A Space that can build and serve the Gradio health page can still fail, restart, or take too long when asked to load a large model and process many images. The precise limit depends on the selected Space hardware and model; the repository does not identify a particular model size or include a Space runtime trace that proves which resource limit was reached.

### Storage and session lifetime

On Linux, sessions default to `/tmp/noesis_sessions`. This is temporary local storage, not durable session storage. Uploaded images/models and output artifacts should be treated as disposable across Space restarts/rebuilds unless persistent storage is configured. Large uploads and generated image copies also consume local disk space during a run.

### Packaging and entry-point details to verify

- The Space entry point is `app.py`, while the Render manifest launches `main:app`; use the correct command/configuration for each host.
- The Space README specifies Gradio SDK version `5.9.1`, while `backend/requirements.txt` lists the inference/API libraries but does not pin Gradio or the optional `spaces` package. Spaces may provide the declared SDK, but a generic container build from `requirements.txt` alone will not necessarily have those packages. Keep the platform SDK metadata and Python dependencies aligned with the actual build path.
- [`backend/Dockerfile`](backend/Dockerfile) runs `main:app` with two Uvicorn workers. It does not run the Gradio-wrapped `app:app` entry point. That Docker command is therefore not equivalent to the README's Gradio Space setup; choose one entry point deliberately if deploying with the Docker SDK.
- The app uses in-process local session files and has no shared database or object store. Multiple workers/instances and restarts make session continuity fragile unless requests are consistently routed and storage is shared/persistent.

These are deployment risks visible in the configuration, not confirmed causes of a particular Hugging Face build failure. No HF build logs or runtime screenshots were present in the project files reviewed.

## Evidence versus diagnosis

| Finding | Confidence | Reason |
| --- | --- | --- |
| Session and upload routes worked in the reported Render run | Observed in supplied log notes | They returned HTTP `200`. |
| Inference did not send progress before the run stalled | Observed in supplied browser screenshot notes | UI remained at `0/21`. |
| Model loading precedes the first progress event | Confirmed in source | `YOLO(model_path)` runs before the first `yield` in `inference_engine.py`. |
| Render process restarted after inference began | Observed in supplied log notes | A later Uvicorn startup was present. |
| Render Free resource limits are a poor fit for PyTorch YOLO inference | Strong diagnosis | 0.1 CPU / 512 MB RAM vs. PyTorch + model + image processing. |
| The Render restart was definitely an OOM kill | Not established | No explicit OOM line or matching metrics were supplied. |
| Hugging Face cannot run/deploy the application at all | Not established and contradicted by included Space setup | A Gradio Space entry point and metadata are present. |
| A CPU Space may fail or be impractical for a given model/batch | Strong risk, model-dependent | The implementation falls back to CPU; actual resource needs are unknown. |

## Practical next steps

1. Check Render metrics and service events at the exact failed inference time to confirm or rule out memory exhaustion.
2. If continuing on Render, try a service with materially more RAM and CPU, then measure peak memory and per-image inference time using the same model and image set.
3. If deploying the frontend separately from the backend, configure an explicit Render API URL in the frontend and allow that origin in CORS.
4. For Hugging Face, deploy using the Gradio Space entry point and a hardware tier with enough resources for the target model; check build logs, runtime logs, and storage needs. Treat `/tmp` session data as temporary.
5. For persistent multi-user use, move session data to persistent/shared storage and avoid relying on one process's local filesystem.

## Related project files

- [`FREE_PLAN_LIMITATIONS.md`](FREE_PLAN_LIMITATIONS.md) — detailed Render Free resource and persistence assessment.
- [`backend/render.yaml`](backend/render.yaml) — Render service settings.
- [`backend/README.md`](backend/README.md) — Hugging Face Space metadata and API description.
- [`backend/app.py`](backend/app.py) — Gradio-wrapped Hugging Face entry point.
- [`backend/main.py`](backend/main.py) — FastAPI app and Linux temporary session directory.
- [`backend/services/inference_engine.py`](backend/services/inference_engine.py) — model loading, progress streaming, and inference flow.
- [`backend/requirements.txt`](backend/requirements.txt) — Python dependencies.
- [`index.html`](index.html) — frontend API origin selection.
