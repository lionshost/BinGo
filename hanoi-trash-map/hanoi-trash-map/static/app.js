// ============================================================
// BINGO THU GOM RAC THONG MINH
// Garbage Truck Collection Simulation
// DEMO - No real GPS / WebSocket / IoT
// ============================================================


// ============================================================
// 1. MAP CONFIGURATION
// ============================================================

const HANOI_CENTER = [21.0285, 105.8542];

const HANOI_BOUNDS = L.latLngBounds(
    [20.94, 105.72],
    [21.18, 105.97]
);

const map = L.map("map", {
    center: HANOI_CENTER,
    zoom: 13,
    minZoom: 12,
    maxZoom: 19,
    maxBounds: HANOI_BOUNDS,
    maxBoundsViscosity: 1.0
});


// ============================================================
// 2. VIETMAP VECTOR BASE MAP
// ============================================================

const providerConfig = JSON.parse(document.getElementById("mapConfig").textContent);
let mapReady = false;
let vietmapLayer = null;
let statusFilter = "all";

function showMapState(message) {
    document.getElementById("map").inert = true;
    document.getElementById("mapPlaceholder").hidden = false;
    document.getElementById("mapStateText").textContent = message;
    document.getElementById("providerStatus").textContent = "VIETMAP · Chưa kết nối";
    document.getElementById("mapCaption").textContent = "Chưa kết nối nguồn bản đồ";
}

async function initializeVietmap(style = "lm") {
    mapReady = false;
    if (!providerConfig.tilemapKey) {
        showMapState("Kết nối tài khoản VIETMAP để mở bản đồ và tìm tuyến đường cho đội xe của bạn.");
        return false;
    }
    if (!L.vietmapGL) {
        showMapState("Chưa tải được thư viện bản đồ VIETMAP. Kiểm tra kết nối mạng rồi tải lại trang.");
        return false;
    }
    document.getElementById("providerStatus").textContent = "VIETMAP · Đang kết nối";
    try {
        if (vietmapLayer) map.removeLayer(vietmapLayer);
        vietmapLayer = L.vietmapGL({
            style: `https://maps.vietmap.vn/maps/styles/${style}/style.json?apikey=${encodeURIComponent(providerConfig.tilemapKey)}`
        }).addTo(map);
        const gl = vietmapLayer.getVietmapMap();
        return await new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (!settled) { settled = true; clearTimeout(timeout); resolve(value); }
            };
            const timeout = setTimeout(() => {
                showMapState("Kết nối VIETMAP quá lâu. Kiểm tra Tilemap key, tên miền được cấp phép hoặc mạng.");
                finish(false);
            }, 18000);
            gl.on("load", () => {
                if (settled) return;
                mapReady = true;
                document.getElementById("map").inert = false;
                document.getElementById("mapPlaceholder").hidden = true;
                document.getElementById("providerStatus").textContent = "VIETMAP · Đã kết nối";
                document.getElementById("mapCaption").textContent = "Bản đồ VIETMAP";
                finish(true);
            });
            gl.on("error", event => {
                // Never log raw provider URLs because they include a key.
                if (!settled || [401, 403, 423].includes(event.error?.status)) {
                    mapReady = false;
                    if (running) pauseSimulation();
                    showMapState("Không tải được VIETMAP. Kiểm tra Tilemap key, quyền truy cập và hạn mức.");
                    setRouteControls(false);
                    finish(false);
                }
            });
        });
    } catch {
        showMapState("Trình duyệt chưa mở được bản đồ VIETMAP. Kiểm tra WebGL và kết nối mạng.");
        return false;
    }
}


// ============================================================

// 3. DOM
// ============================================================

const startBtn =
    document.getElementById("startBtn");

const pauseBtn =
    document.getElementById("pauseBtn");

const resetBtn =
    document.getElementById("resetBtn");


const simulationStatus =
    document.getElementById("simulationStatus");

const mapTime =
    document.getElementById("mapTime");


const totalCount =
    document.getElementById("totalCount");

const collectedCount =
    document.getElementById("collectedCount");

const waitingCount =
    document.getElementById("waitingCount");

const truckCount =
    document.getElementById("truckCount");


const searchInput =
    document.getElementById("searchInput");

const districtFilter =
    document.getElementById("districtFilter");

const typeFilter =
    document.getElementById("typeFilter");


const showRoutes =
    document.getElementById("showRoutes");

const showTrucks =
    document.getElementById("showTrucks");


const truckList =
    document.getElementById("truckList");

const toggleTruckList =
    document.getElementById("toggleTruckList");

let truckListCollapsed = false;


// ============================================================
// 4. APPLICATION STATE
// ============================================================

let bins = [];

const binMarkers =
    new Map();

let running =
    false;

let routesLoading = true;
const loadRoutesBtn = document.getElementById("loadRoutesBtn");
const retryRoutesBtn = document.getElementById("retryRoutesBtn");
const TRUCK_SPEED_KMH = 30;

let timer =
    null;

let simulationSeconds =
    0;

let speedMultiplier =
    1;

const routeLayers =
    [];

const truckMarkers =
    [];


// ============================================================
// 5. TRUCK CONFIGURATION
// Routes are generated from trash-bin data.
// ============================================================

