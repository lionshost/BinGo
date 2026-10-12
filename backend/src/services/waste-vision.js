// ============================================================
// WASTE VISION SERVICE — phân tích ảnh điểm thu gom bằng Gemini Vision
// Khóa GEMINI chỉ dùng trên máy chủ, gửi qua header (không đặt trong URL).
// ============================================================

import {
    FILL_LEVELS,
    UNKNOWN_FILL_LEVEL,
    WASTE_GROUPS,
    IMAGE_ISSUES,
    MIN_FILL_CONFIDENCE,
    MIN_ITEM_CONFIDENCE
} from '../config/waste-taxonomy.js';

export const DEFAULT_MODEL = 'gemini-2.0-flash';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const REQUEST_TIMEOUT_MS = 30000;

export class VisionError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = 'VisionError';
        this.status = status;
    }
}

const FILL_KEYS = [...Object.keys(FILL_LEVELS), UNKNOWN_FILL_LEVEL];
const GROUP_KEYS = Object.keys(WASTE_GROUPS);
const ISSUE_KEYS = Object.keys(IMAGE_ISSUES);

export const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        image_usable: { type: 'BOOLEAN' },
        image_issues: { type: 'ARRAY', items: { type: 'STRING', enum: ISSUE_KEYS } },
        bin_visible: { type: 'BOOLEAN' },
        fill_level: { type: 'STRING', enum: FILL_KEYS },
        fill_percent_estimate: { type: 'INTEGER' },
        overflow_detected: { type: 'BOOLEAN' },
        fill_confidence: { type: 'NUMBER' },
        waste_items: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    name: { type: 'STRING' },
                    group: { type: 'STRING', enum: GROUP_KEYS },
                    confidence: { type: 'NUMBER' }
                },
                required: ['name', 'group', 'confidence']
            }
        },
        scene_summary: { type: 'STRING' }
    },
    required: [
        'image_usable', 'image_issues', 'bin_visible', 'fill_level',
        'overflow_detected', 'fill_confidence', 'waste_items', 'scene_summary'
    ]
};

export const PROMPT = `Bạn là chuyên viên giám sát vệ sinh môi trường đô thị tại Việt Nam.
Phân tích ảnh chụp một thùng rác hoặc điểm tập kết rác và trả về JSON đúng schema.

1. Chất lượng ảnh:
   - image_usable = false nếu ảnh mờ, quá tối, bị che, chụp quá xa hoặc không thấy rõ miệng thùng để đánh giá.
   - Liệt kê vấn đề vào image_issues: ${ISSUE_KEYS.join(', ')}.
   - bin_visible = false nếu không thấy thùng rác/điểm chứa rác nào.
2. Mức đầy (fill_level):
   - con_suc_chua: rác dưới khoảng 60% dung tích.
   - gan_day: khoảng 60–90%.
   - day: trên 90% hoặc ngang miệng thùng, nắp không đóng được.
   - tran: rác tràn ra ngoài, rơi vãi quanh thùng, túi rác để dưới đất cạnh thùng.
   - khong_xac_dinh: không đủ thông tin để đánh giá.
   overflow_detected = true khi thấy rác nằm ngoài thùng.
   fill_confidence: độ tin cậy 0–1 cho đánh giá mức đầy. Hãy thận trọng, đừng đoán.
3. waste_items: liệt kê sơ bộ các loại chất thải nhìn thấy (tên tiếng Việt ngắn gọn), mỗi loại gán 1 nhóm:
   - huu_co: thức ăn thừa, rau củ quả, lá cây.
   - tai_che: giấy, bìa carton, chai nhựa, lon kim loại, thủy tinh.
   - nguy_hai: pin, ắc quy, bóng đèn, hóa chất, bình xịt, thuốc, kim tiêm, đồ điện tử.
   - kho_phan_huy: túi nilon bẩn, hộp xốp, tã bỉm, sành sứ, cao su, vải vụn.
   Kèm confidence 0–1. Chỉ liệt kê thứ thực sự thấy trong ảnh.
4. scene_summary: 1 câu tiếng Việt mô tả hiện trạng.`;

function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
}

function percent(value) {
    return `${Math.round(value * 100)}%`;
}

/**
 * Chuẩn hóa và kiểm tra kết quả thô từ mô hình. Quyết định cần kiểm tra thủ công
 * được tính ở đây (không tin tưởng hoàn toàn cờ của mô hình).
 */
