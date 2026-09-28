import Phaser from 'phaser';
import { GAME_CONFIG } from './config';
import { WorldScene } from './game/WorldScene';
import { defaultSave, loadSave, writeSave, type SaveData } from './game/save';
import {
  getSettings, updateSettings, startBGM, unlockAudio,
  nextTrack, prevTrack, BGM_TRACKS,
} from './game/audio';

declare global {
  interface Window {
    __setAppReady: () => void;
  }
}

const gameContainer = document.getElementById('game-container')!;

// ===== 触摸防护：禁止长按菜单、双击与手势缩放 =====
['contextmenu', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
  gameContainer.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
});

// ===== Toast =====
let toastTimer: number | undefined;
function showToast(msg: string): void {
  const toast = document.getElementById('toast')!;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

// ===== 起名（默认名不写死，玩家可改；边输入边记住）=====
const nameInput = document.getElementById('player-name') as HTMLInputElement;
nameInput.value = localStorage.getItem(GAME_CONFIG.nameKey) ?? GAME_CONFIG.defaultPlayerName;
nameInput.addEventListener('input', () => {
  const v = nameInput.value.trim();
  if (v) localStorage.setItem(GAME_CONFIG.nameKey, v);
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnNew.click();
});

// ===== 标题页按钮 =====
const btnNew = document.getElementById('btn-new') as HTMLButtonElement;
const btnContinue = document.getElementById('btn-continue') as HTMLButtonElement;

// 继续游戏：无存档时置灰
function refreshContinueState(): void {
  btnContinue.disabled = localStorage.getItem(GAME_CONFIG.saveKey) === null;
}
refreshContinueState();

let game: Phaser.Game | null = null;

function startWorld(save: SaveData): void {
  const titleScreen = document.getElementById('title-screen')!;
  const worldUi = document.getElementById('world-ui')!;
  titleScreen.hidden = true;
  worldUi.hidden = false;
  if (game) {
    game.scene.stop('title');
    game.scene.start('world', { save });
  }
}

btnNew.addEventListener('click', () => {
  const name = nameInput.value.trim() || GAME_CONFIG.defaultPlayerName;
  nameInput.value = name;
  localStorage.setItem(GAME_CONFIG.nameKey, name);
  const save = defaultSave(name);
  writeSave(save);
  refreshContinueState();
  startWorld(save);
});

btnContinue.addEventListener('click', () => {
  const save = loadSave();
  if (!save) {
    showToast('还没有存档。');
    return;
  }
  startWorld(save);
});

// ===== BGM 点歌台（标题页与游戏内通用；默认不播放，玩家主动点才响）=====
const musicPanel = document.getElementById('music-panel')!;
function refreshMusicUI(): void {
  const s = getSettings();
  document.getElementById('music-track-name')!.textContent = `${BGM_TRACKS[s.track].name} · ${BGM_TRACKS[s.track].tag}`;
  (document.getElementById('music-toggle') as HTMLButtonElement).textContent = s.musicOn ? '⏸ 暂停' : '▶ 播放';
  (document.getElementById('opt-sfx') as HTMLInputElement).checked = s.sfxOn;
  (document.getElementById('opt-speak') as HTMLInputElement).checked = s.speakOn;
}
function openMusic(): void {
  unlockAudio();
  refreshMusicUI();
  musicPanel.hidden = false;
}
document.getElementById('btn-title-music')!.addEventListener('click', openMusic);
document.getElementById('btn-music')!.addEventListener('click', openMusic);
document.getElementById('music-close')!.addEventListener('click', () => { musicPanel.hidden = true; });
document.getElementById('music-toggle')!.addEventListener('click', () => {
  unlockAudio();
  const s = getSettings();
  updateSettings({ musicOn: !s.musicOn });
  if (!s.musicOn) startBGM();
  refreshMusicUI();
});
document.getElementById('music-prev')!.addEventListener('click', () => { unlockAudio(); prevTrack(); refreshMusicUI(); });
document.getElementById('music-next')!.addEventListener('click', () => { unlockAudio(); nextTrack(); refreshMusicUI(); });
(document.getElementById('opt-sfx') as HTMLInputElement).addEventListener('change', (e) => {
  updateSettings({ sfxOn: (e.target as HTMLInputElement).checked });
});
(document.getElementById('opt-speak') as HTMLInputElement).addEventListener('change', (e) => {
  updateSettings({ speakOn: (e.target as HTMLInputElement).checked });
});

// ===== Phaser 引擎：标题背景场景 + 世界场景 =====
try {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser-root',
    width: 480,
    height: 270,
    backgroundColor: '#101018',
    render: { pixelArt: true, antialias: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [
      class TitleScene extends Phaser.Scene {
        constructor() { super('title'); }
      },
      WorldScene,
    ],
  });
} catch (err) {
  console.error('Phaser 初始化失败：', err);
  showToast('引擎初始化失败，请重试。');
}

// ===== 界面已渲染，通知看门狗 =====
window.__setAppReady();

// ===== 自检入口：带 ?auto=1 时自动点“新的游戏”，供无头截图 =====
setTimeout(() => {
  if (new URLSearchParams(location.search).has('auto')) btnNew.click();
}, 300);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const banner = document.getElementById('update-banner')!;
  const btnUpdate = document.getElementById('btn-update')!;
  function showBanner(reg: ServiceWorkerRegistration): void {
    banner.hidden = false;
    btnUpdate.onclick = () => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' }); // 玩家点了才允许接管
    };
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // 新页面核心资源已加载成功 → 通知 SW 可删旧缓存
      reg.active?.postMessage({ type: 'CORE_READY' });
      if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) showBanner(reg);
        });
      });
      // 新 SW 接管后刷新页面
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        location.reload();
      });
    }).catch((err) => console.warn('Service Worker 注册失败：', err));
  });
}
