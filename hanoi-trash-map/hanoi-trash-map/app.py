from flask import Flask, jsonify, render_template, request
from pathlib import Path
import json
import math
from routing import MAX_STOPS, RoutingError, road_route

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "trash_bins.json"
THANH_XUAN_DATA_FILE = BASE_DIR / "data" / "thanh_xuan_bins.json"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024


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


@app.post("/api/road-route")
def truck_road_route():
    payload = request.get_json(silent=True)
    ids = payload.get("bin_ids") if isinstance(payload, dict) else None
    if (not isinstance(ids, list) or not 1 <= len(ids) <= MAX_STOPS
            or any(not isinstance(value, str) for value in ids)
            or len(set(ids)) != len(ids)):
        return jsonify(error=f"Cần từ 1 đến {MAX_STOPS} mã điểm thu gom khác nhau."), 400
    lookup = {item["id"]: item for item in load_bins()}
    selected = []
    for bin_id in ids:
        item = lookup.get(bin_id)
        if not item or item.get("status") == "broken":
            return jsonify(error="Điểm thu gom không tồn tại hoặc đang hỏng."), 400
        lat, lon = item.get("latitude"), item.get("longitude")
        if (any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in (lat, lon))
                or not -90 <= lat <= 90 or not -180 <= lon <= 180):
            return jsonify(error="Tọa độ điểm thu gom không hợp lệ."), 400
        selected.append(item)
    try:
        return jsonify(road_route(selected))
    except RoutingError as error:
        return jsonify(error=str(error)), 503


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
