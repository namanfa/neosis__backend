---
title: Neosis SKU Labeler Backend
emoji: 🏷️
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: "5.9.1"
app_file: app.py
pinned: false
hardware: cpu-basic
---

# Neosis SKU Labeler — Backend

FastAPI backend for the Neosis pseudo-labeling tool, running inside a Gradio Space.

The Gradio interface (visible at `/gradio`) is a lightweight status panel only.
All real API traffic is handled by FastAPI at `/api/sessions/`.

## API Endpoints

- `POST /api/sessions/` — Create a new labeling session
- `POST /api/sessions/{id}/upload-images` — Upload images
- `POST /api/sessions/{id}/upload-model` — Upload `.pt` model
- `GET  /api/sessions/{id}/infer` — Run inference (SSE stream)
- `GET  /api/sessions/{id}/analytics` — Get detection statistics
- `GET  /api/sessions/{id}/preview/{image}` — Preview annotated image
- `GET  /api/sessions/{id}/export` — Download dataset ZIP
- `POST /api/convert` — Convert `.pt` → `.onnx`

The Image Extraction API is also available:

- `POST /api/extract/columns` — Read an Excel/CSV file and return its header names
- `POST /api/extract/run` — Download links from the selected column and stream progress events
- `GET /api/extract/download/{job_id}` — Download the resulting ZIP

The local-first Testing Images and Packshots tools use `/api/tools/`:

- `GET /api/tools/brands` — Shared brand list and image counts
- `GET /api/tools/testing/{brand_slug}/images` and `POST /api/tools/testing/{brand_slug}/upload`
- `POST /api/tools/packshots/prepare`, `GET /api/tools/packshots/{brand_slug}`, and upload/replace/download routes under the same prefix

Their files use the configured library backend (local filesystem by default). They do not use a database. Packshot SKU labels are stored in a per-brand `manifest.json`.

## API Docs

Visit `/docs` on this Space URL for interactive Swagger documentation.
