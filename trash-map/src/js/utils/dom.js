// ============================================================
// DOM & GEOMETRY UTILITIES
// ============================================================

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = value => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function fillSelect(select, values) {
    if (!select) return;

    while (select.options.length > 1) {
        select.remove(1);
    }

    values.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

export function uniqueValues(items, key) {
    return [
        ...new Set(items.map(item => item[key]).filter(Boolean))
    ].sort((a, b) => String(a).localeCompare(String(b), "vi"));
}