const THANH_XUAN_TRUCK_COUNT = 3;
const GENERAL_TRUCK_COUNT = 50;
const TRUCK_COUNT =
    THANH_XUAN_TRUCK_COUNT + GENERAL_TRUCK_COUNT;

const truckColors = [
    "#16a34a",
    "#2563eb",
    "#9333ea",
    "#dc2626",
    "#ea580c",
    "#0891b2",
    "#4f46e5",
    "#be123c",
    "#0f766e",
    "#a16207"
];

const trucks = Array.from(
    { length: TRUCK_COUNT },
    (_, truckIndex) => {

        const isThanhXuanTruck =
            truckIndex < THANH_XUAN_TRUCK_COUNT;

        const number = String(
            isThanhXuanTruck
                ? truckIndex + 1
                : truckIndex - THANH_XUAN_TRUCK_COUNT + 1
        ).padStart(2, "0");

        const prefix =
            isThanhXuanTruck
                ? "TX"
                : "HN";


        return {
            id: `${prefix}-${number}`,
            name: isThanhXuanTruck
                ? `Xe Thanh Xuân ${number}`
                : `Xe HN-${number}`,

            district:
                isThanhXuanTruck
                    ? "Thanh Xuân"
                    : null,

            color:
                truckColors[
                    truckIndex % truckColors.length
                ],

            route: [],
            assignedBins: [],
            orderedBins: [],
            routeStatus: "pending",
            routeError: "",
            stops: [],
            distanceTravelled: 0,
            totalDistance: 0,
            nextStop: 0,

            segment: 0,
            progress: 0,

            collected: 0
        };

    }
);


// ============================================================
// 6. LOAD TRASH BINS
// ============================================================

async function loadBins() {

    const response =
        await fetch("/api/trash-bins");


    if (!response.ok) {

        throw new Error(
            "Không thể tải /api/trash-bins"
        );

    }


    bins =
        await response.json();


    bins.forEach(bin => {

        bin.latitude =
            Number(bin.latitude);

        bin.longitude =
            Number(bin.longitude);

        bin.demoCollected =
            false;

        bin.collectedBy =
            null;

    });


    randomizeDemoStatuses();


    console.log(
        `Loaded ${bins.length} trash bins`
    );


    initializeFilters();

    createBinMarkers();

    updateStats();

}


function randomizeDemoStatuses() {

    const availableBins =
        bins.filter(
            bin => bin.status === "active"
        );


    for (
        let index = availableBins.length - 1;
        index > 0;
        index--
    ) {

        const randomIndex =
            Math.floor(
                Math.random() * (index + 1)
            );


        [
            availableBins[index],
            availableBins[randomIndex]
        ] = [
            availableBins[randomIndex],
            availableBins[index]
        ];

    }


    const fullCount =
        Math.max(
            1,
            Math.floor(
                availableBins.length * 0.12
            )
        );


    const overloadedCount =
        Math.max(
            1,
            Math.floor(
                availableBins.length * 0.08
            )
        );


    availableBins
        .slice(0, fullCount)
        .forEach(
            bin => {
                bin.status = "full";
            }
        );


    availableBins
        .slice(
            fullCount,
            fullCount + overloadedCount
        )
        .forEach(
            bin => {
                bin.status = "overloaded";
            }
        );

}


// ============================================================
// 7. FILTER DATA
// ============================================================

function uniqueValues(key) {

    return [

        ...new Set(

            bins
                .map(item => item[key])
                .filter(Boolean)

        )

    ].sort(

        (a, b) =>
            String(a).localeCompare(
                String(b),
                "vi"
            )

    );

}


function initializeFilters() {

    fillSelect(
        districtFilter,
        uniqueValues("district")
    );

    fillSelect(
        typeFilter,
        uniqueValues("type")
    );

}


function fillSelect(
    select,
    values
) {

    if (!select) {
        return;
    }


    while (
        select.options.length > 1
    ) {

        select.remove(1);

    }


    values.forEach(value => {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            value;

        option.textContent =
            value;


        select.appendChild(
            option
        );

    });

}


// ============================================================
// 8. FILTERED BINS
// ============================================================

function filteredBins() {

    const keyword =
        searchInput
            ?.value
            ?.trim()
            ?.toLowerCase() || "";


    const district =
        districtFilter?.value || "";


    const type =
        typeFilter?.value || "";


    return bins.filter(item => {

        const text = [

            item.name || "",
            item.address || "",
            item.district || "",
            item.type || ""

        ]
            .join(" ")
            .toLowerCase();


        const keywordMatch =
            !keyword ||
            text.includes(keyword);


        const districtMatch =
            !district ||
            item.district === district;


        const typeMatch =
            !type ||
            item.type === type;


        const statusMatch = statusFilter === "all"
            || (statusFilter === "collected" && item.demoCollected)
            || (statusFilter === "priority" && !item.demoCollected && ["full", "overloaded"].includes(item.status))
            || (statusFilter === "broken" && item.status === "broken");

        return (
            statusMatch && keywordMatch &&
            districtMatch &&
            typeMatch
        );

    });

}


// ============================================================
// 9. BIN ICON
// ============================================================

