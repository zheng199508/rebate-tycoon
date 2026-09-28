import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepController } from '../src/game/steps';

function make() {
  const ends: { x: number; y: number }[] = [];
  let bumps = 0;
  const ctrl = new StepController(
    0, 0,
    (x, y) => x < 0 || y < 0 || x > 4, // 可行走 x: 0..4
    {
      onStepEnd: (to) => ends.push(to),
      onBump: () => { bumps++; },
    },
  );
  return { ctrl, ends, getBumps: () => bumps };
}

test('快速轻点（110ms）准确走一格', () => {
  const { ctrl, ends } = make();
  ctrl.press('right');
  ctrl.update(20);
  ctrl.release('right');
  ctrl.update(90);
  assert.equal(ctrl.x, 1);
  assert.equal(ends.length, 1);
});

test('按住连续走，每格约 100ms', () => {
  const { ctrl } = make();
  ctrl.press('right');
  ctrl.update(350);
  assert.equal(ctrl.x, 3); // 100/200/300 各走一格，第 4 格在途
});

test('松开立即停：当前格走完即停，不多走', () => {
  const { ctrl } = make();
  ctrl.press('right');
  ctrl.update(350);
  ctrl.release('right');
  ctrl.update(500);
  assert.equal(ctrl.x, 4); // 第 4 格走完即停
});

test('撞墙不穿模并触发 bump 反馈', () => {
  const { ctrl, getBumps } = make();
  ctrl.press('right');
  ctrl.update(1000);
  assert.equal(ctrl.x, 4);
  assert.ok(getBumps() > 0);
});
