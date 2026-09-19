from flask import Flask, jsonify, render_template
from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "trash_bins.json"
THANH_XUAN_DATA_FILE = BASE_DIR / "data" / "thanh_xuan_bins.json"

app = Flask(__name__)


def load_bins():
    with DATA_FILE.open("r", encoding="utf-8") as f:
        bins = json.load(f)

    with THANH_XUAN_DATA_FILE.open("r", encoding="utf-8") as f:
        bins.extend(json.load(f))

    return bins


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/trash-bins")
def trash_bins():
    return jsonify(load_bins())


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )