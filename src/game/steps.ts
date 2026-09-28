/** 宝可梦式逐格移动控制器（纯逻辑，可在 Node 测试）：
 * - 快速轻点 80~120ms 必须准确走一格；
 * - 按住连续行走，每格约 100ms；松开立即停（当前格走完即停）；
 * - 撞墙不穿模（由 isBlocked 判定），上层做 ~50ms 回弹反馈。
 */
import type { Tile } from './grid';

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DELTAS: Record<Dir, { dx: number; dy: number; row: number }> = {
  down: { dx: 0, dy: 1, row: 0 },
  left: { dx: -1, dy: 0, row: 1 },
  right: { dx: 1, dy: 0, row: 2 },
  up: { dx: 0, dy: -1, row: 3 },
};

export interface StepEvents {
  onStepStart?(from: Tile, to: Tile, dir: Dir): void;
  onStepEnd?(to: Tile, dir: Dir): void;
  onBump?(at: Tile, dir: Dir): void;
}

export class StepController {
  static readonly STEP_MS = 100;

  moving = false;
  pendingDir: Dir | null = null;

  private held = new Set<Dir>();
  private elapsed = 0;

  constructor(
    public x: number,
    public y: number,
    private readonly blocked: (x: number, y: number) => boolean,
    private readonly ev: StepEvents,
  ) {}

  press(dir: Dir): void {
    if (this.held.has(dir)) return;
    this.held.add(dir);
    if (!this.moving) this.tryStart();
  }

  release(dir: Dir): void {
    this.held.delete(dir);
  }

  releaseAll(): void {
    this.held.clear();
  }

  private tryStart(): void {
    if (this.moving) return;
    let dir: Dir | null = null;
    this.held.forEach((d) => { dir = d; });
    if (!dir) return;
    const d = dir as Dir;
    const nx = this.x + DELTAS[d].dx;
    const ny = this.y + DELTAS[d].dy;
    if (this.blocked(nx, ny)) {
      this.ev.onBump?.({ x: this.x, y: this.y }, d);
      return;
    }
    this.moving = true;
    this.pendingDir = d;
    this.elapsed = 0;
    this.ev.onStepStart?.({ x: this.x, y: this.y }, { x: nx, y: ny }, d);
  }

  update(dt: number): void {
    if (!this.moving) return;
    this.elapsed += dt;
    // 一个 update 帧内补时：按住连续走时每格约 100ms，走完即接下一格
    while (this.moving && this.pendingDir && this.elapsed >= StepController.STEP_MS) {
      this.elapsed -= StepController.STEP_MS;
      const d = this.pendingDir;
      this.x += DELTAS[d].dx;
      this.y += DELTAS[d].dy;
      this.moving = false;
      this.pendingDir = null;
      this.ev.onStepEnd?.({ x: this.x, y: this.y }, d);
      if (this.held.size === 0) break;
      // 仍按住：保留剩余时间立刻接下一格
      const nd = [...this.held].pop()!;
      const nx = this.x + DELTAS[nd].dx;
      const ny = this.y + DELTAS[nd].dy;
      if (this.blocked(nx, ny)) {
        this.elapsed = 0;
        this.ev.onBump?.({ x: this.x, y: this.y }, nd);
        break;
      }
      this.pendingDir = nd;
      this.moving = true;
      this.ev.onStepStart?.({ x: this.x, y: this.y }, { x: nx, y: ny }, nd);
    }
  }
}
