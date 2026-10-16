import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    nms,
    decodeDetections,
    coverageStats,
    buildRawAnalysis,
    measureQuality,
    analyzeWasteImageCv,
    DEFAULT_MODEL_PATH
} from '../src/services/waste-cv.js';
import { analyzeWaste } from '../src/services/waste-analysis.js';
import { normalizeAnalysis, VisionError } from '../src/services/waste-vision.js';

const box = (classId, score, x1, y1, x2, y2) => ({ classId, score, x1, y1, x2, y2 });

test('nms drops overlapping boxes of the same class but keeps other classes', () => {
    const kept = nms([
        box(1, 0.9, 0.1, 0.1, 0.5, 0.5),
        box(1, 0.6, 0.12, 0.12, 0.52, 0.52),
        box(2, 0.7, 0.1, 0.1, 0.5, 0.5)
    ]);
    assert.equal(kept.length, 2);
    assert.deepEqual(kept.map(b => b.classId).sort(), [1, 2]);
});

test('decodeDetections maps letterboxed YOLO output back to original image coordinates', () => {
    // 1 anchor, 5 classes; ảnh 1280×640 → scale 0.5, padY 160.
    const anchors = 1;
    const data = new Float32Array(9 * anchors);
    data[0] = 320; data[1] = 320; data[2] = 160; data[3] = 160; // cx, cy, w, h
    data[4 + 3] = 0.8; // lớp hữu cơ
    const [d] = decodeDetections(data, 9, anchors, { scale: 0.5, padX: 0, padY: 160, width: 1280, height: 640 });
    assert.equal(d.classId, 3);
    assert.ok(Math.abs(d.x1 - 0.375) < 1e-6 && Math.abs(d.x2 - 0.625) < 1e-6);
    assert.ok(Math.abs(d.y1 - 0.25) < 1e-6 && Math.abs(d.y2 - 0.75) < 1e-6);
    assert.equal(decodeDetections(new Float32Array(9), 9, 1, { scale: 1, padX: 0, padY: 0, width: 640, height: 640 }).length, 0);
});

test('coverageStats measures the union area and the share near the bottom of the frame', () => {
    const { coverage, bottomShare } = coverageStats([box(0, 1, 0, 0, 0.5, 0.5), box(0, 1, 0.25, 0.25, 0.75, 0.75)]);
    assert.ok(Math.abs(coverage - 0.4375) < 0.01);
    assert.ok(bottomShare > 0 && bottomShare < 0.3);
    assert.equal(coverageStats([]).coverage, 0);
});

test('buildRawAnalysis: nothing detected is unknown and goes to manual review', () => {
    const r = normalizeAnalysis(buildRawAnalysis([]));
    assert.equal(r.fill_level, 'khong_xac_dinh');
    assert.equal(r.needs_manual_review, true);
});

test('buildRawAnalysis: heavy coverage reads as full, with groups mapped from classes', () => {
    const raw = buildRawAnalysis([
        box(1, 0.9, 0.05, 0.05, 0.95, 0.6),
        box(3, 0.8, 0.1, 0.1, 0.9, 0.5)
    ]);
    const r = normalizeAnalysis(raw);
    assert.equal(r.fill_level, 'day');
    assert.ok(r.fill_confidence <= 0.78);
    assert.deepEqual(r.detected_groups.sort(), ['huu_co', 'tai_che']);
});

test('buildRawAnalysis: waste piled at the bottom with several items means overflow', () => {
    const raw = buildRawAnalysis([
        box(1, 0.9, 0.0, 0.75, 0.4, 1.0),
        box(0, 0.8, 0.4, 0.75, 0.8, 1.0),
        box(4, 0.8, 0.1, 0.4, 0.9, 1.0)
    ]);
    assert.equal(raw.overflow_detected, true);
    assert.equal(normalizeAnalysis(raw).fill_level, 'tran');
});

test('buildRawAnalysis: blur and darkness make the image unusable', () => {
    const r = normalizeAnalysis(buildRawAnalysis([box(1, 0.9, 0, 0, 0.5, 0.5)], { blurry: true, dark: true }));
    assert.equal(r.image_usable, false);
    assert.equal(r.needs_manual_review, true);
    assert.deepEqual(r.image_issues.sort(), ['mo_nhoe', 'thieu_sang']);
});

test('measureQuality tells flat/dark frames apart from textured, bright ones', () => {
    const w = 32;
    const flat = new Uint8Array(w * w).fill(20);
    assert.equal(measureQuality(flat, w, w).blurry, true);
    assert.equal(measureQuality(flat, w, w).dark, true);
    const checker = Uint8Array.from({ length: w * w }, (_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 230 : 40);
    const q = measureQuality(checker, w, w);
    assert.equal(q.blurry, false);
    assert.equal(q.dark, false);
});

test('analyzeWaste keeps a confident CV result and never calls Gemini', async () => {
    const good = { needs_manual_review: false, engine: 'cv' };
    const r = await analyzeWaste({}, { geminiKey: 'k' }, {
        cv: async () => good,
        gemini: async () => { throw new Error('should not be called'); }
    });
    assert.equal(r, good);
});

test('analyzeWaste falls back to Gemini when CV is unsure or unavailable', async () => {
    const gemini = async () => ({ needs_manual_review: false, engine: undefined });
    const unsure = await analyzeWaste({}, { geminiKey: 'k' }, { cv: async () => ({ needs_manual_review: true }), gemini });
    assert.equal(unsure.engine, 'gemini');
    assert.equal(unsure.fallback_reason, 'cv_low_confidence');
    const down = await analyzeWaste({}, { geminiKey: 'k' }, { cv: async () => { throw new VisionError('x', 503); }, gemini });
    assert.equal(down.fallback_reason, 'cv_unavailable');
});

test('analyzeWaste returns the CV result when there is no Gemini key, and surfaces CV errors', async () => {
    const unsure = { needs_manual_review: true };
    assert.equal(await analyzeWaste({}, { geminiKey: '' }, { cv: async () => unsure }), unsure);
    await assert.rejects(
        analyzeWaste({}, { geminiKey: '' }, { cv: async () => { throw new VisionError('x', 503); } }),
        err => err.status === 503
    );
    await assert.rejects(
        analyzeWaste({}, { geminiKey: 'k' }, { cv: async () => { throw new VisionError('bad', 422); }, gemini: async () => ({}) }),
        err => err.status === 422
    );
});

test('analyzeWaste prefers the CV result if Gemini fails too', async () => {
    const unsure = { needs_manual_review: true };
    const r = await analyzeWaste({}, { geminiKey: 'k' }, {
        cv: async () => unsure,
        gemini: async () => { throw new VisionError('quota', 429); }
    });
    assert.equal(r, unsure);
});

test('real ONNX model runs end-to-end on an image and returns the shared schema', { skip: !fs.existsSync(DEFAULT_MODEL_PATH) }, async () => {
    const { default: sharp } = await import('sharp');
    const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 90, g: 120, b: 80 } } }).png().toBuffer();
    const r = await analyzeWasteImageCv({ mimeType: 'image/png', data: png.toString('base64') });
    assert.equal(r.engine, 'cv');
    assert.ok(typeof r.fill_level === 'string' && Array.isArray(r.waste_items));
    assert.equal(r.guidance.length, 4);
    await assert.rejects(
        analyzeWasteImageCv({ mimeType: 'image/png', data: Buffer.from('not an image').toString('base64') }),
        err => err instanceof VisionError && err.status === 422
    );
});
