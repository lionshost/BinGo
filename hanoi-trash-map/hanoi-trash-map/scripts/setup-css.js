import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const stylePath = path.join(rootDir, 'static', 'style.css');
let cssContent = fs.readFileSync(stylePath, 'utf8');

// Remove the old @import url(...) from cssContent so we have only one at top
cssContent = cssContent.replace("@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');", "");

const mapCentricStyles = `
/* ============================================================ */
/* MAP-CENTRIC COMMAND CENTER ARCHITECTURE                       */
/* ============================================================ */

html, body.map-centric-body {
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden !important;
    background: var(--canvas);
    font-family: 'Be Vietnam Pro', Arial, sans-serif;
}

.map-centric-app {
    height: 100vh;
    width: 100vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.command-topbar {
    height: 58px;
    min-height: 58px;
    max-height: 58px;
    flex-shrink: 0;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--line);
    background: #ffffff;
    z-index: 100;
}

.topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.toggle-sidebar-btn {
    width: 36px;
    height: 36px;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
}

.toggle-sidebar-btn:hover {
    background: #eef7f1;
    color: var(--green);
}

.compact-loc {
    min-width: auto;
    padding: 5px 10px;
    gap: 8px;
    border-radius: 10px;
}

.compact-loc strong {
    font-size: 11px;
}

.compact-loc small {
    font-size: 8.5px;
    margin-top: 1px;
}

.topbar-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
}

.stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    border-radius: 20px;
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
    transition: transform 0.15s;
}

.stat-pill:hover {
    transform: translateY(-1px);
}

.stat-pill .icon {
    width: 14px;
    height: 14px;
}

.stat-pill.mint {
    background: #e8f5ed;
    color: #166c50;
    border: 1px solid #c8ebd7;
}

.stat-pill.blue {
    background: #edf4fc;
    color: #1d4ed8;
    border: 1px solid #d0e2fb;
}

.stat-pill.peach {
    background: #fdf3e7;
    color: #b45309;
    border: 1px solid #fae2cc;
}

.stat-pill.lilac {
    background: #f4effd;
    color: #7e22ce;
    border: 1px solid #eddcfb;
}

.command-center-workspace {
    flex: 1;
    display: flex;
    position: relative;
    overflow: hidden;
    height: calc(100vh - 58px);
}

.sidebar-dock {
    width: 320px;
    min-width: 320px;
    max-width: 320px;
    height: 100%;
    background: #ffffff;
    border-right: 1px solid var(--line);
    overflow-y: auto;
    transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 60;
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.03);
    scrollbar-width: thin;
    scrollbar-color: #d6e6d8 transparent;
}

.sidebar-dock.collapsed {
    margin-left: -320px;
}

.sidebar-dock-inner {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.floating-sidebar-trigger {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 500;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: 0 4px 16px rgba(25, 61, 52, 0.12);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
    transition: transform 0.2s, background 0.2s;
}

.floating-sidebar-trigger:hover {
    background: #eef7f1;
    color: var(--green);
    transform: translateY(-1px);
}

.map-viewport {
    flex: 1;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: #edf2e9;
}

.command-map {
    width: 100% !important;
    height: 100% !important;
    z-index: 1;
}

.floating-filter-strip {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: rgba(255, 255, 255, 0.93);
    backdrop-filter: blur(12px);
    border: 1px solid var(--line);
    border-radius: 30px;
    box-shadow: 0 4px 20px rgba(25, 61, 52, 0.1);
}

.floating-map-tools {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.93);
    backdrop-filter: blur(12px);
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(25, 61, 52, 0.1);
}

.compact-search {
    width: 150px;
    height: 32px;
    padding: 0 8px;
    background: transparent;
    border: none;
}

.compact-search input {
    height: 30px;
    font-size: 10px;
}

.compact-select {
    height: 32px;
    font-size: 10px;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    max-width: 120px;
}

.floating-legend {
    position: absolute;
    bottom: 14px;
    right: 14px;
    z-index: 400;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.93);
    backdrop-filter: blur(10px);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 8.5px;
    color: var(--muted);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.floating-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

@media (max-width: 1024px) {
    .topbar-stats {
        display: none;
    }
    .compact-search {
        width: 110px;
    }
}

@media (max-width: 768px) {
    .sidebar-dock {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        box-shadow: 8px 0 30px rgba(0,0,0,0.15);
    }
    .floating-filter-strip {
        left: 14px;
        transform: none;
        max-width: calc(100% - 28px);
        overflow-x: auto;
    }
    .floating-map-tools {
        top: 60px;
        right: 14px;
    }
}
`;

const tailwindHeader = `@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: 'Be Vietnam Pro', Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* Brand Palette */
  --color-ink: #193d34;
  --color-muted: #70877e;
  --color-green: #178760;
  --color-deep: #116347;
  --color-line: #e4ece6;
  --color-surface: #ffffff;
  --color-canvas: #f6f8f4;

  /* Stat cards */
  --color-card-mint: #eaf6f0;
  --color-card-blue: #eaf1fb;
  --color-card-peach: #fdf1eb;
  --color-card-lilac: #f3eefb;
}

`;

const outDir = path.join(rootDir, 'src', 'styles');
fs.writeFileSync(path.join(outDir, 'main.css'), tailwindHeader + cssContent + mapCentricStyles, 'utf8');
console.log('src/styles/main.css generated with Map-Centric styles');