function getBinStatus(item) {

    if (item.demoCollected) return {key: "collected", label: "Đã thu gom", icon: "✓"};

    const statuses = {

        active: {
            key: "available",
            label: "Còn chỗ",
            icon: "🗑"
        },

        full: {
            key: "full",
            label: "Đầy",
            icon: "🗑"
        },

        overloaded: {
            key: "overloaded",
            label: "Quá tải",
            icon: "🗑"
        },

        broken: {
            key: "broken",
            label: "Hỏng",
            icon: "!"
        }

    };


    return statuses[item.status] || statuses.active;

}


function createBinIcon(item) {

    const status =
        getBinStatus(item);


    return L.divIcon({

        className: "",

        html:
            `<div class="bin-icon ${status.key}" title="${escapeHtml(status.label)}">`
            + `<span class="bin-glyph">${status.icon}</span>`
            + `</div>`,

        iconSize:
            [30, 30],

        iconAnchor:
            [15, 15]

    });

}


// ============================================================
// 10. BIN POPUP
// ============================================================

function popupContent(item) {

    const status =
        getBinStatus(item);


    const collector =
        item.collectedBy

            ? `
                <div>
                    🚛 Xe thu gom:
                    <strong>
                        ${escapeHtml(item.collectedBy)}
                    </strong>
                </div>
            `

            : "";


    return `

        <div style="min-width:220px">

            <strong>
                ${escapeHtml(item.name)}
            </strong>

            <hr
                style="
                    border:0;
                    border-top:1px solid #ddd;
                "
            >

            <div>
                📍 ${escapeHtml(item.address)}
            </div>

            <div>
                🏙️ ${escapeHtml(item.district)}
            </div>

            <div>
                🗑️ ${escapeHtml(item.type)}
            </div>

            <div>
                ${
                    item.recyclable
                        ? "♻️ Có phân loại rác"
                        : "🗑️ Rác thông thường"
                }
            </div>

            ${collector}

            <div
                style="
                    margin-top:7px;
                    font-weight:700;
                "
            >
                ${status.icon} Hiện trạng: ${escapeHtml(status.label)}
            </div>

        </div>

    `;

}


// ============================================================
// 11. CREATE BIN MARKERS
// ============================================================

function createBinMarkers() {

    bins.forEach(item => {

        if (
            !Number.isFinite(item.latitude) ||
            !Number.isFinite(item.longitude)
        ) {

            console.warn(
                "Invalid bin coordinate:",
                item
            );

            return;

        }


        const marker =
            L.marker(

                [
                    item.latitude,
                    item.longitude
                ],

                {
                    icon:
                        createBinIcon(item)
                }

            );


        marker.bindPopup(
            popupContent(item)
        );


        marker.addTo(map);


        binMarkers.set(
            item.id,
            marker
        );

    });

}


// ============================================================
// 12. UPDATE BIN MARKER
// ============================================================

function updateBinMarker(item) {

    const marker =
        binMarkers.get(
            item.id
        );


    if (!marker) {
        return;
    }


    marker.setIcon(
        createBinIcon(item)
    );


    marker.setPopupContent(
        popupContent(item)
    );

}


// ============================================================
// 13. FILTER MARKER VISIBILITY
// ============================================================

function refreshBinVisibility() {

    const visibleIds =
        new Set(

            filteredBins()
                .map(
                    item => item.id
                )

        );


    bins.forEach(item => {

        const marker =
            binMarkers.get(
                item.id
            );


        if (!marker) {
            return;
        }


        if (
            visibleIds.has(
                item.id
            )
        ) {

            if (
                !map.hasLayer(marker)
            ) {

                marker.addTo(map);

            }

        }

        else {

            if (
                map.hasLayer(marker)
            ) {

                marker.remove();

            }

        }

    });


    const visibleCount = document.getElementById("visibleCount");
    if (visibleCount) visibleCount.textContent = visibleIds.size;
    updateRouteVisibility();

    updateTruckVisibility();

}


function truckMatchesFilter(truck) {

    const visibleIds =
        new Set(
            filteredBins().map(
                item => item.id
            )
        );


    return truck.assignedBins.some(
        item => visibleIds.has(item.id)
    );

}


// ============================================================
// 14. DISTANCE IN METERS
// ============================================================

function distanceMeters(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R =
        6371000;


    const toRad =
        value =>
            value *
            Math.PI /
            180;


    const dLat =
        toRad(
            lat2 - lat1
        );


    const dLon =
        toRad(
            lon2 - lon1
        );


    const a =

        Math.sin(
            dLat / 2
        ) ** 2

        +

        Math.cos(
            toRad(lat1)
        )

        *

        Math.cos(
            toRad(lat2)
        )

        *

        Math.sin(
            dLon / 2
        ) ** 2;


    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)

        );


    return R * c;

}


// ============================================================
// 15. GENERATE TRUCK ROUTES
//
// Chia điểm theo longitude thành nhiều khu vực.
// Sau đó nearest-neighbour tạo route cho từng xe.
// ============================================================

