const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RoadRouting = require('../static/road-routing.js');

function appFixture() {
    const elements = new Map();
    const element = () => ({value: '', checked: true, options: [{}], textContent: '',
        style: {setProperty() {}}, classList: {add() {}, remove() {}, toggle() {}}, addEventListener() {},
        appendChild() {}, setAttribute() {}, remove() {}});
    const layers = new Set();
    const map = {hasLayer: l => layers.has(l), removeLayer: l => layers.delete(l),
        invalidateSize() {}, setView() {}};
    function layer(position) {
        return {position, addTo() {layers.add(this); return this;},
            remove() {layers.delete(this);}, on() {}, bindPopup() {},
            setLatLng(p) {this.position = p;}, setIcon() {}, setPopupContent() {}};
    }
    const sandbox = {RoadRouting, AbortController, console: {log() {}, warn() {}, error() {}},
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
        document: {getElementById(id) {
            if (!elements.has(id)) {
                const node = element();
                if (id === 'mapConfig') node.textContent = JSON.stringify({tilemapKey:'test',routingConfigured:true});
                elements.set(id, node);
            }
            return elements.get(id);
        },
            querySelectorAll: () => [], createElement: element},
        L: {latLngBounds() {}, map: () => map, tileLayer: () => layer(),
            marker: layer, divIcon: () => ({}), polyline: layer},
        fetch: async () => {throw Error('unconfigured fetch');}};
    const context = vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
    vm.runInContext(source.replace(/initialize\(\);\s*$/, ''), context);
    const run = code => vm.runInContext(code, context);
    run(`
        mapReady = true;
        bins = ['a','b','c','d'].map((id, index) => ({id, latitude:21, longitude:105.8 + index/1000, status:'active'}));
        trucks.splice(2);
        trucks.forEach((truck, i) => {
            truck.assignedBins = bins.slice(i*2, i*2+2);
            truck.orderedBins = truck.assignedBins;
        });
    `);
    return {context, run, elements};
}

function response(ids, fail = false) {
    return {ok: !fail, json: async () => fail ? {error: 'offline'} : {
        geometry: [[21,105.8], [21,105.8001], [21.0001,105.8001]],
        stops: ids.map((id,i) => ({bin_id:id, route_index:i*2}))
    }};
}

test('missing tile key disables map and never requests road routes', async () => {
    const {run, elements} = appFixture();
    run('providerConfig.tilemapKey = ""; mapReady = false');
    assert.equal(await run('initializeVietmap()'), false);
    await run('loadRoadRoutes()');
    run('setRouteControls(false); startSimulation()');
    assert.equal(run('running'), false);
    assert.equal(elements.get('loadRoutesBtn').disabled, true);
    assert.equal(elements.get('map').inert, true);
});

test('page initialization does not spend routing quota', async () => {
    const {run, context} = appFixture();
    let calls = 0;
    context.fetch = async () => { calls++; throw Error('unexpected routing request'); };
    run(`
        loadBins = async () => {};
        generateTruckRoutes = () => {};
        fitMapToHanoi = () => {};
        initializeVietmap = async () => true;
    `);
    await run('initialize()');
    assert.equal(calls, 0);
});

test('missing services configuration prevents route requests', async () => {
    const {run, elements} = appFixture();
    run('providerConfig.routingConfigured = false');
    await run('loadRoadRoutes()');
    run('setRouteControls(false)');
    assert.equal(elements.get('loadRoutesBtn').disabled, true);
    assert.equal(run('trucks.some(t => t.routeStatus === "ready")'), false);
});

test('VIETMAP SDK load enables map; authentication failure blocks it again', async () => {
    const {run, context, elements} = appFixture();
    const handlers = {};
    context.L.vietmapGL = () => ({
        addTo() { return this; },
        getVietmapMap() { return {on(event, callback) { handlers[event] = callback; }}; }
    });
    const loading = run('initializeVietmap()');
    handlers.load();
    assert.equal(await loading, true);
    assert.equal(run('mapReady'), true);
    assert.equal(elements.get('mapPlaceholder').hidden, true);
    handlers.error({error:{status:403}});
    assert.equal(run('mapReady'), false);
    assert.equal(elements.get('mapPlaceholder').hidden, false);
    assert.equal(elements.get('startBtn').disabled, true);
});

test('failed first route keeps marker ownership, retry preserves other truck progress', async () => {
    const {context, run, elements} = appFixture();
    context.fetch = async (_, options) => {
        const ids = JSON.parse(options.body).bin_ids;
        return response(ids, ids[0] === 'a');
    };
    await run('loadRoadRoutes()');
    assert.equal(run('trucks[0].route.length'), 0);
    assert.equal(run('truckMarkers[0]'), undefined);
    assert.equal(run('truckMarkers[1].truck === trucks[1]'), true);
    assert.equal(elements.get('startBtn').disabled, false);
    assert.equal(elements.get('retryRoutesBtn').hidden, false);
    run('startSimulation(); simulationTick(); pauseSimulation()');
    const travelled = run('trucks[1].distanceTravelled');
    assert.ok(travelled > 0);
    assert.equal(run('bins[0].demoCollected'), undefined);
    assert.equal(run('bins[2].collectedBy === trucks[1].id'), true);
    run('simulationTick()');
    assert.equal(run('trucks[1].distanceTravelled'), travelled);
    context.fetch = async (_, options) => response(JSON.parse(options.body).bin_ids);
    await run('loadRoadRoutes(true)');
    assert.equal(run('trucks[0].routeStatus'), 'ready');
    assert.equal(run('trucks[1].distanceTravelled'), travelled);
    assert.equal(elements.get('retryRoutesBtn').hidden, true);
    run('startSimulation(); speedMultiplier = 10; simulationTick()');
    assert.equal(run('bins.every(b => b.demoCollected)'), true);
    assert.equal(run('running'), false);
    run('resetSimulation()');
    assert.equal(run('bins.some(b => b.demoCollected)'), false);
    assert.equal(run('trucks.some(t => t.distanceTravelled !== 0)'), false);
});

test('loading and all-failed states prevent starting without road geometry', async () => {
    const {context, run, elements} = appFixture();
    run('setRouteControls(true); startSimulation()');
    assert.equal(run('running'), false);
    assert.equal(elements.get('startBtn').disabled, true);
    context.fetch = async (_, options) => response(JSON.parse(options.body).bin_ids, true);
    await run('loadRoadRoutes()');
    run('startSimulation()');
    assert.equal(run('running'), false);
    assert.equal(elements.get('startBtn').disabled, true);
    assert.equal(elements.get('retryRoutesBtn').hidden, false);
    assert.equal(run('routeLayers.length'), 0);
    assert.equal(run('truckMarkers.length'), 0);
});
