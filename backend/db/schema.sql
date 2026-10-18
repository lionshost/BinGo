-- ============================================================
-- BinGo · PostgreSQL schema
-- Chạy bằng: npm run db:setup  (tạo bảng + nạp dữ liệu mẫu từ data/*.json)
-- ============================================================

CREATE TABLE IF NOT EXISTS trash_bins (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    latitude    DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude   DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    district    TEXT NOT NULL,
    type        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'full', 'broken')),
    recyclable  BOOLEAN NOT NULL DEFAULT FALSE,
    address     TEXT NOT NULL DEFAULT '',
    updated_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trash_bins_district_idx ON trash_bins (district);
CREATE INDEX IF NOT EXISTS trash_bins_status_idx ON trash_bins (status);

-- ------------------------------------------------------------
-- Tài khoản người dùng (đăng ký email + đăng nhập Google)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT,
    google_id      TEXT UNIQUE,
    name           TEXT NOT NULL DEFAULT '',
    role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

-- Nâng cấp DB đã có bảng users từ trước
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- ------------------------------------------------------------
-- Thống kê cho trang quản trị: lịch sử đăng nhập + lượt dùng theo ngày
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT,
    email       TEXT NOT NULL,
    method      TEXT NOT NULL CHECK (method IN ('email', 'google', 'register')),
    success     BOOLEAN NOT NULL,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS login_events_created_idx ON login_events (created_at DESC);

-- metric: vietmap.route, vietmap.directions, vietmap.error, vision.cv, page.map, auth.email.ok, api.requests…
CREATE TABLE IF NOT EXISTS usage_daily (
    day     DATE NOT NULL,
    metric  TEXT NOT NULL,
    count   BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, metric)
);
