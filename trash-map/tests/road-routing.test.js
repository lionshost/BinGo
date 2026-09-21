import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as road from '../src/js/road-routing.js';

function fixture() {
    const truck = {orderedBins: [{id: 'a'}, {id: 'b'}, {id: 'c'}]};
    road.prepare(truck, {
        geometry: [[21, 105.8], [21, 105.8001], [21.0001, 105.8001], [21.0001, 105.8002]],
        stops: [{bin_id: 'a', route_index: 0}, {bin_id: 'b', route_index: 2}, {bin_id: 'c', route_index: 3}]
    });
    return truck;
}

test('truck turns at the road bend rather than interpolating between bins', () => {
    const truck = fixture();
    const first = road.advance(truck, 0);
    assert.deepEqual(first.reached.map(b => b.id), ['a']);
    assert.ok(typeof first.bearing === 'number');
    const move = road.advance(truck, truck.cumulative[1] + 3);
    assert.equal(move.position[1], 105.8001);
    assert.ok(move.position[0] > 21 && move.position[0] < 21.0001);
    assert.deepEqual(move.reached, []);
    assert.ok(Math.abs(move.bearing - 0) < 1, 'heading should be North along the second road segment');
});

test('bearing calculates accurate cardinal directions', () => {
    assert.ok(Math.abs(road.bearing([21.0, 105.0], [21.01, 105.0]) - 0) < 0.1, 'North is ~0 deg');
    assert.ok(Math.abs(road.bearing([21.0, 105.0], [21.0, 105.01]) - 90) < 0.1, 'East is ~90 deg');
    assert.ok(Math.abs(road.bearing([21.0, 105.0], [20.99, 105.0]) - 180) < 0.1, 'South is ~180 deg');
    assert.ok(Math.abs(road.bearing([21.0, 105.0], [21.0, 104.99]) - 270) < 0.1, 'West is ~270 deg');
});

test('high speed crosses short segments and collects every reached stop once', () => {
    const truck = fixture();
    const move = road.advance(truck, 10000);
    assert.deepEqual(move.position, truck.route.at(-1));
    assert.deepEqual(move.reached.map(b => b.id), ['a', 'b', 'c']);
    assert.equal(truck.distanceTravelled, truck.totalDistance);
    assert.deepEqual(road.advance(truck, 10000).reached, []);
});

test('speed changes preserve exact distance and reset restores original state', () => {
    const truck = fixture();
    road.advance(truck, 2);
    road.advance(truck, 20);
    assert.equal(truck.distanceTravelled, 22);
    road.reset(truck);
    assert.equal(truck.distanceTravelled, 0);
    assert.deepEqual(road.advance(truck, 0).reached.map(b => b.id), ['a']);
});

test('single location, duplicate vertices and colocated stops terminate safely', () => {
    const truck = {orderedBins: [{id: 'a'}, {id: 'b'}]};
    road.prepare(truck, {geometry: [[21, 105.8], [21, 105.8]],
        stops: [{bin_id: 'a', route_index: 0}, {bin_id: 'b', route_index: 1}]});
    assert.equal(road.advance(truck, 0).reached.length, 2);
    assert.equal(truck.totalDistance, 0);
});

test('invalid coordinates and out-of-order stops are rejected', () => {
    const truck = {orderedBins: [{id: 'a'}]};
    assert.throws(() => road.prepare(truck, {geometry: [[NaN, 105]], stops: []}));
    assert.throws(() => road.prepare(truck, {geometry: [[21, 105]], stops: [{bin_id: 'b', route_index: 0}]}));
});
