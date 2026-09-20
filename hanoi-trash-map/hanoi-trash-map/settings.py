"""Vietmap credentials: the services key must never be returned to browsers."""
import json
import os
from pathlib import Path


def get_settings():
    local_path = Path(__file__).parent / "config.local.json"
    local = json.loads(local_path.read_text(encoding="utf-8")) if local_path.exists() else {}
    def value(name, default=""):
        return os.environ.get(name, local.get(name, default))
    return {
        "tilemap_key": str(value("VIETMAP_TILEMAP_KEY")).strip(),
        "services_key": str(value("VIETMAP_SERVICES_KEY")).strip(),
        "vehicle": str(value("VIETMAP_VEHICLE", "car")),
        "capacity": str(value("VIETMAP_TRUCK_WEIGHT_KG")),
    }


def public_config():
    settings = get_settings()
    weight_ok = settings["vehicle"] != "truck" or (
        settings["capacity"].isdigit() and int(settings["capacity"]) > 0)
    return {
        "provider": "vietmap", "tilemapKey": settings["tilemap_key"],
        "routingConfigured": bool(settings["services_key"]) and weight_ok and settings["vehicle"] in ("car", "truck"),
        "vehicle": settings["vehicle"],
    }
