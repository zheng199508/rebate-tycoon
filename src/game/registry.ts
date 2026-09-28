/** 角色注册表：说话人、头像、地图身体用同一角色 ID 绑定。
 * 缺头像直接报错，禁止静默回退成主角；旁白/文书/物件与人物区分开。
 */

export type CharKind = 'person' | 'narrator' | 'object';

export interface CharacterDef {
  id: string;
  name: string;
  kind: CharKind;
  bodyKey: string;
  avatarKey: string;
}

export const CHARACTERS: Record<string, CharacterDef> = {
  player: {
    id: 'player',
    name: '旅人',
    kind: 'person',
    bodyKey: 'player-sheet',
    avatarKey: 'avatar-player',
  },
  liuruyan: {
    id: 'liuruyan',
    name: '柳如烟',
    kind: 'person',
    bodyKey: 'liu-sheet',
    avatarKey: 'avatar-liu',
  },
  xiaxia: {
    id: 'xiaxia',
    name: '小夏',
    kind: 'person',
    bodyKey: 'xia-sheet',
    avatarKey: 'avatar-xia',
  },
  linlin: {
    id: 'linlin',
    name: '小琳',
    kind: 'person',
    bodyKey: 'linlin-sheet',
    avatarKey: 'avatar-linlin',
  },
  xiaozhu: {
    id: 'xiaozhu',
    name: '小筑',
    kind: 'person',
    bodyKey: 'xiaozhu-sheet',
    avatarKey: 'avatar-xiaozhu',
  },
  homeSign: {
    id: 'homeSign',
    name: '家门',
    kind: 'object',
    bodyKey: '',
    avatarKey: '',
  },
  narrator: {
    id: 'narrator',
    name: '',
    kind: 'narrator',
    bodyKey: '',
    avatarKey: '',
  },
};

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`角色未注册：${id}`);
  if (c.kind === 'person' && !c.avatarKey) {
    throw new Error(`角色 ${id} 缺头像，禁止静默回退成主角`);
  }
  return c;
}

/** 按头像 key 反查角色（对话框渲染时校验注册表绑定） */
export function getByAvatar(avatarKey: string): CharacterDef {
  const hit = Object.values(CHARACTERS).find((c) => c.avatarKey === avatarKey);
  if (!hit) throw new Error(`头像未在注册表绑定：${avatarKey}`);
  return hit;
}
