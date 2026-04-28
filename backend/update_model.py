import joblib
model = joblib.load("health_model.pkl")
joblib.dump(model, "health_model.pkl")