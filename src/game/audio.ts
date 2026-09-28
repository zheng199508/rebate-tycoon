/** 音频层：全部 WebAudio 原创合成，无任何外部音乐文件、无版权问题。
 *  - SFX：点击/翻页/到账/碰壁/系统提示
 *  - BGM：3 首 8-bit 风格循环（原创合成器序列），默认不播放
 *  - 朗读：系统播报走浏览器本地 TTS
 * 设置持久化在 localStorage。
 */

export interface AudioSettings {
  sfxOn: boolean;
  musicOn: boolean;
  speakOn: boolean;
  sfxVol: number;
  musicVol: number;
  track: number; // 当前曲目下标
  mode: 'single' | 'scene';
}

const KEY = 'pxad_audio_v1';

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign({
      sfxOn: true, musicOn: false, speakOn: true,
      sfxVol: 0.6, musicVol: 0.5, track: 0, mode: 'single',
    }, JSON.parse(raw));
  } catch { /* ignore */ }
  return { sfxOn: true, musicOn: false, speakOn: true, sfxVol: 0.6, musicVol: 0.5, track: 0, mode: 'single' };
}

export function saveAudioSettings(s: AudioSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

let s: AudioSettings = loadAudioSettings();
let actx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmStep = 0;

function ac(): AudioContext {
  if (!actx) {
    actx = new AudioContext();
    musicGain = actx.createGain();
    musicGain.connect(actx.destination);
    sfxGain = actx.createGain();
    sfxGain.connect(actx.destination);
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}

/** 解锁音频（首次用户手势时调用） */
export function unlockAudio(): void { ac(); }

export function getSettings(): AudioSettings { return s; }
export function updateSettings(patch: Partial<AudioSettings>): void {
  s = Object.assign({}, s, patch);
  saveAudioSettings(s);
  if (musicGain && actx) musicGain.gain.value = s.musicOn ? s.musicVol : 0;
  if (sfxGain && actx) sfxGain.gain.value = s.sfxOn ? s.sfxVol : 0;
  if (!s.musicOn) stopBGM();
  else startBGM();
}

// ---------- SFX ----------
function beep(freq: number, dur: number, type: OscillatorType, vol: number, when = 0): void {
  if (!s.sfxOn) return;
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + when + dur);
  o.connect(g); g.connect(sfxGain!);
  o.start(a.currentTime + when);
  o.stop(a.currentTime + when + dur);
}

export type SfxName = 'click' | 'page' | 'coin' | 'bump' | 'chime';

export function sfx(name: SfxName): void {
  if (!s.sfxOn) return;
  switch (name) {
    case 'click': beep(800, 0.06, 'square', 0.15); break;
    case 'page': beep(500, 0.05, 'square', 0.12); beep(700, 0.05, 'square', 0.1, 0.05); break;
    case 'coin':
      beep(988, 0.08, 'square', 0.18);
      beep(1319, 0.18, 'square', 0.18, 0.08);
      break;
    case 'bump': beep(140, 0.1, 'sawtooth', 0.2); break;
    case 'chime':
      beep(1047, 0.15, 'triangle', 0.2);
      beep(1319, 0.15, 'triangle', 0.2, 0.12);
      beep(1568, 0.3, 'triangle', 0.2, 0.24);
      break;
  }
}

// ---------- TTS 朗读 ----------
export function speak(text: string): void {
  if (!s.speakOn || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

// ---------- BGM ----------
export interface BgmTrack { name: string; tag: string; }
export const BGM_TRACKS: BgmTrack[] = [
  { name: '静谧探索', tag: '街景漫步' },
  { name: '胜局结算', tag: '到账欢悦' },
  { name: '高燃激战', tag: '野心升腾' },
];

// 每首 = 16 步的音序；freq 0 表示休止
const PATTERNS: number[][] = [
  // 静谧探索 C-Am-F-G
  [262, 0, 330, 0, 392, 0, 330, 0, 220, 0, 262, 0, 330, 0, 392, 0],
  // 胜局结算 C-E-G-C 上行
  [523, 659, 784, 1047, 784, 659, 523, 0, 587, 698, 880, 1175, 880, 698, 587, 0],
  // 高燃激战 低音驱动
  [131, 131, 196, 131, 147, 147, 220, 147, 131, 131, 196, 131, 165, 165, 247, 165],
];
const WAVE: OscillatorType[] = ['triangle', 'square', 'sawtooth'];

function playStep(): void {
  if (!s.musicOn || !actx || !musicGain) return;
  const t = BGM_TRACKS[s.track];
  void t;
  const pat = PATTERNS[s.track];
  const f = pat[bgmStep % pat.length];
  bgmStep++;
  if (f <= 0) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = WAVE[s.track];
  o.frequency.value = f;
  g.gain.setValueAtTime(0.08, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.22);
  o.connect(g); g.connect(musicGain);
  o.start(); o.stop(actx.currentTime + 0.25);
}

export function startBGM(): void {
  if (!s.musicOn) return;
  ac();
  if (bgmTimer) return;
  bgmStep = 0;
  bgmTimer = setInterval(playStep, 220);
}

export function stopBGM(): void {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}

export function nextTrack(): void { updateSettings({ track: (s.track + 1) % BGM_TRACKS.length }); }
export function prevTrack(): void { updateSettings({ track: (s.track - 1 + BGM_TRACKS.length) % BGM_TRACKS.length }); }

/** 对话时压低音量，结束恢复 */
export function duckMusic(on: boolean): void {
  if (!musicGain || !actx) return;
  musicGain.gain.setTargetAtTime(on ? s.musicVol * 0.25 : (s.musicOn ? s.musicVol : 0), actx.currentTime, 0.1);
}