function generateTruckRoutes() {

    const validBins =
        bins.filter(item =>

            item.status !== "broken"

            &&

            Number.isFinite(
                item.latitude
            )

            &&

            Number.isFinite(
                item.longitude
            )

        );


    if (
        validBins.length === 0
    ) {

        throw new Error(
            "Không có điểm rác hợp lệ để tạo tuyến."
        );

    }


    const thanhXuanBins =
        validBins.filter(
            item => item.district === "Thanh Xuân"
        );

    const generalBins =
        validBins.filter(
            item => item.district !== "Thanh Xuân"
        );


    // Sort từng khu vực từ Tây -> Đông.
    const sortedThanhXuanBins =
        [...thanhXuanBins].sort(

            (a, b) =>
                a.longitude -
                b.longitude

        );


    const sortedGeneralBins =
        [...generalBins].sort(

            (a, b) =>
                a.longitude -
                b.longitude

        );


    const thanhXuanGroups = Array.from(
        { length: THANH_XUAN_TRUCK_COUNT },
        () => []
    );


    const generalGroups = Array.from(
        { length: GENERAL_TRUCK_COUNT },
        () => []
    );


    sortedThanhXuanBins.forEach(
        (bin, index) => {

            const groupIndex =
                Math.min(
                    thanhXuanGroups.length - 1,
                    Math.floor(
                        index *
                        thanhXuanGroups.length /
                        sortedThanhXuanBins.length
                    )
                );


            thanhXuanGroups[
                groupIndex
            ].push(bin);

        }

    );


    sortedGeneralBins.forEach(
        (bin, index) => {

            const groupIndex =
                Math.min(
                    generalGroups.length - 1,
                    Math.floor(
                        index *
                        generalGroups.length /
                        sortedGeneralBins.length
                    )
                );


            generalGroups[
                groupIndex
            ].push(bin);

        }

    );


    trucks.forEach(

        (truck, index) => {

            truck.assignedBins =
                index < THANH_XUAN_TRUCK_COUNT
                    ? thanhXuanGroups[index]
                    : generalGroups[
                        index - THANH_XUAN_TRUCK_COUNT
                    ];


            truck.orderedBins = buildNearestRoute(truck.assignedBins);
            truck.route = [];
            truck.routeStatus = truck.orderedBins.length ? "pending" : "empty";


            truck.segment =
                0;


            truck.progress =
                0;


            truck.collected =
                0;


            console.log(
                `${truck.id}: ${truck.assignedBins.length} points`
            );

        }

    );

}


// ============================================================
// 16. NEAREST NEIGHBOUR ROUTE
// ============================================================

function buildNearestRoute(group) {

    if (
        !group ||
        group.length === 0
    ) {

        return [];

    }


    const remaining =
        [...group];


    // Điểm bắt đầu:
    // ưu tiên phía Tây / Nam
    remaining.sort(

        (a, b) => {

            const scoreA =
                a.longitude +
                a.latitude * 0.15;


            const scoreB =
                b.longitude +
                b.latitude * 0.15;


            return scoreA -
                scoreB;

        }

    );


    let current =
        remaining.shift();


    const ordered = [
        current
    ];


    while (
        remaining.length > 0
    ) {

        let nearestIndex =
            0;


        let nearestDistance =
            Infinity;


        for (
            let i = 0;
            i < remaining.length;
            i++
        ) {

            const candidate =
                remaining[i];


            const distance =
                distanceMeters(

                    current.latitude,
                    current.longitude,

                    candidate.latitude,
                    candidate.longitude

                );


            if (
                distance <
                nearestDistance
            ) {

                nearestDistance =
                    distance;


                nearestIndex =
                    i;

            }

        }


        current =
            remaining.splice(
                nearestIndex,
                1
            )[0];


        ordered.push(
            current
        );

    }


    // This determines stop order only; road geometry comes from VIETMAP.
    return ordered;

}



function setRouteControls(loading) {
    routesLoading = loading;
    const ready = trucks.some(t => t.routeStatus === "ready");
    startBtn.disabled = loading || !ready || !mapReady;
    pauseBtn.disabled = loading || !ready || !mapReady;
    resetBtn.disabled = loading || !ready;
    retryRoutesBtn.disabled = loading || !mapReady || !providerConfig.routingConfigured;
    retryRoutesBtn.hidden = !trucks.some(t => t.routeStatus === "error");
    loadRoutesBtn.disabled = loading || !mapReady || !providerConfig.routingConfigured;
    loadRoutesBtn.hidden = ready || trucks.some(t => t.routeStatus === "error");
}

function readyMessage() {
    if (!mapReady || !providerConfig.routingConfigured) return "Kết nối VIETMAP để tải tuyến cho đội xe.";
    const ready = trucks.filter(t => t.routeStatus === "ready").length;
    if (!ready && !trucks.some(t => t.routeStatus === "error")) return "Bản đồ đã sẵn sàng. Nhấn “Tải tuyến VIETMAP” để bắt đầu.";
    const failed = trucks.filter(t => t.routeStatus === "error").length;
    return failed
        ? `⚠️ ${ready} tuyến sẵn sàng; ${failed} tuyến lỗi, các xe này chưa thể chạy. Nhấn “Tải lại tuyến lỗi”.`
        : `Sẵn sàng: ${ready} tuyến chạy theo đường ô tô.`;
}

