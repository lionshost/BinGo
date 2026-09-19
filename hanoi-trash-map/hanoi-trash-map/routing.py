"""OSRM road routing; never substitute straight lines for unavailable roads."""

from collections import OrderedDict
import json
import math
import os
from threading import Lock
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
MAX_STOPS = 100
MAX_SNAP_METERS = 300
_cache = OrderedDict()
_lock = Lock()
_last_request = 0.0


class RoutingError(Exception):
    pass


def _get_json(path, params):
    global _last_request
    # Serialize uncached requests and respect the public demo's request rate.
    delay = 1.1 - (time.monotonic() - _last_request)
    if delay > 0:
        time.sleep(delay)
    _last_request = time.monotonic()
    url = f"{OSRM_BASE_URL}/{path}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "BinGo-road-routing/1.0"})
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.load(response)
    except HTTPError as error:
        if error.code == 400:
            raise RoutingError("Không tìm được đường ô tô gần các điểm thu gom (tối đa 300 m).") from error
        raise RoutingError("Dịch vụ tìm đường đang bận. Hãy thử tải lại tuyến.") from error
    except (URLError, TimeoutError, OSError, ValueError) as error:
        raise RoutingError("Không kết nối được dịch vụ tìm đường. Hãy thử tải lại tuyến.") from error
    if not isinstance(payload, dict) or payload.get("code") != "Ok":
        raise RoutingError("Không tìm được tuyến ô tô nối các điểm thu gom.")
    return payload


def _coordinate(value):
    if (not isinstance(value, list) or len(value) != 2
            or any(isinstance(n, bool) or not isinstance(n, (float, int)) or not math.isfinite(n) for n in value)
            or not -180 <= value[0] <= 180 or not -90 <= value[1] <= 90):
        raise RoutingError("Dịch vụ tìm đường trả về tọa độ không hợp lệ.")
    return [value[1], value[0]]  # OSRM lon/lat -> Leaflet lat/lon


def _same_location(a, b):
    # OSRM may round step endpoints and snapped waypoints differently (< 1 m).
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111320,
                      (a[1] - b[1]) * 111320 * math.cos(lat)) <= 1


def _convert(payload, bins):
    waypoints = payload.get("waypoints", [])
    if len(waypoints) != len(bins):
        raise RoutingError("Thiếu điểm dừng trên tuyến đường.")
    snapped = []
    for waypoint in waypoints:
        distance = waypoint.get("distance")
        if (not isinstance(distance, (int, float)) or not math.isfinite(distance)
                or not 0 <= distance <= MAX_SNAP_METERS):
            raise RoutingError("Điểm thu gom quá xa đường ô tô; cần kiểm tra lại tọa độ.")
        snapped.append(_coordinate(waypoint.get("location")))
    geometry = [snapped[0]]
    stops = [{"bin_id": bins[0]["id"], "route_index": 0,
              "snap_distance": waypoints[0]["distance"]}]
    if len(bins) > 1:
        routes = payload.get("routes", [])
        legs = routes[0].get("legs", []) if routes else []
        if len(legs) != len(bins) - 1:
            raise RoutingError("Thiếu chặng đường ô tô.")
        for index, leg in enumerate(legs, 1):
            steps = leg.get("steps", [])
            if not steps:
                raise RoutingError("Thiếu hình học tuyến đường.")
            for step in steps:
                points = [_coordinate(p) for p in step.get("geometry", {}).get("coordinates", [])]
                if not points or not _same_location(points[0], geometry[-1]):
                    raise RoutingError("Tuyến đường bị đứt đoạn; không thể cho xe chạy.")
                for point in points[1:]:
                    if point != geometry[-1]:
                        geometry.append(point)
            if not _same_location(geometry[-1], snapped[index]):
                raise RoutingError("Điểm dừng không khớp với tuyến đường.")
            stops.append({"bin_id": bins[index]["id"], "route_index": len(geometry) - 1,
                          "snap_distance": waypoints[index]["distance"]})
    return {"geometry": geometry, "stops": stops, "source": "OSRM / OpenStreetMap",
            "profile": "driving"}


def road_route(bins):
    key = tuple((b["id"], b["longitude"], b["latitude"]) for b in bins)
    with _lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < 3600:
            _cache.move_to_end(key)
            return cached[1]
        coordinates = ";".join(f'{b["longitude"]:.6f},{b["latitude"]:.6f}' for b in bins)
        params = {"radiuses": ";".join([str(MAX_SNAP_METERS)] * len(bins))}
        if len(bins) == 1:
            path = f"nearest/v1/driving/{coordinates}"
            params["number"] = 1
        else:
            path = f"route/v1/driving/{coordinates}"
            params.update(steps="true", geometries="geojson", overview="full",
                          alternatives="false", continue_straight="false")
        result = _convert(_get_json(path, params), bins)
        _cache[key] = (time.monotonic(), result)
        _cache.move_to_end(key)
        while len(_cache) > 256:
            _cache.popitem(last=False)
        return result
