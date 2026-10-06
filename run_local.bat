@echo off
title Noesis - SKU Labeler
echo ========================================================
echo         Starting Noesis - SKU Labeler Local Server
echo ========================================================
echo.

cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found in venv\
    echo Please ensure the virtual environment is set up.
    pause
    exit /b 1
)

set "PYTHONPATH=%~dp0backend"
echo [1/2] Launching browser (with 2-second delay for server startup)...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:7860/"

echo [2/2] Starting FastAPI backend on http://127.0.0.1:7860 ...
echo (Press CTRL+C to stop the server)
echo.

cd backend
..\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 7860
pause
