import copy
import unittest
from unittest.mock import patch
from urllib.error import URLError

from app import app
import routing


BINS = [
    {"id": "a", "latitude": 21.0, "longitude": 105.8, "status": "active"},
    {"id": "b", "latitude": 21.001, "longitude": 105.801, "status": "active"},
]
PAYLOAD = {
    "code": "Ok",
    "waypoints": [
        {"location": [105.8, 21.0], "distance": 5},
        {"location": [105.801, 21.001], "distance": 8},
    ],
    "routes": [{"legs": [{"steps": [
        {"geometry": {"coordinates": [[105.8, 21.0], [105.801, 21.0]]}},
        {"geometry": {"coordinates": [[105.801, 21.0], [105.801, 21.001]]}},
        {"geometry": {"coordinates": [[105.801, 21.001]]}},
    ]}]}],
}


class RoadRoutingTests(unittest.TestCase):
    def setUp(self):
        routing._cache.clear()
        self.client = app.test_client()

    def test_full_bend_geometry_and_stops_not_straight_line(self):
        result = routing._convert(PAYLOAD, BINS)
        self.assertEqual(result["geometry"], [[21, 105.8], [21, 105.801], [21.001, 105.801]])
        self.assertEqual([s["route_index"] for s in result["stops"]], [0, 2])

    def test_shared_snapped_stop_and_single_stop(self):
        single = {"waypoints": PAYLOAD["waypoints"][:1]}
        self.assertEqual(routing._convert(single, BINS[:1])["stops"][0]["route_index"], 0)
        data = copy.deepcopy(PAYLOAD)
        data["waypoints"][1] = data["waypoints"][0]
        data["routes"][0]["legs"][0]["steps"] = [{"geometry": {"coordinates": [[105.8, 21.0]]}}]
        self.assertEqual(len(routing._convert(data, BINS)["geometry"]), 1)

    def test_disconnected_geometry_rejected(self):
        data = copy.deepcopy(PAYLOAD)
        data["routes"][0]["legs"][0]["steps"][1]["geometry"]["coordinates"][0] = [105.9, 21.1]
        with self.assertRaises(routing.RoutingError):
            routing._convert(data, BINS)

    def test_sub_meter_osrm_rounding_does_not_break_route(self):
        data = copy.deepcopy(PAYLOAD)
        data["waypoints"][1]["location"] = [105.801001, 21.001003]
        data["routes"][0]["legs"][0]["steps"][1]["geometry"]["coordinates"][0] = [105.801001, 21.000003]
        self.assertEqual(len(routing._convert(data, BINS)["geometry"]), 3)

    def test_distant_or_invalid_snap_rejected(self):
        for value in (301, float("nan"), -1):
            data = copy.deepcopy(PAYLOAD)
            data["waypoints"][0]["distance"] = value
            with self.assertRaises(routing.RoutingError):
                routing._convert(data, BINS)

    @patch("routing._get_json", return_value=PAYLOAD)
    def test_cache_and_driving_query(self, upstream):
        routing.road_route(BINS)
        routing.road_route(BINS)
        upstream.assert_called_once()
        path, options = upstream.call_args.args
        self.assertIn("route/v1/driving/105.800000,21.000000;", path)
        self.assertEqual(options["steps"], "true")
        self.assertEqual(options["geometries"], "geojson")
        self.assertEqual(options["radiuses"], "300;300")

    @patch("routing.urlopen", side_effect=URLError("offline"))
    def test_network_failure_is_explicit(self, upstream):
        with self.assertRaises(routing.RoutingError):
            routing._get_json("route", {})

    @patch("app.load_bins", return_value=BINS)
    @patch("app.road_route")
    def test_reject_bad_requests_without_upstream(self, upstream, bins):
        for payload in (None, {}, [], {"bin_ids": []}, {"bin_ids": ["a", "a"]},
                        {"bin_ids": ["missing"]}, {"bin_ids": [{}]}, {"bin_ids": ["a"] * 101}):
            self.assertEqual(self.client.post("/api/road-route", json=payload).status_code, 400)
        upstream.assert_not_called()

    @patch("app.load_bins", return_value=BINS)
    @patch("app.road_route", side_effect=routing.RoutingError("offline"))
    def test_no_straight_line_fallback_on_failure(self, upstream, bins):
        response = self.client.post("/api/road-route", json={"bin_ids": ["a", "b"]})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json, {"error": "offline"})

    @patch("app.load_bins", return_value=BINS)
    @patch("app.road_route", return_value={"geometry": [[21, 105.8]], "stops": []})
    def test_api_preserves_requested_stop_order(self, upstream, bins):
        self.assertEqual(self.client.post("/api/road-route", json={"bin_ids": ["b", "a"]}).status_code, 200)
        self.assertEqual([b["id"] for b in upstream.call_args.args[0]], ["b", "a"])


if __name__ == "__main__":
    unittest.main()
