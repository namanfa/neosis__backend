# syntax=docker/dockerfile:1
FROM python:3.11-slim

# System dependencies for OpenCV and general image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy and install Python dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy rest of the backend code
COPY . .

# Create temp session directory (ephemeral — fine per user requirements)
RUN mkdir -p /tmp/noesis_sessions

# HuggingFace Spaces expects the app to listen on port 7860
EXPOSE 7860

# Use 2 workers: handles concurrent uploads + SSE inference streams on free CPU tier
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "2"]
