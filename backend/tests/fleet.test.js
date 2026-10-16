import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = '';
process.env.CORS_ORIGINS = 'https://bingo.example';

const { createApp } = await import('../src/app.js');
const { clearFleet, updatePositions, nearbyTrucks, STALE_MS } = await import('../src/services/fleet.js');

let server;
let base;

before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => clearFleet());

const publish = trucks => fetch(`${base}/api/fleet/positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trucks })
});

test('xe trong bán kính được trả về, gần nhất trước', async () => {
    const res = await publish([
        { id: 'HN-02', name: 'Xe 2', lat: 21.0330, lon: 105.8500 },
        { id: 'HN-01', name: 'Xe 1', lat: 21.0290, lon: 105.8500, color: '#16a34a' },
        { id: 'HN-03', name: 'Xe 3', lat: 21.1000, lon: 105.9000 }
    ]);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).accepted, 3);

    const near = await fetch(`${base}/api/fleet/nearby?lat=21.0285&lon=105.8500&radius=1000`);
    const data = await near.json();
    assert.deepEqual(data.trucks.map(t => t.id), ['HN-01', 'HN-02']);
    assert.ok(data.trucks[0].distance < data.trucks[1].distance);
    assert.ok(data.trucks[0].etaMinutes >= 1);
});

test('đầu vào sai bị từ chối', async () => {
    assert.equal((await publish([])).status, 400);
    assert.equal((await publish([{ id: 'x', lat: 200, lon: 0 }])).status, 400);
    assert.equal((await publish([{ id: '', lat: 1, lon: 1 }])).status, 400);
    assert.equal((await fetch(`${base}/api/fleet/nearby?lat=abc&lon=1`)).status, 400);
    assert.equal((await fetch(`${base}/api/fleet/nearby?lat=1&lon=1&radius=999999`)).status, 400);
});

test('xe ngừng báo vị trí quá lâu thì biến mất', () => {
    const t0 = 1_000_000;
    updatePositions([{ id: 'A', lat: 21, lon: 105 }], t0);
    assert.equal(nearbyTrucks(21, 105, 500, t0 + STALE_MS - 1).length, 1);
    assert.equal(nearbyTrucks(21, 105, 500, t0 + STALE_MS + 1).length, 0);
});
