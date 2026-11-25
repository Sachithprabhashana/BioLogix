import cv2
import numpy as np
from flask import Flask, jsonify, request

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "biologix-ai-service"})


@app.post("/verify-face")
def verify_face():
    if "image" not in request.files:
        return jsonify({"status": "error", "message": "No image file provided"}), 400

    file = request.files["image"]
    file_bytes = np.frombuffer(file.read(), np.uint8)
    image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if image is None:
        return jsonify({"status": "error", "message": "Invalid image"}), 400

    height, width, _ = image.shape
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Basic image-quality sanity check before full ML/embedding inference
    good_frame = width >= 120 and height >= 120 and brightness >= 25.0
    confidence_score = round(min(0.95, max(0.35, sharpness / 500.0)), 2) if good_frame else 0.25

    return jsonify(
        {
            "status": "ok",
            "frameValid": good_frame,
            "dimensions": {"width": int(width), "height": int(height)},
            "brightness": round(brightness, 1),
            "sharpness": round(sharpness, 1),
            "confidenceScore": confidence_score,
            "suggestedStatus": "VERIFIED" if (good_frame and confidence_score >= 0.7) else "REVIEW",
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)