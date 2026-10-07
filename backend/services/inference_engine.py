import os
import gc
import json
import asyncio
import cv2
from PIL import Image
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from .session_manager import get_session_dir, validate_session

router = APIRouter()


def _load_yolo_model(model_path):
    from ultralytics import YOLO
    return YOLO(model_path)


def _get_default_batch_size():
    """Auto-detect optimal batch size based on available hardware."""
    try:
        import torch
        if torch.cuda.is_available():
            return 8  # GPU available — safe batch size
    except ImportError:
        pass
    return 1  # CPU-only or no torch — process one at a time (same as before)


def _get_image_dimensions(img_path):
    """Get image width and height by reading only the file header (very fast)."""
    with Image.open(img_path) as im:
        return im.size  # (width, height)


def _class_color_bgr(class_id):
    """Generate a unique BGR color for a class using golden-angle distribution."""
    import colorsys
    golden_angle = 137.508
    hue = (class_id * golden_angle) % 360 / 360.0
    saturation = 0.65 + (class_id % 3) * 0.12
    lightness = 0.50 + (class_id % 2) * 0.12
    r, g, b = colorsys.hls_to_rgb(hue, lightness, saturation)
    return (int(b * 255), int(g * 255), int(r * 255))  # BGR for OpenCV


def draw_annotated_image(img_path, detections, output_path):
    """Draw bounding boxes on the image and save the annotated version."""
    img = cv2.imread(img_path)
    if img is None:
        return

    for det in detections:
        x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
        cls_name = det["class_name"]
        confidence = det["confidence"]
        label = f"{cls_name} {confidence:.2f}"

        color = _class_color_bgr(det["class_id"])

        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(img, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
        cv2.putText(img, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    cv2.imwrite(output_path, img)


def _write_labels_for_image(labels_dir, img_name, detections, iw, ih):
    """Write all YOLO darknet labels for one image in a single file operation."""
    label_path = os.path.join(labels_dir, f"{os.path.splitext(img_name)[0]}.txt")
    lines = []
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        cls_id = det["class_id"]
        bw = x2 - x1
        bh = y2 - y1
        n_x = (x1 + bw / 2) / iw
        n_y = (y1 + bh / 2) / ih
        n_w = bw / iw
        n_h = bh / ih
        lines.append(f"{cls_id} {n_x} {n_y} {n_w} {n_h}")
    with open(label_path, "w") as f:
        f.write("\n".join(lines) + "\n")


async def run_inference_generator(session_id: str, conf: float, iou: float, agnostic_nms: bool = True, batch_size: int = 0):
    session_dir = get_session_dir(session_id)
    model_path = os.path.join(session_dir, "models", "model.pt")
    raw_images_dir = os.path.join(session_dir, "raw_images")
    labels_dir = os.path.join(session_dir, "labels")
    detected_images_dir = os.path.join(session_dir, "detected_images")
    results_file = os.path.join(session_dir, "results.json")

    os.makedirs(detected_images_dir, exist_ok=True)

    if not os.path.exists(model_path):
        yield f"data: {json.dumps({'error': 'Model not found'})}\n\n"
        return

    if not os.path.exists(raw_images_dir):
        yield f"data: {json.dumps({'error': 'Images not found'})}\n\n"
        return

    image_files = [f for f in os.listdir(raw_images_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
    total_images = len(image_files)

    if total_images == 0:
        yield f"data: {json.dumps({'error': 'No images found'})}\n\n"
        return

    # Auto-detect batch size if not specified
    if batch_size <= 0:
        batch_size = _get_default_batch_size()

    # Load YOLOv11 model
    yield f"data: {json.dumps({'progress': 0, 'total': total_images, 'detections': 0, 'status': 'loading_model'})}\n\n"
    try:
        model_task = asyncio.create_task(asyncio.to_thread(_load_yolo_model, model_path))
        while not model_task.done():
            completed, _ = await asyncio.wait({model_task}, timeout=10)
            if not completed:
                yield ": keepalive\n\n"
        model = await model_task
    except Exception as e:
        yield f"data: {json.dumps({'error': f'Failed to load model: {str(e)}'})}\n\n"
        return

    yield f"data: {json.dumps({'progress': 0, 'total': total_images, 'detections': 0, 'batch_size': batch_size})}\n\n"
    await asyncio.sleep(0.01)

    all_predictions = []
    total_detections = 0
    processed = 0

    # Process images in batches
    for batch_start in range(0, total_images, batch_size):
        batch_names = image_files[batch_start:batch_start + batch_size]
        batch_paths = [os.path.join(raw_images_dir, name) for name in batch_names]

        try:
            # Run YOLOv11 inference with class-agnostic NMS enabled
            batch_task = asyncio.create_task(asyncio.to_thread(model, batch_paths, conf=conf, iou=iou, agnostic_nms=agnostic_nms, verbose=False))
            while not batch_task.done():
                completed, _ = await asyncio.wait({batch_task}, timeout=10)
                if not completed:
                    yield ": keepalive\n\n"
            results = await batch_task
            batch_preds = results  # list of Result objects

            # Process each image's results
            for idx, img_name in enumerate(batch_names):
                img_path = batch_paths[idx]
                detections = []

                # Get image dimensions using PIL (reads header only — very fast)
                try:
                    iw, ih = _get_image_dimensions(img_path)
                except Exception:
                    iw, ih = 1, 1  # fallback

                result = batch_preds[idx]
                if len(result.boxes) > 0:
                    for box in result.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        cls_id = int(box.cls[0].item())
                        confidence = float(box.conf[0].item())
                        cls_name = model.names[cls_id]
                        detections.append({
                            "class_id": cls_id,
                            "class_name": cls_name,
                            "confidence": confidence,
                            "bbox": [x1, y1, x2, y2]
                        })

                # Write all labels for this image in one file operation
                _write_labels_for_image(labels_dir, img_name, detections, iw, ih)

                # Generate annotated image (offload to thread to keep event loop responsive)
                annotated_path = os.path.join(detected_images_dir, img_name)
                await asyncio.to_thread(draw_annotated_image, img_path, detections, annotated_path)

                avg_conf = sum(d["confidence"] for d in detections) / len(detections) if detections else 0
                classes_present = list(set([d["class_name"] for d in detections]))

                processed += 1
                total_detections += len(detections)

                img_data = {
                    "id": processed,
                    "name": img_name,
                    "detections": len(detections),
                    "avgConf": avg_conf,
                    "classes": classes_present,
                    "bboxes": detections
                }
                all_predictions.append(img_data)

        except Exception as e:
            print(f"Error processing batch starting at {batch_start}: {e}")
            # Count skipped images as processed to keep progress accurate
            processed += len(batch_names)
        finally:
            try:
                del results
                del batch_preds
            except Exception:
                pass
            gc.collect()

        # Send progress update after each batch (include per-image detail for log)
        last_img_dets = len(all_predictions[-1]["bboxes"]) if all_predictions else 0
        last_img_name = all_predictions[-1]["name"] if all_predictions else ""
        yield f"data: {json.dumps({'progress': processed, 'total': total_images, 'detections': total_detections, 'image_detections': last_img_dets, 'image_name': last_img_name})}\n\n"
        await asyncio.sleep(0.01)

    with open(results_file, "w") as f:
        json.dump(all_predictions, f)

    yield f"data: {json.dumps({'progress': total_images, 'total': total_images, 'detections': total_detections, 'done': True})}\n\n"


@router.get("/{session_id}/infer")
async def run_inference(session_id: str, conf: float = 0.25, iou: float = 0.45, agnostic_nms: bool = True, batch_size: int = 0):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    return StreamingResponse(run_inference_generator(session_id, conf, iou, agnostic_nms, batch_size), media_type="text/event-stream")
