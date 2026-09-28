/** 存档：与浏览器缓存（Cache Storage）分开，存 localStorage；抽象存储便于测试 */
import type { Dir } from './steps';
import { freshGame, recoverPending, type GameState } from './economy';

export interface SaveData {
  version: 1;
  playerName: string;
  x: number;
  y: number;
  dir: Dir;
  flags: Record<string, boolean>;
  /** 阶段3 起的游戏状态；旧存档没有该字段，读档时补全新档 */
  game?: GameState;
}

export interface KVStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const SAVE_KEY = 'pxad_save_v1';

export function defaultSave(playerName: string): SaveData {
  return {
    version: 1,
    playerName,
    x: 19,
    y: 15,
    dir: 'down',
    flags: {},
    game: freshGame(),
  };
}

function browserStorage(): KVStorage {
  const g = globalThis as unknown as { localStorage?: Storage };
  if (g.localStorage) return g.localStorage;
  throw new Error('当前环境无 localStorage');
}

export function loadSave(storage?: KVStorage): SaveData | null {
  const s = storage ?? browserStorage();
  const raw = s.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1 || typeof data.x !== 'number' || typeof data.y !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** 读档后补齐游戏状态；中途未结算的 pending 事务回滚（物品不丢不重） */
export function ensureGame(save: SaveData): GameState {
  if (!save.game) {
    save.game = freshGame();
  }
  recoverPending(save.game);
  return save.game;
}

export function writeSave(data: SaveData, storage?: KVStorage): void {
  const s = storage ?? browserStorage();
  s.setItem(SAVE_KEY, JSON.stringify(data));
}

export function clearSave(storage?: KVStorage): void {
  const s = storage ?? browserStorage();
  s.removeItem(SAVE_KEY);
}
