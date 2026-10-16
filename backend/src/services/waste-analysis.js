// ============================================================
// WASTE ANALYSIS — điều phối: computer vision (YOLO ONNX) là chính,
// Gemini Vision chỉ là dự phòng khi CV lỗi hoặc không đủ tin cậy.
// ============================================================

import { analyzeWasteImage, VisionError } from './waste-vision.js';
import { analyzeWasteImageCv } from './waste-cv.js';

export async function analyzeWaste(image, settings, deps = {}) {
    const cv = deps.cv || analyzeWasteImageCv;
    const gemini = deps.gemini || analyzeWasteImage;
    const hasGemini = Boolean((settings?.geminiKey || '').trim());

    let cvResult = null;
    let cvError = null;
    try {
        cvResult = await cv(image, settings);
    } catch (err) {
        if (!(err instanceof VisionError)) throw err;
        // Ảnh hỏng thì Gemini cũng không đọc được; các lỗi còn lại cho phép dự phòng.
        if (err.status === 422 || err.status === 400) throw err;
        cvError = err;
    }

    if (cvResult && (!cvResult.needs_manual_review || !hasGemini)) return cvResult;

    if (!hasGemini) throw cvError;

    try {
        const fallback = await gemini(image, settings);
        return { ...fallback, engine: 'gemini', fallback_reason: cvError ? 'cv_unavailable' : 'cv_low_confidence' };
    } catch (err) {
        if (cvResult) return cvResult;
        throw err;
    }
}
