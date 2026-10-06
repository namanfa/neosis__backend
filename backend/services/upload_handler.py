from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import shutil
from typing import List
from .session_manager import create_session_id, get_session_dir, validate_session

router = APIRouter()

@router.post("")
async def create_new_session():
    session_id = create_session_id()
    return {"session_id": session_id}

@router.post("/{session_id}/upload/images")
async def handle_image_upload(session_id: str, files: List[UploadFile] = File(...)):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_dir = get_session_dir(session_id)
    raw_images_dir = os.path.join(session_dir, "raw_images")
    
    saved_files = []
    for file in files:
        if file.content_type and file.content_type.startswith('image/'):
            # The filename from webkitdirectory might contain paths, so we take just the basename
            filename = os.path.basename(file.filename)
            file_path = os.path.join(raw_images_dir, filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_files.append(filename)
            
    return {"message": f"Successfully uploaded {len(saved_files)} images", "files": saved_files}

@router.post("/{session_id}/upload/model")
async def handle_model_upload(session_id: str, file: UploadFile = File(...)):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    if not file.filename.endswith('.pt'):
        raise HTTPException(status_code=400, detail="Only .pt model files are accepted")
        
    session_dir = get_session_dir(session_id)
    model_path = os.path.join(session_dir, "models", "model.pt")
    
    with open(model_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "Model uploaded successfully"}

@router.post("/{session_id}/upload/darknet_labels")
async def handle_darknet_labels_upload(session_id: str, file: UploadFile = File(...)):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    session_dir = get_session_dir(session_id)
    darknet_path = os.path.join(session_dir, "_darknet.labels")
    
    with open(darknet_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"message": "Darknet labels file uploaded successfully"}
