"""VIETMAP Route v4. Road geometry only; no straight-line fallback."""
from datetime import datetime, timezone
import json
import math
from threading import Lock
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from settings import get_settings

MAX_STOPS = 100
MAX_SNAP_METERS = 300
_lock = Lock()
_last_request = 0.0


class RoutingError(Exception):
    pass


def decode_polyline(encoded):
    if not isinstance(encoded, str) or not encoded or len(encoded) > 2_000_000:
        raise RoutingError("VIETMAP chưa trả về hình học tuyến đường hợp lệ.")
    index, latitude, longitude = 0, 0, 0
    result = []
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            number = shift = 0
            while True:
                if index >= len(encoded) or shift > 30:
                    raise RoutingError("Hình học tuyến VIETMAP bị thiếu hoặc lỗi.")
                byte = ord(encoded[index]) - 63
                index += 1
                if not 0 <= byte <= 63:
                    raise RoutingError("Hình học tuyến VIETMAP không hợp lệ.")
                number |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            deltas.append(~(number >> 1) if number & 1 else number >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        point = [latitude / 1e5, longitude / 1e5]
        if abs(point[0]) > 90 or abs(point[1]) > 180:
            raise RoutingError("Tọa độ tuyến đường không hợp lệ.")
        result.append(point)
    return result


def distance(a, b):
    radians = math.pi / 180
    h = (math.sin((b[0] - a[0]) * radians / 2) ** 2
         + math.cos(a[0] * radians) * math.cos(b[0] * radians)
         * math.sin((b[1] - a[1]) * radians / 2) ** 2)
    return 6371000 * 2 * math.asin(math.sqrt(min(1, h)))


def _convert(payload, bins, vehicle):
    paths = payload.get("paths")
    if not isinstance(paths, list) or not paths or not isinstance(paths[0], dict):
        raise RoutingError("VIETMAP không tìm được tuyến đường phù hợp.")
    path = paths[0]
    geometry = decode_polyline(path.get("points"))
    snapped = decode_polyline(path.get("snapped_waypoints"))
    if len(snapped) != len(bins):
        raise RoutingError("VIETMAP trả thiếu điểm dừng trên đường.")
    # Via-arrival instructions disambiguate loops and self-crossings.
    via_indices = []
    instructions = path.get("instructions", [])
    if not isinstance(instructions, list):
        raise RoutingError("Thiếu hướng dẫn tuyến VIETMAP.")
    for instruction in instructions:
        if not isinstance(instruction, dict):
            raise RoutingError("Hướng dẫn tuyến VIETMAP không hợp lệ.")
        if instruction.get("sign") == 5:
            interval = instruction.get("interval", [])
            if not isinstance(interval, list) or len(interval) != 2:
                raise RoutingError("Thiếu chỉ số điểm dừng VIETMAP.")
            via_indices.append(interval[0])
    indices = [0, *via_indices, len(geometry) - 1]
    if len(indices) != len(bins):
        raise RoutingError("Thiếu hướng dẫn ghé điểm trung gian; chưa thể xác định điểm thu gom.")
    previous = 0
    stops = []
    for item, location, index in zip(bins, snapped, indices):
        if isinstance(index, bool) or not isinstance(index, int) or not previous <= index < len(geometry):
            raise RoutingError("Thứ tự điểm dừng VIETMAP không hợp lệ.")
        if distance(location, geometry[index]) > 2:
            raise RoutingError("Điểm dừng không khớp hình học tuyến VIETMAP.")
        snap_distance = distance([item["latitude"], item["longitude"]], location)
        if snap_distance > MAX_SNAP_METERS:
            raise RoutingError(f"Điểm {item['id']} cách đường ô tô hơn 300 m; cần kiểm tra tọa độ mẫu.")
        stops.append({"bin_id": item["id"], "route_index": index,
                      "snap_distance": round(snap_distance, 1)})
        previous = index
    return {"geometry": geometry, "stops": stops, "source": "VIETMAP Route v4",
            "profile": vehicle, "fetched_at": datetime.now(timezone.utc).isoformat()}


def _get_json(params):
    global _last_request
    # Limit bursts. Keep routes only in the current browser simulation.
    with _lock:
        delay = 0.25 - (time.monotonic() - _last_request)
        if delay > 0:
            time.sleep(delay)
        _last_request = time.monotonic()
        request = Request("https://maps.vietmap.vn/api/route/v4?" + urlencode(params),
                          headers={"User-Agent": "BinGo/2.0", "Accept": "application/json"})
        try:
            with urlopen(request, timeout=15) as response:
                payload = json.load(response)
        except HTTPError as error:
            if error.code in (401, 403, 423):
                raise RoutingError("Kiểm tra Services key, quyền Route v4 và hạn mức VIETMAP.") from None
            if error.code == 429:
                raise RoutingError("VIETMAP đang giới hạn lượt gọi. Hãy thử lại sau.") from None
            raise RoutingError("VIETMAP chưa xử lý được yêu cầu tìm đường.") from None
        except (URLError, TimeoutError, OSError, ValueError):
            # Upstream exception URLs may contain a secret; never return/log them.
            raise RoutingError("Không kết nối được VIETMAP. Hãy thử tải lại tuyến.") from None
    if not isinstance(payload, dict) or payload.get("code") != "OK":
        code = payload.get("code") if isinstance(payload, dict) else None
        messages = {
            "OVER_DAILY_LIMIT": "Đã hết hạn mức Route v4 của VIETMAP.",
            "MAX_POINTS_EXCEED": "Tuyến vượt số điểm của gói VIETMAP. Cần điều chỉnh gói hoặc chia tuyến.",
            "ZERO_RESULTS": "VIETMAP không tìm được đường nối các điểm này.",
        }
        raise RoutingError(messages.get(code, "VIETMAP từ chối tuyến; hãy kiểm tra cấu hình và điểm thu gom."))
    return payload


def road_route(bins):
    settings = get_settings()
    if not settings["services_key"]:
        raise RoutingError("Chưa cấu hình VIETMAP Services key trên máy chủ.")
    vehicle = settings["vehicle"]
    if vehicle not in ("car", "truck"):
        raise RoutingError("Cấu hình VIETMAP_VEHICLE phải là car hoặc truck.")
    params = [("apikey", settings["services_key"]), ("vehicle", vehicle),
              ("points_encoded", "true"), ("optimize", "false"), ("alternative", "false")]
    if vehicle == "truck":
        if not settings["capacity"].isdigit() or int(settings["capacity"]) <= 0:
            raise RoutingError("Chế độ xe tải cần khối lượng toàn bộ xe (kg) trong cấu hình VIETMAP.")
        params.append(("capacity", settings["capacity"]))
    # A singleton is routed back to itself to obtain a road-snapped location.
    requested = bins if len(bins) > 1 else [bins[0], bins[0]]
    params.extend(("point", f'{item["latitude"]:.6f},{item["longitude"]:.6f}') for item in requested)
    result = _convert(_get_json(params), requested, vehicle)
    if len(bins) == 1:
        result["geometry"] = result["geometry"][:1]
        result["stops"] = result["stops"][:1]
    return result