async function loadRoadRoutes(onlyFailed = false) {
    if (!mapReady || !providerConfig.routingConfigured || running) return;
    setRouteControls(true);
    const pending = trucks.filter(t => t.orderedBins.length
        && (!onlyFailed || t.routeStatus === "error"));
    // Load on explicit user action. Requests may consume the VIETMAP plan quota.
    for (const [index, truck] of pending.entries()) {
        if (!mapReady) {
            pending.slice(index).forEach(t => {
                t.routeStatus = "error";
                t.routeError = "Kết nối bản đồ bị gián đoạn. Hãy tải lại tuyến.";
            });
            break;
        }
        simulationStatus.textContent = `Đang tải tuyến VIETMAP ${index + 1}/${pending.length} · ${truck.id}`;
        truck.routeStatus = "loading";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
            const response = await fetch("/api/road-route", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({bin_ids: truck.orderedBins.map(b => b.id)}),
                signal: controller.signal
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Không tải được tuyến đường.");
            RoadRouting.prepare(truck, data);
            document.getElementById("routeUpdated").textContent = `Tuyến cập nhật ${new Date().toLocaleTimeString("vi-VN", {hour:"2-digit", minute:"2-digit"})}`;
            truck.routeStatus = "ready";
            truck.routeError = "";
        } catch (error) {
            truck.route = [];
            truck.stops = [];
            truck.routeStatus = "error";
            truck.routeError = error.name === "AbortError"
                ? "Tìm đường quá lâu. Hãy thử tải lại tuyến." : error.message;
            console.warn(`Route ${truck.id} unavailable:`, error);
        } finally {
            clearTimeout(timeout);
        }
        renderTruckList();
    }
    createRoutes();
    createTruckMarkers();
    setRouteControls(false);
    simulationStatus.textContent = readyMessage();
    updateStats();
    renderTruckList();
}

retryRoutesBtn.addEventListener("click", async () => {
    if (routesLoading) return;
    pauseSimulation();
    await loadRoadRoutes(true);
});

loadRoutesBtn.addEventListener("click", () => {
    if (!routesLoading) loadRoadRoutes();
});

// ============================================================
// 17. CREATE ROUTES
// ============================================================

function createRoutes() {

    routeLayers.forEach(
        layer => {

            if (
                map.hasLayer(layer)
            ) {

                map.removeLayer(layer);

            }

        }
    );


    routeLayers.length =
        0;


    trucks.forEach(truck => {

        if (
            truck.route.length < 2
        ) {

            return;

        }


        const line =
            L.polyline(

                truck.route,

                {

                    color:
                        truck.color,

                    weight:
                        4,

                    opacity:
                        0.80,

                    smoothFactor: 0,

                    dashArray:
                        "10 7",

                    lineCap:
                        "round",

                    lineJoin:
                        "round"

                }

            );

        line.truck = truck;


        line.addTo(map);


        routeLayers.push(
            line
        );

    });


    updateRouteVisibility();

}


// ============================================================
// 18. SHOW / HIDE ROUTES
// ============================================================

function updateRouteVisibility() {

    routeLayers.forEach(
        line => {

            if (
                showRoutes?.checked &&
                truckMatchesFilter(line.truck)
            ) {

                if (
                    !map.hasLayer(line)
                ) {

                    line.addTo(map);

                }

            }

            else {

                if (
                    map.hasLayer(line)
                ) {

                    line.remove();

                }

            }

        }
    );

}


// ============================================================
// 19. TRUCK ICON
// ============================================================

function createTruckIcon(truck) {

    return L.divIcon({

        className: "",

        html: `

            <div class="truck-wrapper">

                <div
                    class="truck-pulse"
                    style="
                        border-color:${truck.color};
                    "
                ></div>

                <div class="truck-icon"><svg class="icon" aria-hidden="true"><use href="#i-truck"/></svg></div>

            </div>

        `,

        iconSize:
            [38, 38],

        iconAnchor:
            [19, 19]

    });

}


// ============================================================
// 20. CREATE TRUCK MARKERS
// ============================================================

function createTruckMarkers() {

    truckMarkers.forEach(
        marker => {

            if (
                map.hasLayer(marker)
            ) {

                map.removeLayer(marker);

            }

        }
    );


    truckMarkers.length =
        0;


    trucks.forEach((truck, index) => {

        if (
            truck.route.length === 0
        ) {

            return;

        }


        const current = truck.route[truck.segment];
        const next = truck.route[truck.segment + 1] || current;
        const first = current.map((value, axis) => value + (next[axis] - value) * truck.progress);


        const marker =
            L.marker(

                first,

                {

                    icon:
                        createTruckIcon(
                            truck
                        ),

                    zIndexOffset:
                        1000

                }

            );

        marker.truck = truck;


        marker.bindPopup(

            `

            <div style="min-width:190px">

                <strong>
                    <svg class="icon" aria-hidden="true"><use href="#i-truck"/></svg> ${truck.name}
                </strong>

                <div>
                    Xe thu gom mô phỏng
                </div>

                <div>
                    Điểm phụ trách:
                    <strong>
                        ${truck.assignedBins.length}
                    </strong>
                </div>

                <div>
                    Mã xe:
                    <strong>
                        ${truck.id}
                    </strong>
                </div>

            </div>

            `

        );


        marker.addTo(map);


        // Preserve truck indices when an earlier route failed or has no stops.
        truckMarkers[index] = marker;

    });


    updateTruckVisibility();

}


// ============================================================
// 21. SHOW / HIDE TRUCKS
// ============================================================

