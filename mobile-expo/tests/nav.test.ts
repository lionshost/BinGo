// Chạy: npm test (Node ≥ 22.6 tự bỏ kiểu TypeScript).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { navProgress, type NavStep } from '../src/lib/nav.ts';

// Tuyến chữ L: đi lên phía bắc ~222 m, rồi rẽ phải sang đông ~208 m.
const geometry: [number, number][] = [[21.0, 105.8], [21.001, 105.8], [21.002, 105.8], [21.002, 105.801], [21.002, 105.802]];
const steps: NavStep[] = [
  { text: 'tiếp tục', sign: 0, index: 0 },
  { text: 'rẽ phải vào Láng', sign: 2, index: 2 },
  { text: 'Kết thúc!', sign: 4, index: 4 },
];

test('navProgress: trên tuyến, bước sắp tới là điểm rẽ phải', () => {
  const p = navProgress(geometry, steps, { lat: 21.0005, lon: 105.8 });
  assert.ok(p.offRouteM < 1);
  assert.equal(p.nextStep?.sign, 2);
  assert.ok(Math.abs(p.toNextM - 167) < 3, `toNextM=${p.toNextM}`);
  assert.ok(Math.abs(p.remainingM - 375) < 5, `remainingM=${p.remainingM}`);
  assert.equal(p.arrived, false);
});

test('navProgress: qua điểm rẽ thì chỉ còn tới đích', () => {
  const p = navProgress(geometry, steps, { lat: 21.002, lon: 105.8015 });
  assert.equal(p.nextStep, null);
  assert.ok(Math.abs(p.toNextM - p.remainingM) < 0.01);
});

test('navProgress: lệch tuyến và tới đích', () => {
  assert.ok(navProgress(geometry, steps, { lat: 21.001, lon: 105.801 }).offRouteM > 90);
  assert.equal(navProgress(geometry, steps, { lat: 21.002, lon: 105.80195 }).arrived, true);
});
