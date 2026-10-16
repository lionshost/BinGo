// ============================================================
// WASTE CV SERVICE — nhận diện rác bằng computer vision (YOLOv8 ONNX chạy tại máy chủ)
// Pipeline: giải mã ảnh (sharp) → letterbox 640×640 → YOLO (onnxruntime-node) → NMS
//           → kiểm tra chất lượng ảnh (độ nét/độ sáng) → suy ra mức đầy bằng hình học.
// Mô hình chỉ phát hiện RÁC (giấy/nhựa/kim loại/hữu cơ/khác), không có lớp "thùng rác",
// nên mức đầy là ước lượng theo độ phủ và vị trí rác trong khung hình; độ tin cậy bị chặn
// trần để ảnh khó rơi về kiểm tra thủ công hoặc dịch vụ dự phòng.
// ============================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAnalysis, VisionError } from './waste-vision.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MODEL_PATH = path.resolve(__dirname, '../../models/trashscan8s.onnx');
export const CV_MODEL_NAME = 'yolov8s-trashscan';

export const INPUT_SIZE = 640;
export const SCORE_THRESHOLD = 0.25;
export const IOU_THRESHOLD = 0.5;
const MAX_CV_CONFIDENCE = 0.78;
const GRID = 64;

/** Chỉ số lớp của mô hình → tên hiển thị + nhóm chất thải trong taxonomy. */
export const CLASS_MAP = [
    { name: 'Giấy', group: 'tai_che' },
    { name: 'Nhựa', group: 'tai_che' },
    { name: 'Kim loại', group: 'tai_che' },
    { name: 'Rác hữu cơ', group: 'huu_co' },
    { name: 'Rác khác', group: 'kho_phan_huy' }
];

const BLUR_VARIANCE_MIN = 25;
const DARK_MEAN_MIN = 45;

// ---------- Hậu xử lý YOLO (hàm thuần, có test) ----------

function iou(a, b) {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return union > 0 ? inter / union : 0;
}

/** NMS theo từng lớp. */
export function nms(boxes, iouThreshold = IOU_THRESHOLD) {
    const kept = [];
    [...boxes].sort((a, b) => b.score - a.score).forEach(box => {
        if (kept.every(k => k.classId !== box.classId || iou(k, box) < iouThreshold)) kept.push(box);
    });
    return kept;
}

/**
 * Giải mã đầu ra YOLOv8 dạng [1, 4+nc, anchors] (cx, cy, w, h trong không gian 640×640 đã letterbox)
 * thành hộp chuẩn hóa 0–1 theo ảnh gốc.
 * @param {Float32Array} data
 * @param {number} channels  4 + số lớp
 * @param {number} anchors
 * @param {{scale:number,padX:number,padY:number,width:number,height:number}} meta
 */
export function decodeDetections(data, channels, anchors, meta, scoreThreshold = SCORE_THRESHOLD) {
    const nc = channels - 4;
    const out = [];
    for (let i = 0; i < anchors; i++) {
        let best = -1;
        let bestScore = scoreThreshold;
        for (let c = 0; c < nc; c++) {
            const s = data[(4 + c) * anchors + i];
            if (s > bestScore) { bestScore = s; best = c; }
        }
        if (best < 0) continue;
        const cx = data[i];
        const cy = data[anchors + i];
        const w = data[2 * anchors + i];
        const h = data[3 * anchors + i];
        const toX = v => Math.min(1, Math.max(0, (v - meta.padX) / meta.scale / meta.width));
        const toY = v => Math.min(1, Math.max(0, (v - meta.padY) / meta.scale / meta.height));
        const x1 = toX(cx - w / 2);
        const x2 = toX(cx + w / 2);
        const y1 = toY(cy - h / 2);
        const y2 = toY(cy + h / 2);
        if (x2 - x1 <= 0 || y2 - y1 <= 0) continue;
        out.push({ classId: best, score: bestScore, x1, y1, x2, y2 });
    }
    return nms(out);
}

// ---------- Suy luận hình học → schema chung với Gemini ----------

/** Tỉ lệ diện tích khung hình bị rác phủ (hợp các hộp, lưới 64×64) và phần nằm ở đáy khung. */
export function coverageStats(boxes) {
    const mask = new Uint8Array(GRID * GRID);
    boxes.forEach(b => {
        const gx1 = Math.floor(b.x1 * GRID);
        const gx2 = Math.ceil(b.x2 * GRID);
        const gy1 = Math.floor(b.y1 * GRID);
        const gy2 = Math.ceil(b.y2 * GRID);
        for (let y = gy1; y < Math.min(GRID, gy2); y++) {
            for (let x = gx1; x < Math.min(GRID, gx2); x++) mask[y * GRID + x] = 1;
        }
    });
    const bottomStart = Math.floor(GRID * 0.7);
    let total = 0;
    let bottom = 0;
    mask.forEach((v, idx) => {
        if (!v) return;
        total++;
        if (Math.floor(idx / GRID) >= bottomStart) bottom++;
    });
    return { coverage: total / (GRID * GRID), bottomShare: total ? bottom / total : 0 };
}

/**
 * Chuyển phát hiện + chất lượng ảnh thành đối tượng thô cho normalizeAnalysis().
 * @param {Array} boxes  kết quả decodeDetections
 * @param {{blurry:boolean,dark:boolean}} quality
 */
