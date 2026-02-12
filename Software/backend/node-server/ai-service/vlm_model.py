from transformers import AutoProcessor, AutoModelForImageTextToText
from PIL import Image
import torch

MODEL_NAME = "Qwen/Qwen2-VL-2B-Instruct"

processor = AutoProcessor.from_pretrained(MODEL_NAME)
model = AutoModelForImageTextToText.from_pretrained(
    MODEL_NAME,
    device_map="cpu",
    torch_dtype=torch.float32
)

def run_vlm(image_path):
    image = Image.open(image_path).convert("RGB")

    prompt = (
        "You are monitoring railway tracks.\n"
        "Detect if there is any person, object, tool, animal, or obstruction "
        "on or near the railway track.\n"
        "Respond with JSON:\n"
        "{anomaly: true/false, class: <type>, confidence: 0-1}"
    )

    inputs = processor(
        images=image,
        text=prompt,
        return_tensors="pt"
    )

    with torch.no_grad():
        output = model.generate(**inputs, max_new_tokens=128)

    text = processor.batch_decode(output, skip_special_tokens=True)[0]

    # SAFE fallback parsing
    anomaly = "true" in text.lower()
    confidence = 0.7 if anomaly else 0.2
    label = "object/person" if anomaly else "clear"

    return {
        "vision_anomaly": anomaly,
        "vision_class": label,
        "vision_confidence": confidence
    }
