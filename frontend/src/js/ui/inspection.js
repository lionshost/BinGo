// ============================================================
// UI INSPECTION & AI VISION MODULE (COMPUTER VISION)
// ============================================================

import { state, dom } from "../state/store.js";
import { analyzeWasteImageApi } from "../api/client.js";
import { updateBinMarker } from "../map/markers.js";
import { escapeHtml } from "../utils/dom.js";
import { WASTE_GROUPS, FILL_LEVELS } from "../config/waste-taxonomy.js";

let currentImageDataUrl = null;
let currentAnalysisResult = null;
let activeCallbacks = {};

/**
 * Initialize inspection UI events, dropzone, clipboard paste & review queue
 */
export function setupInspectionUI(map, callbacks = {}) {
    activeCallbacks = callbacks;

    // Global hook for opening inspection from Leaflet popups
    window.bingoOpenInspection = binId => {
        openInspectionModal(binId, map);
    };

    // Open Inspection from topbar or floating action
    if (dom.openInspectBtn) {
        dom.openInspectBtn.addEventListener("click", () => openInspectionModal(null, map));
    }

    // Close Dialog
    if (dom.closeInspectBtn && dom.inspectDialog) {
        dom.closeInspectBtn.addEventListener("click", () => dom.inspectDialog.close());
    }

    if (dom.inspectDialog) {
        dom.inspectDialog.addEventListener("click", event => {
            if (event.target === dom.inspectDialog) {
                const rect = dom.inspectDialog.getBoundingClientRect();
                if (
                    event.clientX < rect.left ||
                    event.clientX > rect.right ||
                    event.clientY < rect.top ||
                    event.clientY > rect.bottom
                ) {
                    dom.inspectDialog.close();
                }
            }
        });
    }

    // Dropzone & File Input
    const dropzone = dom.imageDropzone;
    const fileInput = dom.imageFileInput;

    if (dropzone && fileInput) {
        dropzone.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", e => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
        });

        dropzone.addEventListener("dragover", e => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        });

        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("dragover");
        });

        dropzone.addEventListener("drop", e => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
            const file = e.dataTransfer?.files?.[0];
            if (file) handleImageFile(file);
        });
    }

    // Paste from clipboard anywhere while dialog is open
    document.addEventListener("paste", e => {
        if (!dom.inspectDialog || !dom.inspectDialog.open) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    handleImageFile(file);
                    break;
                }
            }
        }
    });

    dom.inspectBinFilter?.addEventListener("input", () => renderBinOptions());

    // Analyze button
    if (dom.analyzeImageBtn) {
        dom.analyzeImageBtn.addEventListener("click", () => runAnalysis(map));
    }

    // Apply button
    if (dom.applyAnalysisBtn) {
        dom.applyAnalysisBtn.addEventListener("click", () => applyAnalysisToMap(map));
    }

    // Send to manual review button
    if (dom.sendToReviewBtn) {
        dom.sendToReviewBtn.addEventListener("click", () => sendCurrentToManualReview());
    }

    renderManualReviewsList(map);
}

/**
 * Open the inspection modal, populate bin selector
 */
export function openInspectionModal(binId = null, map = null) {
    if (!dom.inspectDialog) return;

    state.activeInspectBinId = binId;
    currentImageDataUrl = null;
    currentAnalysisResult = null;

    // Reset UI
    if (dom.imagePreview) {
        dom.imagePreview.src = "";
        dom.imagePreview.hidden = true;
    }
    if (dom.imageDropzone) {
        dom.imageDropzone.classList.remove("has-image");
        const placeholder = dom.imageDropzone.querySelector(".dropzone-placeholder");
        if (placeholder) placeholder.hidden = false;
    }
    if (dom.analyzeImageBtn) {
        dom.analyzeImageBtn.disabled = true;
        dom.analyzeImageBtn.innerHTML = `<span>✨ Bắt đầu nhận diện AI</span>`;
    }
    if (dom.inspectionResultCard) {
        dom.inspectionResultCard.hidden = true;
        dom.inspectionResultCard.innerHTML = "";
    }

    // Populate bin select dropdown
    if (dom.inspectBinFilter) dom.inspectBinFilter.value = "";
    renderBinOptions(binId);

    dom.inspectDialog.showModal();
}

