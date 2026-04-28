# backend/app.py
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import joblib
from bson import ObjectId
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import ASCENDING, DESCENDING, MongoClient
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
CORS(app)

app.config["SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "healthyme-pro-super-secret-key")
app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
app.config["MONGO_DB_NAME"] = os.getenv("MONGO_DB_NAME", "healthyme_pro")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config["MODEL_PATH"] = os.path.join(BASE_DIR, "health_model.pkl")


def load_ml_model():
    model_path = app.config["MODEL_PATH"]
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found at {model_path}")
    return joblib.load(model_path)


client = MongoClient(app.config["MONGO_URI"])
db = client[app.config["MONGO_DB_NAME"]]
users_collection = db["users"]
history_collection = db["history"]

users_collection.create_index([("email", ASCENDING)], unique=True)
history_collection.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])

model = load_ml_model()


def sanitize_text(value):
    return str(value or "").strip()


def clamp_score(value):
    return round(max(0.0, min(100.0, float(value))), 2)


def parse_entry_date(entry_date):
    text = sanitize_text(entry_date)
    if not text:
        return datetime.now(timezone.utc)
    try:
        parsed = datetime.strptime(text, "%Y-%m-%d")
        return parsed.replace(tzinfo=timezone.utc, hour=12, minute=0, second=0, microsecond=0)
    except ValueError:
        return None


def day_bounds(target_date):
    start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


def serialize_user(user):
    profile = user.get("profile", {})
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "profile": {
            "age": profile.get("age", ""),
            "gender": profile.get("gender", ""),
            "height": profile.get("height", ""),
            "weight": profile.get("weight", ""),
            "goal": profile.get("goal", ""),
            "activity_level": profile.get("activity_level", ""),
            "daily_water_goal": profile.get("daily_water_goal", ""),
            "food_preference": profile.get("food_preference", ""),
            "food_notes": profile.get("food_notes", ""),
            "conditions": profile.get("conditions", ""),
        },
    }


def serialize_history(document):
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "input_data": document["input_data"],
        "score": document["score"],
        "created_at": document["created_at"].isoformat(),
        "ui_context": document.get("ui_context", {}),
    }


def create_token(user):
    payload = {
        "user_id": str(user["_id"]),
        "email": user["email"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")


def token_required(route_function):
    @wraps(route_function)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization token missing"}), 401

        token = auth_header.split(" ", 1)[1].strip()

        try:
            payload = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            user = users_collection.find_one({"_id": ObjectId(payload["user_id"])})
            if not user:
                return jsonify({"error": "User not found"}), 401
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401

        return route_function(user, *args, **kwargs)

    return wrapped


def validate_numeric_payload(payload):
    required = ["sleep", "water", "exercise", "calories"]
    if not isinstance(payload, dict):
        return None, "Invalid input"

    parsed = {}
    for field in required:
        if field not in payload:
            return None, f"Missing {field}"
        if isinstance(payload[field], bool):
            return None, f"Invalid {field}"
        try:
            parsed[field] = float(payload[field])
        except Exception:
            return None, f"Invalid {field}"

    return parsed, None


def build_profile(data):
    return {
        "age": sanitize_text(data.get("age")),
        "gender": sanitize_text(data.get("gender")),
        "height": sanitize_text(data.get("height")),
        "weight": sanitize_text(data.get("weight")),
        "goal": sanitize_text(data.get("goal")),
        "activity_level": sanitize_text(data.get("activity_level")),
        "daily_water_goal": sanitize_text(data.get("daily_water_goal")),
        "food_preference": sanitize_text(data.get("food_preference")),
        "food_notes": sanitize_text(data.get("food_notes")),
        "conditions": sanitize_text(data.get("conditions")),
    }


@app.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = sanitize_text(data.get("email")).lower()
    password = sanitize_text(data.get("password"))
    name = sanitize_text(data.get("name"))

    if not email or not password or not name:
        return jsonify({"error": "Name, email, and password are required"}), 400

    if users_collection.find_one({"email": email}):
        return jsonify({"error": "Email already exists"}), 409

    user = {
        "name": name,
        "email": email,
        "password_hash": generate_password_hash(password),
        "profile": build_profile(data),
        "created_at": datetime.now(timezone.utc),
    }

    result = users_collection.insert_one(user)
    user["_id"] = result.inserted_id
    token = create_token(user)

    return jsonify({"token": token, "user": serialize_user(user)}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = sanitize_text(data.get("email")).lower()
    password = sanitize_text(data.get("password"))

    user = users_collection.find_one({"email": email})
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_token(user)
    return jsonify({"token": token, "user": serialize_user(user)})


@app.route("/predict", methods=["POST"])
@token_required
def predict(current_user):
    data = request.get_json() or {}
    parsed, error = validate_numeric_payload(data)
    if error:
        return jsonify({"error": error}), 400

    entry_dt = parse_entry_date(data.get("entry_date"))
    if entry_dt is None:
        return jsonify({"error": "Invalid entry_date. Use YYYY-MM-DD."}), 400

    ui_context = {
        "meal_notes": sanitize_text(data.get("meal_notes")),
        "protein": sanitize_text(data.get("protein")),
        "entry_date": entry_dt.date().isoformat(),
    }

    try:
        result = model.predict([[parsed["sleep"], parsed["water"], parsed["exercise"], parsed["calories"]]])
        raw_score = float(result[0])
        score = clamp_score(raw_score)
    except Exception as error_detail:
        return jsonify({"error": "Prediction failed", "details": str(error_detail)}), 500

    start, end = day_bounds(entry_dt)
    existing = history_collection.find_one(
        {
            "user_id": str(current_user["_id"]),
            "created_at": {"$gte": start, "$lt": end},
        }
    )

    if existing:
        history_collection.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "input_data": parsed,
                    "score": score,
                    "created_at": entry_dt,
                    "ui_context": ui_context,
                }
            },
        )
    else:
        history_collection.insert_one(
            {
                "user_id": str(current_user["_id"]),
                "input_data": parsed,
                "score": score,
                "created_at": entry_dt,
                "ui_context": ui_context,
            }
        )

    return jsonify({"score": score, "entry_date": entry_dt.date().isoformat()})


@app.route("/history", methods=["GET"])
@token_required
def history(current_user):
    records = history_collection.find({"user_id": str(current_user["_id"])}).sort("created_at", DESCENDING)
    return jsonify([serialize_history(record) for record in records])


@app.route("/chat", methods=["POST"])
@token_required
def chat(current_user):
    data = request.get_json() or {}
    message = sanitize_text(data.get("message")).lower()

    if "sleep" in message:
        reply = "Aim for a consistent bedtime and target 7 to 9 hours of sleep when possible."
    elif "water" in message or "hydration" in message:
        reply = "A simple hydration target is to spread your water intake evenly through the day instead of drinking it all at once."
    elif "food" in message or "calorie" in message or "diet" in message:
        reply = "Try balancing calories with protein, fiber, and whole foods so your food consumption supports your energy and health goals."
    elif "exercise" in message or "workout" in message:
        reply = "Consistency matters more than intensity at first. Choose a routine you can repeat every week."
    else:
        reply = "Focus on sleep, water intake, exercise, and balanced food consumption for stronger day-to-day health habits."

    return jsonify({"response": reply})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True)
