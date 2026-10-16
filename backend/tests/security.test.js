import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = '';
process.env.CORS_ORIGINS = 'https://bingo.example';
process.env.AUTH_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { createRateLimiter } = await import('../src/services/security.js');
const { updatePositions, FleetError, MAX_TRUCKS } = await import('../src/services/fleet.js');

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

test('API trả header bảo mật', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(res.headers.get('x-powered-by'), null);
});

test('body quá 100KB bị từ chối (trừ route ảnh)', async () => {
    const big = JSON.stringify({ email: 'a@b.vn', password: 'x'.repeat(200_000) });
    assert.equal((await post('/api/auth/login', big)).status, 413);
});

test('rate limiter chặn khi vượt ngưỡng và gửi Retry-After', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const res = { headers: {}, set(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json() {} };
    let passed = 0;
    for (let i = 0; i < 4; i++) limiter({ ip: '1.2.3.4' }, res, () => passed++);
    assert.equal(passed, 2);
    assert.equal(res.code, 429);
    assert.ok(res.headers['Retry-After']);
    limiter({ ip: '5.6.7.8' }, res, () => passed++); // IP khác không bị ảnh hưởng
    assert.equal(passed, 3);
});

test('đăng nhập sai nhiều lần cho cùng email bị khoá', async () => {
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await post('/api/auth/login', { email: 'victim@b.vn', password: 'sai-mat-khau' })).status);
    assert.equal(codes[0], 401);
    assert.equal(codes.at(-1), 429);
});

test('số xe lưu trong bộ nhớ có trần', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_TRUCKS / 100; i++) {
        updatePositions(Array.from({ length: 100 }, (_, j) => ({ id: `t${i}-${j}`, lat: 21, lon: 105 })), now);
    }
    assert.throws(() => updatePositions([{ id: 'qua-tran', lat: 21, lon: 105 }], now), FleetError);
    // xe đã có vẫn cập nhật được
    assert.equal(updatePositions([{ id: 't0-0', lat: 21.1, lon: 105 }], now), 1);
});
