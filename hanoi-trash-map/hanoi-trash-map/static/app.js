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
// 2. BASE MAP
// Esri primary + OSM.DE fallback
// ============================================================

let fallbackActivated = false;

const esriMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri"
    }
);

esriMap.addTo(map);


// Nếu Esri không tải được -> thử OSM Germany
esriMap.on("tileerror", function (event) {

    console.error("Esri tile failed:", event);

    if (fallbackActivated) {
        return;
    }

    fallbackActivated = true;

    console.warn(
        "Esri failed. Switching to OpenStreetMap.DE..."
    );

    if (map.hasLayer(esriMap)) {
        map.removeLayer(esriMap);
    }

    const fallbackMap = L.tileLayer(
        "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    );

    fallbackMap.addTo(map);

    fallbackMap.on("tileerror", function (fallbackError) {
        console.error(
            "Fallback map tile failed:",
            fallbackError
        );
    });

});


setTimeout(() => {
    map.invalidateSize(true);
}, 300);


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


        return (
            keywordMatch &&
            districtMatch &&
            typeMatch
        );

    });

}


// ============================================================
// 9. BIN ICON
// ============================================================

function getBinStatus(item) {

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


            truck.route =
                buildNearestRoute(
                    truck.assignedBins
                );


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


    return ordered.map(
        item => [

            item.latitude,
            item.longitude

        ]
    );

}


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

                <div class="truck-icon">
                    🚛
                </div>

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


    trucks.forEach(truck => {

        if (
            truck.route.length === 0
        ) {

            return;

        }


        const first =
            truck.route[0];


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
                    🚛 ${truck.name}
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


        truckMarkers.push(
            marker
        );

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
// 23. COLLECT NEARBY BINS
// ============================================================

function collectNearbyBins(
    truck,
    lat,
    lng
) {

    // Khoảng 120m để demo
    const collectionRadius =
        120;


    bins.forEach(item => {

        if (
            item.demoCollected ||
            item.status === "broken"
        ) {

            return;

        }


        if (
            !Number.isFinite(item.latitude) ||
            !Number.isFinite(item.longitude)
        ) {

            return;

        }


        const distance =
            distanceMeters(

                lat,
                lng,

                item.latitude,
                item.longitude

            );


        if (
            distance <=
            collectionRadius
        ) {

            markBinCollected(
                item,
                truck
            );

        }

    });

}


// ============================================================
// 24. COLLECT WAYPOINT
// ============================================================

function collectWaypointBin(
    truck,
    position
) {

    if (!position) {
        return;
    }


    let nearestBin =
        null;


    let nearestDistance =
        Infinity;


    truck.assignedBins.forEach(
        item => {

            if (
                item.demoCollected ||
                item.status === "broken"
            ) {

                return;

            }


            const distance =
                distanceMeters(

                    position[0],
                    position[1],

                    item.latitude,
                    item.longitude

                );


            if (
                distance <
                nearestDistance
            ) {

                nearestDistance =
                    distance;

                nearestBin =
                    item;

            }

        }
    );


    // Waypoint được tạo từ chính điểm rác
    if (
        nearestBin &&
        nearestDistance <= 30
    ) {

        markBinCollected(
            nearestBin,
            truck
        );

    }

}


// ============================================================
// 25. MOVE TRUCK
// ============================================================

function moveTruck(
    truck,
    marker
) {

    if (
        !marker ||
        truck.route.length < 2
    ) {

        return;

    }


    // Xe đã đến cuối tuyến
    if (
        truck.segment >=
        truck.route.length - 1
    ) {

        marker.setLatLng(

            truck.route[
                truck.route.length - 1
            ]

        );


        return;

    }


    const current =
        truck.route[
            truck.segment
        ];


    const next =
        truck.route[
            truck.segment + 1
        ];


    const lat =

        current[0]

        +

        (
            next[0] -
            current[0]
        )

        * truck.progress;


    const lng =

        current[1]

        +

        (
            next[1] -
            current[1]
        )

        * truck.progress;


    marker.setLatLng(
        [lat, lng]
    );


    // Thu gom những điểm gần xe
    collectNearbyBins(
        truck,
        lat,
        lng
    );


    const segmentDistance =
        Math.max(

            100,

            distanceMeters(

                current[0],
                current[1],

                next[0],
                next[1]

            )

        );


    // Mỗi tick tương đương khoảng 25m ở 1x
    const movement =
        (
            25 /
            segmentDistance
        )

        *

        speedMultiplier;


    truck.progress +=
        movement;


    if (
        truck.progress >= 1
    ) {

        // Thu chính xác điểm ở cuối segment
        collectWaypointBin(
            truck,
            next
        );


        truck.segment++;


        truck.progress =
            0;


        // Đặt marker chính xác vào waypoint
        marker.setLatLng(
            next
        );


        if (
            truck.segment >=
            truck.route.length - 1
        ) {

            truck.segment =
                truck.route.length - 1;

        }

    }

}


// ============================================================
// 26. CHECK TRUCK FINISH
// ============================================================

function truckFinished(truck) {

    return (

        truck.route.length <= 1

        ||

        truck.segment >=
        truck.route.length - 1

    );

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

    if (running) {
        return;
    }


    if (
        allTrucksFinished()
    ) {

        simulationStatus.textContent =
            "✅ Đã hoàn thành. Nhấn Reset để chạy lại.";

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
        "✅ Hoàn thành các tuyến thu gom";


    updateStats();

    renderTruckList();

}


// ============================================================
// 31. RESET
// ============================================================

function resetSimulation() {

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
        "Sẵn sàng bắt đầu";


    updateStats();

    renderTruckList();

    updateClock();

}


// ============================================================
// 32. STATISTICS
// ============================================================

function updateStats() {

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
            trucks.length;

    }

}


// ============================================================
// 33. TRUCK DASHBOARD
// ============================================================

function renderTruckList() {

    if (!truckList) {
        return;
    }


    truckList.innerHTML =
        "";


    trucks.forEach(truck => {

        const denominator =
            Math.max(

                1,

                truck.route.length - 1

            );


        let routeProgress =

            (
                truck.segment +
                truck.progress
            )

            /

            denominator;


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
            "IDLE";


        if (finished) {

            status =
                "DONE";

        }

        else if (running) {

            status =
                "LIVE";

        }


        const displaySpeed =

            running &&
            !finished

                ? Math.round(
                    25 +
                    speedMultiplier * 2
                )

                : 0;


        const assigned =
            truck.assignedBins.length;


        const item =
            document.createElement(
                "div"
            );


        item.className =
            "truck-item";


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


            <div class="progress">

                <div
                    style="
                        width:${percent}%;
                        background:${truck.color};
                    "
                ></div>

            </div>

        `;


        truckList.appendChild(
            item
        );

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

                document
                    .querySelectorAll(
                        ".speed-btn"
                    )
                    .forEach(btn => {

                        btn.classList.remove(
                            "active"
                        );

                    });


                button.classList.add(
                    "active"
                );


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

    try {

        simulationStatus.textContent =
            "⏳ Đang tải dữ liệu...";


        // 1. Load 300 bins
        await loadBins();


        // 2. Generate 3 routes
        generateTruckRoutes();


        // 3. Draw routes
        createRoutes();


        // 4. Create trucks
        createTruckMarkers();


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
            "Sẵn sàng bắt đầu";


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

initialize();