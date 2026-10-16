import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = '';
process.env.CORS_ORIGINS = 'https://bingo.example';
process.env.AUTH_SECRET = 'test-secret';
process.env.GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com';

const { createApp } = await import('../src/app.js');
const { verifyGoogleIdToken, signToken, verifyToken, AuthError } = await import('../src/services/auth.js');

let server;
let base;

before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (url, body, headers = {}) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
});

test('đăng ký → /me → đăng nhập lại', async () => {
    const reg = await post('/api/auth/register', { email: ' Dang@Example.com ', password: 'matkhau123', name: 'Đăng' });
    assert.equal(reg.status, 201);
    const { token, user } = await reg.json();
    assert.equal(user.email, 'dang@example.com');
    assert.equal(user.passwordHash, undefined);

    const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.id, user.id);

    const login = await post('/api/auth/login', { email: 'DANG@example.com', password: 'matkhau123' });
    assert.equal(login.status, 200);
});

test('từ chối email trùng, mật khẩu yếu, đăng nhập sai', async () => {
    await post('/api/auth/register', { email: 'a@b.vn', password: 'matkhau123' });
    assert.equal((await post('/api/auth/register', { email: 'a@b.vn', password: 'matkhau123' })).status, 409);
    assert.equal((await post('/api/auth/register', { email: 'c@d.vn', password: 'short' })).status, 400);
    assert.equal((await post('/api/auth/register', { email: 'khong-hop-le', password: 'matkhau123' })).status, 400);
    assert.equal((await post('/api/auth/login', { email: 'a@b.vn', password: 'saimatkhau' })).status, 401);
    assert.equal((await post('/api/auth/login', { email: 'ko-ton-tai@b.vn', password: 'matkhau123' })).status, 401);
});

test('/me từ chối token sai hoặc hết hạn', async () => {
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
    const bad = await fetch(`${base}/api/auth/me`, { headers: { Authorization: 'Bearer abc.def.ghi' } });
    assert.equal(bad.status, 401);
    assert.equal(verifyToken(signToken('u1', 'test-secret', -10), 'test-secret'), null);
    assert.equal(verifyToken(signToken('u1', 'other', 60), 'test-secret'), null);
    assert.equal(verifyToken(signToken('u1', 'test-secret', 60), 'test-secret').sub, 'u1');
});

test('Google: kiểm tra audience và email đã xác minh', async () => {
    const clientId = 'client-123.apps.googleusercontent.com';
    const reply = info => async () => ({ ok: true, json: async () => info });
    const good = { aud: clientId, iss: 'https://accounts.google.com', email_verified: 'true', email: 'G@x.com', sub: '42', name: 'G' };

    assert.deepEqual(await verifyGoogleIdToken('t', clientId, reply(good)), { googleId: '42', email: 'g@x.com', name: 'G' });
    await assert.rejects(verifyGoogleIdToken('t', clientId, reply({ ...good, aud: 'other' })), AuthError);
    await assert.rejects(verifyGoogleIdToken('t', clientId, reply({ ...good, email_verified: 'false' })), AuthError);
    await assert.rejects(verifyGoogleIdToken('t', clientId, reply({ ...good, iss: 'evil.com' })), AuthError);
    await assert.rejects(verifyGoogleIdToken('t', '', reply(good)), AuthError);
    await assert.rejects(verifyGoogleIdToken('t', clientId, async () => ({ ok: false })), AuthError);
});

test('Google: token giả bị từ chối, config trả client id', async () => {
    const res = await post('/api/auth/google', { credential: 'khong-phai-token' });
    assert.ok([401, 503].includes(res.status)); // 503 nếu máy test offline
    const cfg = await (await fetch(`${base}/api/auth/config`)).json();
    assert.equal(cfg.googleClientId, 'client-123.apps.googleusercontent.com');
});
