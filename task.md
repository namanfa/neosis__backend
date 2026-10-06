# Project State & Tasks

- `[x]` Local Environment Setup
  - `[x]` Python 3.12 installed on system
  - `[x]` Dedicated virtual environment (`venv`) created
  - `[x]` Core dependencies installed (`fastapi`, `uvicorn`, `ultralytics`, `torch` CPU, `torchvision`, `opencv-python-headless`, `onnx`, `Pillow`)
- `[x]` Label Corrector Removal (Per user requirement)
  - `[x]` Deleted backend `label_editor.py` and unregistered its router
  - `[x]` Replaced Page 4 in `SKULabeler (1).jsx` with dedicated Inferenced Image Viewer
  - `[x]` Removed bounding box drawing, editing, dragging, and label saving controls
- `[x]` Local Tool Operation
  - `[x]` Configured FastAPI to serve frontend (`index.html` and `SKULabeler (1).jsx`) locally
  - `[x]` Created single-click launch script `run_local.bat`

