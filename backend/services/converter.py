import os
import tempfile
import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response

router = APIRouter()


async def _convert_pt_to_onnx(pt_path: str, onnx_path: str):
    """Run the YOLO ONNX export in a thread so it doesn't block the event loop."""
    def _run():
        from ultralytics import YOLO
        model = YOLO(pt_path)
        # Export to ONNX — Ultralytics writes to <pt_basename>.onnx by default
        model.export(format="onnx", dynamic=False, imgsz=640)
        # Ultralytics places the .onnx next to the .pt file
        expected_onnx = pt_path.replace(".pt", ".onnx")
        if not os.path.exists(expected_onnx):
            raise FileNotFoundError(f"Export did not produce {expected_onnx}")
        os.rename(expected_onnx, onnx_path)

    await asyncio.to_thread(_run)


@router.post("/api/convert")
async def convert_model(file: UploadFile = File(...)):
    """
    Accept a .pt YOLOv11 weights file, convert it to ONNX format,
    and stream the .onnx bytes back to the browser.

    The browser then uses the returned bytes directly with ONNXRuntime-Web
    for fully local inference — no GPU or server needed during inference.
    """
    if not file.filename.endswith(".pt"):
        raise HTTPException(status_code=400, detail="Only .pt files are accepted.")

    with tempfile.TemporaryDirectory() as tmpdir:
        pt_path = os.path.join(tmpdir, "model.pt")
        onnx_path = os.path.join(tmpdir, "model.onnx")

        # Save uploaded .pt to disk
        content = await file.read()
        with open(pt_path, "wb") as f:
            f.write(content)

        # Convert to ONNX
        try:
            await _convert_pt_to_onnx(pt_path, onnx_path)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"ONNX conversion failed: {str(e)}"
            )

        # Read the .onnx bytes and stream them back
        with open(onnx_path, "rb") as f:
            onnx_bytes = f.read()

    return Response(
        content=onnx_bytes,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="model.onnx"',
            "Content-Length": str(len(onnx_bytes)),
        }
    )
