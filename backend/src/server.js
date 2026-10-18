import { createApp } from './app.js';
import { env, cvModelAvailable, cvModelPath } from './config/env.js';
import { closePool } from './db/pool.js';
import { flushUsage, pruneLogins } from './repositories/analytics.js';

const app = createApp();

const server = app.listen(env.port, () => {
    console.log(`BinGo API đang chạy tại http://localhost:${env.port}`);
    console.log(`Nguồn dữ liệu: ${env.databaseUrl ? 'PostgreSQL' : 'file JSON (chưa đặt DATABASE_URL)'}`);
    if (!cvModelAvailable()) {
        console.warn(`⚠ Không thấy mô hình CV tại ${cvModelPath()}: phân tích ảnh sẽ chỉ dùng Gemini (nếu có GEMINI_API_KEY).`);
    }
    if (env.nodeEnv === 'production' && !env.corsOrigins.length) {
        console.warn('⚠ CORS_ORIGINS trống: API đang chấp nhận mọi origin.');
    }
});

// Chống slowloris / kết nối treo chiếm hết socket.
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;

// Bộ đếm lượt dùng ghi xuống DB theo lô; lịch sử đăng nhập giữ 90 ngày.
const flushTimer = setInterval(flushUsage, 30_000);
const pruneTimer = setInterval(pruneLogins, 24 * 3600_000);
flushTimer.unref();
pruneTimer.unref();
pruneLogins();

// Một promise lỗi lọt lưới không được làm sập cả tiến trình.
process.on('unhandledRejection', reason => console.error('unhandledRejection:', reason));

function shutdown() {
    server.close(() => flushUsage().finally(() => closePool().finally(() => process.exit(0))));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
