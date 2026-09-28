/** 程序化占位素材（阶段 4 再换正式美术）：
 * 主角走路表 144×192 = 3 列×4 行，每格 48×48，人物约 32×44，固定脚点在格底中心。
 * 行顺序：下、左、右、上；列顺序：站立、迈左腿、迈右腿。
 * 一律最近邻缩放。
 */

type Ctx = CanvasRenderingContext2D;

function px(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

const CELL = 48;

interface Palette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  beard?: string;
}

/** 在一格 48×48 内画 Q 版二次元小人（大头帅哥比例）；row: 0下 1左 2右 3上；frame: 0站立 1迈左腿 2迈右腿 */
function drawPerson(g: Ctx, row: number, frame: number, p: Palette): void {
  const ox = frame * CELL;
  const oy = row * CELL;
  const flip = row === 2; // 右侧由左侧镜像
  const P = (x: number, y: number, w: number, h: number, c: string) => {
    const lx = flip ? 47 - x - w : x;
    px(g, ox + lx, oy + y, w, h, c);
  };

  // 腿与鞋
  let legL = { x: 19, y: 33, h: 9 };
  let legR = { x: 25, y: 33, h: 9 };
  if (frame === 1) { legL = { x: 18, y: 32, h: 10 }; legR = { x: 26, y: 34, h: 7 }; }
  else if (frame === 2) { legL = { x: 19, y: 34, h: 7 }; legR = { x: 25, y: 32, h: 10 }; }
  P(legL.x, legL.y, 5, legL.h, p.pants);
  P(legR.x, legR.y, 5, legR.h, p.pants);
  P(legL.x, legL.y + legL.h - 1, 5, 2, p.shoes);
  P(legR.x, legR.y + legR.h - 1, 5, 2, p.shoes);

  // 身体（卫衣）+ 手臂
  P(16, 24, 16, 10, p.shirt);
  P(14, 25, 3, 8, p.shirt);
  P(31, 25, 3, 8, p.shirt);

  // 大头
  if (row === 3) {
    // 背面：头发后脑袋
    P(14, 6, 20, 19, p.hair);
    P(13, 10, 3, 10, p.hair);
    P(34, 10, 3, 10, p.hair);
  } else {
    P(15, 11, 18, 14, p.skin); // 脸
    P(14, 6, 20, 8, p.hair);   // 头发
    P(14, 8, 3, 6, p.hair);
    P(31, 8, 3, 6, p.hair);
    if (row === 1 || row === 2) {
      // 侧面近大远小
      P(19, 16, 2, 3, '#20242a');
      P(24, 17, 1, 2, '#20242a');
    } else {
      P(19, 16, 2, 3, '#20242a');
      P(25, 16, 2, 3, '#20242a');
    }
    if (p.beard) P(19, 21, 10, 3, p.beard);
  }
}

function makeSheet(p: Palette): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CELL * 3;
  cv.height = CELL * 4;
  const g = cv.getContext('2d')!;
  for (let row = 0; row < 4; row++) {
    for (let frame = 0; frame < 3; frame++) {
      drawPerson(g, row, frame, p);
    }
  }
  return cv;
}

export function makePlayerSheet(): HTMLCanvasElement {
  return makeSheet({
    skin: '#f0c090',
    hair: '#3a2a1e',
    shirt: '#3b6ea5',
    pants: '#2e3a55',
    shoes: '#1c1c1c',
  });
}

export function makeElderSheet(): HTMLCanvasElement {
  return makeSheet({
    skin: '#e8b98d',
    hair: '#dcdcdc',
    shirt: '#a56b3b',
    pants: '#4a4a4a',
    shoes: '#222222',
    beard: '#f0f0f0',
  });
}

/** 其他店员：指定工服色 */
export function makeClerkSheet(shirt: string, pants: string): HTMLCanvasElement {
  return makeSheet({
    skin: '#f0c090',
    hair: '#2a1e18',
    shirt,
    pants,
    shoes: '#222222',
  });
}

export function makeXiaSheet(): HTMLCanvasElement {
  return makeSheet({
    skin: '#f0c090',
    hair: '#2a1e18',
    shirt: '#d95a6a',
    pants: '#3a3a4a',
    shoes: '#222222',
  });
}

export function makeLiuSheet(): HTMLCanvasElement {
  return makeSheet({
    skin: '#f2c4a0',
    hair: '#14100e',
    shirt: '#7a4a8a',
    pants: '#7a4a8a',
    shoes: '#2a1a30',
  });
}

/** 对话框头像 32×32 半身像 */
export function makeAvatar(kind: 'player' | 'elder' | 'xia' | 'liu'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 32;
  const g = cv.getContext('2d')!;
  const skin = kind === 'xia' ? '#f0c090' : kind === 'liu' ? '#f2c4a0' : kind === 'player' ? '#f0c090' : '#e8b98d';
  const hair = kind === 'player' ? '#3a2a1e' : kind === 'xia' ? '#2a1e18' : kind === 'liu' ? '#14100e' : '#dcdcdc';
  const shirt = kind === 'player' ? '#3b6ea5' : kind === 'xia' ? '#d95a6a' : kind === 'liu' ? '#7a4a8a' : '#a56b3b';
  px(g, 8, 18, 16, 10, shirt); // 肩
  px(g, 9, 4, 14, 14, skin); // 脸
  px(g, 9, 2, 14, 5, hair); // 头发
  if (kind === 'liu') px(g, 8, 4, 2, 14, hair); // 长发
  px(g, 13, 9, 2, 2, '#20242a');
  px(g, 19, 9, 2, 2, '#20242a');
  if (kind === 'elder') px(g, 12, 13, 8, 3, '#f0f0f0');
  return cv;
}

/** 16×16 地面（草地） */
export function makeTileGround(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  px(g, 0, 0, 16, 16, '#58a05c');
  // 确定性噪点
  const speckles: [number, number, string][] = [
    [2, 3, '#519755'], [8, 2, '#62ab66'], [13, 4, '#519755'],
    [4, 9, '#62ab66'], [11, 11, '#519755'], [6, 14, '#62ab66'], [14, 14, '#519755'],
  ];
  for (const [x, y, c] of speckles) px(g, x, y, 2, 2, c);
  return cv;
}

/** 16×16 室内地板（木纹） */
export function makeFloorTile(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  px(g, 0, 0, 16, 16, '#a07850');
  px(g, 0, 7, 16, 1, '#8a6440');
  px(g, 0, 15, 16, 1, '#7a5638');
  return cv;
}

/** 16×16 边界墙（石块） */
export function makeTileWall(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  px(g, 0, 0, 16, 16, '#7d8590');
  px(g, 0, 0, 16, 2, '#9aa1aa');
  px(g, 0, 7, 16, 1, '#5d646d');
  px(g, 7, 8, 1, 8, '#5d646d');
  return cv;
}

/** 16×16 灌木障碍 */
export function makeBush(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  px(g, 2, 6, 12, 8, '#2e6b3a');
  px(g, 4, 3, 8, 4, '#3f8a4d');
  px(g, 1, 9, 14, 4, '#2e6b3a');
  px(g, 5, 5, 2, 2, '#57a86a');
  return cv;
}

/** 16×16 木牌物件 */
export function makeSign(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const g = cv.getContext('2d')!;
  px(g, 7, 8, 2, 8, '#5d4030');
  px(g, 3, 2, 10, 7, '#8a6238');
  px(g, 3, 2, 10, 1, '#a57a4a');
  px(g, 5, 4, 6, 1, '#3a2a1e');
  px(g, 5, 6, 6, 1, '#3a2a1e');
  return cv;
}
