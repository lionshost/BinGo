// ============================================================
// TRASH BIN REPOSITORY
// PostgreSQL khi có DATABASE_URL; nếu không, đọc file JSON mẫu (dev/test).
// Cả hai nguồn trả về cùng định dạng mà frontend đang dùng.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../db/pool.js';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
export const SEED_FILES = ['trash_bins.json', 'thanh_xuan_bins.json'].map(name => path.join(dataDir, name));

const SELECT_BINS = `
    SELECT id, name, latitude, longitude, district, type, status, recyclable, address,
           to_char(updated_on, 'DD/MM/YYYY') AS updated
    FROM trash_bins`;

let fileCache = null;

export function readSeedBins() {
    if (!fileCache) {
        fileCache = SEED_FILES.filter(file => fs.existsSync(file))
            .flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    }
    return fileCache;
}

export async function listBins() {
    const pool = getPool();
    if (!pool) return readSeedBins();
    const { rows } = await pool.query(`${SELECT_BINS} ORDER BY id`);
    return rows;
}

export async function findBinsByIds(ids) {
    const pool = getPool();
    if (!pool) {
        const wanted = new Set(ids);
        return readSeedBins().filter(bin => wanted.has(bin.id));
    }
    const { rows } = await pool.query(`${SELECT_BINS} WHERE id = ANY($1::text[])`, [ids]);
    return rows;
}