// Bỏ dấu + hạ chữ thường để "hoan kiem" khớp "Hoàn Kiếm".
const fold = text => String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/**
 * Điền danh sách điểm thu gom, lọc theo ô tìm kiếm (hàng trăm điểm nên không thể cuộn tìm tay).
 * Điểm đang được chọn luôn được giữ lại dù không khớp bộ lọc.
 */
function renderBinOptions(selectedId = null) {
    const select = dom.inspectBinSelect;
    if (!select) return;

    const keep = selectedId ?? select.value;
    const terms = fold(dom.inspectBinFilter?.value || "").split(/\s+/).filter(Boolean);
    const matches = state.bins.filter(b => {
        if (b.id === keep) return true;
        const haystack = fold(`${b.name} ${b.district} ${b.id}`);
        return terms.every(term => haystack.includes(term));
    });

    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = matches.length ? "-- Chọn điểm thu gom (hoặc để trống) --" : "-- Không có điểm nào khớp --";
    fragment.append(placeholder);
    for (const b of matches) {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = `${b.id} · ${b.name} (${b.district})`;
        fragment.append(opt);
    }
    select.replaceChildren(fragment);
    select.value = keep && matches.some(b => b.id === keep) ? keep : "";

    if (dom.inspectBinCount) {
        dom.inspectBinCount.textContent = terms.length
            ? `Tìm thấy ${matches.length}/${state.bins.length} điểm`
            : `${state.bins.length} điểm thu gom`;
    }
}

// Ảnh chụp điện thoại thường 3–8 MB; server chỉ nhận ≤ 5 MB và Gemini không cần độ phân giải đó.
// Thu nhỏ về cạnh dài ≤ 1600px, JPEG 85% → thường < 500 KB, tải lên nhanh hơn nhiều.
const MAX_EDGE = 1600;

