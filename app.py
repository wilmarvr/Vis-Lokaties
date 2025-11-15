import json
import os
from datetime import datetime

from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "sqlite:///vislokaties.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


class Dataset(db.Model):
    __tablename__ = "dataset"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)
    payload = db.Column(db.Text, nullable=False)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


def default_payload():
    return {
        "waters": [],
        "steks": [],
        "rigs": [],
        "bathy": {"points": [], "datasets": []},
        "settings": {"waterColor": "#33a1ff"},
    }


def get_or_create_dataset():
    dataset = Dataset.query.filter_by(name="default").first()
    if dataset is None:
        dataset = Dataset(name="default", payload=json.dumps(default_payload()))
        db.session.add(dataset)
        db.session.commit()
    return dataset


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/db", methods=["GET", "POST"])
def api_db():
    if request.method == "GET":
        dataset = get_or_create_dataset()
        return jsonify(json.loads(dataset.payload))

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Body moet JSON object zijn."}), 400

    dataset = get_or_create_dataset()
    dataset.payload = json.dumps(payload)
    dataset.updated_at = datetime.utcnow()
    db.session.add(dataset)
    db.session.commit()
    return jsonify({"status": "ok", "updated_at": dataset.updated_at.isoformat()})


with app.app_context():
    db.create_all()
    get_or_create_dataset()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