function updateTruckVisibility() {

    truckMarkers.forEach(
        marker => {

            if (
                showTrucks?.checked &&
                truckMatchesFilter(marker.truck)
            ) {

                if (
                    !map.hasLayer(marker)
                ) {

                    marker.addTo(map);

                }

            }

            else {

                if (
                    map.hasLayer(marker)
                ) {

                    marker.remove();

                }

            }

        }
    );

}


// ============================================================
// 22. COLLECT BIN
// ============================================================

function markBinCollected(
    item,
    truck
) {

    if (
        !item ||
        item.demoCollected ||
        item.status === "broken"
    ) {

        return;

    }


    item.demoCollected =
        true;


    item.collectedBy =
        truck.id;


    truck.collected++;


    updateBinMarker(
        item
    );

}


// ============================================================
// 23. MOVE ALONG ROAD GEOMETRY AND COLLECT AT ROUTED STOPS
// ============================================================

function moveTruck(truck, marker, meters = TRUCK_SPEED_KMH / 3.6 * speedMultiplier) {
    if (!marker || truck.routeStatus !== "ready") return;
    const movement = RoadRouting.advance(truck, meters);
    if (movement.position) marker.setLatLng(movement.position);
    movement.reached.forEach(item => markBinCollected(item, truck));
}

// ============================================================
// 26. CHECK TRUCK FINISH
// ============================================================

function truckFinished(truck) {
    return truck.routeStatus !== "ready"
        || (truck.distanceTravelled >= truck.totalDistance && truck.nextStop >= truck.stops.length);
}

function allTrucksFinished() {

    return trucks.every(
        truck =>
            truckFinished(truck)
    );

}


// ============================================================
// 27. SIMULATION TICK
// ============================================================

function simulationTick() {

    if (!running) {
        return;
    }


    trucks.forEach(

        (truck, index) => {

            const marker =
                truckMarkers[index];


            if (
                !marker ||
                truckFinished(truck)
            ) {

                return;

            }


            moveTruck(
                truck,
                marker
            );

        }

    );


    simulationSeconds +=
        speedMultiplier;


    updateStats();

    renderTruckList();

    updateClock();
    if (statusFilter !== "all") refreshBinVisibility();


    if (
        allTrucksFinished()
    ) {

        finishSimulation();

    }

}


// ============================================================
// 28. START SIMULATION
// ============================================================

function startSimulation() {

    if (running || routesLoading || !mapReady || !trucks.some(t => t.routeStatus === "ready")) {
        return;
    }

    // Collect stops at the snapped starting position, including single-stop routes.
    trucks.forEach((truck, index) => moveTruck(truck, truckMarkers[index], 0));
    updateStats();


    if (
        allTrucksFinished()
    ) {

        simulationStatus.textContent =
            "✅ Các tuyến khả dụng đã hoàn thành. Nhấn Reset để chạy lại.";
        renderTruckList();

        return;

    }


    running =
        true;


    simulationStatus.textContent =
        `🟢 Đang thu gom - tốc độ ${speedMultiplier}×`;


    renderTruckList();


    if (timer) {

        clearInterval(
            timer
        );

    }


    timer =
        setInterval(

            simulationTick,

            100

        );

}


// ============================================================
// 29. PAUSE
// ============================================================

function pauseSimulation() {

    if (routesLoading) return;

    running =
        false;


    if (timer) {

        clearInterval(
            timer
        );

        timer =
            null;

    }


    simulationStatus.textContent =
        "⏸ Đã tạm dừng";


    renderTruckList();

}


// ============================================================
// 30. FINISH
// ============================================================

function finishSimulation() {

    running =
        false;


    if (timer) {

        clearInterval(
            timer
        );

        timer =
            null;

    }


    simulationStatus.textContent =
        trucks.some(t => t.routeStatus === "error")
            ? "⚠️ Đã chạy xong các tuyến khả dụng. Còn tuyến lỗi cần tải lại."
            : "✅ Hoàn thành các tuyến thu gom";


    updateStats();

    renderTruckList();

}


// ============================================================
// 31. RESET
// ============================================================

function resetSimulation() {

    if (routesLoading) return;

    running =
        false;


    if (timer) {

        clearInterval(
            timer
        );

        timer =
            null;

    }


    simulationSeconds =
        0;


    bins.forEach(item => {

        item.demoCollected =
            false;

        item.collectedBy =
            null;


        updateBinMarker(
            item
        );

    });


    trucks.forEach(
        truck => {

            RoadRouting.reset(truck);
            truck.segment =
                0;

            truck.progress =
                0;

            truck.collected =
                0;

        }
    );


    trucks.forEach(

        (truck, index) => {

            const marker =
                truckMarkers[index];


            if (
                marker &&
                truck.route.length > 0
            ) {

                marker.setLatLng(
                    truck.route[0]
                );

            }

        }

    );


    simulationStatus.textContent =
        readyMessage();


    updateStats();

    renderTruckList();

    updateClock();
    refreshBinVisibility();

}


// ============================================================
// 32. STATISTICS
// ============================================================