async function compressImage(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return null;
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // PNG/WebP trong suốt → nền trắng thay vì đen khi sang JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Handle chosen image file (preview and compress if necessary)
 */
function handleImageFile(file) {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        alert("Chỉ hỗ trợ file ảnh JPEG, PNG hoặc WebP.");
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        alert("Ảnh quá lớn (tối đa 8 MB). Hãy chọn ảnh nhỏ hơn.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async e => {
        // Ưu tiên bản đã nén; nếu trình duyệt không giải mã được thì dùng ảnh gốc (đã giới hạn 8 MB).
        const compressed = await compressImage(file).catch(() => null);
        currentImageDataUrl = compressed || e.target.result;
        if (dom.imagePreview) {
            dom.imagePreview.src = currentImageDataUrl;
            dom.imagePreview.hidden = false;
        }
        if (dom.imageDropzone) {
            dom.imageDropzone.classList.add("has-image");
            const placeholder = dom.imageDropzone.querySelector(".dropzone-placeholder");
            if (placeholder) placeholder.hidden = true;
        }
        if (dom.analyzeImageBtn) {
            dom.analyzeImageBtn.disabled = false;
        }
        if (dom.inspectionResultCard) {
            dom.inspectionResultCard.hidden = true;
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Execute Gemini Vision analysis via backend
 */
async function runAnalysis(map) {
    if (!currentImageDataUrl) return;

    const binId = dom.inspectBinSelect?.value || state.activeInspectBinId || null;

    if (dom.analyzeImageBtn) {
        dom.analyzeImageBtn.disabled = true;
        dom.analyzeImageBtn.innerHTML = `<span class="spinner"></span> Đang phân tích bằng Computer Vision...`;
    }

    try {
        const result = await analyzeWasteImageApi(currentImageDataUrl, binId);
        currentAnalysisResult = result;
        renderAnalysisResult(result, binId, map);
    } catch (err) {
        console.error("Analysis error:", err);
        alert("Lỗi khi phân tích ảnh: " + (err.message || err));
    } finally {
        if (dom.analyzeImageBtn) {
            dom.analyzeImageBtn.disabled = false;
            dom.analyzeImageBtn.innerHTML = `<span>✨ Phân tích lại bằng AI</span>`;
        }
    }
}

/**
 * Render structured AI result in inspection modal
 */
function renderAnalysisResult(res, binId, map) {
    if (!dom.inspectionResultCard) return;

    dom.inspectionResultCard.hidden = false;

    // Fill status badge info
    const levelKey = res.fill_level || "khong_xac_dinh";
    const levelInfo = FILL_LEVELS[levelKey] || { label: "Không xác định", action: "Cần kiểm tra trực tiếp" };

    let fillBadgeClass = "badge-available";
    if (levelKey === "gan_day") fillBadgeClass = "badge-near-full";
    if (levelKey === "day") fillBadgeClass = "badge-full";
    if (levelKey === "tran" || res.overflow_detected) fillBadgeClass = "badge-overflow";

    // Overflow alert banner
    const overflowBanner = res.overflow_detected || levelKey === "tran"
        ? `<div class="inspect-alert alert-danger">
            <strong>⚠️ Phát hiện rác tràn ra ngoài!</strong>
            <p>Rác đã rơi vãi xung quanh thùng chứa. Cần gắn cờ ưu tiên thu gom khẩn cấp.</p>
           </div>`
        : "";

    // Manual review warning banner
    const manualReviewBanner = res.needs_manual_review
        ? `<div class="inspect-alert alert-warning">
            <strong>🔍 Hình ảnh cần kiểm tra thủ công</strong>
            <p>Lý do: ${escapeHtml(res.review_reasons.join(", "))}</p>
           </div>`
        : "";

    // Waste items tags
    const itemsHtml = (res.waste_items && res.waste_items.length > 0)
        ? res.waste_items.map(item => {
            const grp = WASTE_GROUPS[item.group] || { label: item.group, color: "#888", icon: "📦" };
            return `<span class="waste-tag" style="border-left: 3px solid ${grp.color};">
                ${grp.icon} <strong>${escapeHtml(item.name)}</strong>
                <small>(${grp.label} · ${Math.round(item.confidence * 100)}%)</small>
            </span>`;
        }).join("")
        : `<p class="muted">Không bóc tách được chi tiết từng vật thể riêng biệt.</p>`;

    // 4 Waste groups guidance cards
    const guidanceHtml = (res.guidance || []).map(g => {
        return `
            <div class="guidance-card ${g.detected ? 'is-detected' : ''}">
                <div class="guidance-head">
                    <span class="group-icon">${g.icon}</span>
                    <strong style="color:${g.color}">${escapeHtml(g.label)}</strong>
                    ${g.detected ? '<span class="detected-chip">Đã phát hiện trong ảnh</span>' : ''}
                </div>
                <div class="guidance-body">
                    <p class="guidance-examples"><strong>Ví dụ:</strong> ${escapeHtml(g.examples)}</p>
                    <p class="guidance-action"><strong>Cách xử lý:</strong> ${escapeHtml(g.guidance)}</p>
                </div>
            </div>
        `;
    }).join("");

    // Target bin info
    const bin = state.bins.find(b => b.id === binId);
    const binTitle = bin ? `${bin.name} (${bin.district})` : (binId ? `Điểm ${binId}` : "Chưa gắn với điểm cụ thể");

    dom.inspectionResultCard.innerHTML = `
        <div class="inspect-header-row">
            <div>
                <span class="eyebrow">KẾT QUẢ GIÁM ĐỊNH AI</span>
                <h3>${escapeHtml(binTitle)}</h3>
            </div>
            <span class="fill-badge ${fillBadgeClass}">
                ${escapeHtml(res.fill_label || levelInfo.label)}
                ${res.fill_percent_estimate != null ? `(~${res.fill_percent_estimate}%)` : ''}
            </span>
        </div>

        ${overflowBanner}
        ${manualReviewBanner}

        ${res.scene_summary ? `<p class="scene-summary">📝 <em>"${escapeHtml(res.scene_summary)}"</em></p>` : ''}

        <div class="inspect-section">
            <h4><span class="icon">🗑️</span> Nhận diện mức đầy & Hiện trạng:</h4>
            <div class="inspect-detail-grid">
                <div><strong>Mức đầy:</strong> ${escapeHtml(res.fill_label)}</div>
                <div><strong>Rác tràn:</strong> ${res.overflow_detected ? '🚨 CÓ TRÀN' : 'Không'}</div>
                <div><strong>Độ tin cậy:</strong> ${Math.round((res.fill_confidence || 0) * 100)}%</div>
                <div><strong>Đề xuất:</strong> ${escapeHtml(res.fill_action)}</div>
            </div>
        </div>

        <div class="inspect-section">
            <h4><span class="icon">🏷️</span> Chất thải nhận diện trong ảnh:</h4>
            <div class="waste-tags-container">
                ${itemsHtml}
            </div>
        </div>

        <div class="inspect-section">
            <h4><span class="icon">📋</span> Hướng dẫn phân loại 4 nhóm chất thải:</h4>
            <div class="guidance-grid">
                ${guidanceHtml}
            </div>
        </div>

        <div class="inspect-actions">
            ${binId ? `
                <button id="applyAnalysisBtn" class="btn primary">
                    ✓ Cập nhật trạng thái điểm trên bản đồ
                </button>
            ` : `
                <span class="muted" style="font-size:12px;">(Hãy chọn 1 điểm thu gom ở trên để cập nhật vào bản đồ)</span>
            `}
            <button id="sendToReviewBtn" class="btn secondary">
                📌 Lưu vào danh sách chờ kiểm tra thủ công
            </button>
        </div>
    `;

    // Re-bind buttons inside the dynamically generated container
    const applyBtn = dom.inspectionResultCard.querySelector("#applyAnalysisBtn");
    if (applyBtn) {
        applyBtn.addEventListener("click", () => applyAnalysisToMap(map));
    }
    const reviewBtn = dom.inspectionResultCard.querySelector("#sendToReviewBtn");
    if (reviewBtn) {
        reviewBtn.addEventListener("click", () => sendCurrentToManualReview());
    }
}

/**
 * Apply the analyzed status to the target bin in active session memory
 */
export function applyAnalysisToMap(map) {
    if (!currentAnalysisResult) return;
    const binId = dom.inspectBinSelect?.value || state.activeInspectBinId || currentAnalysisResult.bin_id;
    if (!binId) {
        alert("Vui lòng chọn điểm thu gom cần cập nhật.");
        return;
    }

    const bin = state.bins.find(b => b.id === binId);
    if (!bin) {
        alert("Không tìm thấy điểm thu gom mã " + binId);
        return;
    }

    // Determine target status
    let targetStatus = currentAnalysisResult.suggested_status;
    if (!targetStatus) {
        // If suggested_status is null (e.g. low confidence or review flag), map directly from fill_level
        const lvl = currentAnalysisResult.fill_level;
        if (lvl === "tran" || currentAnalysisResult.overflow_detected) targetStatus = "overloaded";
        else if (lvl === "day") targetStatus = "full";
        else if (lvl === "gan_day" || lvl === "con_suc_chua") targetStatus = "active";
        else targetStatus = "active";
    }

    bin.status = targetStatus;
    bin.lastInspection = {
        timestamp: new Date().toLocaleTimeString("vi-VN"),
        fill_level: currentAnalysisResult.fill_level,
        fill_label: currentAnalysisResult.fill_label,
        overflow: currentAnalysisResult.overflow_detected,
        detected_groups: currentAnalysisResult.detected_groups
    };

    updateBinMarker(bin);

    if (activeCallbacks.onBinVisibilityRefresh) activeCallbacks.onBinVisibilityRefresh();
    if (activeCallbacks.onStatsUpdate) activeCallbacks.onStatsUpdate();

    // Close modal & confirm
    if (dom.inspectDialog) dom.inspectDialog.close();

    // Pan map to updated bin
    if (map && bin.latitude && bin.longitude) {
        map.setView([bin.latitude, bin.longitude], 17);
        const marker = state.binMarkers.get(bin.id);
        if (marker && typeof marker.openPopup === "function") marker.openPopup();
    }

    alert(`✅ Đã cập nhật trạng thái điểm "${bin.name}" thành: ${currentAnalysisResult.fill_label}`);
}

/**
 * Send current inspection to Pending Manual Reviews list
 */
export function sendCurrentToManualReview() {
    if (!currentAnalysisResult) return;
    const binId = dom.inspectBinSelect?.value || state.activeInspectBinId || currentAnalysisResult.bin_id;
    const bin = state.bins.find(b => b.id === binId);

    const reviewItem = {
        id: "REV-" + Date.now(),
        binId: binId || "Chưa gắn",
        binName: bin ? bin.name : "Ảnh không gán điểm",
        thumbnail: currentImageDataUrl,
        analysis: currentAnalysisResult,
        timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    };

    state.pendingReviews.unshift(reviewItem);
    renderManualReviewsList();

    if (dom.inspectDialog) dom.inspectDialog.close();

    // Open/focus sidebar to show pending review
    const card = dom.pendingReviewsCard;
    if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    alert("📌 Đã thêm vào hàng đợi kiểm tra thủ công.");
}

/**
 * Render the list of pending manual reviews in the sidebar
 */
export function renderManualReviewsList(map) {
    const list = dom.manualReviewList;
    const countEl = dom.manualReviewCount;
    if (!list) return;

    if (countEl) {
        countEl.textContent = state.pendingReviews.length;
    }

    if (state.pendingReviews.length === 0) {
        list.innerHTML = `<div class="empty-reviews muted">Không có điểm nào chờ kiểm tra thủ công.</div>`;
        return;
    }

    list.innerHTML = "";
    state.pendingReviews.forEach(item => {
        const row = document.createElement("div");
        row.className = "manual-review-item";

        const reasons = (item.analysis?.review_reasons || ["Cần người vận hành xác nhận"]).join(", ");

        row.innerHTML = `
            <div class="review-thumb-col">
                <img src="${item.thumbnail || ''}" alt="Ảnh rác" class="review-thumb">
            </div>
            <div class="review-info-col">
                <div class="review-title">
                    <strong>${escapeHtml(item.binName)}</strong>
                    <small>${escapeHtml(item.timestamp)}</small>
                </div>
                <div class="review-reason">⚠️ ${escapeHtml(reasons)}</div>
                <div class="review-actions-row">
                    <button class="btn-review-action btn-set-normal" data-action="active" title="Xác nhận: Còn sức chứa">Còn chỗ</button>
                    <button class="btn-review-action btn-set-full" data-action="full" title="Xác nhận: Đầy">Đầy</button>
                    <button class="btn-review-action btn-set-overloaded" data-action="overloaded" title="Xác nhận: Tràn / Ưu tiên">Tràn</button>
                    <button class="btn-review-action btn-dismiss" data-action="dismiss" title="Bỏ qua">✕</button>
                </div>
            </div>
        `;

        // Handle operator decisions
        row.querySelectorAll(".btn-review-action").forEach(btn => {
            btn.addEventListener("click", () => {
                const action = btn.dataset.action;
                if (action === "dismiss") {
                    state.pendingReviews = state.pendingReviews.filter(r => r.id !== item.id);
                    renderManualReviewsList(map);
                    return;
                }

                // If user selected active/full/overloaded
                if (item.binId && item.binId !== "Chưa gắn") {
                    const bin = state.bins.find(b => b.id === item.binId);
                    if (bin) {
                        bin.status = action;
                        updateBinMarker(bin);
                        if (activeCallbacks.onBinVisibilityRefresh) activeCallbacks.onBinVisibilityRefresh();
                        if (activeCallbacks.onStatsUpdate) activeCallbacks.onStatsUpdate();
                        if (map && bin.latitude && bin.longitude) {
                            map.setView([bin.latitude, bin.longitude], 17);
                            const marker = state.binMarkers.get(bin.id);
                            if (marker && typeof marker.openPopup === "function") marker.openPopup();
                        }
                    }
                }

                state.pendingReviews = state.pendingReviews.filter(r => r.id !== item.id);
                renderManualReviewsList(map);
            });
        });

        list.appendChild(row);
    });
}
