from pathlib import Path
import cv2
import numpy as np
from flask import Flask, jsonify, request

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
PROTOTXT_PATH = BASE_DIR / "models" / "deploy.prototxt"
MODEL_PATH = BASE_DIR / "models" / "res10_300x300_ssd_iter_140000.caffemodel"

face_net = None
if PROTOTXT_PATH.exists() and MODEL_PATH.exists():
    face_net = cv2.dnn.readNetFromCaffe(str(PROTOTXT_PATH), str(MODEL_PATH))


def detect_faces_dnn(image: np.ndarray, min_confidence: float = 0.5):
    assert face_net is not None
    h, w = image.shape[:2]
    blob = cv2.dnn.blobFromImage(
        cv2.resize(image, (300, 300)),
        1.0,
        (300, 300),
        (104.0, 177.0, 123.0),
    )
    face_net.setInput(blob)
    detections = face_net.forward()

    faces = []
    for i in range(detections.shape[2]):
        conf = float(detections[0, 0, i, 2])
        if conf >= min_confidence:
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            x1, y1, x2, y2 = box.astype(int)
            faces.append(
                {
                    "confidence": round(conf, 4),
                    "box": {
                        "x1": max(0, int(x1)),
                        "y1": max(0, int(y1)),
                        "x2": min(w, int(x2)),
                        "y2": min(h, int(y2)),
                    },
                }
            )
    return faces


@app.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "service": "biologix-ai-service",
            "dnnModelLoaded": face_net is not None,
        }
    )


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

    if face_net is not None:
        faces = detect_faces_dnn(image, min_confidence=0.5)
        face_detected = len(faces) > 0
        best_conf = max((f["confidence"] for f in faces), default=0.0)
        confidence_score = round(best_conf, 2) if face_detected else 0.15
        suggested_status = (
            "VERIFIED" if (face_detected and confidence_score >= 0.75) else "REVIEW"
        )

        return jsonify(
            {
                "status": "ok",
                "detector": "opencv-dnn-ssd",
                "faceDetected": face_detected,
                "facesCount": len(faces),
                "faces": faces,
                "dimensions": {"width": int(width), "height": int(height)},
                "brightness": round(brightness, 1),
                "sharpness": round(sharpness, 1),
                "confidenceScore": confidence_score,
                "suggestedStatus": suggested_status,
            }
        )

    # Fallback when DNN model files are not yet placed in ai-service/models/
    good_frame = width >= 120 and height >= 120 and brightness >= 25.0
    confidence_score = (
        round(min(0.95, max(0.35, sharpness / 500.0)), 2) if good_frame else 0.25
    )

    return jsonify(
        {
            "status": "ok",
            "detector": "quality-fallback",
            "dnnModelLoaded": False,
            "frameValid": good_frame,
            "faceDetected": False,
            "facesCount": 0,
            "dimensions": {"width": int(width), "height": int(height)},
            "brightness": round(brightness, 1),
            "sharpness": round(sharpness, 1),
            "confidenceScore": confidence_score,
            "suggestedStatus": "REVIEW",
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True)