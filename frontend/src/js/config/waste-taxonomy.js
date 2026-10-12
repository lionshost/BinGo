// ============================================================
// WASTE TAXONOMY — dùng chung cho máy chủ (Gemini Vision) và giao diện
// Bản sao giống hệt ở backend/src/config và frontend/src/js/config — sửa một file thì sửa cả hai.
// ============================================================

/** Mức đầy của thùng/điểm chứa rác nhận diện từ ảnh. */
export const FILL_LEVELS = {
    con_suc_chua: {
        key: "con_suc_chua",
        label: "Còn sức chứa",
        binStatus: "active",
        rank: 0,
        action: "Chưa cần thu gom, tiếp tục theo dõi."
    },
    gan_day: {
        key: "gan_day",
        label: "Gần đầy",
        binStatus: "near_full",
        rank: 1,
        action: "Lên lịch thu gom trong ca tới."
    },
    day: {
        key: "day",
        label: "Đầy",
        binStatus: "full",
        rank: 2,
        action: "Ưu tiên thu gom trong ngày."
    },
    tran: {
        key: "tran",
        label: "Rác tràn ra ngoài",
        binStatus: "overloaded",
        rank: 3,
        action: "Thu gom khẩn cấp và vệ sinh khu vực xung quanh."
    }
};

export const UNKNOWN_FILL_LEVEL = "khong_xac_dinh";

/** 4 nhóm tính chất chất thải và hướng dẫn phân loại tại nguồn. */
export const WASTE_GROUPS = {
    huu_co: {
        key: "huu_co",
        label: "Chất thải hữu cơ",
        color: "#3f9b5f",
        icon: "🥬",
        examples: "Thức ăn thừa, vỏ rau củ quả, lá cây, bã trà/cà phê, xương nhỏ.",
        guidance: "Để ráo nước, bỏ vào túi/thùng rác thực phẩm riêng. Không lẫn túi nilon, hộp xốp. Có thể ủ làm phân compost."
    },
    tai_che: {
        key: "tai_che",
        label: "Chất thải tái chế",
        color: "#2f7fc1",
        icon: "♻️",
        examples: "Giấy, bìa carton, chai nhựa PET, lon nhôm, kim loại, chai lọ thủy tinh.",
        guidance: "Làm sạch, để khô, ép dẹt; gom riêng để bán phế liệu hoặc bỏ vào thùng tái chế. Không để dính thức ăn."
    },
    nguy_hai: {
        key: "nguy_hai",
        label: "Chất thải nguy hại",
        color: "#d4553a",
        icon: "☣️",
        examples: "Pin, ắc quy, bóng đèn huỳnh quang, nhiệt kế thủy ngân, bình xịt, hóa chất, dầu nhớt, thuốc hết hạn, kim tiêm, đồ điện tử hỏng.",
        guidance: "Tuyệt đối không bỏ chung rác sinh hoạt. Đựng trong hộp/túi kín, dán nhãn, mang tới điểm thu hồi chất thải nguy hại hoặc chờ đợt thu gom riêng. Không đốt, không đập vỡ."
    },
    kho_phan_huy: {
        key: "kho_phan_huy",
        label: "Chất thải khó phân hủy",
        color: "#7b8794",
        icon: "🛍️",
        examples: "Túi nilon bẩn, hộp xốp, tã bỉm, sành sứ vỡ, cao su, đầu lọc thuốc lá, vải vụn.",
        guidance: "Cho vào túi kín, bỏ thùng rác còn lại để xử lý chôn lấp/đốt có kiểm soát. Hạn chế dùng nilon và đồ nhựa dùng một lần."
    }
};

/** Các vấn đề chất lượng ảnh mà mô hình có thể báo cáo. */
export const IMAGE_ISSUES = {
    mo_nhoe: "Ảnh mờ/nhòe",
    thieu_sang: "Thiếu sáng hoặc ngược sáng",
    bi_che_khuat: "Thùng rác bị che khuất",
    qua_xa: "Chụp quá xa",
    goc_chup_kem: "Góc chụp không thấy miệng thùng",
    khong_thay_thung_rac: "Không thấy thùng/điểm chứa rác",
    khac: "Vấn đề khác"
};

/** Ngưỡng độ tin cậy tối thiểu để tự động cập nhật trạng thái. */
export const MIN_FILL_CONFIDENCE = 0.6;
/** Bỏ qua vật thể có độ tin cậy dưới ngưỡng này. */
export const MIN_ITEM_CONFIDENCE = 0.35;

/** Trạng thái điểm thu gom được coi là cần ưu tiên khi lập tuyến. */
export const PRIORITY_STATUSES = ["overloaded", "full"];
