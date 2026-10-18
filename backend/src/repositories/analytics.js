// ============================================================
// ANALYTICS REPOSITORY — lịch sử đăng nhập + bộ đếm lượt dùng theo ngày.
// PostgreSQL khi có DATABASE_URL; nếu không, lưu trong bộ nhớ (dev/test, mất khi restart).
// Bộ đếm được gom trong bộ nhớ rồi ghi xuống DB theo lô (flushUsage) để mỗi request
// không phải chờ một câu UPSERT. Lỗi ghi chỉ được log, không bao giờ làm hỏng request.
// ============================================================

import { getPool } from '../db/pool.js';

const MAX_MEMORY_LOGINS = 500;
// Ngày tính theo giờ Việt Nam (UTC+7) để "hôm nay" khớp với người dùng.
const TZ_OFFSET_MS = 7 * 3600_000;

export const dayKey = (ms = Date.now()) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);

const memoryLogins = [];
// Đã ghi xuống DB (hoặc dùng làm kho chính khi không có DB): "YYYY-MM-DD|metric" → count
const memoryUsage = new Map();
// Chưa ghi xuống DB
let pending = new Map();
let warned = false;

const warnOnce = err => {
    if (warned) return;
    warned = true;
    console.warn(`[analytics] Không ghi được thống kê (${err.message}). Đã tạo bảng login_events / usage_daily chưa?`);
};

const bump = (map, key, n) => map.set(key, (map.get(key) || 0) + n);

/** Tăng bộ đếm `metric` của hôm nay (không chờ DB). */
export function incrementUsage(metric, n = 1, ms = Date.now()) {
    bump(getPool() ? pending : memoryUsage, `${dayKey(ms)}|${metric}`, n);
}

/** Ghi các bộ đếm đang chờ xuống DB. Lỗi thì giữ lại để lần sau ghi tiếp. */
export async function flushUsage() {
    const pool = getPool();
    if (!pool || !pending.size) return;
    const batch = pending;
    pending = new Map();
    const days = [];
    const metrics = [];
    const counts = [];
    for (const [key, count] of batch) {
        const [day, metric] = key.split('|');
        days.push(day);
        metrics.push(metric);
        counts.push(count);
    }
    try {
        await pool.query(
            `INSERT INTO usage_daily (day, metric, count)
             SELECT * FROM unnest($1::date[], $2::text[], $3::bigint[])
             ON CONFLICT (day, metric) DO UPDATE SET count = usage_daily.count + EXCLUDED.count`,
            [days, metrics, counts]
        );
    } catch (err) {
        warnOnce(err);
        for (const [key, count] of batch) bump(pending, key, count);
    }
}

/** Số liệu `days` ngày gần nhất (kể cả hôm nay): { days: [...], metrics: { name: [count theo ngày] } } */
export async function usageSeries(days = 14, ms = Date.now()) {
    const dayList = [];
    for (let i = days - 1; i >= 0; i--) dayList.push(dayKey(ms - i * 86400_000));
    const index = new Map(dayList.map((d, i) => [d, i]));
    const metrics = {};
    const add = (day, metric, count) => {
        const i = index.get(day);
        if (i === undefined) return;
        (metrics[metric] ||= new Array(days).fill(0))[i] += Number(count);
    };

    const pool = getPool();
    if (pool) {
        try {
            const { rows } = await pool.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, metric, count FROM usage_daily WHERE day >= $1::date`,
                [dayList[0]]
            );
            for (const row of rows) add(row.day, row.metric, row.count);
        } catch (err) {
            warnOnce(err);
        }
    }
    // Kho bộ nhớ (khi không có DB) + phần chưa kịp ghi xuống DB
    for (const map of [memoryUsage, pending]) {
        for (const [key, count] of map) {
            const [day, metric] = key.split('|');
            add(day, metric, count);
        }
    }
    return { days: dayList, metrics };
}

/** Lưu một lượt đăng nhập/đăng ký (thành công hoặc thất bại). */
export async function recordLogin({ userId = null, email, method, success, ip = null, userAgent = null }) {
    const event = {
        userId,
        email: String(email || '').slice(0, 254),
        method,
        success: Boolean(success),
        ip: ip ? String(ip).slice(0, 64) : null,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
        createdAt: new Date().toISOString()
    };
    const pool = getPool();
    if (!pool) {
        memoryLogins.unshift(event);
        memoryLogins.length = Math.min(memoryLogins.length, MAX_MEMORY_LOGINS);
        return;
    }
    try {
        await pool.query(
            `INSERT INTO login_events (user_id, email, method, success, ip, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [event.userId, event.email, event.method, event.success, event.ip, event.userAgent]
        );
    } catch (err) {
        warnOnce(err);
    }
}

export async function listLogins(limit = 50) {
    const pool = getPool();
    if (!pool) return memoryLogins.slice(0, limit);
    try {
        const { rows } = await pool.query(
            `SELECT user_id, email, method, success, ip, user_agent, created_at
               FROM login_events ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        return rows.map(row => ({
            userId: row.user_id,
            email: row.email,
            method: row.method,
            success: row.success,
            ip: row.ip,
            userAgent: row.user_agent,
            createdAt: new Date(row.created_at).toISOString()
        }));
    } catch (err) {
        warnOnce(err);
        return [];
    }
}

/** Xoá lịch sử đăng nhập cũ hơn `days` ngày (chạy định kỳ). */
export async function pruneLogins(days = 90) {
    const pool = getPool();
    if (!pool) return;
    try {
        await pool.query(`DELETE FROM login_events WHERE created_at < NOW() - make_interval(days => $1)`, [days]);
    } catch (err) {
        warnOnce(err);
    }
}

export function clearMemoryAnalytics() {
    memoryLogins.length = 0;
    memoryUsage.clear();
    pending.clear();
}
