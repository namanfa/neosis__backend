# Neosis storage and deployment handoff

Use this note as project context before changing storage, uploads, or session data. Confirm the current deployment before assuming that the AWS setup described here is live.

## Deployment status and what “AWS” means here

The repository includes an AWS EC2 deployment guide in [`deploy/README.md`](deploy/README.md). It describes running the app in Docker Compose on an Ubuntu EC2 instance, with Caddy providing HTTPS and authentication. This confirms that AWS EC2 is the documented deployment target; repository files alone do **not** confirm that an EC2 instance is currently running or that a deployment succeeded.

There is no database integration in the current app code: no SQL/NoSQL client, database URL, or schema. Testing Images and Packshots use the `StorageBackend` object store. A Cloudflare R2 adapter is implemented and can be enabled with `STORAGE_BACKEND=r2`; credentials are supplied through environment variables. Session records and files are represented by directories on disk. Do not describe this as “stored in a database” unless a database is added.

The deployment guide's `deploy/data/sessions` directory is a host directory mounted into the app container as `/data`. On EC2, that means files are on the EC2 instance's attached storage (normally its root EBS volume unless the operator configured another mount). The Compose file does not provision a separate EBS volume, RDS database, or S3 bucket. Confirm the actual instance, volumes, and deployment state in AWS before making claims about live data location or durability.

## Current storage paths

`SESSION_BASE_DIR` selects the root directory. The app creates one UUID-named folder per session, with these subfolders:

```text
<SESSION_BASE_DIR>/<session-id>/
├── raw_images/       # Uploaded source images
├── models/           # Uploaded model, saved as model.pt
├── labels/           # Generated YOLO-format label text files
├── previews/         # Reserved/preview output directory
├── detected_images/  # Annotated images produced by inference
└── _darknet.labels   # Optional uploaded class-name file
```

Configured defaults by environment:

| Environment | Session root | Persistence |
| --- | --- | --- |
| Local Windows development | `<project>/output/sessions` | Local project disk; ignored by Git |
| Linux container without an override (including the backend's documented Gradio Space setup) | `/tmp/noesis_sessions` | Temporary container filesystem; may be lost when the container restarts or is replaced |
| Docker Compose deployment from `deploy/` | `/data/sessions` inside the app container, mapped to `deploy/data/sessions` on the host | Host filesystem, subject to the EC2 instance/volume lifecycle |

The persistent library uses the separate `LIBRARY_DIR`: `<project>/output/library` on local Windows development, and `/data/library` in the Docker Compose setup. Choose it with `STORAGE_BACKEND=local`; this is the current default. This library root is separate from the temporary Labeler session root.

Testing Images and Packshots use this library through the shared `StorageBackend` interface. Their keys are `brands.json`, `testing/<brand_slug>/...`, and `packshots/<brand_slug>/manifest.json`. The local filesystem is the default. Set `STORAGE_BACKEND=r2`, `R2_ENDPOINT_URL`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` to use Cloudflare R2. R2 images stay private and are displayed using short-lived signed GET URLs. `R2_ENDPOINT_URL` is the account endpoint without the bucket path; `R2_BUCKET_NAME` supplies the bucket separately. Local library files are not migrated automatically. Labeler session data and temporary Image Extraction files still use session storage on the app host; selecting R2 does not move them.

The Docker image sets `SESSION_BASE_DIR=/data/sessions`; Compose mounts `./data:/data`. The top-level `deploy/README.md` describes cleanup of session directories older than two days. Treat this as data deletion, not archival or backup.

The Image Extraction feature stores its temporary ZIP and in-progress image files in a job directory under `SESSION_BASE_DIR` (or the local `output/sessions` fallback). It does not put files in the shared image library. On the documented EC2 setup, the existing two-day session cleanup covers abandoned temporary jobs; a completed ZIP is removed after download.

## Upload and processing flow

- A new session gets a UUID and its directory tree is created on disk.
- Uploaded images go under that session's `raw_images/` directory.
- The uploaded `.pt` model is saved to `models/model.pt`.
- Inference writes labels under `labels/` and annotated output under `detected_images/`.
- Dataset export reads these files and builds a downloadable ZIP; it does not persist them into a database.

Relevant implementation: `backend/main.py`, `backend/services/session_manager.py`, `backend/services/upload_handler.py`, `backend/services/inference_engine.py`, and `backend/services/export.py`.

## Guidance for future changes

- If adding a database, first decide which structured metadata belongs there (for example users, sessions, image metadata, labels, timestamps, and lifecycle state). The current filesystem session layout is not a database schema.
- Preserve `StorageBackend` if adding another object store. The R2 adapter uses boto3 and keeps access keys on the backend; never expose them to browser code.
- Keep storage access behind `StorageBackend` so local disk can remain useful for development while a durable backend is introduced.
- Preserve per-session isolation and validate session IDs and uploaded filenames when changing file handling. Do not expose raw storage paths or make private uploaded images publicly accessible by default.
- Account for cleanup, backups, retention, and migration of existing `deploy/data/sessions` files before changing storage behavior.
- Do not put credentials, `.env` values, or real uploaded data in source control.

## Verify before describing a live deployment

Check the AWS account/region and EC2 instance, inspect its running Compose services, verify the actual `SESSION_BASE_DIR` and host mount, and confirm which EBS volume backs the host directory. If a managed database or S3 bucket was created outside this repository, document its name and configuration separately without committing secrets. Until verified, describe AWS EC2 as the documented deployment setup, not as confirmed live infrastructure.
