// ============================================================
// POSTGRESQL CONNECTION POOL
// Không có DATABASE_URL → trả về null, kho dữ liệu dùng file JSON mẫu.
// ============================================================

import pg from 'pg';
import { env } from '../config/env.js';

let pool = null;

export function getPool() {
    if (!env.databaseUrl) return null;
    if (!pool) {
        pool = new pg.Pool({
            connectionString: env.databaseUrl,
            // Neon / Supabase / Render yêu cầu SSL; đặt DATABASE_SSL=false cho Postgres local.
            ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
            max: 5,
            idleTimeoutMillis: 30000,
            // Truy vấn treo không được giữ kết nối mãi.
            connectionTimeoutMillis: 10000,
            statement_timeout: 15000
        });
        pool.on('error', err => console.error('PostgreSQL pool error:', err.message));
    }
    return pool;
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
