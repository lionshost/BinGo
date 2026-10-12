// ============================================================
// DB SETUP — tạo bảng (db/schema.sql) và upsert dữ liệu mẫu data/*.json
// Dùng: DATABASE_URL=... npm run db:setup   (chạy lại nhiều lần vẫn an toàn)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { getPool, closePool } from '../src/db/pool.js';
import { readSeedBins } from '../src/repositories/bins.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function toIsoDate(ddmmyyyy) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy || '');
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

async function main() {
    if (!env.databaseUrl) {
        throw new Error('Chưa đặt DATABASE_URL (trong backend/.env hoặc biến môi trường).');
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(rootDir, 'db', 'schema.sql'), 'utf8'));

        const bins = readSeedBins();
        for (const bin of bins) {
            await client.query(
                `INSERT INTO trash_bins
                    (id, name, latitude, longitude, district, type, status, recyclable, address, updated_on)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE))
                 ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
                    district = EXCLUDED.district, type = EXCLUDED.type, status = EXCLUDED.status,
                    recyclable = EXCLUDED.recyclable, address = EXCLUDED.address, updated_on = EXCLUDED.updated_on`,
                [bin.id, bin.name, bin.latitude, bin.longitude, bin.district, bin.type,
                    bin.status, Boolean(bin.recyclable), bin.address || '', toIsoDate(bin.updated)]
            );
        }
        await client.query('COMMIT');
        console.log(`✔ Đã tạo schema và nạp ${bins.length} điểm thu gom.`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await closePool();
    }
}

main().catch(err => {
    console.error('✘ db:setup thất bại:', err.message);
    process.exit(1);
});
