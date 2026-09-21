import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline, distance, convert, MAX_STOPS } from '../server/services/routing.js';

// Polyline encoding helper for tests
function encode(points) {
    let result = '';
    let prev = [0, 0];
    for (const point of points) {
        for (let axis = 0; axis < 2; axis++) {
            const val = Math.round(point[axis] * 1e5);
            let delta = val - prev[axis];
            prev[axis] = val;
            let num = delta < 0 ? ~(delta << 1) : delta << 1;
            while (num >= 32) {
                result += String.fromCharCode((32 | (num & 31)) + 63);
                num >>= 5;
            }
            result += String.fromCharCode(num + 63);
        }
    }
    return result;
}

test('decodePolyline decodes standard lat/lon polyline5', () => {
    const points = [[21.0, 105.8], [21.001, 105.801], [21.002, 105.802]];
    const encoded = encode(points);
    const decoded = decodePolyline(encoded);
    assert.equal(decoded.length, 3);
    assert.ok(Math.abs(decoded[0][0] - 21.0) < 1e-4);
    assert.ok(Math.abs(decoded[0][1] - 105.8) < 1e-4);
    assert.ok(Math.abs(decoded[2][0] - 21.002) < 1e-4);
});

test('distance calculates accurate Haversine distance in meters', () => {
    // 1 degree latitude is approximately 111.139 km = 111139 m
    const d = distance([21.0, 105.8], [21.001, 105.8]);
    assert.ok(d > 110 && d < 112);
});

test('convert matches snapped waypoints to geometry indices', () => {
    const bins = [
        { id: 'bin-1', latitude: 21.0, longitude: 105.8 },
        { id: 'bin-2', latitude: 21.001, longitude: 105.801 },
        { id: 'bin-3', latitude: 21.002, longitude: 105.802 }
    ];
    const geometry = [
        [21.0, 105.8],
        [21.0005, 105.8005],
        [21.001, 105.801],
        [21.0015, 105.8015],
        [21.002, 105.802]
    ];
    const snapped = [
        [21.0, 105.8],
        [21.001, 105.801],
        [21.002, 105.802]
    ];
    const payload = {
        code: 'OK',
        paths: [{
            points: encode(geometry),
            snapped_waypoints: encode(snapped),
            instructions: [
                { sign: 0, text: 'Start' },
                { sign: 5, interval: [2, 2], text: 'Waypoint 1' },
                { sign: 4, text: 'Destination' }
            ]
        }]
    };

    const res = convert(payload, bins, 'car');
    assert.equal(res.geometry.length, 5);
    assert.equal(res.stops.length, 3);
    assert.equal(res.stops[0].bin_id, 'bin-1');
    assert.equal(res.stops[0].route_index, 0);
    assert.equal(res.stops[1].bin_id, 'bin-2');
    assert.equal(res.stops[1].route_index, 2);
    assert.equal(res.stops[2].bin_id, 'bin-3');
    assert.equal(res.stops[2].route_index, 4);
});
