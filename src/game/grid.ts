/** 网格地图：边界/障碍 + BFS 自动寻路（纯逻辑，不依赖 Phaser，可在 Node 测试） */

export interface Tile {
  x: number;
  y: number;
}

export class GridMap {
  private blockedSet = new Set<string>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  private key(x: number, y: number): string {
    return x + ',' + y;
  }

  setBlocked(x: number, y: number): void {
    this.blockedSet.add(this.key(x, y));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** 出界或被占 = 不可走 */
  isBlocked(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.blockedSet.has(this.key(x, y));
  }

  private neighbors(t: Tile): Tile[] {
    const out: Tile[] = [];
    if (!this.isBlocked(t.x, t.y - 1)) out.push({ x: t.x, y: t.y - 1 });
    if (!this.isBlocked(t.x - 1, t.y)) out.push({ x: t.x - 1, y: t.y });
    if (!this.isBlocked(t.x + 1, t.y)) out.push({ x: t.x + 1, y: t.y });
    if (!this.isBlocked(t.x, t.y + 1)) out.push({ x: t.x, y: t.y + 1 });
    return out;
  }

  /** BFS 最短路：返回从 from 到 to 的瓦片序列（不含 from，含 to）；不可达返回 null */
  bfsPath(from: Tile, to: Tile): Tile[] | null {
    if (from.x === to.x && from.y === to.y) return [];
    if (this.isBlocked(to.x, to.y)) return null;
    const prev = new Map<string, string>();
    const visited = new Set<string>([this.key(from.x, from.y)]);
    const queue: Tile[] = [from];
    const targetKey = this.key(to.x, to.y);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of this.neighbors(cur)) {
        const k = this.key(nb.x, nb.y);
        if (visited.has(k)) continue;
        visited.add(k);
        prev.set(k, this.key(cur.x, cur.y));
        if (k === targetKey) {
          // 回溯
          const path: Tile[] = [];
          let ck = targetKey;
          while (ck !== this.key(from.x, from.y)) {
            const [cx, cy] = ck.split(',').map(Number);
            path.unshift({ x: cx, y: cy });
            ck = prev.get(ck)!;
          }
          return path;
        }
        queue.push(nb);
      }
    }
    return null;
  }

  /** 点到人物/物件时：走到它相邻的可行走格 */
  pathToAdjacent(from: Tile, target: Tile): Tile[] | null {
    const candidates: Tile[] = [
      { x: target.x, y: target.y - 1 },
      { x: target.x - 1, y: target.y },
      { x: target.x + 1, y: target.y },
      { x: target.x, y: target.y + 1 },
    ];
    let best: Tile[] | null = null;
    for (const c of candidates) {
      if (this.isBlocked(c.x, c.y)) continue;
      const path = this.bfsPath(from, c);
      if (path && (best === null || path.length < best.length)) best = path;
    }
    return best;
  }
}
