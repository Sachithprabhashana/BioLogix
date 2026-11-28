import json
import math
from pathlib import Path
import cv2
from flask import Flask, jsonify, request
import numpy as np


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
            x1 = max(0, int(x1))
            y1 = max(0, int(y1))
            x2 = min(w, int(x2))
            y2 = min(h, int(y2))
            if x2 > x1 and y2 > y1:
                faces.append(
                    {
                        "confidence": round(conf, 4),
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    }
                )
    return faces


def extract_face_embedding(img_bgr: np.ndarray):
    if face_net is None:
        return None

    faces = detect_faces_dnn(img_bgr, min_confidence=0.5)
    if not faces:
        return None

    best_face = max(faces, key=lambda f: f["confidence"])
    box = best_face["box"]
    face_crop = img_bgr[box["y1"] : box["y2"], box["x1"] : box["x2"]]
    if face_crop.size == 0:
        return None

    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (32, 32)).astype(np.float32).flatten()

    norm = float(np.linalg.norm(resized))
    if norm == 0.0:
        return None

    normalized = (resized / norm).tolist()
    return {
        "embedding": [round(float(v), 6) for v in normalized],
        "detectionConfidence": best_face["confidence"],
    }


def cosine_similarity(vec_a, vec_b):
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(float(a) * float(b) for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(float(a) * float(a) for a in vec_a))
    norm_b = math.sqrt(sum(float(b) * float(b) for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return max(0.0, min(1.0, dot / (norm_a * norm_b)))


def decode_uploaded_image(field_name: str = "image"):
    if field_name not in request.files:
        return None, (
            jsonify({"status": "error", "message": "No image file provided"}),
            400,
        )

    file_bytes = np.frombuffer(request.files[field_name].read(), np.uint8)
    image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if image is None:
        return None, (
            jsonify({"status": "error", "message": "Invalid image file"}),
            400,
        )

    return image, None


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
    image, err = decode_uploaded_image("image")
    if err is not None:
        return err

    if face_net is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Face detection DNN model is not loaded on AI service",
                }
            ),
            503,
        )

    height, width, _ = image.shape
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    faces = detect_faces_dnn(image, min_confidence=0.5)
    if not faces:
        return (
            jsonify(
                {
                    "status": "error",
                    "faceDetected": False,
                    "facesCount": 0,
                    "confidenceScore": 0.0,
                    "suggestedStatus": "REJECTED",
                    "message": "No face detected in image",
                }
            ),
            422,
        )

    best_conf = max(f["confidence"] for f in faces)
    confidence_score = round(best_conf, 2)
    suggested_status = "VERIFIED" if confidence_score >= 0.75 else "REVIEW"

    return jsonify(
        {
            "status": "ok",
            "detector": "opencv-dnn-ssd",
            "faceDetected": True,
            "facesCount": len(faces),
            "faces": faces,
            "dimensions": {"width": int(width), "height": int(height)},
            "brightness": round(brightness, 1),
            "sharpness": round(sharpness, 1),
            "confidenceScore": confidence_score,
            "suggestedStatus": suggested_status,
        }
    )


@app.post("/extract-embedding")
def extract_embedding_route():
    img_bgr, err = decode_uploaded_image("image")
    if err is not None:
        return err

    if face_net is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Face detection DNN model is not loaded on AI service",
                }
            ),
            503,
        )

    result = extract_face_embedding(img_bgr)
    if result is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "No face detected in image",
                }
            ),
            422,
        )

    return jsonify(
        {
            "status": "ok",
            "embedding": result["embedding"],
            "detectionConfidence": result["detectionConfidence"],
        }
    )


@app.post("/match-face")
def match_face_route():
    img_bgr, err = decode_uploaded_image("image")
    if err is not None:
        return err

    if face_net is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Face detection DNN model is not loaded on AI service",
                }
            ),
            503,
        )

    ref_raw = request.form.get("referenceEmbedding")
    if not ref_raw:
        return (
            jsonify({"status": "error", "message": "referenceEmbedding is required"}),
            400,
        )

    try:
        ref_embedding = json.loads(ref_raw)
    except Exception:
        return (
            jsonify(
                {"status": "error", "message": "invalid referenceEmbedding JSON"}
            ),
            400,
        )

    current = extract_face_embedding(img_bgr)
    if current is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "faceDetected": False,
                    "matched": False,
                    "similarityScore": 0.0,
                    "suggestedStatus": "REJECTED",
                    "message": "No face detected in check-in image",
                }
            ),
            422,
        )

    similarity = cosine_similarity(current["embedding"], ref_embedding)
    threshold = 0.75
    matched = similarity >= threshold

    return jsonify(
        {
            "status": "ok",
            "faceDetected": True,
            "matched": matched,
            "similarityScore": round(similarity, 4),
            "detectionConfidence": current["detectionConfidence"],
            "suggestedStatus": "VERIFIED" if matched else "FLAGGED",
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True)