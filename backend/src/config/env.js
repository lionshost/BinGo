// ============================================================
// ENVIRONMENT CONFIG — đọc một lần từ biến môi trường (.env khi chạy local)
// Services key / Gemini key / DATABASE_URL chỉ dùng trên máy chủ.
// ============================================================

import 'dotenv/config';
import { DEFAULT_MODEL } from '../services/waste-vision.js';

const read = (name, fallback = '') => String(process.env[name] ?? fallback).trim();

function parseOrigins(value) {
    return value.split(',').map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean);
}

export const env = {
    port: Number(read('PORT', '3000')) || 3000,
    nodeEnv: read('NODE_ENV', 'development'),
    databaseUrl: read('DATABASE_URL'),
    databaseSsl: read('DATABASE_SSL', 'true') !== 'false',
    corsOrigins: parseOrigins(read('CORS_ORIGINS')),
    tilemapKey: read('VIETMAP_TILEMAP_KEY'),
    servicesKey: read('VIETMAP_SERVICES_KEY'),
    vehicle: read('VIETMAP_VEHICLE', 'car'),
    capacity: read('VIETMAP_TRUCK_WEIGHT_KG'),
    geminiKey: read('GEMINI_API_KEY'),
    geminiModel: read('GEMINI_MODEL', DEFAULT_MODEL)
};

export function publicConfig() {
    const weightOk = env.vehicle !== 'truck' || (/^\d+$/.test(env.capacity) && parseInt(env.capacity, 10) > 0);
    return {
        provider: 'vietmap',
        tilemapKey: env.tilemapKey,
        routingConfigured: Boolean(env.servicesKey) && weightOk && ['car', 'truck'].includes(env.vehicle),
        vehicle: env.vehicle,
        geminiConfigured: Boolean(env.geminiKey),
        geminiModel: env.geminiModel
    };
}
