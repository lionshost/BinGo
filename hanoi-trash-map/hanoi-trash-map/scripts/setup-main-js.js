import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const appJsPath = path.join(rootDir, 'static', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Replace mapConfig reading with dynamic resolver
const configPattern = 'const providerConfig = JSON.parse(document.getElementById("mapConfig").textContent);';
const newConfigResolver = `import RoadRouting from './road-routing.js';

let providerConfig = { provider: "vietmap", tilemapKey: "", routingConfigured: false, vehicle: "car" };
const mapConfigEl = document.getElementById("mapConfig");
if (mapConfigEl && mapConfigEl.textContent.trim()) {
    try {
        providerConfig = JSON.parse(mapConfigEl.textContent);
    } catch (e) {
        console.warn("Failed to parse inline mapConfig, will fetch from /api/map-config", e);
    }
}

async function ensureProviderConfig() {
    if (!providerConfig.tilemapKey) {
        try {
            const res = await fetch("/api/map-config");
            if (res.ok) {
                const data = await res.json();
                providerConfig = { ...providerConfig, ...data };
            }
        } catch (e) {
            console.warn("Could not fetch /api/map-config", e);
        }
    }

    if (providerConfig.tilemapKey && typeof window !== "undefined") {
        if (!window.vietmapgl) {
            await new Promise((resolve) => {
                const s = document.createElement("script");
                s.src = "https://unpkg.com/@vietmap/vietmap-gl-js@6/dist/vietmap-gl.js";
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            });
        }
        if (window.L && !window.L.vietmapGL) {
            await new Promise((resolve) => {
                const s = document.createElement("script");
                s.src = "https://unpkg.com/@vietmap/vietmap-gl-leaflet/leaflet-vietmap-gl.js";
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            });
        }
    }
}
`;

appJs = appJs.replace(configPattern, newConfigResolver);

// Ensure ensureProviderConfig is called inside initialize()
appJs = appJs.replace('async function initialize() {', 'async function initialize() {\n    await ensureProviderConfig();');

// Sidebar toggle logic
const sidebarToggleHandlers = `
// ============================================================
// MAP-CENTRIC SIDEBAR DOCK CONTROLS
// ============================================================
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const floatingSidebarTrigger = document.getElementById("floatingSidebarTrigger");
const sidebarDock = document.getElementById("sidebarDock");

function setSidebarCollapsed(collapsed) {
    if (!sidebarDock) return;
    sidebarDock.classList.toggle("collapsed", collapsed);
    if (floatingSidebarTrigger) {
        floatingSidebarTrigger.hidden = !collapsed;
    }
    setTimeout(() => { if (typeof map !== "undefined" && map) map.invalidateSize(); }, 120);
    setTimeout(() => { if (typeof map !== "undefined" && map) map.invalidateSize(); }, 360);
}

if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener("click", () => {
        const isCollapsed = sidebarDock && sidebarDock.classList.contains("collapsed");
        setSidebarCollapsed(!isCollapsed);
    });
}

if (floatingSidebarTrigger) {
    floatingSidebarTrigger.addEventListener("click", () => {
        setSidebarCollapsed(false);
    });
}
`;

appJs += '\n' + sidebarToggleHandlers;

const outPath = path.join(rootDir, 'src', 'js', 'main.js');
fs.writeFileSync(outPath, appJs, 'utf8');
console.log('Successfully generated src/js/main.js with Map-Centric sidebar controls');
