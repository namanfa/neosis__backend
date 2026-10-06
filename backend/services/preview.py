import os
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from .session_manager import get_session_dir, validate_session

router = APIRouter()

@router.get("/{session_id}/images")
async def get_images(session_id: str):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    session_dir = get_session_dir(session_id)
    results_file = os.path.join(session_dir, "results.json")
    
    if not os.path.exists(results_file):
        raise HTTPException(status_code=404, detail="Inference results not available yet")
        
    with open(results_file, "r") as f:
        predictions = json.load(f)
        
    return predictions

@router.get("/{session_id}/preview/{image_name}")
async def get_preview_image(session_id: str, image_name: str):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    session_dir = get_session_dir(session_id)
    raw_images_dir = os.path.join(session_dir, "raw_images")
    image_path = os.path.join(raw_images_dir, image_name)
    
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(image_path)

@router.get("/{session_id}/detected/{image_name}")
async def get_detected_image(session_id: str, image_name: str):
    """Serve the annotated image (with bounding boxes drawn on it)."""
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    session_dir = get_session_dir(session_id)
    detected_images_dir = os.path.join(session_dir, "detected_images")
    image_path = os.path.join(detected_images_dir, image_name)
    
    if not os.path.exists(image_path):
        # Fall back to raw image if detected version doesn't exist
        raw_images_dir = os.path.join(session_dir, "raw_images")
        image_path = os.path.join(raw_images_dir, image_name)
        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(image_path)
