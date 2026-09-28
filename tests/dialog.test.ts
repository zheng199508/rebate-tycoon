import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DialogMachine } from '../src/game/dialogmachine';

test('分页：未显示完先补全，再翻页，最后一页才关闭', () => {
  const d = new DialogMachine([
    { name: '村口大叔', text: '第一页。' },
    { name: '村口大叔', text: '第二页内容。' },
  ]);
  assert.equal(d.click(), 'complete'); // 第一次点击：补全
  assert.equal(d.shown, 4);
  assert.equal(d.click(), 'next'); // 第二次：翻页
  assert.equal(d.pageIndex, 1);
  assert.equal(d.click(), 'complete');
  assert.equal(d.click(), 'close'); // 最后一页：关闭
});

test('多句话必须分页（空页报错）', () => {
  assert.throws(() => new DialogMachine([]));
});
