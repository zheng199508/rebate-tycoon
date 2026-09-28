import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridMap } from '../src/game/grid';

test('BFS：沿障碍绕行，路径合法', () => {
  const m = new GridMap(10, 10);
  for (let y = 0; y < 3; y++) m.setBlocked(2, y);
  const path = m.bfsPath({ x: 0, y: 0 }, { x: 4, y: 2 });
  assert.ok(path);
  let cx = 0;
  let cy = 0;
  for (const t of path!) {
    assert.equal(Math.abs(t.x - cx) + Math.abs(t.y - cy), 1);
    assert.ok(!m.isBlocked(t.x, t.y));
    cx = t.x;
    cy = t.y;
  }
  assert.equal(cx, 4);
  assert.equal(cy, 2);
});

test('BFS：目标被围死返回 null', () => {
  const m = new GridMap(5, 5);
  m.setBlocked(2, 1);
  m.setBlocked(1, 2);
  m.setBlocked(3, 2);
  m.setBlocked(2, 3);
  assert.equal(m.bfsPath({ x: 0, y: 0 }, { x: 2, y: 2 }), null);
});

test('pathToAdjacent：点到被占人物时走到相邻格', () => {
  const m = new GridMap(5, 5);
  m.setBlocked(2, 2); // NPC
  const path = m.pathToAdjacent({ x: 0, y: 0 }, { x: 2, y: 2 });
  assert.ok(path && path.length > 0);
  const last = path[path.length - 1];
  assert.equal(Math.abs(last.x - 2) + Math.abs(last.y - 2), 1);
});
