/** 世界场景：商业街 + 房子室内两张地图；走路/对话复用底座；接入返利系统切片 */
import Phaser from 'phaser';
import { GridMap } from './grid';
import { StepController, DELTAS, type Dir } from './steps';
import { DialogMachine } from './dialogmachine';
import { getCharacter, getByAvatar } from './registry';
import { writeSave, ensureGame, type SaveData } from './save';
import * as art from './sprites';
import {
  ITEMS,
  SKILL_NAMES,
  beginPurchase,
  settlePurchase,
  taskName,
  taskReward,
  type GameState,
  type ItemId,
  type SkillKey,
} from './economy';
import {
  sfx, speak, duckMusic, unlockAudio,
} from './audio';

const TILE = 16;
const STREET_W = 40;
const STREET_H = 20;
const CAFE_W = 14;
const CAFE_H = 10;
const HOUSE_W = 16;
const HOUSE_H = 12;

interface ShopDef {
  id: 'tea' | 'phone' | 'real' | 'car';
  x: number; y: number; w: number; h: number;
  label: string; color: number;
  door: { x: number; y: number };
  npc: string | null;
  npcAt: { x: number; y: number } | null;
}

const SHOPS: ShopDef[] = [
  { id: 'tea', x: 0, y: 2, w: 9, h: 9, label: '奶茶店', color: 0xc97b4a, door: { x: 4, y: 11 }, npc: 'xiaxia', npcAt: { x: 4, y: 13 } },
  { id: 'phone', x: 9, y: 2, w: 8, h: 9, label: '手机店', color: 0x4a6fa5, door: { x: 13, y: 11 }, npc: 'linlin', npcAt: { x: 13, y: 13 } },
  { id: 'real', x: 17, y: 2, w: 8, h: 9, label: '售楼处', color: 0x5a8a5a, door: { x: 21, y: 11 }, npc: 'xiaozhu', npcAt: { x: 21, y: 13 } },
  { id: 'car', x: 25, y: 2, w: 9, h: 9, label: '4S车行', color: 0x555a66, door: { x: 29, y: 11 }, npc: null, npcAt: null },
];

const CAFE_EXIT = { x: 7, y: 8 };
const HOME_DOOR = { x: 37, y: 15 };
const HOUSE_DOOR = { x: 8, y: 10 };
const TASK_IDS = ['firstSpend', 'firstBuck', 'settle'];
const SKILL_KEYS: SkillKey[] = ['cooking', 'singing', 'fitness'];

export class WorldScene extends Phaser.Scene {
  private save!: SaveData;
  private g!: GameState;
  private map!: GridMap;
  private controller!: StepController;
  private player!: Phaser.GameObjects.Sprite;
  private dir: Dir = 'down';
  private pathQueue: { x: number; y: number }[] = [];
  private pendingAction: string | null = null;
  private dialogMachine: DialogMachine | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private guideMarker?: Phaser.GameObjects.Star;
  private liuSprite?: Phaser.GameObjects.Sprite;
  private liuLeft = false;
  private busy = false; // 揭晓动画期间锁输入
  private interactCooldown = new Set<string>(); // 刚交互过的店，离开前不再自动触发
  private sysTab: 'ledger' | 'tasks' | 'skills' = 'ledger';

  private elDialog!: HTMLElement;
  private elDialogName!: HTMLElement;
  private elDialogAvatar!: HTMLImageElement;
  private elDialogText!: HTMLElement;
  private elObjective!: HTMLElement;
  private elMoney!: HTMLElement;
  private elTip!: HTMLElement;

  constructor() {
    super('world');
  }

  preload(): void {
    this.load.image('bg-street', 'assets/bg-street.jpg');
    this.load.image('bg-cafe', 'assets/bg-cafe.jpg');
    this.load.image('bg-house', 'assets/bg-house.jpg');
  }

  init(data: { save?: SaveData }): void {
    this.save = data.save ?? { version: 1, playerName: '旅人', x: 19, y: 15, dir: 'down', flags: {} };
    this.g = ensureGame(this.save);
  }

