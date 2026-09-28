/** 返利系统核心经济逻辑（纯函数，不依赖 Phaser，可在 Node 测试）。
 * 事务规则：beginPurchase 扣款并写 pending → settlePurchase 揭晓到账 → pending=null。
 * 中途断电/读档：pending 按未到账回滚扣款，confirmed 不重复发（物品不丢不重）。
 */

export type ItemId = 'tea' | 'phone' | 'house';

export interface ItemDef {
  name: string;
  price: number;
  once: true;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  tea: { name: '珍珠奶茶', price: 18, once: true },
  phone: { name: '旗舰手机', price: 5999, once: true },
  house: { name: '房子钥匙', price: 50000, once: true },
};

export type SkillKey = 'cooking' | 'singing' | 'fitness';

export const SKILL_NAMES: Record<SkillKey, string> = {
  cooking: '厨艺',
  singing: '歌技',
  fitness: '体能',
};

export interface LedgerEntry {
  label: string;
  spend: number;
  multiplier: number;
  gain: number;
}

export interface GameState {
  money: number;
  owned: Partial<Record<ItemId, number>>;
  skills: Record<SkillKey, number>;
  ledger: LedgerEntry[];
  tasksDone: Record<string, boolean>;
  pendingTx: { itemId: ItemId; spend: number } | null;
  flags: Record<string, boolean>;
  map: 'cafe' | 'street' | 'house';
}

export function freshGame(): GameState {
  return {
    money: 5000,
    owned: {},
    skills: { cooking: 0, singing: 0, fitness: 0 },
    ledger: [],
    tasksDone: {},
    pendingTx: null,
    flags: {},
    map: 'cafe',
  };
}

/** 返利固定百倍（用户拍板）。 */
export const REBATE_MULTIPLIER = 100;

export interface OpResult {
  ok: boolean;
  reason: string;
}

/** 事务开始：扣钱 + 写 pending。失败时不扣钱、给出原因。 */
export function beginPurchase(s: GameState, item: ItemId): OpResult {
  if (s.pendingTx) return { ok: false, reason: '正在结算，请稍候' };
  const def = ITEMS[item];
  if ((s.owned[item] ?? 0) >= 1) return { ok: false, reason: '这件已经买过了' };
  if (s.money < def.price) return { ok: false, reason: `余额不足（需 ¥${def.price}，你只有 ¥${s.money}）` };
  s.money -= def.price;
  s.pendingTx = { itemId: item, spend: def.price };
  return { ok: true, reason: '' };
}

/** 事务结算：固定百倍返利到账 + 任务结算。 */
export function settlePurchase(
  s: GameState,
): { multiplier: number; gain: number; newTasks: string[] } {
  if (!s.pendingTx) throw new Error('没有待结算的交易');
  const { itemId, spend } = s.pendingTx;
  const multiplier = REBATE_MULTIPLIER;
  const gain = spend * multiplier;
  s.money += gain;
  s.owned[itemId] = (s.owned[itemId] ?? 0) + 1;
  s.ledger.unshift({ label: ITEMS[itemId].name, spend, multiplier, gain });
  s.pendingTx = null;
  const newTasks = checkTasks(s);
  return { multiplier, gain, newTasks };
}

/** 读档恢复：未到账的 pending 退款回滚（防刷）。 */
export function recoverPending(s: GameState): void {
  if (s.pendingTx) {
    s.money += s.pendingTx.spend;
    s.pendingTx = null;
  }
}

const TASK_DEFS: { id: string; name: string; reward: SkillKey; done: (s: GameState) => boolean }[] = [
  { id: 'firstSpend', name: '第一次消费（奶茶店）', reward: 'cooking', done: (s) => s.ledger.length > 0 },
  { id: 'firstBuck', name: '第一桶金（手机店）', reward: 'fitness', done: (s) => s.ledger.some((e) => e.gain >= 10000) },
  { id: 'settle', name: '安家（售楼处买房）', reward: 'singing', done: (s) => (s.owned.house ?? 0) > 0 },
];

export function taskName(id: string): string {
  return TASK_DEFS.find((t) => t.id === id)?.name ?? id;
}

export function taskReward(id: string): SkillKey | null {
  return TASK_DEFS.find((t) => t.id === id)?.reward ?? null;
}

/** 任务直接奖励指定技能，不发自由属性点 */
function checkTasks(s: GameState): string[] {
  const newly: string[] = [];
  for (const t of TASK_DEFS) {
    if (t.done(s) && !s.tasksDone[t.id]) {
      s.tasksDone[t.id] = true;
      s.skills[t.reward] += 1;
      newly.push(t.id);
    }
  }
  return newly;
}
