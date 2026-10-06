import uuid
import os
import shutil

def get_base_dir():
    return os.environ.get(
        "SESSION_BASE_DIR",
        os.path.join(os.getcwd(), "output", "sessions")
    )

def create_session_id():
    session_id = str(uuid.uuid4())
    session_dir = get_session_dir(session_id)
    os.makedirs(os.path.join(session_dir, "raw_images"), exist_ok=True)
    os.makedirs(os.path.join(session_dir, "labels"), exist_ok=True)
    os.makedirs(os.path.join(session_dir, "models"), exist_ok=True)
    os.makedirs(os.path.join(session_dir, "previews"), exist_ok=True)
    os.makedirs(os.path.join(session_dir, "detected_images"), exist_ok=True)
    return session_id

def get_session_dir(session_id: str):
    return os.path.join(get_base_dir(), session_id)

def validate_session(session_id: str):
    return os.path.exists(get_session_dir(session_id))

