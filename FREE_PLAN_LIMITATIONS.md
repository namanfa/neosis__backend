# Why the SKU Labeler inference backend is not reliable on a free plan

**Assessment date:** October 7, 2026

**Deployment considered:** The FastAPI backend and the page it serves, running on Render Free
**Scope:** This explains the current inference workload. It does not claim that every possible model or every free hosting platform is incapable of inference.

## Executive summary

The application can start on a free web service, serve its page, accept uploads, and return HTTP `200` responses. Those facts do not mean the service has enough resources to load a PyTorch YOLO model and finish inference.

The free Render web-service plan has **0.1 CPU and 512 MB RAM**. This application loads a `.pt` model through Ultralytics/PyTorch and processes images on CPU. The service logs supplied on October 7 show the session and upload requests succeeding, followed by an inference request, Ultralytics initialization, and a later server restart. In the browser, inference remained at `0/21` with “Connecting to YOLOv11 Engine.”

This behavior is consistent with the service running out of resources or being restarted while loading the model. The screenshots do **not** show an explicit out-of-memory message, so that cause is not proven. Render's **Metrics → Memory** graph and service events for the same time are needed to confirm it.

The practical conclusion is that the current free service is suitable for previewing the UI and basic API routes, but it is not a dependable host for this PyTorch inference workload. A first paid test should provide at least **1 CPU and 2 GB RAM**; larger models may need more. A paid plan improves resource headroom but does not guarantee a given model will fit.

## What the application does during inference

When the user starts a session, the backend:

1. Creates a session directory and accepts the image, model, and optional label uploads.
2. Handles `GET /api/sessions/{session_id}/infer` as a Server-Sent Events (SSE) stream.
3. Opens the uploaded `.pt` file with `YOLO(model_path)`.
4. Runs the images through the model on CPU unless a CUDA GPU is available.
5. Writes labels, annotated images, and results to the session directory.

The relevant implementation is in [`backend/services/inference_engine.py`](backend/services/inference_engine.py). In particular, the code constructs the YOLO model **before sending the first progress event**. While model loading is in progress, the browser can therefore show `0/21` and “Connecting” even though the inference endpoint already returned HTTP `200`.

The deployment dependencies include `torch`, `torchvision`, `ultralytics`, and OpenCV; see [`backend/requirements.txt`](backend/requirements.txt). The project does not configure a GPU for Render, so inference uses the service CPU.

## Evidence from the reported run

The supplied Render log screenshot shows:

- `POST /api/sessions` returned `200 OK`.
- Image, model, and optional label uploads returned `200 OK`.
- `GET /api/sessions/.../infer` returned `200 OK`.
- Ultralytics created its settings file after the inference request.
- The service later logged a new Uvicorn startup.

The webpage screenshot showed `0/21` and “Connecting to YOLOv11 Engine” rather than an image-processing progress update.

An HTTP `200` on the SSE endpoint confirms that the stream response opened; it does **not** confirm that the model loaded or that any image was processed. The timing and restart make resource exhaustion a leading explanation, but there is no explicit OOM line in the screenshots. Check the Render service's **Metrics** page for memory and CPU around the failed run. Render documents CPU and memory metrics and recommends reviewing them alongside logs: [Render Service Metrics](https://render.com/docs/service-metrics).

## Why the free resources are a poor fit

### 1. Very little memory for a PyTorch service

Render Free web services have **512 MB RAM**. The Python process needs memory for the operating system and web server, PyTorch and Ultralytics, the loaded model, and image decoding and inference. A model's `.pt` file size is not the same as its full in-memory footprint. The model architecture, weights, runtime, and intermediate tensors all consume memory.

If the process reaches its memory limit, it can be terminated and restarted before the first progress event is sent. That matches the reported symptom, though the provided logs alone do not prove an OOM kill.

Render's current web-service compute table lists Free as **0.1 CPU / 512 MB**, and the `1c-2g` plan as **1 CPU / 2 GB**: [Render Compute Plans](https://render.com/docs/compute-plans).