  create(): void {
    // —— 程序化素材 ——
    this.textures.addCanvas('t-ground', art.makeTileGround());
    this.textures.addCanvas('t-floor', art.makeFloorTile());
    this.textures.addCanvas('t-wall', art.makeTileWall());
    this.textures.addCanvas('player-sheet', art.makePlayerSheet());
    this.textures.addCanvas('liu-sheet', art.makeLiuSheet());
    this.textures.addCanvas('xia-sheet', art.makeXiaSheet());
    this.textures.addCanvas('linlin-sheet', art.makeClerkSheet('#3b6ea5', '#2e3a55'));
    this.textures.addCanvas('xiaozhu-sheet', art.makeClerkSheet('#3f8a5a', '#2e4a35'));
    for (const key of ['player-sheet', 'liu-sheet', 'xia-sheet', 'linlin-sheet', 'xiaozhu-sheet']) {
      const tex = this.textures.get(key);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          tex.add(String(row * 3 + col), 0, col * 48, row * 48, 48, 48);
        }
      }
    }
    (this.game as unknown as { avatarURL: Record<string, string> }).avatarURL = {
      'avatar-player': 'assets/av-player.jpg',
      'avatar-liu': 'assets/av-liu.jpg',
      'avatar-xia': 'assets/av-xia.jpg',
      'avatar-linlin': 'assets/av-linlin.jpg',
      'avatar-xiaozhu': 'assets/av-xiaozhu.jpg',
    };

    const q = new URLSearchParams(location.search);
    const mode: 'cafe' | 'street' | 'house' =
      q.get('state') === 'cafe' ? 'cafe'
      : q.get('state') === 'house' ? 'house'
      : q.get('state') === 'street' ? 'street'
      : this.g.map;
    const inHouse = mode === 'house';
    const inCafe = mode === 'cafe';
    const W = inHouse ? HOUSE_W : inCafe ? CAFE_W : STREET_W;
    const H = inHouse ? HOUSE_H : inCafe ? CAFE_H : STREET_H;

    // —— 地图与碰撞 ——
    this.map = new GridMap(W, H);
    for (let x = 0; x < W; x++) { this.map.setBlocked(x, 0); this.map.setBlocked(x, H - 1); }
    for (let y = 0; y < H; y++) { this.map.setBlocked(0, y); this.map.setBlocked(W - 1, y); }

    if (mode === 'street') {
      for (const s of SHOPS) {
        for (let y = s.y; y < s.y + s.h; y++) {
          for (let x = s.x; x < s.x + s.w; x++) this.map.setBlocked(x, y);
        }
      }
      for (const s of SHOPS) {
        if (s.npcAt) this.map.setBlocked(s.npcAt.x, s.npcAt.y);
      }
    } else if (inCafe) {
      // 咖啡厅：两张桌子，柳如烟坐在对面
      for (let x = 5; x <= 8; x++) for (let y = 4; y <= 5; y++) this.map.setBlocked(x, y);
    } else {
      for (let x = 3; x <= 5; x++) for (let y = 3; y <= 4; y++) this.map.setBlocked(x, y);
      for (let x = 10; x <= 12; x++) for (let y = 4; y <= 5; y++) this.map.setBlocked(x, y);
    }

    // —— 渲染背景：整张精美像素场景图（碰撞格不变）——
    const bgKey = mode === 'street' ? 'bg-street' : inHouse ? 'bg-house' : 'bg-cafe';
    this.add.image((W * TILE) / 2, (H * TILE) / 2, bgKey)
      .setDisplaySize(W * TILE, H * TILE)
      .setDepth(0);

    if (mode === 'street') {
      // 店名写在各自招牌上（用代码文字，不用生成图里的字）
      const signY: Record<string, number> = { tea: 4, phone: 6, real: 4, car: 4 };
      for (const s of SHOPS) {
        this.add.text(s.door.x * TILE + 8, signY[s.id] * TILE, s.label, {
          fontSize: '11px', color: '#2a2a35', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(6);
      }
      // NPC
      for (const s of SHOPS) {
        if (s.npc && s.npcAt) {
          this.add.sprite(s.npcAt.x * TILE + 8, s.npcAt.y * TILE + 8, getCharacter(s.npc).bodyKey, '0')
            .setOrigin(0.5, 0.92).setDepth(s.npcAt.y * TILE);
        }
      }
    } else if (inCafe) {
      this.liuSprite = this.add.sprite(7 * TILE + 8, 3 * TILE + 8, 'liu-sheet', '0').setOrigin(0.5, 0.92).setDepth(5);
      this.add.text((W / 2) * TILE, 1.6 * TILE, '咖啡厅', { fontSize: '12px', color: '#ffe082', fontFamily: 'monospace' }).setOrigin(0.5);
    } else {
      this.add.text((W / 2) * TILE, 2 * TILE, '你的小家', { fontSize: '12px', color: '#ffe082', fontFamily: 'monospace' }).setOrigin(0.5);
    }

    // —— 出生点 ——
    if (inCafe) {
      this.save.x = 7; this.save.y = 7;
    } else if (inHouse) {
      this.save.x = HOUSE_DOOR.x; this.save.y = HOUSE_DOOR.y - 1;
    } else if (this.save.x === 0 && this.save.y === 0) {
      this.save.x = 19; this.save.y = 15;
    }
    this.dir = this.save.dir;

    this.player = this.add
      .sprite(this.save.x * TILE + 8, this.save.y * TILE + 8, 'player-sheet', this.standFrame())
      .setOrigin(0.5, 0.92)
      .setDepth(5);

    this.cameras.main.setBounds(0, 0, W * TILE, H * TILE);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.controller = new StepController(
      this.save.x,
      this.save.y,
      (x, y) => this.map.isBlocked(x, y),
      {
        onStepStart: (_f, to, dir) => this.beginStep(to, dir),
        onStepEnd: (_to, dir) => this.finishStep(dir),
        onBump: (_at, dir) => this.bumpFeedback(dir),
      },
    );

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.keyInput(e, true));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.keyInput(e, false));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.dialogMachine || this.busy) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.onWorldTap(Math.floor(wp.x / TILE), Math.floor(wp.y / TILE));
    });

    // 自检钩子：?state=art 展示美术样板（走路表+头像+瓦片）
    if (q.get('state') === 'art') {
      this.cameras.main.setBounds(0, 0, 480, 270);
      this.cameras.main.centerOn(240, 135);
      this.add.rectangle(240, 135, 480, 270, 0x0a0a12).setDepth(20);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          this.add.image(30 + col * 52, 70 + row * 48, 'player-sheet', String(row * 3 + col)).setDepth(30).setScale(1.2);
          this.add.image(200 + col * 52, 70 + row * 48, 'xia-sheet', String(row * 3 + col)).setDepth(30).setScale(1.2);
        }
      }
      this.add.text(82, 24, '主角走路表（下/左/右/上 × 站/迈左/迈右）', { fontSize: '10px', color: '#fff', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(30);
      this.add.text(252, 24, '小夏走路表', { fontSize: '10px', color: '#fff', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(30);
      this.add.image(360, 60, 't-ground').setDepth(30);
      this.add.image(384, 60, 't-wall').setDepth(30);
      this.add.image(360, 96, 't-floor').setDepth(30);
      this.add.text(372, 30, '瓦片样板', { fontSize: '10px', color: '#fff', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(30);
      return;
    }

    this.bindDom();
    this.refreshHUD();

    // 自检钩子：?state=shop/sys/breakup 直接定位界面（截图用）
    if (q.get('state') === 'shop') { this.openShopPanel('tea'); }
    if (q.get('state') === 'sys') { this.renderSys(); (document.getElementById('sys-panel') as HTMLElement).hidden = false; }
    if (q.get('state') === 'breakup') { this.openBreakupDialog(); return; }

    // 第 1 章：咖啡厅内自动播分手剧情
    if (!this.g.flags.ch1done && inCafe) {
      this.time.delayedCall(400, () => this.openBreakupDialog());
    }
  }

  update(_t: number, delta: number): void {
    if (this.dialogMachine || this.busy) return;
    this.controller.update(delta);
    if (!this.controller.moving && this.pathQueue.length > 0) {
      const next = this.pathQueue[0];
      const dx = next.x - this.controller.x;
      const dy = next.y - this.controller.y;
      const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.controller.press(dir);
      this.controller.release(dir);
    }
    if (!this.controller.moving && this.pathQueue.length === 0 && this.pendingAction) {
      const act = this.pendingAction;
      this.pendingAction = null;
      this.handleAction(act);
    }
  }

  // ===== 帧与移动 =====
  private standFrame(): string { return String(DELTAS[this.dir].row * 3); }
  private stepFrameA(): string { return String(DELTAS[this.dir].row * 3 + 1); }
  private stepFrameB(): string { return String(DELTAS[this.dir].row * 3 + 2); }

  private keyInput(e: KeyboardEvent, down: boolean): void {
    const map: Record<string, Dir> = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    };
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    if (down) {
      this.pathQueue.length = 0;
      this.controller.press(dir);
    } else {
      this.controller.release(dir);
    }
  }

  private beginStep(to: { x: number; y: number }, dir: Dir): void {
    this.dir = dir;
    this.player.setDepth(to.y * TILE);
    this.pathQueue.shift();
    this.player.setFrame(this.stepFrameA());
    this.time.delayedCall(StepController.STEP_MS / 2, () => {
      if (this.controller.pendingDir === dir) this.player.setFrame(this.stepFrameB());
    });
    this.tweens.add({ targets: this.player, x: to.x * TILE + 8, y: to.y * TILE + 8, duration: StepController.STEP_MS, ease: 'linear' });
  }

  private finishStep(dir: Dir): void {
    this.player.setFrame(this.standFrame());
    const x = this.controller.x;
    const y = this.controller.y;
    this.save.x = x;
    this.save.y = y;
    this.save.dir = dir;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => writeSave(this.save), 200);
    // 已经离开店门/NPC 的店，解除冷却
    for (const s of SHOPS) {
      if (!this.interactCooldown.has(s.id)) continue;
      const nearDoor = Math.abs(x - s.door.x) + Math.abs(y - s.door.y) <= 1;
      const nearNpc = s.npcAt ? Math.abs(x - s.npcAt.x) + Math.abs(y - s.npcAt.y) <= 1 : false;
      if (!nearDoor && !nearNpc) this.interactCooldown.delete(s.id);
    }
    // 踏上可交互格（门/NPC店门）自动触发
    if (!this.dialogMachine && !this.busy) this.checkAutoInteract();
  }

  /** 走到门格/店门格，或面对门站住，自动触发，不用鼠标再点 */
  private checkAutoInteract(): void {
    const x = this.controller.x;
    const y = this.controller.y;
    const d = DELTAS[this.dir];
    const front = { x: x + d.dx, y: y + d.dy };
    if (this.g.map === 'cafe') {
      if (this.onTile(x, y, CAFE_EXIT) || this.onTile(front.x, front.y, CAFE_EXIT)) this.handleAction('cafeExit');
      return;
    }
    if (this.g.map === 'street') {
      if (this.onTile(x, y, HOME_DOOR) || this.onTile(front.x, front.y, HOME_DOOR)) {
        if ((this.g.owned.house ?? 0) > 0) this.handleAction('home');
        else this.openNarratorDialog(['（这扇门上着锁。先去售楼处买套房吧。）']);
        return;
      }
      for (const s of SHOPS) {
        if (this.interactCooldown.has(s.id)) continue;
        if (this.onTile(x, y, s.door) || this.onTile(front.x, front.y, s.door)) { this.openShopFlow(s.id); return; }
        // 走到 NPC 相邻格就自动开口，不用点
        if (s.npcAt) {
          const dist = Math.abs(x - s.npcAt.x) + Math.abs(y - s.npcAt.y);
          if (dist === 1) { this.openShopFlow(s.id); return; }
        }
      }
      return;
    }
    if (this.g.map === 'house' && (this.onTile(x, y, HOUSE_DOOR) || this.onTile(front.x, front.y, HOUSE_DOOR))) {
      this.handleAction('leaveHouse');
    }
  }

  private onTile(x: number, y: number, t: { x: number; y: number }): boolean {
    return x === t.x && y === t.y;
  }

  private bumpFeedback(dir: Dir): void {
    sfx('bump');
    const d = DELTAS[dir];
    this.tweens.add({ targets: this.player, x: this.player.x + d.dx * 4, y: this.player.y + d.dy * 4, duration: 25, yoyo: true, ease: 'Sine.easeOut' });
    for (let i = 0; i < 3; i++) {
      const dot = this.add.rectangle(this.player.x + d.dx * 10 + i * 2, this.player.y - 8 + d.dy * 10, 3, 3, 0xcccccc).setDepth(6);
      this.tweens.add({ targets: dot, alpha: 0, y: dot.y - 6, duration: 300 });
    }
  }

  // ===== 点地寻路 / 交互 =====
  private onWorldTap(tx: number, ty: number): void {
    const from = { x: this.controller.x, y: this.controller.y };
    if (this.g.map === 'cafe') {
      if (tx === CAFE_EXIT.x && ty === CAFE_EXIT.y) {
        const path = this.map.pathToAdjacent(from, CAFE_EXIT);
        if (path) this.pathQueue = path;
        this.pendingAction = 'cafeExit';
        return;
      }
    } else if (this.g.map === 'street') {
      for (const s of SHOPS) {
        const hitDoor = tx === s.door.x && ty === s.door.y;
        const hitNpc = s.npcAt && tx === s.npcAt.x && ty === s.npcAt.y;
        if (hitDoor || hitNpc) {
          const target = s.npcAt ?? s.door;
          const path = this.map.pathToAdjacent(from, target);
          if (path) this.pathQueue = path;
          this.pendingAction = 'shop:' + s.id;
          return;
        }
      }
      if (tx === HOME_DOOR.x && ty === HOME_DOOR.y) {
        const path = this.map.pathToAdjacent(from, HOME_DOOR);
        if (path) this.pathQueue = path;
        this.pendingAction = 'home';
        return;
      }
    } else {
      if (tx === HOUSE_DOOR.x && ty === HOUSE_DOOR.y) {
        const path = this.map.pathToAdjacent(from, HOUSE_DOOR);
        if (path) this.pathQueue = path;
        this.pendingAction = 'leaveHouse';
        return;
      }
    }
    this.pendingAction = null;
    if (!this.map.isBlocked(tx, ty)) {
      const path = this.map.bfsPath(from, { x: tx, y: ty });
      if (path) this.pathQueue = path;
    }
  }

  private handleAction(act: string): void {
    if (act === 'cafeExit') {
      this.g.map = 'street';
      this.save.x = 19; this.save.y = 15;
      writeSave(this.save);
      this.scene.restart({ save: this.save });
      return;
    }
    if (act === 'home') {
      if ((this.g.owned.house ?? 0) > 0) {
        this.g.map = 'house';
        writeSave(this.save);
        this.scene.restart({ save: this.save });
      } else {
        this.openNarratorDialog(['（这扇门上着锁。先去售楼处买套房吧。）']);
      }
      return;
    }
    if (act === 'leaveHouse') {
      this.g.map = 'street';
      this.save.x = HOME_DOOR.x; this.save.y = HOME_DOOR.y + 1;
      writeSave(this.save);
      this.scene.restart({ save: this.save });
      return;
    }
    if (act.startsWith('shop:')) {
      const id = act.slice(5) as ShopDef['id'];
      this.openShopFlow(id);
    }
  }

  // ===== 店铺剧情 =====
  private openShopFlow(id: ShopDef['id']): void {
    this.interactCooldown.add(id); // 交互后冷却，人离开前不再自动弹
    const xia = getCharacter('xiaxia');
    if (id === 'car') {
      this.openNarratorDialog(['（4S车行卷帘门紧闭。招牌上写着：新车上市，敬请期待。）']);
      return;
    }
    if (id === 'tea') {
      if ((this.g.owned.tea ?? 0) > 0) {
        this.openXiaPages([`奶茶每天限量，明天再来吧。`], xia);
      } else {
        this.openShopPanel('tea');
      }
      return;
    }
    if (id === 'phone') {
      const linlin = getCharacter('linlin');
      if ((this.g.owned.phone ?? 0) > 0) {
        this.openXiaPages([`最新款你都买了，还想再看哪款呀？`], linlin);
      } else {
        this.openShopPanel('phone');
      }
      return;
    }
    if (id === 'real') {
      const xiaozhu = getCharacter('xiaozhu');
      if ((this.g.owned.house ?? 0) > 0) {
        this.openXiaPages([`你已经是有房的人啦！回家看看吧，门在街那头。`], xiaozhu);
      } else {
        this.openShopPanel('house');
      }
    }
  }

  private openXiaPages(texts: string[], xia: ReturnType<typeof getCharacter>): void {
    this.dialogMachine = new DialogMachine(texts.map((t) => ({ name: xia.name, avatar: xia.avatarKey, text: t })));
    this.controller.releaseAll();
    this.pathQueue.length = 0;
    this.renderDialog(false);
  }

  private openNarratorDialog(texts: string[]): void {
    this.dialogMachine = new DialogMachine(texts.map((t) => ({ name: '', avatar: '', text: t })));
    this.controller.releaseAll();
    this.pathQueue.length = 0;
    this.renderDialog(false);
  }

  private openBreakupDialog(): void {
    const liu = getCharacter('liuruyan');
    this.dialogMachine = new DialogMachine([
      { name: liu.name, avatar: liu.avatarKey, text: `${this.save.playerName}，我们分手吧。` },
      { name: liu.name, avatar: liu.avatarKey, text: '你一个月三千块，给我买过什么？王少随手就是一个包。' },
      { name: liu.name, avatar: liu.avatarKey, text: '别再联系了。' },
      { name: '', avatar: '', text: '（柳如烟起身离开。你一个人坐在咖啡厅里。）' },
      { name: '', avatar: '', text: '【叮！返利系统绑定成功】新手资金 ¥5000 已到账。消费任意金额，固定百倍返利。' },
    ]);
    this.controller.releaseAll();
    this.pathQueue.length = 0;
    this.renderDialog(false);
  }

  // ===== DOM HUD =====
  private bindDom(): void {
    this.elDialog = document.getElementById('dialog-box')!;
    this.elDialogName = document.getElementById('dialog-name')!;
    this.elDialogAvatar = document.getElementById('dialog-avatar') as HTMLImageElement;
    this.elDialogText = document.getElementById('dialog-text')!;
    this.elObjective = document.getElementById('objective-text')!;
    this.elMoney = document.getElementById('money-text')!;
    this.elTip = document.getElementById('tutorial-tip')!;

    document.querySelectorAll<HTMLButtonElement>('#dpad .dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir as Dir;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pathQueue.length = 0;
        this.controller.press(dir);
      });
      const up = () => this.controller.release(dir);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });

    document.getElementById('btn-guide')!.addEventListener('click', () => this.guideToTarget());
    // 对话期间：全屏任意位置点击都翻页（不只对话框里）
    document.addEventListener('pointerdown', () => {
      unlockAudio();
      if (this.dialogMachine) this.advanceDialog();
    });

    // 商店面板
    document.getElementById('shop-leave')!.addEventListener('click', () => {
      (document.getElementById('shop-panel') as HTMLElement).hidden = true;
    });
    document.getElementById('shop-buy')!.addEventListener('click', () => this.onShopBuy());

    // 系统面板
    document.getElementById('btn-sys')!.addEventListener('click', () => {
      this.g.flags.sawLedger = true;
      this.renderSys();
      (document.getElementById('sys-panel') as HTMLElement).hidden = false;
      this.refreshHUD();
    });
    document.getElementById('sys-close')!.addEventListener('click', () => {
      (document.getElementById('sys-panel') as HTMLElement).hidden = true;
    });
    document.querySelectorAll<HTMLButtonElement>('.sys-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sysTab = btn.dataset.tab as 'ledger' | 'tasks' | 'skills';
        this.renderSys();
      });
    });
  }

  private currentShop: ItemId = 'tea';

  private openShopPanel(item: ItemId): void {
    this.currentShop = item;
    const def = ITEMS[item];
    (document.getElementById('shop-name') as HTMLElement).textContent = def.name;
    (document.getElementById('shop-price') as HTMLElement).textContent = `¥${def.price}`;
    (document.getElementById('shop-panel') as HTMLElement).hidden = false;
  }

  private onShopBuy(): void {
    const res = beginPurchase(this.g, this.currentShop);
    if (!res.ok) { this.toast(res.reason); return; }
    (document.getElementById('shop-panel') as HTMLElement).hidden = true;
    this.runReveal();
  }

  /** 返利到账播报：固定百倍，直接展示，不再滚动抽奖。期间按钮与移动全锁。 */
  private runReveal(): void {
    this.busy = true;
    const box = document.getElementById('reveal') as HTMLElement;
    const multEl = document.getElementById('reveal-mult') as HTMLElement;
    const gainEl = document.getElementById('reveal-gain') as HTMLElement;
    box.hidden = false;
    const { multiplier, gain, newTasks } = settlePurchase(this.g);
    multEl.textContent = '×' + multiplier;
    gainEl.textContent = `宿主消费 ¥${this.g.ledger[0].spend}，${multiplier}倍返利到账 ¥${gain}`;
    sfx('chime');
    speak(`叮，返利系统到账，${gain}元`);
    this.refreshHUD();
    writeSave(this.save);
    this.time.delayedCall(1800, () => {
      box.hidden = true;
      this.busy = false;
      if (newTasks.length > 0) this.toast('任务完成：' + newTasks.map((id) => SKILL_NAMES[taskReward(id)!] + ' Lv1 已解锁').join('、'));
      this.refreshHUD();
    });
  }

  private renderSys(): void {
    document.querySelectorAll<HTMLButtonElement>('.sys-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.sysTab);
    });
    const c = document.getElementById('sys-content')!;
    if (this.sysTab === 'ledger') {
      c.innerHTML = this.g.ledger.length === 0
        ? '<div class="task-todo">还没有消费记录。去街上花点钱吧。</div>'
        : this.g.ledger.map((e) =>
          `<div class="ledger-row"><span>${e.label} −¥${e.spend} ×${e.multiplier}</span><span class="ledger-gain">+¥${e.gain}</span></div>`,
        ).join('');
    } else if (this.sysTab === 'tasks') {
      c.innerHTML = TASK_IDS.map((id) =>
        `<div class="task-row ${this.g.tasksDone[id] ? 'task-done' : 'task-todo'}">${this.g.tasksDone[id] ? '✓' : '○'} ${taskName(id)}<br><small>奖励：${SKILL_NAMES[taskReward(id)!] ?? ''} Lv1</small></div>`,
      ).join('');
    } else {
      // 技能面板：只显示已通过任务解锁的技能，未获得的不显示
      const unlocked = SKILL_KEYS.filter((k) => this.g.skills[k] > 0);
      c.innerHTML = unlocked.length === 0
        ? '<div class="task-todo">还没有解锁技能。完成任务可直接获得技能。</div>'
        : unlocked.map((k) =>
          `<div class="skill-row"><span>${SKILL_NAMES[k]}</span><span class="task-done">Lv${this.g.skills[k]} ✓</span></div>`,
        ).join('');
    }
  }

  private toast(msg: string): void {
    const t = document.getElementById('toast')!;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  private refreshHUD(): void {
    this.elMoney.textContent = '¥' + this.g.money.toLocaleString('zh-CN');
    this.elObjective.textContent = '目标：' + this.objectiveText();
    this.elTip.hidden = !this.tutorialVisible();
    if (this.tutorialVisible()) this.elTip.textContent = this.tutorialText();
  }

  private tutorialVisible(): boolean {
    return !this.g.owned.house;
  }

  private objectiveText(): string {
    if (!this.g.flags.ch1done) return '看完分手剧情…';
    if (this.g.map === 'cafe') return '走出咖啡厅，去商业街逛逛';
    if (!this.g.owned.tea) return '去奶茶店买一杯珍珠奶茶';
    if (!this.g.flags.sawLedger) return '点右上角“系统”看看账本';
    if (!this.g.owned.phone) return '去手机店买旗舰手机';
    if (!this.g.owned.house) return '去售楼处买下特惠房';
    return '切片完成：自由逛逛';
  }

  private tutorialText(): string {
    return '教学：' + this.objectiveText();
  }

  private guideToTarget(): void {
    if (this.guideMarker) this.guideMarker.destroy();
    let tx = 14; let ty = 9;
    if (this.g.map === 'cafe') { tx = CAFE_EXIT.x; ty = CAFE_EXIT.y; }
    else if (!this.g.owned.tea) { tx = 14; ty = 9; }
    else if (!this.g.owned.phone) { tx = 20; ty = 9; }
    else if (!this.g.owned.house) { tx = 26; ty = 9; }
    else { tx = HOME_DOOR.x; ty = HOME_DOOR.y; }
    this.guideMarker = this.add.star(tx * TILE + 8, ty * TILE - 16, 5, 5, 9, 0xffd54a).setDepth(6);
    this.tweens.add({ targets: this.guideMarker, y: '-=6', yoyo: true, repeat: 3, duration: 250 });
    this.time.delayedCall(1000, () => this.guideMarker?.destroy());
  }

  // ===== 对话框打字机 =====
  private renderDialog(instant: boolean): void {
    if (!this.dialogMachine) return;
    (document.getElementById('dpad') as HTMLElement).style.display = 'none'; // 对话期间十字键不遮挡对话框
    duckMusic(true);
    const page = this.dialogMachine.current;
    // 柳如烟最后一页对白：让她真的朝下方的门走出咖啡厅，而不是站原地
    if (this.dialogMachine.pageIndex === 3 && this.liuSprite && !this.liuLeft) {
      this.liuLeft = true;
      this.liuSprite.setFrame('0'); // 朝下走
      this.tweens.add({
        targets: this.liuSprite,
        y: 10 * TILE + 8, // 从 (7,3) 穿过门口 (7,8)，走出画面下方
        duration: 1200,
        ease: 'linear',
        onComplete: () => this.liuSprite?.setVisible(false),
      });
    }
    if (page.avatar) getByAvatar(page.avatar);
    this.elDialogName.textContent = page.name ?? '';
    this.elDialogName.style.display = page.name ? 'block' : 'none';
    if (page.avatar) {
      this.elDialogAvatar.src = (this.game as unknown as { avatarURL: Record<string, string> }).avatarURL[page.avatar];
      this.elDialogAvatar.style.display = 'block';
    } else {
      this.elDialogAvatar.style.display = 'none';
    }
    this.elDialog.hidden = false;
    this.dialogMachine.setShown(0);
    this.elDialogText.textContent = '';
    if (instant) {
      this.dialogMachine.setShown(page.text.length);
      this.elDialogText.textContent = page.text;
      return;
    }
    this.time.addEvent({
      delay: 26,
      repeat: Math.max(0, page.text.length - 1),
      callback: () => {
        if (!this.dialogMachine) return;
        this.dialogMachine.setShown(this.dialogMachine.shown + 1);
        this.elDialogText.textContent = page.text.slice(0, this.dialogMachine.shown);
      },
    });
  }

  private advanceDialog(): void {
    if (!this.dialogMachine) return;
    const act = this.dialogMachine.click();
    if (act === 'complete') {
      this.elDialogText.textContent = this.dialogMachine.current.text;
    } else if (act === 'next') {
      sfx('page');
      this.renderDialog(false);
    } else {
      this.elDialog.hidden = true;
      this.dialogMachine = null;
      duckMusic(false);
      (document.getElementById('dpad') as HTMLElement).style.display = '';
      if (!this.g.flags.ch1done) {
        this.g.flags.ch1done = true;
        writeSave(this.save);
        this.refreshHUD();
      }
    }
  }
}