function updateStats() {

    const done = bins.filter(b => b.demoCollected).length;
    const serviceable = bins.filter(b => b.status !== "broken").length;
    const percent = serviceable ? Math.round(done / serviceable * 100) : 0;
    document.getElementById("missionPercent").innerHTML = `${percent}<small>%</small>`;
    document.getElementById("missionRing").style.setProperty("--progress", `${percent}%`);
    document.getElementById("missionText").textContent = done ? `${done} điểm sạch hơn nhờ đội xe của bạn` : "Sẵn sàng cho hành trình mới";
    document.getElementById("completionLabel").textContent = `${percent}% hành trình hoàn thành`;
    document.getElementById("fleetSummary").textContent = `${trucks.length} xe được phân công`;

    const total =
        bins.length;


    const collected =
        bins.filter(
            item =>
                item.demoCollected
        ).length;


    const broken =
        bins.filter(
            item =>
                item.status === "broken"
        ).length;


    const waiting =
        total -
        collected -
        broken;


    if (totalCount) {

        totalCount.textContent =
            total;

    }


    if (collectedCount) {

        collectedCount.textContent =
            collected;

    }


    if (waitingCount) {

        waitingCount.textContent =
            Math.max(
                0,
                waiting
            );

    }


    if (truckCount) {

        truckCount.textContent =
            trucks.filter(truck => truck.routeStatus === "ready").length;

    }

}


// ============================================================
// 33. TRUCK DASHBOARD
// ============================================================

const truckCards = new Map();

function renderTruckList() {

    if (!truckList) {
        return;
    }


    trucks.forEach(truck => {

        let routeProgress = truck.totalDistance > 0
            ? truck.distanceTravelled / truck.totalDistance
            : (truck.routeStatus === "ready" && truckFinished(truck) ? 1 : 0);


        routeProgress =
            Math.min(
                1,
                Math.max(
                    0,
                    routeProgress
                )
            );


        const percent =
            Math.round(
                routeProgress *
                100
            );


        const finished =
            truckFinished(truck);


        let status =
            "SẴN SÀNG";


        if (truck.routeStatus === "error") {
            status = "LỖI TUYẾN";
        }
        else if (truck.routeStatus === "empty") {
            status = "KHÔNG CÓ ĐIỂM";
        }
        else if (truck.routeStatus !== "ready") {
            status = truck.routeStatus === "loading" ? "ĐANG TẢI" : "CHỜ TUYẾN";
        }
        else if (finished) {

            status =
                "HOÀN TẤT";

        }

        else if (running) {

            status =
                "ĐANG CHẠY";

        }


        const displaySpeed =

            running &&
            !finished

                ? TRUCK_SPEED_KMH

                : 0;


        const assigned =
            truck.assignedBins.length;


        let item = truckCards.get(truck.id);
        if (!item) {
        item = document.createElement("div");
        truckCards.set(truck.id, item);
        item.className = "truck-item";
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.setAttribute("aria-label", `Xem ${truck.name} trên bản đồ`);
        const focusTruck = () => {
            if (!mapReady || !truck.route.length) { simulationStatus.textContent = `${truck.name}: chưa có tuyến để xem.`; return; }
            const marker = truckMarkers[trucks.indexOf(truck)];
            if (marker) { map.setView(marker.getLatLng(), 16); marker.openPopup(); }
            document.querySelector(".map-card").scrollIntoView({behavior:"smooth", block:"start"});
        };
        item.addEventListener("click", focusTruck);
        item.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusTruck(); } });
        truckList.appendChild(item);
        }


        item.innerHTML = `

            <div class="truck-head">

                <span>
                    🚛 ${truck.name}
                </span>

                <span
                    style="
                        color:${truck.color};
                    "
                >
                    ● ${status}
                </span>

            </div>


            <div class="truck-meta">

                <span>
                    Đã thu:
                    ${truck.collected}
                    /
                    ${assigned}
                </span>

                <span>
                    ${displaySpeed}
                    km/h
                </span>

            </div>


            <div class="truck-meta">

                <span>
                    Tiến độ:
                    ${percent}%
                </span>

                <span>
                    ${truck.id}
                </span>

            </div>


            ${truck.routeError ? `<div class="sim-status">${escapeHtml(truck.routeError)}</div>` : ""}

            <div class="progress">

                <div
                    style="
                        width:${percent}%;
                        background:${truck.color};
                    "
                ></div>

            </div>

        `;



    });

}


// ============================================================
// 34. CLOCK
// ============================================================

function updateClock() {

    const totalSeconds =
        Math.floor(
            simulationSeconds
        );


    const minutes =
        Math.floor(
            totalSeconds / 60
        );


    const seconds =
        totalSeconds % 60;


    if (mapTime) {

        mapTime.textContent =

            `${

                String(minutes)
                    .padStart(
                        2,
                        "0"
                    )

            }:${

                String(seconds)
                    .padStart(
                        2,
                        "0"
                    )

            }`;

    }

}


// ============================================================
// 35. SPEED BUTTONS
// ============================================================

