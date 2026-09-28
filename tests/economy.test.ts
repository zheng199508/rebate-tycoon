import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEMS,
  REBATE_MULTIPLIER,
  freshGame,
  beginPurchase,
  settlePurchase,
  recoverPending,
  type GameState,
} from '../src/game/economy.ts';

function newGame(): GameState {
  return freshGame();
}

test('成功产出：买奶茶 → 扣款 → 固定百倍到账 → 任务与技能点', () => {
  const s = newGame();
  assert.equal(REBATE_MULTIPLIER, 100);
  const ok = beginPurchase(s, 'tea');
  assert.equal(ok.ok, true);
  assert.equal(s.money, 5000 - ITEMS.tea.price);
  const r = settlePurchase(s);
  assert.equal(r.multiplier, 100);
  assert.equal(r.gain, 18 * 100);
  assert.equal(s.money, 4982 + 1800); // 6782
  assert.equal(s.owned.tea, 1);
  assert.equal(s.ledger.length, 1);
  assert.equal(s.tasksDone.firstSpend, true);
  assert.equal(s.skills.cooking, 1); // 任务直接奖励厨艺
});

test('失败：余额不足，不扣钱并给出原因', () => {
  const s = newGame();
  s.money = 0;
  const before = s.money;
  const r = beginPurchase(s, 'phone');
  assert.equal(r.ok, false);
  assert.match(r.reason, /余额不足/);
  assert.equal(s.money, before);
  assert.equal(s.pendingTx, null);
});

test('失败：重复购买同一件直接拒绝', () => {
  const s = newGame();
  assert.equal(beginPurchase(s, 'tea').ok, true);
  settlePurchase(s);
  const again = beginPurchase(s, 'tea');
  assert.equal(again.ok, false);
  assert.match(again.reason, /买过/);
});

test('连点防重复：结算中第二次点击被拒，只扣一次钱', () => {
  const s = newGame();
  const first = beginPurchase(s, 'tea');
  assert.equal(first.ok, true);
  const second = beginPurchase(s, 'tea');
  assert.equal(second.ok, false);
  assert.match(second.reason, /正在结算/);
  settlePurchase(s);
  assert.equal(s.ledger.length, 1);
});

test('中途存档：pending 读档回滚，钱退回不丢不重', () => {
  const s = newGame();
  beginPurchase(s, 'tea');
  assert.equal(s.money, 4982);
  recoverPending(s);
  assert.equal(s.money, 5000);
  assert.equal(s.pendingTx, null);
  assert.equal(s.owned.tea ?? 0, 0);
  assert.equal(beginPurchase(s, 'tea').ok, true);
  settlePurchase(s);
  assert.equal(s.owned.tea, 1);
  assert.equal(s.ledger.length, 1);
});

test('confirmed 不重复发奖：结算后再结算抛错', () => {
  const s = newGame();
  beginPurchase(s, 'tea');
  settlePurchase(s);
  assert.throws(() => settlePurchase(s));
});

test('技能：任务直接解锁，未解锁前不显示', () => {
  const s = newGame();
  assert.equal(s.skills.cooking, 0);
  beginPurchase(s, 'tea');
  settlePurchase(s);
  assert.equal(s.skills.cooking, 1);
  assert.equal(s.skills.fitness, 0); // 下一个任务还没完成
});

test('数值链复算：奶茶→手机→买房全程可走通', () => {
  const s = newGame();
  beginPurchase(s, 'tea');
  settlePurchase(s);
  assert.equal(s.money, 6782);
  beginPurchase(s, 'phone');
  const r = settlePurchase(s);
  assert.equal(r.multiplier, 100);
  assert.equal(s.money, 6782 - 5999 + 599900); // 600683
  const house = beginPurchase(s, 'house');
  assert.equal(house.ok, true);
  settlePurchase(s);
  assert.equal(s.owned.house, 1);
  assert.equal(s.tasksDone.settle, true);
  assert.ok(s.money > 0);
});
