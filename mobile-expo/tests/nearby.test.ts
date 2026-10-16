import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alertMessage, fmtDistance, newlyArrived, type NearbyTruck } from '../src/lib/nearby.ts';

const truck = (id: string, distance: number): NearbyTruck => ({
  id, name: `Xe ${id}`, color: null, lat: 21, lon: 105, distance, etaMinutes: 2,
});

test('chỉ báo xe mới vào bán kính', () => {
  const known = new Set(['A']);
  const fresh = newlyArrived(known, [truck('A', 100), truck('B', 200)]);
  assert.deepEqual(fresh.map(t => t.id), ['B']);
  assert.equal(newlyArrived(new Set(), []).length, 0);
});

test('định dạng khoảng cách và nội dung thông báo', () => {
  assert.equal(fmtDistance(250), '250 m');
  assert.equal(fmtDistance(1500), '1.5 km');
  assert.match(alertMessage(truck('B', 320)), /Xe B cách bạn 320 m \(~2 phút\)/);
});