document
    .querySelectorAll(
        ".speed-btn"
    )
    .forEach(button => {

        button.addEventListener(

            "click",

            () => {

                if (routesLoading) return;

                document
                    .querySelectorAll(
                        ".speed-btn"
                    )
                    .forEach(btn => {

                        btn.classList.remove(
                            "active"
                        );
                        btn.setAttribute("aria-pressed", "false");

                    });


                button.classList.add(
                    "active"
                );
                button.setAttribute("aria-pressed", "true");


                speedMultiplier =
                    Number(
                        button.dataset.speed
                    );


                simulationStatus.textContent =

                    running

                        ? `🟢 Đang thu gom - tốc độ ${speedMultiplier}×`

                        : `Tốc độ mô phỏng: ${speedMultiplier}×`;

            }

        );

    });


// ============================================================
// 36. EVENTS
// ============================================================

if (startBtn) {

    startBtn.addEventListener(
        "click",
        startSimulation
    );

}


if (pauseBtn) {

    pauseBtn.addEventListener(
        "click",
        pauseSimulation
    );

}


if (resetBtn) {

    resetBtn.addEventListener(
        "click",
        resetSimulation
    );

}


if (showRoutes) {

    showRoutes.addEventListener(
        "change",
        updateRouteVisibility
    );

}


if (showTrucks) {

    showTrucks.addEventListener(
        "change",
        updateTruckVisibility
    );

}


if (searchInput) {

    searchInput.addEventListener(
        "input",
        refreshBinVisibility
    );

}


if (districtFilter) {

    districtFilter.addEventListener(
        "change",
        refreshBinVisibility
    );

}


if (typeFilter) {

    typeFilter.addEventListener(
        "change",
        refreshBinVisibility
    );

}


if (toggleTruckList) {

    toggleTruckList.addEventListener(
        "click",
        () => {

            truckListCollapsed =
                !truckListCollapsed;

            truckList.hidden =
                truckListCollapsed;

            toggleTruckList.textContent =
                truckListCollapsed
                    ? "Mở rộng"
                    : "Thu gọn";

            toggleTruckList.setAttribute(
                "aria-expanded",
                String(!truckListCollapsed)
            );

        }
    );

}


// ============================================================
// 37. ESCAPE HTML
// ============================================================

function escapeHtml(value) {

    return String(
        value ?? ""
    )

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


// ============================================================
// 38. FIT MAP TO HANOI
// ============================================================

function fitMapToHanoi() {

    map.setView(
        HANOI_CENTER,
        13
    );

}


// ============================================================
// 39. INITIALIZE APPLICATION
// ============================================================

async function initialize() {

    setRouteControls(true);
    try {

        simulationStatus.textContent =
            "⏳ Đang tải dữ liệu...";


        // Load bin data.
        await loadBins();


        // Prepare assignments, but do not spend routing quota on page load.
        generateTruckRoutes();
        renderTruckList();
        refreshBinVisibility();
        await initializeVietmap();
        setRouteControls(false);


        // 5. Fit map to Hanoi city bounds
        fitMapToHanoi();


        // 6. Refresh Leaflet layout
        setTimeout(
            () => {

                map.invalidateSize(
                    true
                );

            },
            300
        );


        updateStats();

        renderTruckList();

        updateClock();


        simulationStatus.textContent =
            readyMessage();


        console.log(
            "===================================="
        );

        console.log(
            "BinGo thu gom rác thông minh sẵn sàng"
        );

        console.log(
            `Trash bins: ${bins.length}`
        );


        trucks.forEach(
            truck => {

                console.log(
                    `${truck.id}:`,
                    {
                        assigned:
                            truck.assignedBins.length,

                        routePoints:
                            truck.route.length
                    }
                );

            }
        );


        console.log(
            "===================================="
        );

    }

    catch (error) {

        console.error(
            "Initialization error:",
            error
        );


        simulationStatus.textContent =
            "❌ Không thể khởi tạo mô phỏng";


        alert(

            "Không thể khởi tạo BinGo thu gom rác thông minh.\n\n"

            +

            error.message

        );

    }

}


// ============================================================
// START APPLICATION
// ============================================================


const setupDialog = document.getElementById("setupDialog");
["helpBtn", "connectMapBtn"].forEach(id => document.getElementById(id).addEventListener("click", () => setupDialog.showModal()));
document.getElementById("closeSetupBtn").addEventListener("click", () => setupDialog.close());
setupDialog.addEventListener("click", event => { if (event.target === setupDialog) {
    const bounds = setupDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setupDialog.close();
}});
document.getElementById("fleetTab").addEventListener("click", () => {
    document.getElementById("fleetPanel").scrollIntoView({behavior:"smooth", block:"start"});
    document.getElementById("fleetPanel").focus({preventScroll:true});
});
document.getElementById("mapTab").addEventListener("click", () => document.querySelector(".map-card").scrollIntoView({behavior:"smooth", block:"start"}));
document.getElementById("centerMapBtn").addEventListener("click", fitMapToHanoi);
document.getElementById("layerBtn").addEventListener("click", event => {
    const panel = document.getElementById("layerPanel");
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
});
document.getElementById("mapStyle").addEventListener("change", async event => {
    if (!providerConfig.tilemapKey || routesLoading) return;
    pauseSimulation();
    setRouteControls(true);
    await initializeVietmap(event.target.value);
    setRouteControls(false);
    simulationStatus.textContent = readyMessage();
});
document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    statusFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(chip => {
        const active = chip === button;
        chip.classList.toggle("active", active);
        chip.setAttribute("aria-pressed", String(active));
    });
    refreshBinVisibility();
}));

initialize();
