import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeAnalysis,
    parseImageDataUrl,
    analyzeWasteImage,
    VisionError
} from '../src/services/waste-vision.js';

const goodRaw = {
    image_usable: true,
    image_issues: [],
    bin_visible: true,
    fill_level: 'day',
    fill_percent_estimate: 95,
    overflow_detected: false,
    fill_confidence: 0.86,
    waste_items: [
        { name: 'Chai nhựa', group: 'tai_che', confidence: 0.9 },
        { name: 'Vỏ chuối', group: 'huu_co', confidence: 0.7 },
        { name: 'Vật mờ', group: 'kho_phan_huy', confidence: 0.1 }
    ],
    scene_summary: 'Thùng rác xanh gần đầy miệng.'
};

test('normalizeAnalysis maps a clear, confident image to a bin status without manual review', () => {
    const r = normalizeAnalysis(goodRaw);
    assert.equal(r.fill_level, 'day');
    assert.equal(r.fill_label, 'Đầy');
    assert.equal(r.suggested_status, 'full');
    assert.equal(r.needs_manual_review, false);
    assert.deepEqual(r.review_reasons, []);
    // low-confidence item dropped
    assert.equal(r.waste_items.length, 2);
    assert.deepEqual(r.detected_groups.sort(), ['huu_co', 'tai_che']);
    assert.equal(r.guidance.length, 4);
    assert.equal(r.guidance.find(g => g.key === 'tai_che').detected, true);
    assert.equal(r.guidance.find(g => g.key === 'nguy_hai').detected, false);
});

test('normalizeAnalysis flags blurry images for manual review and never suggests a status', () => {
    const r = normalizeAnalysis({ ...goodRaw, image_usable: false, image_issues: ['mo_nhoe', 'thieu_sang'] });
    assert.equal(r.needs_manual_review, true);
    assert.equal(r.suggested_status, null);
    assert.ok(r.review_reasons.some(x => x.includes('mờ')));
    assert.ok(r.review_reasons.some(x => x.includes('sáng')));
});

test('normalizeAnalysis flags low confidence, unknown level and missing bin', () => {
    assert.equal(normalizeAnalysis({ ...goodRaw, fill_confidence: 0.4 }).needs_manual_review, true);
    assert.equal(normalizeAnalysis({ ...goodRaw, fill_level: 'khong_xac_dinh' }).needs_manual_review, true);
    const noBin = normalizeAnalysis({ ...goodRaw, bin_visible: false });
    assert.equal(noBin.needs_manual_review, true);
    assert.ok(noBin.review_reasons.some(x => x.includes('thùng')));
});

test('normalizeAnalysis upgrades to overflow when spillage is detected', () => {
    const r = normalizeAnalysis({ ...goodRaw, fill_level: 'gan_day', overflow_detected: true });
    assert.equal(r.fill_level, 'tran');
    assert.equal(r.suggested_status, 'overloaded');
});

test('normalizeAnalysis raises a hazard alert and sanitizes garbage input', () => {
    const r = normalizeAnalysis({
        ...goodRaw,
        fill_confidence: 7,
        fill_percent_estimate: 400,
        waste_items: [{ name: 'Pin', group: 'nguy_hai', confidence: 0.8 }, { name: 'x', group: 'bogus', confidence: 1 }, null]
    });
    assert.equal(r.fill_confidence, 1);
    assert.equal(r.fill_percent_estimate, 100);
    assert.equal(r.waste_items.length, 1);
    assert.ok(r.alerts.some(a => a.includes('nguy hại')));
    assert.equal(normalizeAnalysis(null).needs_manual_review, true);
});

test('parseImageDataUrl accepts jpeg/png/webp and rejects others', () => {
    const ok = parseImageDataUrl('data:image/jpeg;base64,' + Buffer.from('abc').toString('base64'));
    assert.equal(ok.mimeType, 'image/jpeg');
    assert.throws(() => parseImageDataUrl('data:image/gif;base64,AAAA'), VisionError);
    assert.throws(() => parseImageDataUrl('hello'), VisionError);
    assert.throws(() => parseImageDataUrl(42), VisionError);
});

test('analyzeWasteImage refuses to run without an API key', async () => {
    await assert.rejects(
        analyzeWasteImage({ mimeType: 'image/jpeg', data: 'AAAA' }, { geminiKey: '' }),
        err => err instanceof VisionError && err.status === 503
    );
});

test('analyzeWasteImage calls Gemini with the key in a header and normalizes the reply', async () => {
    let captured;
    const fakeFetch = async (url, init) => {
        captured = { url, init };
        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: JSON.stringify(goodRaw) }] } }]
            })
        };
    };
    const r = await analyzeWasteImage(
        { mimeType: 'image/jpeg', data: 'AAAA' },
        { geminiKey: 'secret-key', geminiModel: 'gemini-2.0-flash' },
        fakeFetch
    );
    assert.ok(captured.url.includes('gemini-2.0-flash:generateContent'));
    assert.ok(!captured.url.includes('secret-key'));
    assert.equal(captured.init.headers['x-goog-api-key'], 'secret-key');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.equal(r.suggested_status, 'full');
    assert.equal(r.model, 'gemini-2.0-flash');
});

test('analyzeWasteImage maps provider quota and malformed replies to VisionError', async () => {
    const quota = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) });
    await assert.rejects(
        analyzeWasteImage({ mimeType: 'image/png', data: 'AAAA' }, { geminiKey: 'k' }, quota),
        err => err instanceof VisionError && err.status === 429
    );
    const junk = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) });
    await assert.rejects(
        analyzeWasteImage({ mimeType: 'image/png', data: 'AAAA' }, { geminiKey: 'k' }, junk),
        err => err instanceof VisionError && err.status === 502
    );
});
