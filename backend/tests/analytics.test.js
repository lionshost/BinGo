import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = '';
process.env.CORS_ORIGINS = 'https://bingo.example';
process.env.AUTH_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { setUserRole } = await import('../src/repositories/users.js');
const { clearMemoryAnalytics, dayKey, incrementUsage, usageSeries } = await import('../src/repositories/analytics.js');

let server;
let base;

before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => clearMemoryAnalytics());

const post = (url, body) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'BinGoTest/1.0' },
    body: JSON.stringify(body)
});
const get = (url, token) => fetch(base + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function adminToken(email) {
    const { token, user } = await (await post('/api/auth/register', { email, password: 'matkhau123' })).json();
    await setUserRole(user.id, 'admin');
    return token;
}

test('dayKey tính theo giờ Việt Nam (UTC+7)', () => {
    assert.equal(dayKey(Date.parse('2026-10-18T16:59:00Z')), '2026-10-18');
    assert.equal(dayKey(Date.parse('2026-10-18T17:00:00Z')), '2026-10-19');
});

test('usageSeries trả đủ số ngày, đếm đúng ngày và bỏ ngày ngoài khoảng', async () => {
    const now = Date.parse('2026-10-18T05:00:00Z');
    incrementUsage('vietmap.route', 2, now);
    incrementUsage('vietmap.route', 1, now - 86400_000);
    incrementUsage('vietmap.route', 9, now - 30 * 86400_000);
    const { days, metrics } = await usageSeries(3, now);
    assert.deepEqual(days, ['2026-10-16', '2026-10-17', '2026-10-18']);
    assert.deepEqual(metrics['vietmap.route'], [0, 1, 2]);
});

test('đăng nhập đúng/sai được ghi vào lịch sử, admin xem được', async () => {
    const token = await adminToken('boss@x.vn');
    await post('/api/auth/login', { email: 'boss@x.vn', password: 'sai-mat-khau' });
    await post('/api/auth/login', { email: 'boss@x.vn', password: 'matkhau123' });

    const { events } = await (await get('/api/admin/logins', token)).json();
    assert.deepEqual(events.slice(0, 3).map(e => [e.method, e.success]), [['email', true], ['email', false], ['register', true]]);
    assert.equal(events[0].email, 'boss@x.vn');
    assert.equal(events[0].userAgent, 'BinGoTest/1.0');
    assert.ok(events[0].ip);
    assert.ok(!('passwordHash' in events[0]));

    const usage = await (await get('/api/admin/usage?days=7', token)).json();
    assert.equal(usage.days.length, 7);
    assert.equal(usage.totals['auth.email.ok'], 1);
    assert.equal(usage.totals['auth.email.fail'], 1);
    assert.equal(usage.totals['auth.register.ok'], 1);
});

test('/api/track chỉ nhận trang trong danh sách', async () => {
    const token = await adminToken('boss2@x.vn');
    assert.equal((await post('/api/track', { page: 'map' })).status, 204);
    assert.equal((await post('/api/track', { page: 'map' })).status, 204);
    assert.equal((await post('/api/track', { page: '../../hack' })).status, 400);
    assert.equal((await post('/api/track', {})).status, 400);

    const { totals } = await (await get('/api/admin/usage', token)).json();
    assert.equal(totals['page.map'], 2);
    assert.ok(!Object.keys(totals).some(k => k.includes('hack')));
    // Gọi /api/track không tính vào lượt gọi API chung, còn /api/admin/usage thì có.
    assert.ok(totals['api.requests'] >= 1);
});

test('API thống kê chỉ dành cho admin', async () => {
    assert.equal((await get('/api/admin/logins')).status, 401);
    const { token } = await (await post('/api/auth/register', { email: 'thuong@x.vn', password: 'matkhau123' })).json();
    assert.equal((await get('/api/admin/usage', token)).status, 403);
});
