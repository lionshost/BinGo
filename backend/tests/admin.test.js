import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = '';
process.env.CORS_ORIGINS = 'https://bingo.example';
process.env.AUTH_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { setUserRole } = await import('../src/repositories/users.js');

let server;
let base;

before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const register = async email => {
    const res = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'matkhau123' })
    });
    return res.json();
};
const get = (url, token) => fetch(base + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('đăng ký mới luôn là role user, không tự đặt được admin', async () => {
    const res = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hacker@x.vn', password: 'matkhau123', role: 'admin' })
    });
    assert.equal((await res.json()).user.role, 'user');
});

test('API admin: chưa đăng nhập 401, user thường 403', async () => {
    assert.equal((await get('/api/admin/stats')).status, 401);
    assert.equal((await get('/api/admin/stats', 'abc.def.ghi')).status, 401);
    const { token } = await register('user@x.vn');
    assert.equal((await get('/api/admin/stats', token)).status, 403);
    assert.equal((await get('/api/admin/users', token)).status, 403);
});

test('admin xem được thống kê và danh sách user (không lộ hash mật khẩu)', async () => {
    const { token, user } = await register('admin@x.vn');
    await setUserRole(user.id, 'admin');

    const stats = await (await get('/api/admin/stats', token)).json();
    assert.ok(stats.bins.total > 0);
    assert.ok(stats.bins.byStatus);
    assert.ok(stats.users.total >= 3);
    assert.equal(stats.users.admins, 1);
    assert.equal(stats.system.database, 'json-file');

    const { users } = await (await get('/api/admin/users', token)).json();
    assert.ok(users.some(u => u.email === 'admin@x.vn' && u.role === 'admin'));
    assert.ok(users.every(u => u.passwordHash === undefined && u.password_hash === undefined));

    const me = await (await get('/api/auth/me', token)).json();
    assert.equal(me.user.role, 'admin');
});

test('thu hồi quyền có hiệu lực ngay với token cũ', async () => {
    const { token, user } = await register('temp-admin@x.vn');
    await setUserRole(user.id, 'admin');
    assert.equal((await get('/api/admin/stats', token)).status, 200);
    await setUserRole(user.id, 'user');
    assert.equal((await get('/api/admin/stats', token)).status, 403);
});
