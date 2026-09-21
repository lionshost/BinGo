import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { roadRoute, RoutingError, MAX_STOPS } from './services/routing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '32kb' }));

function getSettings() {
  const localConfigPath = path.join(rootDir, 'config.local.json');
  const defaultConfigPath = path.join(rootDir, 'config.json');
  let fileConfig = {};
  if (fs.existsSync(localConfigPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    } catch (e) {
      console.error('Error reading config.local.json', e);
    }
  } else if (fs.existsSync(defaultConfigPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
    } catch (e) {
      console.error('Error reading config.json', e);
    }
  }

  const tilemapKey = (process.env.VIETMAP_TILEMAP_KEY || fileConfig.VIETMAP_TILEMAP_KEY || '').trim();
  const servicesKey = (process.env.VIETMAP_SERVICES_KEY || fileConfig.VIETMAP_SERVICES_KEY || '').trim();
  const vehicle = (process.env.VIETMAP_VEHICLE || fileConfig.VIETMAP_VEHICLE || 'car').trim();
  const capacity = (process.env.VIETMAP_TRUCK_WEIGHT_KG || fileConfig.VIETMAP_TRUCK_WEIGHT_KG || '').toString().trim();

  return { tilemapKey, servicesKey, vehicle, capacity };
}

function publicConfig() {
  const settings = getSettings();
  const weightOk = settings.vehicle !== 'truck' || (/^\d+$/.test(settings.capacity) && parseInt(settings.capacity, 10) > 0);
  return {
    provider: 'vietmap',
    tilemapKey: settings.tilemapKey,
    routingConfigured: Boolean(settings.servicesKey) && weightOk && ['car', 'truck'].includes(settings.vehicle),
    vehicle: settings.vehicle,
  };
}

function loadBins() {
  const binsFile = path.join(rootDir, 'data', 'trash_bins.json');
  const thanhXuanFile = path.join(rootDir, 'data', 'thanh_xuan_bins.json');

  let bins = [];
  if (fs.existsSync(binsFile)) {
    bins = JSON.parse(fs.readFileSync(binsFile, 'utf8'));
  }
  if (fs.existsSync(thanhXuanFile)) {
    const extra = JSON.parse(fs.readFileSync(thanhXuanFile, 'utf8'));
    bins = bins.concat(extra);
  }
  return bins;
}

app.get('/api/map-config', (req, res) => {
  res.json(publicConfig());
});

app.get('/api/trash-bins', (req, res) => {
  res.json(loadBins());
});

app.post('/api/road-route', async (req, res) => {
  const ids = req.body?.bin_ids;
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > MAX_STOPS ||
    ids.some(v => typeof v !== 'string') ||
    new Set(ids).size !== ids.length
  ) {
    return res.status(400).json({ error: `Cần từ 1 đến ${MAX_STOPS} mã điểm thu gom khác nhau.` });
  }

  const allBins = loadBins();
  const lookup = new Map(allBins.map(item => [item.id, item]));
  const selected = [];

  for (const binId of ids) {
    const item = lookup.get(binId);
    if (!item || item.status === 'broken') {
      return res.status(400).json({ error: 'Điểm thu gom không tồn tại hoặc đang hỏng.' });
    }
    const lat = Number(item.latitude);
    const lon = Number(item.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Tọa độ điểm thu gom không hợp lệ.' });
    }
    selected.push({ ...item, latitude: lat, longitude: lon });
  }

  const settings = getSettings();

  // If servicesKey is set on Node server, process directly without needing Flask!
  if (settings.servicesKey) {
    try {
      const result = await roadRoute(selected, settings);
      return res.json(result);
    } catch (err) {
      const status = err instanceof RoutingError ? 503 : 500;
      return res.status(status).json({ error: err.message });
    }
  }

  // Fallback: If servicesKey is not in Node config, try forwarding to local Flask on 5000
  try {
    const flaskRes = await fetch('http://127.0.0.1:5000/api/road-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await flaskRes.json();
    return res.status(flaskRes.status).json(data);
  } catch (err) {
    return res.status(503).json({
      error: 'Chưa cấu hình VIETMAP Services key trên máy chủ và Flask server chưa khởi động.',
      detail: err.message,
    });
  }
});

app.use(express.static(path.join(rootDir, 'dist')));

app.listen(PORT, () => {
  console.log(`🚀 BinGo Node.js API server running on http://127.0.0.1:${PORT}`);
});
