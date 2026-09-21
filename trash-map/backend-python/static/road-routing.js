/* Shared geometry for the displayed road and the truck's movement. */
(function (root) {
    function distance(a, b) {
        const rad = Math.PI / 180;
        const h = Math.sin((b[0] - a[0]) * rad / 2) ** 2
            + Math.cos(a[0] * rad) * Math.cos(b[0] * rad)
            * Math.sin((b[1] - a[1]) * rad / 2) ** 2;
        return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
    }

    function bearing(a, b) {
        if (!a || !b) return 0;
        const rad = Math.PI / 180;
        const lat1 = a[0] * rad;
        const lat2 = b[0] * rad;
        const dLon = (b[1] - a[1]) * rad;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return 0;
        const deg = Math.atan2(y, x) * 180 / Math.PI;
        return (deg + 360) % 360;
    }

    function prepare(truck, data) {
        if (!Array.isArray(data.geometry) || !data.geometry.length
            || data.geometry.some(p => !Array.isArray(p) || p.length !== 2
                || !p.every(Number.isFinite) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)
            || !Array.isArray(data.stops) || data.stops.length !== truck.orderedBins.length) {
            throw new Error("Dữ liệu tuyến đường không hợp lệ.");
        }
        let previousIndex = 0;
        data.stops.forEach((stop, i) => {
            if (stop.bin_id !== truck.orderedBins[i].id || !Number.isInteger(stop.route_index)
                || stop.route_index < previousIndex || stop.route_index >= data.geometry.length
                || (i === 0 && stop.route_index !== 0)
                || (i === data.stops.length - 1 && stop.route_index !== data.geometry.length - 1)) {
            throw new Error("Điểm dừng không khớp với tuyến đường.");
            }
            previousIndex = stop.route_index;
        });
        truck.route = data.geometry;
        truck.stops = data.stops;
        truck.cumulative = [0];
        for (let i = 1; i < truck.route.length; i++) {
            truck.cumulative.push(truck.cumulative[i - 1] + distance(truck.route[i - 1], truck.route[i]));
        }
        truck.totalDistance = truck.cumulative.at(-1);
        reset(truck);
    }

    function reset(truck) {
        truck.segment = 0;
        truck.progress = 0;
        truck.distanceTravelled = 0;
        truck.nextStop = 0;
        truck.bearing = truck.route && truck.route.length >= 2 ? bearing(truck.route[0], truck.route[1]) : 0;
    }

    function advance(truck, meters) {
        if (!truck.route.length) return {position: null, reached: [], bearing: 0};
        truck.distanceTravelled = Math.min(truck.totalDistance, truck.distanceTravelled + Math.max(0, meters));
        while (truck.segment < truck.route.length - 1
            && truck.cumulative[truck.segment + 1] <= truck.distanceTravelled) {
            truck.segment++;
        }
        const current = truck.route[truck.segment];
        const next = truck.route[truck.segment + 1] || current;
        const length = (truck.cumulative[truck.segment + 1] || 0) - truck.cumulative[truck.segment];
        truck.progress = length > 0 ? (truck.distanceTravelled - truck.cumulative[truck.segment]) / length : 0;
        const position = current.map((value, i) => value + (next[i] - value) * truck.progress);
        
        let currentBearing = truck.bearing || 0;
        if (truck.route[truck.segment + 1]) {
            currentBearing = bearing(current, truck.route[truck.segment + 1]);
        } else if (truck.segment > 0) {
            currentBearing = bearing(truck.route[truck.segment - 1], current);
        }
        truck.bearing = currentBearing;

        const reached = [];
        while (truck.nextStop < truck.stops.length
            && truck.cumulative[truck.stops[truck.nextStop].route_index] <= truck.distanceTravelled) {
            reached.push(truck.orderedBins[truck.nextStop++]);
        }
        return {position, reached, bearing: currentBearing};
    }

    const api = {prepare, reset, advance, distance, bearing};
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.RoadRouting = api;
})(globalThis);
