/**
 * 全局游戏配置（阶段 1：暂定名 / 默认名 / 存档键）
 * 游戏定名后改 gameName 一处即可，manifest 与标题页需同步改。
 */
export const GAME_CONFIG = {
  /** 游戏名（暂定占位名） */
  gameName: '像素冒险',
  /** 名字输入框默认名（玩家可改，不写死） */
  defaultPlayerName: '旅人',
  /** 存档键：与浏览器缓存（Cache Storage）分开存放 */
  saveKey: 'pxad_save_v1',
  /** 玩家起名持久化键 */
  nameKey: 'pxad_player_name',
} as const;
