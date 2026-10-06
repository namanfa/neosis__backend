"""
HuggingFace Spaces entry point (Gradio 5.x SDK).

HF Spaces health-checks the root path ('/') expecting a Gradio response.
We mount Gradio at '/' so the health check passes, while all our real
FastAPI routes live at '/api/sessions/' — no conflict.
"""

# ZeroGPU requires `import spaces` to be the VERY FIRST import before torch/FastAPI.
try:
    import spaces

    @spaces.GPU
    def dummy_gpu_check():
        """Satisfies ZeroGPU startup detector."""
        return None
    _has_spaces = True
except ImportError:
    _has_spaces = False

import uvicorn
import gradio as gr
from main import app as fastapi_app

# ── Minimal Gradio status interface ──────────────────────────────────────────
def _get_status_text():
    return (
        "## ✅ Noesis SKU Labeler Backend is Running\n\n"
        "All API endpoints are live at `/api/sessions/`.\n\n"
        "**Interactive docs**: visit `/docs` on this Space URL.\n\n"
        "The real UI lives on Vercel — this panel is just a health indicator."
    )

if _has_spaces:
    @spaces.GPU
    def get_status():
        return _get_status_text()
else:
    def get_status():
        return _get_status_text()

demo = gr.Interface(
    fn=get_status,
    inputs=[],
    outputs=gr.Markdown(),
    title="Noesis Backend Status",
    description="FastAPI inference backend for the Noesis SKU Labeler tool.",
    flagging_mode="never",
)

# Mount Gradio at ROOT ('/') — HF Spaces health check expects Gradio at root.
# Our FastAPI routes are all under '/api/...' so there is no path conflict.
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)