export function normalizeAnalysis(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const reviewReasons = [];
    const alerts = [];

    const issues = Array.isArray(src.image_issues)
        ? [...new Set(src.image_issues.filter(k => ISSUE_KEYS.includes(k)))]
        : [];
    const imageUsable = src.image_usable === true;
    const binVisible = src.bin_visible === true;
    const confidence = clamp01(src.fill_confidence);
    const overflow = src.overflow_detected === true;

    let fillLevel = FILL_KEYS.includes(src.fill_level) ? src.fill_level : UNKNOWN_FILL_LEVEL;
    if (overflow && fillLevel !== UNKNOWN_FILL_LEVEL) fillLevel = 'tran';

    if (!imageUsable) {
        reviewReasons.push('Ảnh không đủ rõ để đánh giá tự động.');
    }
    issues
        .filter(k => k !== 'khong_thay_thung_rac')
        .forEach(k => reviewReasons.push(IMAGE_ISSUES[k]));
    if (!binVisible || issues.includes('khong_thay_thung_rac')) {
        reviewReasons.push('Không nhận diện được thùng/điểm chứa rác trong ảnh.');
    }
    if (fillLevel === UNKNOWN_FILL_LEVEL) {
        reviewReasons.push('Không xác định được mức đầy.');
    } else if (confidence < MIN_FILL_CONFIDENCE) {
        reviewReasons.push(`Độ tin cậy thấp (${percent(confidence)} < ${percent(MIN_FILL_CONFIDENCE)}).`);
    }

    const seen = new Set();
    const wasteItems = (Array.isArray(src.waste_items) ? src.waste_items : [])
        .filter(item => item && GROUP_KEYS.includes(item.group) && typeof item.name === 'string')
        .map(item => ({
            name: item.name.trim().slice(0, 60),
            group: item.group,
            confidence: clamp01(item.confidence)
        }))
        .filter(item => item.name && item.confidence >= MIN_ITEM_CONFIDENCE)
        .filter(item => {
            const k = `${item.group}:${item.name.toLowerCase()}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 12);

    const detectedGroups = [...new Set(wasteItems.map(i => i.group))];
    if (detectedGroups.includes('nguy_hai')) {
        alerts.push('Phát hiện nghi chất thải nguy hại — cần thu gom riêng, không ép chung xe rác sinh hoạt.');
    }
    if (fillLevel === 'tran') {
        alerts.push('Rác tràn ra ngoài — cần thu gom khẩn cấp và vệ sinh khu vực.');
    }

    const needsManualReview = reviewReasons.length > 0;
    const level = FILL_LEVELS[fillLevel];
    const pct = Number(src.fill_percent_estimate);

    return {
        image_usable: imageUsable,
        image_issues: issues,
        bin_visible: binVisible,
        fill_level: fillLevel,
        fill_label: level ? level.label : 'Không xác định',
        fill_action: level ? level.action : 'Cần người vận hành kiểm tra trực tiếp.',
        fill_percent_estimate: Number.isFinite(pct) ? Math.round(Math.min(100, Math.max(0, pct))) : null,
        fill_confidence: confidence,
        overflow_detected: overflow,
        suggested_status: !needsManualReview && level ? level.binStatus : null,
        needs_manual_review: needsManualReview,
        review_reasons: [...new Set(reviewReasons)],
        alerts,
        waste_items: wasteItems,
        detected_groups: detectedGroups,
        guidance: GROUP_KEYS.map(key => ({ ...WASTE_GROUPS[key], detected: detectedGroups.includes(key) })),
        scene_summary: typeof src.scene_summary === 'string' ? src.scene_summary.slice(0, 300) : ''
    };
}

/** Tách data URL base64 và kiểm tra định dạng/kích thước. */
export function parseImageDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') {
        throw new VisionError('Thiếu ảnh cần phân tích.', 400);
    }
    const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!match) {
        throw new VisionError('Ảnh phải ở dạng data URL base64.', 400);
    }
    const mimeType = match[1];
    if (!ALLOWED_MIME.includes(mimeType)) {
        throw new VisionError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.', 415);
    }
    const data = match[2].replace(/\s/g, '');
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) {
        throw new VisionError('Ảnh quá lớn (tối đa 5 MB).', 413);
    }
    return { mimeType, data };
}

/** Gọi Gemini Vision và trả kết quả đã chuẩn hóa. */
export async function analyzeWasteImage(image, settings, fetchImpl = fetch) {
    const key = (settings?.geminiKey || '').trim();
    if (!key) {
        throw new VisionError('Chưa cấu hình GEMINI_API_KEY trên máy chủ.', 503);
    }
    const model = (settings?.geminiModel || DEFAULT_MODEL).trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const body = {
        contents: [{
            role: 'user',
            parts: [
                { inline_data: { mime_type: image.mimeType, data: image.data } },
                { text: PROMPT }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA
        }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (err) {
        throw new VisionError(
            err?.name === 'AbortError' ? 'Phân tích ảnh quá lâu, hãy thử lại.' : 'Không kết nối được dịch vụ Gemini.',
            503
        );
    } finally {
        clearTimeout(timer);
    }

    let payload = null;
    try {
        payload = await res.json();
    } catch {
        payload = null;
    }

    if (!res.ok) {
        if (res.status === 429) throw new VisionError('Đã vượt hạn mức Gemini, hãy thử lại sau.', 429);
        if (res.status === 400 || res.status === 403) {
            throw new VisionError('Gemini từ chối yêu cầu (kiểm tra khóa API/mô hình).', 502);
        }
        throw new VisionError('Dịch vụ Gemini đang lỗi, hãy thử lại.', 503);
    }

    if (payload?.promptFeedback?.blockReason) {
        throw new VisionError('Ảnh bị bộ lọc an toàn từ chối phân tích.', 422);
    }

    const text = payload?.candidates?.[0]?.content?.parts?.find(p => typeof p.text === 'string')?.text;
    let raw;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new VisionError('Gemini trả về dữ liệu không hợp lệ.', 502);
    }

    return { ...normalizeAnalysis(raw), model };
}
