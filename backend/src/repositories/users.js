// ============================================================
// USER REPOSITORY
// PostgreSQL khi có DATABASE_URL; nếu không, lưu trong bộ nhớ (dev/test, mất khi restart).
// ============================================================

import crypto from 'node:crypto';
import { getPool } from '../db/pool.js';

const memory = new Map();

export const ROLES = ['user', 'admin'];

const COLUMNS = 'id, email, password_hash, google_id, name, role, created_at';
const toUser = row => row && ({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    name: row.name,
    role: row.role,
    createdAt: new Date(row.created_at).toISOString()
});

export const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role });

export async function findUserByEmail(email) {
    const pool = getPool();
    if (!pool) return [...memory.values()].find(u => u.email === email) || null;
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
    return toUser(rows[0]) || null;
}

export async function findUserById(id) {
    const pool = getPool();
    if (!pool) return memory.get(id) || null;
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return toUser(rows[0]) || null;
}

export async function findUserByGoogleId(googleId) {
    const pool = getPool();
    if (!pool) return [...memory.values()].find(u => u.googleId === googleId) || null;
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE google_id = $1`, [googleId]);
    return toUser(rows[0]) || null;
}

// Trả về null nếu email đã tồn tại (kể cả khi hai request đăng ký cùng email chạy song song).
export async function createUser({ email, passwordHash = null, googleId = null, name = '', role = 'user' }) {
    const pool = getPool();
    const id = crypto.randomUUID();
    if (!pool) {
        if ([...memory.values()].some(u => u.email === email)) return null;
        const user = { id, email, passwordHash, googleId, name, role, createdAt: new Date().toISOString() };
        memory.set(id, user);
        return user;
    }
    const { rows } = await pool.query(
        `INSERT INTO users (id, email, password_hash, google_id, name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING
         RETURNING ${COLUMNS}`,
        [id, email, passwordHash, googleId, name, role]
    );
    return toUser(rows[0]) || null;
}

// Gắn Google vào tài khoản email có sẵn và XOÁ mật khẩu cũ: nếu kẻ khác đã đăng ký trước
// bằng email của bạn (email đăng ký chưa được xác minh) thì mật khẩu của họ không còn dùng được.
export async function linkGoogle(userId, googleId, name) {
    const pool = getPool();
    if (!pool) {
        const user = memory.get(userId);
        user.googleId = googleId;
        user.passwordHash = null;
        if (!user.name) user.name = name;
        return user;
    }
    const { rows } = await pool.query(
        `UPDATE users
            SET google_id = $2, password_hash = NULL, name = COALESCE(NULLIF(name, ''), $3)
          WHERE id = $1
      RETURNING ${COLUMNS}`,
        [userId, googleId, name]
    );
    return toUser(rows[0]);
}

export async function setUserRole(userId, role) {
    if (!ROLES.includes(role)) throw new Error(`Role không hợp lệ: ${role}`);
    const pool = getPool();
    if (!pool) {
        const user = memory.get(userId);
        if (!user) return null;
        user.role = role;
        return user;
    }
    const { rows } = await pool.query(`UPDATE users SET role = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [userId, role]);
    return toUser(rows[0]) || null;
}

export async function listUsers(limit = 100) {
    const pool = getPool();
    if (!pool) {
        return [...memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    }
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC LIMIT $1`, [limit]);
    return rows.map(toUser);
}

export async function userStats() {
    const weekAgo = Date.now() - 7 * 86400_000;
    const pool = getPool();
    if (!pool) {
        const all = [...memory.values()];
        return {
            total: all.length,
            admins: all.filter(u => u.role === 'admin').length,
            google: all.filter(u => u.googleId).length,
            newThisWeek: all.filter(u => Date.parse(u.createdAt) >= weekAgo).length
        };
    }
    const { rows: [row] } = await pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
                COUNT(*) FILTER (WHERE google_id IS NOT NULL)::int AS google,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS "newThisWeek"
           FROM users`
    );
    return row;
}

export function clearMemoryUsers() {
    memory.clear();
}
