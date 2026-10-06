from fastapi import APIRouter, HTTPException
import os
import json
import colorsys
from .session_manager import get_session_dir, validate_session

router = APIRouter()


def generate_distinct_colors(n):
    """Generate N visually distinct colors using golden-angle HSL distribution.
    Each class gets a unique color with good contrast.
    """
    colors = []
    # Use the golden angle (~137.508 degrees) for optimal hue distribution
    golden_angle = 137.508
    for i in range(n):
        hue = (i * golden_angle) % 360 / 360.0
        # Alternate saturation and lightness to increase distinctness
        saturation = 0.65 + (i % 3) * 0.12  # 0.65, 0.77, 0.89
        lightness = 0.50 + (i % 2) * 0.12   # 0.50, 0.62
        r, g, b = colorsys.hls_to_rgb(hue, lightness, saturation)
        colors.append(f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}")
    return colors

@router.get("/{session_id}/analytics")
async def get_analytics(session_id: str):
    if not validate_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
        
    session_dir = get_session_dir(session_id)
    results_file = os.path.join(session_dir, "results.json")
    
    if not os.path.exists(results_file):
        raise HTTPException(status_code=404, detail="Analytics not available yet")
        
    with open(results_file, "r") as f:
        predictions = json.load(f)
        
    total_images = len(predictions)
    total_detections = sum(img["detections"] for img in predictions)
    avg_per_image = total_detections / total_images if total_images > 0 else 0
    
    # Calculate Mean Confidence
    all_confs = []
    class_counts = {}
    
    for img in predictions:
        for box in img.get("bboxes", []):
            all_confs.append(box["confidence"])
            cls_name = box["class_name"]
            class_counts[cls_name] = class_counts.get(cls_name, 0) + 1
            
    mean_confidence = sum(all_confs) / len(all_confs) if all_confs else 0
    
    # Confidence Histogram
    hist_bins = [
        {"range": "0.0-0.2", "min": 0.0, "max": 0.2, "count": 0},
        {"range": "0.2-0.4", "min": 0.2, "max": 0.4, "count": 0},
        {"range": "0.4-0.6", "min": 0.4, "max": 0.6, "count": 0},
        {"range": "0.6-0.8", "min": 0.6, "max": 0.8, "count": 0},
        {"range": "0.8-1.0", "min": 0.8, "max": 1.0, "count": 0},
    ]
    
    for conf in all_confs:
        for bin in hist_bins:
            if bin["min"] <= conf <= bin["max"]:
                bin["count"] += 1
                break
                
    # Format class counts
    sorted_classes = sorted(class_counts.items(), key=lambda item: item[1], reverse=True)
    num_classes = len(sorted_classes)
    unique_colors = generate_distinct_colors(max(num_classes, 1))
    class_distribution = [
        {"name": k, "count": v, "color": unique_colors[i]}
        for i, (k, v) in enumerate(sorted_classes)
    ]
            
    return {
        "summary": {
            "total_images": total_images,
            "total_detections": total_detections,
            "avg_per_image": round(avg_per_image, 1),
            "mean_confidence": round(mean_confidence, 2)
        },
        "histogram": [{"range": b["range"], "count": b["count"]} for b in hist_bins],
        "class_counts": class_distribution,
        "sample_images": predictions[:5]
    }
