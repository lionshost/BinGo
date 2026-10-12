import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.port, () => {
    console.log(`BinGo API đang chạy tại http://localhost:${env.port}`);
    console.log(`Nguồn dữ liệu: ${env.databaseUrl ? 'PostgreSQL' : 'file JSON (chưa đặt DATABASE_URL)'}`);
    if (env.nodeEnv === 'production' && !env.corsOrigins.length) {
        console.warn('⚠ CORS_ORIGINS trống: API đang chấp nhận mọi origin.');
    }
});

function shutdown() {
    server.close(() => closePool().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
