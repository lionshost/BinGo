// Chạy: npm test (Node ≥ 22.6 tự bỏ kiểu TypeScript).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distanceM, formatDistance, matchesFilter, normalize, planNearestRoute, type Bin, type BinStatus } from '../src/lib/bins.ts';

const bin = (id: string, lat: number, status: BinStatus = 'full'): Bin => ({
  id, name: id, latitude: lat, longitude: 105.8, status, district: 'Đống Đa', type: '', recyclable: false, address: 'Đường Láng', updated: '',
});

test('normalize bỏ dấu tiếng Việt', () => {
  assert.equal(normalize('Hoàn Kiếm'), 'hoan kiem');
  assert.equal(normalize('Đống Đa'), 'dong da');
});

test('distanceM và formatDistance', () => {
  const d = distanceM({ lat: 21, lon: 105.8 }, { lat: 21.01, lon: 105.8 });
  assert.ok(Math.abs(d - 1112) < 5, String(d));
  assert.equal(formatDistance(1112), '1.1 km');
  assert.equal(formatDistance(234), '230 m');
});

test('planNearestRoute chỉ lấy điểm đầy/tràn chưa thu, theo thứ tự gần nhất', () => {
  const bins = [bin('A', 21.001), bin('B', 21.003), bin('C', 21.002, 'active'), bin('D', 21.002, 'broken'), bin('E', 21.005, 'overloaded')];
  const start = { lat: 21, lon: 105.8 };
  assert.deepEqual(planNearestRoute(bins, {}, start, 5).map(b => b.id), ['A', 'B', 'E']);
  assert.deepEqual(planNearestRoute(bins, { B: 1 }, start, 2).map(b => b.id), ['A', 'E']);
});

test('matchesFilter: bộ lọc + tìm không dấu', () => {
  const b = bin('HN-0001', 21);
  assert.ok(matchesFilter(b, 'priority', '', {}));
  assert.ok(!matchesFilter(b, 'priority', '', { 'HN-0001': 1 }));
  assert.ok(matchesFilter(b, 'collected', '', { 'HN-0001': 1 }));
  assert.ok(matchesFilter(b, 'all', normalize('dong da'), {}));
  assert.ok(!matchesFilter(b, 'all', 'hoan kiem', {}));
});
