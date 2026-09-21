import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  // If Flask is running locally on 5000, forward to it
  try {
    const flaskRes = await fetch('http://127.0.0.1:5000/api/road-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await flaskRes.json();
    return res.status(flaskRes.status).json(data);
  } catch (err) {
    // If Flask is not running, return informative guidance
    return res.status(503).json({
      error: 'Dịch vụ định tuyến chưa khả dụng hoặc Flask server chưa khởi động.',
      detail: err.message,
    });
  }
});

app.use(express.static(path.join(rootDir, 'dist')));

app.listen(PORT, () => {
  console.log(`🚀 BinGo Node.js API server running on http://127.0.0.1:${PORT}`);
});
