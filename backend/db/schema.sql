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
