// ============================================================
// ENVIRONMENT CONFIG — đọc một lần từ biến môi trường (.env khi chạy local)
// Services key / Gemini key / DATABASE_URL chỉ dùng trên máy chủ.
// ============================================================

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL } from '../services/waste-vision.js';
import { DEFAULT_MODEL_PATH } from '../services/waste-cv.js';

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
    geminiModel: read('GEMINI_MODEL', DEFAULT_MODEL),
    cvModelPath: read('CV_MODEL_PATH'),
    authSecret: read('AUTH_SECRET'),
    tokenTtlSeconds: (Number(read('AUTH_TOKEN_DAYS', '7')) || 7) * 86400,
    googleClientId: read('GOOGLE_CLIENT_ID'),
    adminEmails: parseOrigins(read('ADMIN_EMAILS').toLowerCase())
};

if (!env.authSecret) {
    if (env.nodeEnv === 'production') {
        throw new Error('Thiếu AUTH_SECRET: cần đặt chuỗi bí mật để ký token đăng nhập.');
    }
    // Dev/test: secret ngẫu nhiên, mọi phiên đăng nhập mất khi restart server.
    env.authSecret = randomBytes(32).toString('hex');
}

// Đường dẫn tuyệt đối tới mô hình CV (CV_MODEL_PATH tương đối thì tính từ thư mục chạy server).
export const cvModelPath = () => path.resolve(env.cvModelPath || DEFAULT_MODEL_PATH);
export const cvModelAvailable = () => fs.existsSync(cvModelPath());

export function publicConfig() {
    const weightOk = env.vehicle !== 'truck' || (/^\d+$/.test(env.capacity) && parseInt(env.capacity, 10) > 0);
    return {
        provider: 'vietmap',
        tilemapKey: env.tilemapKey,
        routingConfigured: Boolean(env.servicesKey) && weightOk && ['car', 'truck'].includes(env.vehicle),
        vehicle: env.vehicle,
        cvEnabled: cvModelAvailable(),
        geminiConfigured: Boolean(env.geminiKey),
        geminiModel: env.geminiModel
    };
}
