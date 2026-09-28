import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, writeSave, ensureGame, SAVE_KEY, type SaveData, type KVStorage } from '../src/game/save';

function mem(): KVStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('存档重读：位置与已完成标记不变', () => {
  const s = mem();
  const sv = defaultSave('测试');
  sv.x = 25;
  sv.y = 9;
  sv.flags.talkedElder = true;
  writeSave(sv, s);
  const back = loadSave(s)!;
  assert.equal(back.x, 25);
  assert.equal(back.y, 9);
  assert.equal(back.flags.talkedElder, true);
  assert.equal(back.playerName, '测试');
});

test('无存档返回 null；坏档返回 null', () => {
  const s = mem();
  assert.equal(loadSave(s), null);
  s.setItem(SAVE_KEY, '{{{bad');
  assert.equal(loadSave(s), null);
});

test('存档迁移：旧档无 game 字段，补全后旧字段无损', () => {
  const old = { version: 1, playerName: '阿强', x: 5, y: 6, dir: 'up', flags: { seen: true } } as unknown as SaveData;
  const g = ensureGame(old);
  assert.equal(old.playerName, '阿强');
  assert.equal(old.x, 5);
  assert.equal(old.flags.seen, true);
  assert.equal(g.money, 5000);
});

test('迁移幂等：重复 ensureGame 不覆盖进度、不重复发东西', () => {
  const sv = defaultSave('阿强');
  ensureGame(sv);
  sv.game!.money = 999;
  ensureGame(sv);
  ensureGame(sv);
  assert.equal(sv.game!.money, 999);
  assert.equal(sv.game!.ledger.length, 0);
});

test('旧档含 pending：读档回滚一次，重复读档不重复退钱', () => {
  const sv = defaultSave('阿强');
  sv.game!.money = 4982;
  sv.game!.pendingTx = { itemId: 'tea', spend: 18 };
  ensureGame(sv);
  assert.equal(sv.game!.money, 5000);
  assert.equal(sv.game!.pendingTx, null);
  ensureGame(sv);
  assert.equal(sv.game!.money, 5000);
});