### 2. CPU inference is constrained

The code chooses a batch size of one when CUDA is unavailable, which helps limit batch memory, but it still performs all model operations on CPU. The Free plan's 0.1 CPU allocation is very small for repeated object detection. Even when the model fits in RAM, inference can be extremely slow or interrupted. Twenty-one images add repeated CPU work after the model finishes loading.

### 3. Free services sleep when idle and can restart

Render spins a Free web service down after 15 minutes without inbound traffic; waking it takes about a minute. Render also notes that Free services may restart at any time. These limits can add startup delay and interrupt an active in-memory session. They are separate from the model-loading bottleneck: a request can wake the service successfully and still fail to complete inference.

See [Render's free web-service limitations](https://render.com/docs/free#free-web-services).

### 4. Uploaded session data is not durable

On Linux, [`backend/main.py`](backend/main.py) configures sessions under `/tmp/noesis_sessions` unless `SESSION_BASE_DIR` is set. The app stores uploaded images, the `.pt` model, generated annotations, and results on the service's local filesystem.

Render Free filesystems are ephemeral. Uploaded files and session results are lost when the service restarts, redeploys, or spins down, and Free web services cannot attach a persistent disk. This means even a successful run can lose its session artifacts when the instance is recycled. See [Render's filesystem and persistence notes](https://render.com/docs/free#local-files-lost-on-redeploy).

### 5. Free monthly quotas can stop availability

Render grants 750 Free instance hours per workspace per month. When the shared allowance is exhausted, Free web services are suspended until the allowance resets. This does not explain the reported `0/21` run, but it makes a free service unsuitable as a dependable always-available tool. See [Render's free plan limits](https://render.com/docs/free#monthly-usage-limits).

## What the logs do and do not establish

| Observation | What it establishes | What it does not establish |
| --- | --- | --- |
| Upload requests returned `200` | Session creation and uploads completed for that request. | That the model can be loaded into memory. |
| Inference request returned `200` | The SSE HTTP response opened. | That model loading completed or images were processed. |
| Ultralytics settings-file message appeared | The inference code began initializing the Ultralytics runtime. | That the weights loaded successfully. |
| Browser stayed at `0/21` | No progress event reached the page. | Whether the cause was OOM, a slow load, another exception, or a disconnect. |
| A later Uvicorn startup appeared | The service process started again. | Why it restarted; an OOM reason is not shown in the screenshot. |

To confirm a memory failure, compare the inference timestamp with the Render memory graph and service events. A graph reaching the plan limit immediately before a restart would strongly support that diagnosis.

## Recommended deployment options

### Option A: Keep the app on Render and test a larger plan

This is the lowest-change diagnostic step. Test the same model and image set on a service with at least **1 CPU and 2 GB RAM** (Render's `1c-2g` plan). Watch peak memory and inference duration. If the model is larger or peak memory approaches the limit, test a larger plan. This is a starting point, not a guarantee that every `.pt` model will fit.

### Option B: Use another host with sufficient paid resources

Moving to another provider can help only if the selected instance has enough RAM and CPU. A free plan with a similar memory ceiling is unlikely to change the result. Before migrating, compare per-service RAM/CPU limits, billing for an always-running web process, storage persistence, sleep behavior, and model upload size limits.

### Option C: Reduce the inference footprint

Depending on the model and accuracy requirements, options include using a smaller model, exporting to a supported optimized format, reducing image size, or moving inference to a dedicated GPU service. These require separate compatibility and accuracy checks; they are not automatic changes to the current backend.

## Bottom line

The free plan can host the web page and demonstrate the API, but its **512 MB RAM, 0.1 CPU, sleep/restart behavior, and ephemeral filesystem** make it a poor fit for a tool that loads a user-provided PyTorch YOLO model and processes a batch of images. The observed stall is consistent with that mismatch, but Render Metrics should be checked before calling it a confirmed OOM failure.

For a reliable deployment, use a compute plan with materially more RAM and CPU, verify the model's peak resource use, and use persistent storage if session files must survive service restarts.
