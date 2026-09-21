import copy
import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse

from app import app
import routing
import settings

BINS = [
    {"id": "a", "latitude": 21.0, "longitude": 105.8, "status": "active"},
    {"id": "b", "latitude": 21.001, "longitude": 105.801, "status": "active"},
]
CONFIG = {"tilemap_key": "public-tile", "services_key": "SECRET-services",
          "vehicle": "car", "capacity": ""}


def encode(points):
    result, previous = "", [0, 0]
    for point in points:
        for axis in range(2):
            value = round(point[axis] * 100000)
            delta = value - previous[axis]
            previous[axis] = value
            number = ~(delta << 1) if delta < 0 else delta << 1
            while number >= 32:
                result += chr((32 | (number & 31)) + 63)
                number >>= 5
            result += chr(number + 63)
    return result


GEOMETRY = [[21, 105.8], [21, 105.801], [21.001, 105.801]]
PAYLOAD = {"code": "OK", "paths": [{
    "points": encode(GEOMETRY),
    "snapped_waypoints": encode([GEOMETRY[0], GEOMETRY[-1]]),
    "instructions": [{"sign": 0, "interval": [0, 1]}, {"sign": 4, "interval": [2, 2]}],
}]}


class RoadRoutingTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_full_bend_geometry_not_straight_line(self):
        result = routing._convert(PAYLOAD, BINS, "car")
        self.assertEqual(result["geometry"], GEOMETRY)
        self.assertEqual([s["route_index"] for s in result["stops"]], [0, 2])
        self.assertEqual(result["source"], "VIETMAP Route v4")

    def test_via_instruction_disambiguates_repeated_coordinate(self):
        geometry = [GEOMETRY[0], GEOMETRY[-1], GEOMETRY[1], GEOMETRY[-1], GEOMETRY[0]]
        data = copy.deepcopy(PAYLOAD)
        data["paths"][0].update(
            points=encode(geometry),
            snapped_waypoints=encode([geometry[0], geometry[3], geometry[4]]),
            instructions=[{"sign": 5, "interval": [3, 3]}])
        bins = [BINS[0], BINS[1], {**BINS[0], "id": "c"}]
        result = routing._convert(data, bins, "car")
        self.assertEqual([s["route_index"] for s in result["stops"]], [0, 3, 4])
        data["paths"][0]["instructions"] = []
        with self.assertRaises(routing.RoutingError):
            routing._convert(data, bins, "car")

    def test_invalid_geometry_and_missing_stops_rejected(self):
        for value in ("", "_", "!", encode([[91, 105]]), None):
            with self.subTest(value=value), self.assertRaises(routing.RoutingError):
                routing.decode_polyline(value)
        for field, value in (("snapped_waypoints", encode([GEOMETRY[0]])),
                             ("snapped_waypoints", encode([[21, 106], GEOMETRY[-1]])),
                             ("instructions", None)):
            data = copy.deepcopy(PAYLOAD)
            data["paths"][0][field] = value
            with self.subTest(field=field), self.assertRaises(routing.RoutingError):
                routing._convert(data, BINS, "car")

    def test_far_road_snap_rejected(self):
        bins = copy.deepcopy(BINS)
        bins[0]["longitude"] -= .01
        with self.assertRaisesRegex(routing.RoutingError, "300 m"):
            routing._convert(PAYLOAD, bins, "car")

    @patch("routing.get_settings", return_value=CONFIG)
    @patch("routing._get_json", return_value=PAYLOAD)
    def test_request_order_and_lat_lon_preserved(self, upstream, config):
        routing.road_route(BINS)
        params = upstream.call_args.args[0]
        self.assertEqual([v for k, v in params if k == "point"],
                         ["21.000000,105.800000", "21.001000,105.801000"])
        self.assertEqual(dict(params)["vehicle"], "car")
        self.assertEqual(dict(params)["points_encoded"], "true")
        self.assertEqual(dict(params)["optimize"], "false")

    def test_missing_key_invalid_vehicle_and_truck_weight_never_call_provider(self):
        for changes in ({"services_key": ""}, {"vehicle": "bicycle"},
                        {"vehicle": "truck"}, {"vehicle": "truck", "capacity": "-1"}):
            with patch("routing.get_settings", return_value={**CONFIG, **changes}), \
                 patch("routing._get_json") as upstream, self.assertRaises(routing.RoutingError):
                routing.road_route(BINS)
            upstream.assert_not_called()

    def test_truck_capacity_and_singleton(self):
        config = {**CONFIG, "vehicle": "truck", "capacity": "7500"}
        data = copy.deepcopy(PAYLOAD)
        data["paths"][0].update(points=encode([GEOMETRY[0]]),
                               snapped_waypoints=encode([GEOMETRY[0], GEOMETRY[0]]))
        with patch("routing.get_settings", return_value=config), \
             patch("routing._get_json", return_value=data) as upstream:
            result = routing.road_route(BINS[:1])
        self.assertEqual(dict(upstream.call_args.args[0])["capacity"], "7500")
        self.assertEqual(len(result["geometry"]), 1)
        self.assertEqual(len(result["stops"]), 1)

    @patch("routing.time.sleep")
    def test_http_request_and_safe_failures(self, sleep):
        with patch("routing.urlopen", return_value=io.StringIO(json.dumps(PAYLOAD))) as upstream:
            self.assertEqual(routing._get_json([("apikey", "SECRET"), ("point", "21,105.8")]), PAYLOAD)
        request = upstream.call_args.args[0]
        self.assertEqual(urlparse(request.full_url).netloc, "maps.vietmap.vn")
        self.assertEqual(parse_qs(urlparse(request.full_url).query)["point"], ["21,105.8"])
        for error in (URLError("https://provider?apikey=SECRET"), TimeoutError("SECRET"),
                      HTTPError("https://provider?apikey=SECRET", 423, "SECRET", {}, None),
                      HTTPError("https://provider?apikey=SECRET", 429, "SECRET", {}, None)):
            with patch("routing.urlopen", side_effect=error), self.assertRaises(routing.RoutingError) as caught:
                routing._get_json([("apikey", "SECRET")])
            self.assertNotIn("SECRET", str(caught.exception))

    @patch("routing.time.sleep")
    def test_provider_error_codes_and_malformed_json(self, sleep):
        for payload in ('not json', '[]', '{"code":"ZERO_RESULTS"}',
                        '{"code":"MAX_POINTS_EXCEED"}', '{"code":"OVER_DAILY_LIMIT","message":"SECRET"}'):
            with patch("routing.urlopen", return_value=io.StringIO(payload)), self.assertRaises(routing.RoutingError) as caught:
                routing._get_json([])
            self.assertNotIn("SECRET", str(caught.exception))

    @patch("app.load_bins", return_value=BINS)
    def test_api_validation(self, load):
        bad = [None, {}, {"bin_ids": []}, {"bin_ids": ["a", "a"]}, {"bin_ids": [1]},
               {"bin_ids": ["missing"]}, {"bin_ids": ["a"] * 101}]
        with patch("app.road_route") as route:
            for payload in bad:
                self.assertEqual(self.client.post("/api/road-route", json=payload).status_code, 400)
            route.assert_not_called()
        for changes in ({"status": "broken"}, {"latitude": float("nan")}, {"longitude": 181},
                        {"latitude": True}):
            with patch("app.load_bins", return_value=[{**BINS[0], **changes}]):
                self.assertEqual(self.client.post("/api/road-route", json={"bin_ids": ["a"]}).status_code, 400)

    @patch("app.load_bins", return_value=BINS)
    def test_api_success_and_failure_without_geometry_fallback(self, load):
        with patch("app.road_route", return_value=routing._convert(PAYLOAD, BINS, "car")):
            response = self.client.post("/api/road-route", json={"bin_ids": ["a", "b"]})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["geometry"], GEOMETRY)
        with patch("app.road_route", side_effect=routing.RoutingError("unavailable")):
            response = self.client.post("/api/road-route", json={"bin_ids": ["a"]})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("geometry", response.json)

    def test_only_browser_tile_key_is_exposed(self):
        with patch("settings.get_settings", return_value=CONFIG):
            for url in ("/", "/api/map-config"):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertIn("public-tile", response.get_data(as_text=True))
                self.assertNotIn("SECRET-services", response.get_data(as_text=True))
        for changes in ({"services_key": ""}, {"vehicle": "truck"}, {"vehicle": "invalid"}):
            with patch("settings.get_settings", return_value={**CONFIG, **changes}):
                self.assertFalse(settings.public_config()["routingConfigured"])

    def test_without_key_shows_setup_not_old_map(self):
        with patch("settings.get_settings", return_value={**CONFIG, "tilemap_key": "", "services_key": ""}):
            html = self.client.get("/").get_data(as_text=True)
            self.assertIn('id="mapPlaceholder"', html)
            self.assertNotIn('src="https://unpkg.com/@vietmap/vietmap-gl-js', html)
            self.assertNotIn("tile.openstreetmap.org", html)


if __name__ == "__main__":
    unittest.main()