export function buildRawAnalysis(boxes, quality = { blurry: false, dark: false }) {
    const issues = [];
    if (quality.blurry) issues.push('mo_nhoe');
    if (quality.dark) issues.push('thieu_sang');

    const itemsByClass = new Map();
    boxes.forEach(b => {
        const cls = CLASS_MAP[b.classId];
        if (!cls) return;
        const prev = itemsByClass.get(b.classId);
        if (!prev || b.score > prev.confidence) {
            itemsByClass.set(b.classId, { name: cls.name, group: cls.group, confidence: b.score });
        }
    });
    const wasteItems = [...itemsByClass.values()];

    const { coverage, bottomShare } = coverageStats(boxes);
    const meanScore = boxes.length ? boxes.reduce((s, b) => s + b.score, 0) / boxes.length : 0;
    const overflow = boxes.length >= 3 && bottomShare >= 0.25 && coverage >= 0.2;

    let fillLevel = 'khong_xac_dinh';
    let fillPercent = null;
    let confidence = 0;
    if (boxes.length > 0) {
        fillLevel = coverage < 0.12 ? 'con_suc_chua' : coverage < 0.3 ? 'gan_day' : 'day';
        fillPercent = Math.round(Math.min(100, coverage * 250));
        confidence = Math.min(MAX_CV_CONFIDENCE, 0.3 + 0.4 * meanScore + 0.03 * Math.min(boxes.length, 8));
    }

    const summary = boxes.length
        ? `Phát hiện ${boxes.length} vùng rác, phủ khoảng ${Math.round(coverage * 100)}% khung hình${overflow ? ', có rác ở sát đáy/ngoài thùng' : ''}.`
        : 'Không phát hiện được rác trong ảnh.';

    return {
        image_usable: !quality.blurry && !quality.dark,
        image_issues: issues,
        bin_visible: boxes.length > 0,
        fill_level: fillLevel,
        fill_percent_estimate: fillPercent,
        overflow_detected: overflow,
        fill_confidence: confidence,
        waste_items: wasteItems,
        scene_summary: summary
    };
}

// ---------- Tiền xử lý ảnh và chạy mô hình ----------

let sessionPromise = null;
let loadedPath = null;

async function getSession(modelPath) {
    if (sessionPromise && loadedPath === modelPath) return sessionPromise;
    loadedPath = modelPath;
    sessionPromise = (async () => {
        const ort = await import('onnxruntime-node');
        return { ort, session: await ort.InferenceSession.create(modelPath) };
    })().catch(err => {
        sessionPromise = null;
        throw err;
    });
    return sessionPromise;
}

/** Đo độ nét (phương sai Laplacian) và độ sáng trung bình trên bản thu nhỏ xám. */
export function measureQuality(gray, width, height) {
    let sum = 0;
    for (let i = 0; i < gray.length; i++) sum += gray[i];
    const mean = sum / gray.length;

    let lapSum = 0;
    let lapSq = 0;
    let n = 0;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
            lapSum += lap;
            lapSq += lap * lap;
            n++;
        }
    }
    const variance = n ? lapSq / n - (lapSum / n) ** 2 : 0;
    return { mean, variance, blurry: variance < BLUR_VARIANCE_MIN, dark: mean < DARK_MEAN_MIN };
}

async function prepare(buffer) {
    const { default: sharp } = await import('sharp');
    const base = sharp(buffer, { failOn: 'error' }).rotate();
    const { data: rgbFull, info } = await base.clone().removeAlpha().resize({
        width: INPUT_SIZE, height: INPUT_SIZE, fit: 'contain', background: { r: 114, g: 114, b: 114 }
    }).raw().toBuffer({ resolveWithObject: true });

    const rotated = await base.clone().toBuffer({ resolveWithObject: true });
    const width = rotated.info.width;
    const height = rotated.info.height;
    const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height);
    const padX = (INPUT_SIZE - width * scale) / 2;
    const padY = (INPUT_SIZE - height * scale) / 2;

    const plane = INPUT_SIZE * INPUT_SIZE;
    const tensor = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
        tensor[i] = rgbFull[i * info.channels] / 255;
        tensor[plane + i] = rgbFull[i * info.channels + 1] / 255;
        tensor[2 * plane + i] = rgbFull[i * info.channels + 2] / 255;
    }

    const small = await sharp(rotated.data).greyscale().resize({ width: 256, height: 256, fit: 'inside' })
        .raw().toBuffer({ resolveWithObject: true });
    const quality = measureQuality(small.data, small.info.width, small.info.height);

    return { tensor, meta: { scale, padX, padY, width, height }, quality };
}

/** Phân tích ảnh bằng YOLO ONNX tại máy chủ và trả kết quả đã chuẩn hóa. */
export async function analyzeWasteImageCv(image, settings = {}) {
    const modelPath = settings.cvModelPath || DEFAULT_MODEL_PATH;
    const buffer = Buffer.from(image.data, 'base64');

    let prepared;
    try {
        prepared = await prepare(buffer);
    } catch {
        throw new VisionError('Không đọc được ảnh (tệp hỏng hoặc sai định dạng).', 422);
    }

    let runtime;
    try {
        runtime = await getSession(modelPath);
    } catch {
        throw new VisionError('Chưa tải được mô hình computer vision trên máy chủ.', 503);
    }

    let output;
    try {
        const { ort, session } = runtime;
        const input = new ort.Tensor('float32', prepared.tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
        const result = await session.run({ [session.inputNames[0]]: input });
        output = result[session.outputNames[0]];
    } catch {
        throw new VisionError('Mô hình computer vision gặp lỗi khi suy luận.', 503);
    }

    const [, channels, anchors] = output.dims;
    const boxes = decodeDetections(output.data, channels, anchors, prepared.meta);
    const raw = buildRawAnalysis(boxes, prepared.quality);
    return { ...normalizeAnalysis(raw), model: CV_MODEL_NAME, engine: 'cv', detections: boxes.length };
}
