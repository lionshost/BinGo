import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chạy offline: dùng dữ liệu JSON mẫu và không gọi VIETMAP/Gemini thật.
// dotenv không ghi đè biến đã có, nên đặt trước khi import app.
process.env.DATABASE_URL = '';
process.env.VIETMAP_SERVICES_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.CORS_ORIGINS = 'https://bingo.example';

const { createApp } = await import('../src/app.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server;
let base;

before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (url, body) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});

test('health reports the JSON fallback when DATABASE_URL is empty', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', database: 'json-file' });
});

test('trash-bins returns both seed datasets', async () => {
    const bins = await (await fetch(`${base}/api/trash-bins`)).json();
    assert.equal(bins.length, 350);
    assert.ok(bins.some(b => b.id.startsWith('HN-')) && bins.some(b => b.id.startsWith('TX-')));
});

test('map-config never exposes the services key', async () => {
    const config = await (await fetch(`${base}/api/map-config`)).json();
    assert.equal(config.routingConfigured, false);
    assert.ok(!('servicesKey' in config));
});

test('CORS only allows configured origins', async () => {
    const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'https://bingo.example' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://bingo.example');
    const other = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('road-route validates input before calling VIETMAP', async () => {
    assert.equal((await post('/api/road-route', { bin_ids: [] })).status, 400);
    assert.equal((await post('/api/road-route', { bin_ids: ['HN-0001', 'HN-0001'] })).status, 400);
    assert.equal((await post('/api/road-route', { bin_ids: ['NOPE'] })).status, 400);
    assert.equal((await post('/api/road-route', '{bad json')).status, 400);
    const missingKey = await post('/api/road-route', { bin_ids: ['HN-0001'] });
    assert.equal(missingKey.status, 503);
});

test('unknown API paths return JSON 404', async () => {
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    assert.ok((await res.json()).error);
});

test('waste taxonomy copy matches the frontend copy', () => {
    const frontend = path.join(__dirname, '../../frontend/src/js/config/waste-taxonomy.js');
    if (!fs.existsSync(frontend)) return;
    const backend = path.join(__dirname, '../src/config/waste-taxonomy.js');
    assert.equal(fs.readFileSync(backend, 'utf8'), fs.readFileSync(frontend, 'utf8'));
});
