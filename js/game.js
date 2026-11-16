'use strict';
// TRAMPOLINE CHASER 3D

// ===================== 定数 =====================
const CELL        = 3.2;    // 1マスの大きさ(m)
const FLOOR_GAP   = 6.5;    // 階の高さ
const FLOOR_T     = 0.5;    // 床の厚み
const GRAVITY     = 34;
const MOVE_SPEED  = 7.2;
const AIR_SPEED   = 9.8;    // 空中はやや速く動ける（好きな階で抜けられるように）
const EYE         = 1.62;
const P_R         = 0.45;
const ENEMY_SPEED = 3.6;
const ENEMY_R     = 0.62;
const SUBSTEPS    = 4;

const POWER_DUR   = 6.0;
const POWER_BLINK = 2.0;

const INITIAL_LIVES       = 4;
const STAGE_CLEAR_SCORE   = 10000;
const LIFE_BONUS_INTERVAL = 30000;
const TIME_BONUS_MAX      = 120.0;

const BASE_FOV = 74;

// ---- 対戦（レース）----
const MAX_PLAYERS = 6;
const START_LIVES = 3;   // 対戦のライフ（0でレースから退出＝観戦へ）
const RACE_STUN   = 2.5;    // 捕まったとき動けない秒数
const RACE_INV    = 2.0;    // 復帰後の無敵（連続で捕まらないように）
const DASH_DUR    = 5.0;
// ジェムのルーレットで出る3つの能力（いずれも「取った本人以外」に効く）
const ROULETTE_SPIN = 1.6;    // ルーレットが回っている時間
const ABIL_ZAP      = 5.0;    // 雷でしびれる秒数
const ABIL_NOPAD    = 10.0;   // トランポリンに入れない秒数
const ABIL_DARK     = 30.0;   // 暗闇の秒数
const ABIL_SUPER    = 10.0;   // トランポリンがすべてスーパートランポリンになる秒数
const ABIL_NAMES    = ['雷', 'トランポリン封鎖', '暗闇', 'スーパートランポリン（自分）', 'スーパートランポリン（自分以外）'];
const ABIL_LABELS   = ['THUNDER', 'NO TRAMPOLINE', 'BLACKOUT', 'SUPER ME', 'SUPER OTHERS'];
const ABIL_ICONS    = ['\u26A1', '\u26D4', '\u1F311', '\u2B06', '\u2B06'];
const ABIL_COLORS   = ['#ffee44', '#ff8811', '#9966ff', '#ffc400', '#ff5a9e'];
const GEM_BACK      = 10.0;   // 取られたジェムが復活するまでの秒数
const HELP_FAILS    = 3;      // 同じ場所でこの回数落ちたら、復帰地点にジェムを出す
// 暗闇の見え方（近づかないと見えない濃さ）
const DARK_FOG      = 0.045;
const DARK_AMBIENT  = 0.16;
const DASH_MUL    = 1.55;
const NET_HZ      = 15;     // 位置同期
const ENEMY_HZ    = 15;     // 敵位置同期（ホスト -> 全員）
const RACE_LIMIT  = 300;    // 1レースの制限時間（秒）
// ---- 波動（ショックウェーブ）----
const WAVE_R      = 20.0;   // 射程
const WAVE_HALF   = Math.PI * 22.5 / 180;   // 正面45度 = 中心から±22.5度
const WAVE_CD     = 2.6;    // クールダウン(秒)
const WAVE_DY     = 2.6;    // 上下の有効範囲
const WAVE_KNOCK  = 48.0;   // 水平の吹き飛び速度
const WAVE_LIFT   = 22.0;   // 上向きの初速
const KNOCK_DECAY = 2.2;    // ノックバックの減衰(1/秒)
const WAVE_FX_DUR = 0.45;
const WAVE_COLOR  = 0xffdd22;  // 波動の色（常に黄色）

const PCOLORS = [0x00ffcc, 0xff8811, 0xff44aa, 0x66ff44, 0xffdd22, 0xaa66ff];
const PCOLORS_CSS = ['#00ffcc', '#ff8811', '#ff44aa', '#66ff44', '#ffdd22', '#aa66ff'];
const PNAMES = ['CYAN', 'ORANGE', 'PINK', 'GREEN', 'YELLOW', 'PURPLE'];

// ===================== 乱数 =====================
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ===================== セッション（1人タイムアタック） =====================
const Session = {
  stageIndex: 0, lastTime: 0, best: null, newBest: false,
  reset(si) { this.stageIndex = si || 0; },
  bestOf(si) { try { const v = JSON.parse(localStorage.getItem('tc3d_ta_best') || '{}')[si]; return typeof v === 'number' ? v : null; } catch (e) { return null; } },
  unlocked() { try { return Math.max(0, parseInt(localStorage.getItem('tc3d_ta_unlock') || '0', 10) || 0); } catch (e) { return 0; } },
  onClear(t) {
    const si = this.stageIndex;
    this.lastTime = t;
    const old = this.bestOf(si);
    this.newBest = old === null || t < old;
    this.best = this.newBest ? t : old;
    try {
      const all = JSON.parse(localStorage.getItem('tc3d_ta_best') || '{}');
      all[si] = this.best;
      localStorage.setItem('tc3d_ta_best', JSON.stringify(all));
      if (si + 1 > this.unlocked()) localStorage.setItem('tc3d_ta_unlock', String(si + 1));
    } catch (e) {}
  }
};
function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}

// ===================== Three.js セットアップ =====================
const wrap     = document.getElementById('wrap');
const glCanvas = document.getElementById('gl');

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
// おもちゃ工場の世界：明るい空色の背景と、遠くが淡いピーチ色にかすむ霧
const SKY_COL = 0xd6ecff;
scene.background = new THREE.Color(SKY_COL);
const BASE_FOG = 0.0042;                // 通常時の霧の濃さ
scene.fog = new THREE.FogExp2(SKY_COL, BASE_FOG);

const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 700);
camera.rotation.order = 'YXZ';

const BASE_AMB = 0.36, BASE_HEMI = 0.6;
const AMB  = new THREE.AmbientLight(0xfff2e2, BASE_AMB);
const HEMI = new THREE.HemisphereLight(0xeaf6ff, 0x9fc58f, BASE_HEMI);
scene.add(AMB);
scene.add(HEMI);
const BASE_SUN = 0.85;
const SUN = new THREE.DirectionalLight(0xfff0d8, BASE_SUN);   // 面ごとの明暗を付けて立体感を出す
SUN.position.set(0.6, 1, 0.35);
scene.add(SUN);

const BASE_HEAD = 0.55, BASE_HEAD_DIST = 18;
const headLight = new THREE.PointLight(0xfff0d0, BASE_HEAD, BASE_HEAD_DIST, 2);
scene.add(headLight);

const powerLight = new THREE.PointLight(0xffcc22, 0, 22, 2);
scene.add(powerLight);

function resize() {
  const r = wrap.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- テクスチャ生成（カートゥーンのおもちゃ工場。すべてプログラムで描く） ----------
const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

function texCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h || w;
  return [c, c.getContext('2d')];
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function bolt(g, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c9ccd2'); gr.addColorStop(1, '#7d828c');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(60,60,70,.55)'; g.lineWidth = Math.max(1, r * 0.22);
  g.beginPath(); g.moveTo(x - r * 0.5, y); g.lineTo(x + r * 0.5, y); g.stroke();
}
function starPath(g, cx, cy, ro, ri, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, r = (i % 2) ? ri : ro;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}
function finishTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = MAX_ANISO;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 床：白いプラスチックのパネル（階ごとの色はインスタンスカラーで塗る）
function makeFloorTexture() {
  const [c, g] = texCanvas(256);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 256);                 // 継ぎ目
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dedede');
  g.fillStyle = gr; rrect(g, 5, 5, 246, 246, 26); g.fill();
  // ふちの立体感
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,.9)'; rrect(g, 10, 10, 236, 236, 22); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.10)'; rrect(g, 14, 14, 236, 236, 22); g.stroke();
  // 中央のくぼんだボタンと星
  const cg = g.createRadialGradient(118, 118, 10, 128, 128, 66);
  cg.addColorStop(0, '#f2f2f2'); cg.addColorStop(1, '#d4d4d4');
  g.fillStyle = cg; g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 4; g.beginPath(); g.arc(130, 130, 62, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.85)'; starPath(g, 128, 130, 40, 17, 5); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 3; starPath(g, 129, 132, 40, 17, 5); g.stroke();
  // 四隅のボルト
  for (const [x, y] of [[30, 30], [226, 30], [30, 226], [226, 226]]) bolt(g, x, y, 9);
  return finishTex(c);
}

// 天井：クリーム色のパネルと丸い照明
function makeCeilTextures() {
  const [c, g] = texCanvas(256);
  g.fillStyle = '#c9bfa8'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff4dc'; rrect(g, 4, 4, 248, 248, 10); g.fill();
  g.fillStyle = 'rgba(150,130,100,.35)';
  for (let y = 26; y < 256; y += 34) for (let x = 26; x < 256; x += 34) {
    if (Math.hypot(x - 128, y - 128) < 70) continue;
    g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#d8d2c4'; g.beginPath(); g.arc(128, 128, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff9e8'; g.beginPath(); g.arc(128, 128, 46, 0, Math.PI * 2); g.fill();
  const [c2, g2] = texCanvas(256);
  g2.fillStyle = '#000'; g2.fillRect(0, 0, 256, 256);
  const lg = g2.createRadialGradient(128, 128, 0, 128, 128, 50);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.75, '#ffe9b0'); lg.addColorStop(1, '#000000');
  g2.fillStyle = lg; g2.beginPath(); g2.arc(128, 128, 50, 0, Math.PI * 2); g2.fill();
  return { map: finishTex(c), emap: finishTex(c2) };
}

// 床板の側面：白いラインの入った厚み
function makeSideTexture() {
  const [c, g] = texCanvas(128, 32);
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 12, 128, 8);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 29, 128, 3);
  return finishTex(c);
}

// 壁：1枚 = 横2マス × 1階ぶん。下端が床の高さ
function makeWallTexture() {
  const W = 512, H = 512, PX = H / FLOOR_GAP;                         // 1m あたりのピクセル
  const yAt = (m) => H - m * PX;
  const [c, g] = texCanvas(W, H);
  g.fillStyle = '#f7e9cc'; g.fillRect(0, 0, W, H);
  // 縦の継ぎ目とリベット
  for (const x of [0, 256]) {
    g.fillStyle = 'rgba(140,105,60,.25)'; g.fillRect(x, 0, 5, H);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + 5, 0, 3, H);
    for (let y = 24; y < H; y += 46) bolt(g, x + 18, y, 5);
  }
  // 窓（空と雲が見える）
  for (const x0 of [64, 320]) {
    const x = x0, y = yAt(3.7), w = 128, h = yAt(1.4) - yAt(3.7);
    g.fillStyle = '#2f6fa3'; rrect(g, x - 10, y - 10, w + 20, h + 20, 22); g.fill();
    const sky = g.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#7cc6ff'); sky.addColorStop(1, '#e6f6ff');
    g.fillStyle = sky; rrect(g, x, y, w, h, 14); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)';
    for (const [cx, cy, r] of [[x + 40, y + 60, 18], [x + 62, y + 52, 24], [x + 86, y + 62, 17]]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.moveTo(x + 12, y + h - 10); g.lineTo(x + 46, y + 10); g.lineTo(x + 64, y + 10); g.lineTo(x + 30, y + h - 10); g.fill();
    g.fillStyle = '#2f6fa3'; g.fillRect(x + w / 2 - 5, y, 10, h); g.fillRect(x, y + h / 2 - 5, w, 10);
  }
  // 天井ぎわの赤い配管と継ぎ手
  const py = yAt(5.25);
  const pg = g.createLinearGradient(0, py - 12, 0, py + 12);
  pg.addColorStop(0, '#ff9a86'); pg.addColorStop(0.45, '#e6533d'); pg.addColorStop(1, '#9e2c1d');
  g.fillStyle = pg; g.fillRect(0, py - 12, W, 24);
  for (let x = 64; x < W; x += 128) {
    g.fillStyle = '#8a8f99'; g.fillRect(x - 9, py - 16, 18, 32);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x - 9, py - 16, 18, 5);
  }
  // 床ぎわの幅木と、その上の黄色いライン
  const sk = yAt(0.65);
  g.fillStyle = '#3a7d8c'; g.fillRect(0, sk, W, H - sk);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, sk, W, 4);
  g.fillStyle = '#ffd23d'; g.fillRect(0, sk - 14, W, 10);
  return finishTex(c, true);
}

// 穴の縁：黄と黒の警告しま模様
function makeHazardTexture() {
  const [c, g] = texCanvas(128, 32);
  g.fillStyle = '#ffd21f'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#26221e';
  for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  return finishTex(c, true);
}

// ジャンプパッド：トランポリン
function makePadTexture() {
  const [c, g] = texCanvas(256);
  g.fillStyle = '#2b78d6'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1b4f93'; rrect(g, 10, 10, 236, 236, 30); g.fill();
  g.fillStyle = '#25262c'; rrect(g, 24, 24, 208, 208, 24); g.fill();
  // ばね
  g.strokeStyle = '#c7ccd6'; g.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const pts = t < .25 ? [24 + t * 4 * 208, 24] : t < .5 ? [232, 24 + (t - .25) * 4 * 208] : t < .75 ? [232 - (t - .5) * 4 * 208, 232] : [24, 232 - (t - .75) * 4 * 208];
    g.beginPath(); g.moveTo(pts[0], pts[1]); g.lineTo(pts[0] + (128 - pts[0]) * 0.14, pts[1] + (128 - pts[1]) * 0.14); g.stroke();
  }
  // 的
  const rings = ['#ff4b3e', '#ffffff', '#ff4b3e', '#ffffff', '#ff4b3e'];
  rings.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(128, 128, 86 - i * 17, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#ffffff'; g.beginPath();
  g.moveTo(128, 82); g.lineTo(152, 116); g.lineTo(138, 116); g.lineTo(138, 160); g.lineTo(118, 160); g.lineTo(118, 116); g.lineTo(104, 116); g.closePath(); g.fill();
  g.strokeStyle = '#ff4b3e'; g.lineWidth = 3; g.stroke();
  return finishTex(c);
}

// 歯車（壁の飾り）
function makeGearTexture(col, dark) {
  const [c, g] = texCanvas(256);
  const cx = 128, cy = 128, n = 12;
  g.beginPath();
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2;
    const r = (i % 4 < 2) ? 122 : 100;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = col; g.fill();
  g.lineWidth = 6; g.strokeStyle = dark; g.stroke();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3;
    g.beginPath(); g.arc(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62, 18, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 5; g.strokeStyle = dark;
  g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 8;
  g.beginPath(); g.arc(cx, cy, 82, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  return finishTex(c);
}

// ゴールの柱（キャンディ模様）と旗（チェッカー）
function makeCandyTexture() {
  const [c, g] = texCanvas(64, 256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#ff3d4a';
  for (let y = -64; y < 320; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y - 32); g.lineTo(64, y - 8); g.lineTo(0, y + 24); g.fill(); }
  return finishTex(c, true);
}
function makeCheckerTexture() {
  const [c, g] = texCanvas(256, 96);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) { g.fillStyle = ((x + y) % 2) ? '#1d1d24' : '#ffffff'; g.fillRect(x * 32, y * 32, 32, 32); }
  return finishTex(c);
}

// 空（塔の上と、縦穴の上に見える）
function makeSkyTexture() {
  const [c, g] = texCanvas(1024, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#2f8fe8'); gr.addColorStop(0.28, '#6dbcff'); gr.addColorStop(0.47, '#bfe2ff'); gr.addColorStop(0.53, '#d6ecff'); gr.addColorStop(1, '#d6ecff');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  const rnd = mulberry32(7);
  for (let k = 0; k < 13; k++) {
    const x = rnd() * 1024, y = 110 + rnd() * 110, s = 12 + rnd() * 18;
    g.fillStyle = 'rgba(255,255,255,' + (0.75 + rnd() * 0.25) + ')';
    for (let j = 0; j < 5; j++) {
      const ox = (j - 2) * s * 0.9 + (rnd() - .5) * s * .4, oy = -Math.sin(j / 4 * Math.PI) * s * 0.6;
      for (const dx of [0, -1024, 1024]) { g.beginPath(); g.arc(x + ox + dx, y + oy, s * (0.8 + rnd() * 0.4), 0, Math.PI * 2); g.fill(); }
    }
  }
  return finishTex(c);
}

// 光のにじみ（スプライト用）
function makeGlowTexture() {
  const [c, g] = texCanvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.28, 'rgba(255,255,255,.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const FLOOR_TEX = makeFloorTexture();
const CEIL_TEX  = makeCeilTextures();
const SIDE_TEX  = makeSideTexture();
const WALL_TEX  = makeWallTexture();
const HAZ_TEX   = makeHazardTexture();
const GLOW_TEX  = makeGlowTexture();
const PAD_TEX   = makePadTexture();
const CANDY_TEX = makeCandyTexture();
const FLAG_TEX  = makeCheckerTexture();
const SKY_TEX   = makeSkyTexture();
const HAZ_TEX_Z = HAZ_TEX.clone(); HAZ_TEX_Z.needsUpdate = true; HAZ_TEX_Z.rotation = Math.PI / 2; HAZ_TEX_Z.center.set(0.5, 0.5);

// 階ごとの床の色（マップが無いので、色で今いる階が分かるように）
const FLOOR_COLORS = [0xff6f61, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac, 0x38d9a9];
const BASEMENT_COLOR = 0xb3aa9a;
function floorColor(f) { return f < 0 ? BASEMENT_COLOR : FLOOR_COLORS[f % FLOOR_COLORS.length]; }

// ---------- マテリアル ----------
const GEAR_COLS = [['#ffc83d', '#8a5a12'], ['#5aa8ff', '#1f4d87'], ['#ff6b5b', '#8a2a1f'], ['#6ad46f', '#2a6e2e']];
const MAT = {
  floor: new THREE.MeshStandardMaterial({ map: FLOOR_TEX, roughness: 0.55, metalness: 0 }),
  ceil:  new THREE.MeshStandardMaterial({ map: CEIL_TEX.map, emissiveMap: CEIL_TEX.emap, emissive: 0xffe2a0, emissiveIntensity: 1.0, roughness: 0.9, metalness: 0 }),
  side:  new THREE.MeshStandardMaterial({ map: SIDE_TEX, roughness: 0.6, metalness: 0 }),
  wall: new THREE.MeshStandardMaterial({ map: WALL_TEX, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  rim:   new THREE.MeshBasicMaterial({ map: HAZ_TEX }),
  rimZ:  new THREE.MeshBasicMaterial({ map: HAZ_TEX_Z }),
  pad:   new THREE.MeshBasicMaterial({ map: PAD_TEX }),
  beam: new THREE.MeshBasicMaterial({
    color: 0xffa21a, transparent: true, opacity: 0.16,
    depthWrite: false, side: THREE.DoubleSide
  }),
  goalBeam: new THREE.MeshBasicMaterial({
    color: 0x2fe07a, transparent: true, opacity: 0.20, fog: false,
    depthWrite: false, side: THREE.DoubleSide
  }),
  goal:  new THREE.MeshStandardMaterial({ map: CANDY_TEX, roughness: 0.4, metalness: 0 }),
  flag:  new THREE.MeshBasicMaterial({ map: FLAG_TEX, side: THREE.DoubleSide }),
  sky:   new THREE.MeshBasicMaterial({ map: SKY_TEX, side: THREE.BackSide, fog: false, depthWrite: false }),
  enemy: new THREE.MeshBasicMaterial({ color: 0xff2a4a }),
  eye:   new THREE.MeshBasicMaterial({ color: 0xffffff }),
  pupil: new THREE.MeshBasicMaterial({ color: 0x160008 }),
  star:  new THREE.MeshBasicMaterial({ color: 0xffdd22 }),
  gears: GEAR_COLS.map(([a, b]) => new THREE.MeshStandardMaterial({
    map: makeGearTexture(a, b), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1
  }))
};
// 床タイル（箱）の面ごとの材質：+x, -x, 上=床, 下=天井, +z, -z
const TILE_MATS = [MAT.side, MAT.side, MAT.floor, MAT.side, MAT.side, MAT.side];

// 空のドーム（カメラについて動く）
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), MAT.sky);
skyDome.renderOrder = -1;
scene.add(skyDome);

function glowSprite(color, size) {
  const m = new THREE.SpriteMaterial({
    map: GLOW_TEX, color: color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

// ---------- 共有ジオメトリ ----------
const GEO = {
  unit:   new THREE.BoxGeometry(1, 1, 1),
  tile:   new THREE.BoxGeometry(CELL, FLOOR_T, CELL),
  sphere: new THREE.SphereGeometry(1, 18, 14),
  octa:   new THREE.OctahedronGeometry(0.42, 0),
  ring:   new THREE.TorusGeometry(1, 0.05, 6, 30),
  plane:  new THREE.PlaneGeometry(1, 1),
  ceil:   new THREE.PlaneGeometry(CELL, CELL).rotateX(Math.PI / 2),   // 下向きの板
  shadow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  megaRing: new THREE.RingGeometry(1.36, 1.8, 32).rotateX(-Math.PI / 2),
  signPlane: new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2),
  cone:   new THREE.ConeGeometry(Math.tan(Math.PI * 22.5 / 180), 1, 18, 1, true)
};

// ===================== ゲーム状態 =====================
const G = {
  active: false, paused: false, elapsed: 0,
  d: null, group: null,
  pads: [], enemies: [], powerUps: [], fx: [],
  goalObj: null, goalPos: null,
  player: null,
  fovKick: 0, bob: 0, shake: 0
};

const cellCenter = (idx, half) => -half + (idx + 0.5) * CELL;
const cellIndex  = (v, half)   => Math.floor((v + half) / CELL);
const floorY     = (f) => f * FLOOR_GAP;

function disposeGroup(g) {
  const keepG = Object.values(GEO), keepM = [].concat(...Object.values(MAT), ...Object.values(CM));
  g.traverse(o => {
    if (o.geometry && keepG.indexOf(o.geometry) < 0) o.geometry.dispose();
    if (!o.material || Array.isArray(o.material)) return;          // 床タイルの面別材質は共有
    if (keepM.indexOf(o.material) < 0 && o.material !== G.wallMat) o.material.dispose();
  });
}

// ===================== 屋外コース（おもちゃ工場の空中レース） =====================
// 浮いている床（箱）を自由に並べたコース。床は「下からはすり抜け、上からは乗れる」。
// トランポリンの跳び方は従来どおり（真上に打ち上げ、空中では自由に横移動できる）。

const PEAK_MARGIN = 2.2;        // トランポリンの最高点は、着地先より少し上
const PAD_R       = 1.25;       // トランポリンの半径
const MEGA_R      = 1.7;        // スーパートランポリン（金色）：ふつうの数倍の高さまで跳ぶ
const BOUNCY_R    = 1.55;       // ダイブトランポリン（ピンク）：高いところから落ちるほど高く跳ね返る
const BOUNCY_BASE = 1.0;
// ---- 機能の切り替え（ターザンロープとサブルートは、いったん止めている。true に戻せば復活する） ----
const FEATURE_ROPE = false;     // ターザンロープ（つかむ・振る・はなす）
const FEATURE_SUB  = false;     // メインルートの下のサブルート（ロープで進む階層）
const ROPE_GRIP   = 1.75;       // ロープにぶら下がったときの、足元から手までの高さ
const ROPE_GRAB_R = 0.9;        // この距離まで近づけばロープをつかむ
const ROPE_PUMP   = 1.7;        // 前後の入力で振りを大きくする強さ
const ROPE_MAXA   = 1.3;        // 振れ幅の上限（約75度）
const ROPE_REGRAB = 0.45;       // 手をはなしてから同じロープをつかめるまで
const ROPE_TIP    = 1.2;        // ロープの先端（静止時）は、乗ってきた床より少し上        // ダイブトランポリンに歩いて乗ったときの高さ（小さく跳ねるだけ）
const LAUNCH_R    = 1.3;        // 発射台の半径
const LAUNCH_VY   = 13;         // 発射台の上向きの初速
const BOOST_DUR   = 1.6;        // 発射台で飛んだあと、着地してからの加速
const EDGE_GRACE  = 0.27;       // 床の縁に少しかかっていれば乗れる
const STEP_UP     = 0.45;       // この高さまでの段差は歩いて上がれる
const CRUMBLE_T   = 0.55;       // 崩れる床：乗ってから落ちるまで
const CRUMBLE_BACK = 3.6;       // 崩れる床：落ちてから戻るまで
const ROTOR_H     = 1.15;       // 回転バーの高さ（これより上を跳んでいれば当たらない）
const TILE_M      = 3.2;        // 床の模様1枚の大きさ(m)

// ---------- 生成 ----------
function airTime(jv, dy) {                     // 初速 jv で打ち上げ、高さ dy を下りながら通過する時刻
  const disc = jv * jv - 2 * GRAVITY * dy;
  return disc < 0 ? -1 : (jv + Math.sqrt(disc)) / GRAVITY;
}
function padJV(dh) { return Math.sqrt(2 * GRAVITY * (Math.max(dh, 0) + PEAK_MARGIN)); }
function padReach(dh) { const t = airTime(padJV(dh), dh); return t < 0 ? 0 : AIR_SPEED * t; }

const SEG_COLORS = [0xff6f61, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac, 0x38d9a9];

// 離れた区間どうしが重なったら、種をずらして作り直す（全員が同じ手順なので結果も同じ）
function generateCourse(D, seed) {
  let C = null;
  for (let a = 0; a < 40; a++) {
    C = generateCourseOnce(D, (seed + a * 7919) | 0);
    if (!courseOverlaps(C)) { C.tries = a + 1; break; }
  }
  if (!C.tries) C.tries = 40;
  if (FEATURE_SUB) buildSubRoute(C, (seed ^ 0x5b17) | 0);
  else C.subRoutes = [];
  return C;
}
function courseOverlaps(C) {
  const ps = C.plats;
  for (let i = 0; i < ps.length; i++) {
    const A = ps[i];
    if (A.sub) continue;
    const ax = A.w / 2 + (A.mv && A.mv.ax ? A.mv.amp : 0) + 1.2, az = A.d / 2 + (A.mv && A.mv.az ? A.mv.amp : 0) + 1.2;
    for (let j = i + 1; j < ps.length; j++) {
      const B = ps[j];
      if (B.sub || Math.abs(B.seg - A.seg) < 2) continue;
      if (Math.abs(B.y - A.y) > 18 + (A.mv && A.mv.ay ? A.mv.amp : 0) + (B.mv && B.mv.ay ? B.mv.amp : 0)) continue;
      const bx = B.w / 2 + (B.mv && B.mv.ax ? B.mv.amp : 0), bz = B.d / 2 + (B.mv && B.mv.az ? B.mv.amp : 0);
      if (Math.abs(A.x - B.x) < ax + bx && Math.abs(A.z - B.z) < az + bz) return true;
    }
  }
  return false;
}
function generateCourseOnce(D, seed) {
  const rnd = mulberry32(seed);
  const rr = (a, b) => a + (b - a) * rnd();
  const ri = (n) => Math.floor(rnd() * n);
  const pick = (arr) => arr[ri(arr.length)];

  const C = { D: D, plats: [], pads: [], launchers: [], rotors: [], gems: [], cps: [], path: [], segs: [], route: [], track: [] };
  const R = (k, q, o) => C.route.push(Object.assign({ k: k, x: q.x, y: q.y, z: q.z }, o || {}));   // 自動走行テスト用の道順
  const nSeg   = Math.min(5 + Math.floor(D * 1.5), 22);
  const W      = Math.max(4.6, 8.6 - D * 0.4);            // 道の幅
  const gapMul = 1 + Math.min(D, 10) * 0.06;              // すき間の広さ
  const hMax   = Math.min(4.5 + D * 1.1, 13);             // 1回で登る最大の高さ

  // 進行方向（90度単位）。前 = (hx,hz)、右 = (-hz,hx)
  let hx = 0, hz = -1;
  let px = 0, pz = 0, py = 0;                              // いまの道の先端（床の前の縁の中央）
  let segColor = 0, curSeg = -1;

  // 道に沿った座標 (along, lateral) で床を置く。a0〜a1 は前方向の範囲
  function plat(a0, a1, lat, wid, y, o) {
    const rx = -hz, rz = hx;
    const ca = (a0 + a1) / 2, len = a1 - a0;
    const x = px + hx * ca + rx * lat, z = pz + hz * ca + rz * lat;
    const alongX = hx !== 0;
    const P = Object.assign({
      x: x, z: z, y: y, w: alongX ? len : wid, d: alongX ? wid : len, t: 0.8,
      col: SEG_COLORS[segColor % SEG_COLORS.length], kind: 'plat',
      cx: x, cz: z, cy: y, dx: 0, dz: 0, dy: 0, gone: false, seg: curSeg
    }, o || {});
    C.plats.push(P);
    return P;
  }
  function at(a, lat, y) {
    const rx = -hz, rz = hx;
    return { x: px + hx * a + rx * (lat || 0), y: y, z: pz + hz * a + rz * (lat || 0) };
  }
  function addPath(a, lat, y) { C.path.push(at(a, lat, y)); }
  function addPad(P, a, lat, dh) {
    const q = at(a, lat, P.y);
    C.pads.push({ plat: P, ox: q.x - P.x, oz: q.z - P.z, jv: padJV(dh), dh: dh, anim: 0, kind: 'normal', r: PAD_R });
    return C.pads[C.pads.length - 1];
  }
  function addCP(P, a) {
    const q = at(a, 0, P.y);
    C.cps.push({ x: q.x, y: P.y, z: q.z, yaw: Math.atan2(-hx, -hz), plat: P, seg: curSeg });
    R('walk', q, { cp: C.cps.length - 1, cpo: C.cps[C.cps.length - 1] });
  }
  function addGem(a, lat, y) { const q = at(a, lat, y); C.gems.push({ x: q.x, y: y, z: q.z }); }
  function advance(a, ny) {
    if (a > 0.01) C.track.push({ x: px, z: pz, hx: hx, hz: hz, len: a, seg: curSeg });   // サブルート用に、道の通り道を記録
    const q = at(a, 0, ny); px = q.x; pz = q.z; py = ny;
  }

  // 既に置いた床と重ならないかの確認（高さが近いものだけ）
  function clearAhead(len, wid, y) {
    const rx = -hz, rz = hx;
    for (let s = 2; s <= len; s += 3) {
      for (const l of [-wid / 2, 0, wid / 2]) {
        const x = px + hx * s + rx * l, z = pz + hz * s + rz * l;
        for (const P of C.plats) {
          if (Math.abs(P.y - y) > 7) continue;
          if (Math.abs(x - P.x) < P.w / 2 + 1.5 && Math.abs(z - P.z) < P.d / 2 + 1.5) return false;
        }
      }
    }
    return true;
  }

  // ---- スタートの広場 ----
  const S0 = 15;
  C.plats.push({ x: 0, z: 0, y: 0, w: S0, d: S0, t: 1.2, col: 0xfff1b8, kind: 'plat', cx: 0, cz: 0, cy: 0, dx: 0, dz: 0, dy: 0, gone: false, start: true, seg: -1 });
  C.start = { x: 0, y: 0, z: 0, yaw: 0 };
  C.cps.push({ x: 0, y: 0, z: 0, yaw: 0, plat: C.plats[0], seg: -1 });
  C.signs = []; C.ropes = [];
  C.path.push({ x: 0, y: 0, z: 0 });
  advance(S0 / 2, 0);

  // ---- 区間 ----
  const types = [];
  const pool = (i) => {
    const t = ['climb', 'climb'];
    if (D >= 1) t.push('islands', 'launch', 'conveyor', 'mega', 'dive');
    if (D >= 2) t.push('mover', 'crumble', 'rotor', 'islands');
    if (D >= 3) t.push('elevator', 'launch', 'rotor', 'mega');
    if (D >= 4) t.push('dive');
    if (D >= 5) t.push('islands', 'crumble', 'mover');
    if (py > 7) t.push('drop');
    return t;
  };
  let last = '';
  for (let i = 0; i < nSeg; i++) {
    let ty;
    // 1面目は登りと発射台だけで、分かりやすく
    if (D === 0) ty = i === nSeg - 1 ? 'mega' : (i % 2 === 0) ? 'climb' : (i === 3 ? 'drop' : 'runclimb');
    else { do { ty = pick(pool(i)); } while (ty === last && rnd() < 0.7); }
    if (ty === 'drop' && py < 7) ty = 'climb';
    last = ty;
    curSeg = i;
    segColor++;

    // 曲がり角（ときどき左右に90度曲がる）
    if (i > 0 && rnd() < 0.38) {
      const cw = W + 2;
      const corner = plat(0, cw, 0, cw, py);
      R('walk', at(cw / 2, 0, py));
      addPath(cw / 2, 0, py);
      // 曲がる向き：重ならない方を選ぶ
      const save = [hx, hz, px, pz], tlen = C.track.length;
      const dirs = rnd() < 0.5 ? [1, -1] : [-1, 1];
      let ok = false;
      for (const s of dirs) {
        hx = save[0]; hz = save[1]; px = save[2]; pz = save[3]; C.track.length = tlen;
        // 角の中心へ移動してから向きを変える
        advance(cw / 2, py);
        const nhx = s > 0 ? -hz : hz, nhz = s > 0 ? hx : -hx;
        hx = nhx; hz = nhz;
        advance(cw / 2, py);
        if (clearAhead(30, W + 4, py)) { ok = true; break; }
      }
      if (!ok) { hx = save[0]; hz = save[1]; px = save[2]; pz = save[3]; C.track.length = tlen; advance(cw, py); }
      void corner;
    }

    const segStart = C.plats.length;
    const seg = { type: ty, from: C.path.length };
    C.segs.push(seg);

    // 入口の助走路（チェックポイント付き）
    const appLen = rr(7, 10);
    const A = plat(-0.05, appLen, 0, W, py);
    addCP(A, appLen * 0.45);
    addPath(appLen * 0.5, 0, py);
    if (rnd() < 0.3) addGem(appLen * 0.55, rr(-W / 4, W / 4), py);

    if (ty === 'climb' || ty === 'runclimb') {
      // トランポリンで上の床へ
      const dh = (D === 0) ? rr(3.5, 5) : rr(3.5, hMax);
      const reach = padReach(dh);
      let gap = rr(2.0, 3.6) * gapMul;
      const padA = appLen - 1.8;
      gap = Math.min(gap, reach * 0.8 - (appLen - padA) - 1.2);
      gap = Math.max(gap, 1.0);
      addPad(A, padA, 0, dh);
      const bLen = rr(8, 11);
      const b0 = appLen + gap;
      const B = plat(b0, b0 + bLen, 0, W, py + dh);
      seg.jump = { from: at(padA, 0, py), to: at(b0 + 2.5, 0, py + dh) };
      R('walk', at(padA, 0, py)); R('pad', at(b0 + 2.5, 0, py + dh), { plat: B });
      addPath(b0 + bLen / 2, 0, py + dh);
      advance(b0 + bLen, py + dh);
      if (ty === 'runclimb' && rnd() < 0.5) addGem(b0 + bLen / 2, 0, py);

    } else if (ty === 'islands') {
      // 浮島をトランポリンで渡っていく
      const n = 2 + Math.min(D, 4) + ri(2);
      const s = Math.max(3.4, 5.2 - D * 0.18);
      let a = appLen - 1.8, y = py, prevP = A;
      addPad(A, a, 0, 0);       // 仮。次の島が決まったら高さを入れ直す
      R('walk', at(a, 0, py));
      let lat = 0;
      const jumps = [];
      for (let k = 0; k < n; k++) {
        const dh = rr(-1.0, Math.min(5.5, hMax * 0.6));
        const reach = padReach(dh);
        const prevHalf = k === 0 ? 1.8 : s / 2;
        const dist = Math.max(prevHalf + s / 2 + 1.4, Math.min(rr(4.5, 7.0) * gapMul, reach * 0.78));
        const nlat = (D >= 3) ? Math.max(-W, Math.min(W, lat + rr(-3, 3))) : 0;
        const na = a + Math.sqrt(Math.max(1, dist * dist - (nlat - lat) * (nlat - lat)));
        C.pads[C.pads.length - 1].jv = padJV(dh);
        C.pads[C.pads.length - 1].dh = dh;
        const isMover = (D >= 4 && rnd() < 0.3);
        const I = plat(na - s / 2, na + s / 2, nlat, s, y + dh, isMover ? {
          kind: 'mover', mv: { ax: -hz, az: hx, ay: 0, amp: 1.6, om: rr(0.9, 1.4), ph: rnd() * 6.28 }
        } : {});
        jumps.push({ from: at(a, lat, y), to: at(na, nlat, y + dh) });
        R('pad', at(na, nlat, y + dh), { plat: I });
        y += dh; a = na; lat = nlat; prevP = I;
        addPath(na, nlat, y);
        if (k < n - 1) addPad(I, na, nlat, 0);
      }
      // 最後の島から出口へ
      const dh = rr(0, Math.min(4, hMax * 0.5));
      addPad(prevP, a, lat, dh);
      const reach = padReach(dh);
      const gap = Math.min(rr(2.5, 4.5), reach * 0.78 - s / 2 - 2.5);
      const b0 = a + s / 2 + Math.max(gap, 1.4);
      const bLen = rr(8, 10);
      const B = plat(b0, b0 + bLen, 0, W, y + dh);
      jumps.push({ from: at(a, lat, y), to: at(b0 + 2.5, 0, y + dh) });
      R('pad', at(b0 + 2.5, 0, y + dh), { plat: B });
      seg.jumps = jumps;
      addPath(b0 + bLen / 2, 0, y + dh);
      advance(b0 + bLen, y + dh);
      if (rnd() < 0.5) addGem(b0 + bLen * 0.6, 0, y + dh);

    } else if (ty === 'launch') {
      // 発射台で大きな谷を越える
      const gap = rr(8, 13) * gapMul;
      const dy = -rr(0, 3);
      const la = appLen - 2.0;
      const toEdge = (appLen - la) + gap;
      const T = airTime(LAUNCH_VY, dy);
      const need = toEdge + 2.2;
      const k = need * KNOCK_DECAY / (1 - Math.exp(-KNOCK_DECAY * T));
      const q = at(la, 0, py);
      C.launchers.push({ plat: A, ox: q.x - A.x, oz: q.z - A.z, dirx: hx, dirz: hz, k: k, vy: LAUNCH_VY, anim: 0 });
      const bLen = 18;
      const b0 = appLen + gap;
      const B = plat(b0, b0 + bLen, 0, W + 1, py + dy);
      R('walk', q); R('air', at(b0 + 3, 0, py + dy), { plat: B });
      seg.launch = { from: q, to: at(b0 + 3, 0, py + dy) };
      addPath(appLen + gap / 2, 0, py + 3);
      addPath(b0 + bLen / 2, 0, py + dy);
      advance(b0 + bLen, py + dy);

    } else if (ty === 'conveyor') {
      // ベルトコンベア（前向きは追い風、後ろ向きと横向きは邪魔）
      const L = rr(12, 20);
      const r = rnd();
      let dirSign = 1, side = 0, spd = rr(3, 4.5);
      if (D >= 2 && r < 0.45) { dirSign = -1; spd = rr(2.5, 3.5); }
      if (D >= 4 && r > 0.75) { dirSign = 0; side = rnd() < 0.5 ? 1 : -1; spd = rr(2.2, 3.2); }
      const rx = -hz, rz = hx;
      const vx = (hx * dirSign + rx * side) * spd, vz = (hz * dirSign + rz * side) * spd;
      plat(appLen, appLen + L, 0, W, py, { kind: 'conv', conv: { vx: vx, vz: vz } });
      addPath(appLen + L / 2, 0, py);
      const bLen = 6;
      plat(appLen + L, appLen + L + bLen, 0, W, py);
      advance(appLen + L + bLen, py);
      if (rnd() < 0.5) addGem(appLen + L * 0.5, 0, py);

    } else if (ty === 'mover') {
      // すき間を往復する床に乗って渡る
      const gap = rr(6, 9) * gapMul;
      const mLen = 4.2;
      const amp = (gap - mLen) / 2 + 0.35;
      const mid = appLen + gap / 2;
      const per = rr(3.6, 5.0) / (1 + D * 0.04);
      const M = plat(mid - mLen / 2, mid + mLen / 2, 0, W * 0.8, py + 0.25, {
        kind: 'mover', col: 0x8ee3ff, mv: { ax: hx, az: hz, ay: 0, amp: amp, om: Math.PI * 2 / per, ph: rnd() * 6.28 }
      });
      R('walk', at(appLen - 0.7, 0, py)); R('ride', at(appLen + gap + 1.5, 0, py), { plat: M });
      addPath(mid, 0, py);
      const bLen = rr(7, 9);
      plat(appLen + gap, appLen + gap + bLen, 0, W, py);
      advance(appLen + gap + bLen, py);

    } else if (ty === 'elevator') {
      // 上下するエレベーターで上の床へ
      const dh = rr(4, Math.min(9, hMax));
      const eLen = 4.2;
      const per = rr(4.5, 6);
      const M = plat(appLen + 0.1, appLen + eLen - 0.1, 0, W * 0.8, py + dh / 2 + 0.1, {
        kind: 'mover', col: 0x8ee3ff, mv: { ax: 0, az: 0, ay: 1, amp: dh / 2, om: Math.PI * 2 / per, ph: rnd() * 6.28 }
      });
      R('walk', at(appLen - 0.7, 0, py)); R('ride', at(appLen + eLen + 1.5, 0, py + dh), { plat: M });
      addPath(appLen + eLen / 2, 0, py + dh / 2);
      const bLen = rr(8, 10);
      plat(appLen + eLen, appLen + eLen + bLen, 0, W, py + dh);
      advance(appLen + eLen + bLen, py + dh);

    } else if (ty === 'crumble') {
      // 乗るとすぐ崩れるブロックの橋
      const L = rr(8, 15) * gapMul;
      const bw = 2.4;
      const n = Math.ceil(L / bw);
      for (let k = 0; k < n; k++) {
        plat(appLen + k * bw + 0.06, appLen + (k + 1) * bw - 0.06, 0, Math.max(2.8, W * 0.7), py, { kind: 'crumble', col: 0xf2c48d, cr: { st: 0, t: 0 } });
      }
      addPath(appLen + n * bw / 2, 0, py);
      const bLen = 7;
      plat(appLen + n * bw, appLen + n * bw + bLen, 0, W, py);
      advance(appLen + n * bw + bLen, py);

    } else if (ty === 'rotor') {
      // 回転するバーが床の上をなぎ払う
      const Sz = Math.max(9, W + 4);
      const R = plat(appLen, appLen + Sz, 0, Sz, py);
      const c = at(appLen + Sz / 2, 0, py);
      C.rotors.push({ plat: R, ox: c.x - R.x, oz: c.z - R.z, len: Sz / 2 - 0.35,
        arms: D >= 5 ? 2 : 1, om: (rnd() < 0.5 ? 1 : -1) * rr(1.3, 1.8 + D * 0.08), ph: rnd() * 6.28, hitCD: 0 });
      addPath(appLen + Sz / 2, 0, py);
      const bLen = 6;
      plat(appLen + Sz, appLen + Sz + bLen, 0, W, py);
      advance(appLen + Sz + bLen, py);

    } else if (ty === 'mega') {
      // スーパートランポリンで、空高く浮かぶ床へ
      const dh = D === 0 ? rr(15, 18) : rr(16, Math.min(22 + D * 2.5, 40));
      const reach = padReach(dh);
      const padA = appLen - 2.2;
      const gap = Math.max(2.5, Math.min(rr(4, 6 + D * 0.8), reach * 0.75 - 2.2 - 3.5));
      const pd = addPad(A, padA, 0, dh);
      pd.kind = 'mega'; pd.r = MEGA_R;
      const bLen = 12;
      const b0 = appLen + gap;
      const B = plat(b0, b0 + bLen, 0, W + 2, py + dh, { t: 1.0 });
      R('walk', at(padA, 0, py)); R('pad', at(b0 + 3.5, 0, py + dh), { plat: B });
      addGem(b0 + 6, 0, py + dh);
      addPath(appLen, 0, py + dh * 0.6);
      addPath(b0 + bLen / 2, 0, py + dh);
      advance(b0 + bLen, py + dh);

    } else if (ty === 'dive') {
      // 床の端から飛び降り、下のピンクのトランポリンへ。落ちた高さのぶん高く跳ね返る
      const drop = rr(9, Math.min(13 + D * 1.3, 26));
      const up = rr(3, Math.min(6 + D * 0.35, 9));
      const s = 4.0;
      const tf = Math.sqrt(2 * drop / GRAVITY);
      const fall = Math.max(s / 2 + 1.5, Math.min(rr(3, 6), tf * AIR_SPEED * 0.6) + s / 2);
      const ia = appLen + fall;
      const I = plat(ia - s / 2, ia + s / 2, 0, s, py - drop, { col: 0xffc2de });
      const pd = addPad(I, ia, 0, 0);
      pd.kind = 'bouncy'; pd.r = BOUNCY_R; pd.drop = drop; pd.bonus = up + PEAK_MARGIN; pd.jv = padJV(BOUNCY_BASE - PEAK_MARGIN + 0.01);
      const jvFull = Math.sqrt(2 * GRAVITY * (drop + up + PEAK_MARGIN));
      const reach = (airTime(jvFull, drop + up)) * AIR_SPEED;
      const gap = Math.max(1.5, Math.min(rr(2.5, 5), reach * 0.75 - s / 2 - 3));
      const b0 = ia + s / 2 + gap;
      const bLen = rr(9, 11);
      const B = plat(b0, b0 + bLen, 0, W, py + up);
      C.signs.push(Object.assign(at(appLen - 1.6, 0, py), { yaw: Math.atan2(-hx, -hz) }));
      R('pad', at(ia, 0, py - drop), { plat: I }); R('pad', at(b0 + 2.8, 0, py + up), { plat: B });
      addPath(ia, 0, py - drop * 0.4);
      addPath(b0 + bLen / 2, 0, py + up);
      advance(b0 + bLen, py + up);

    } else if (ty === 'rope' || ty === 'ropes') {
      // ターザンロープ：振り子で谷を越える。長さは1本ずつちがう
      const n = ty === 'ropes' ? 2 + (D >= 6 && rnd() < 0.5 ? 1 : 0) : 1;
      const tipY = py + ROPE_TIP;
      const dB = rr(0, Math.min(1.5 + D * 0.15, 3));
      let a = appLen + rr(1.6, 2.6);         // 1本目の、静止時の位置
      R('walk', at(appLen - 0.5, 0, py));
      for (let k = 0; k < n; k++) {
        const L = rr(4.5, Math.min(7 + D * 1.2, 17));
        const last = k === n - 1;
        // 最後のロープ：足が出口の床より上に来る角度＋少し。途中のロープ：次のロープへ手が届く角度
        let need;
        if (last) need = Math.max(0.5, Math.acos(Math.max(-1, 1 - Math.max(0.05, 1.45 - dB) / L))) + 0.15;
        else need = rr(0.55, 0.75);
        need = Math.min(need, 1.12);
        const prevEdge = k === 0 ? appLen : null;
        const back = k === 0 ? (a - prevEdge) + 0.6 : 1.2;
        const idleA = Math.min(0.9, Math.asin(Math.min(0.85, back / L)));
        const q = at(a, 0, tipY + L);
        C.ropes.push({ ax: q.x, ay: q.y, az: q.z, L: L, dx: hx, dz: hz, idleA: idleA,
          th: 0, om: 0, ph: rnd() * 6.28, need: need, cd: 0, seg: curSeg });
        const ri = C.ropes.length - 1;
        const fx = a + L * Math.sin(need);     // 振り切ったときの先端の位置
        if (last) {
          const bLen = 10;
          const b0 = a + L * Math.sin(need - 0.15) + 0.2;
          const B = plat(b0, b0 + bLen, 0, W, py - dB);
          R('rope', at(fx, 0, py - dB), { rope: ri, plat: B });
          R('pad', at(Math.max(b0 + 2.5, fx + 1), 0, py - dB), { plat: B });
          addPath(a, 0, tipY); addPath(b0 + bLen / 2, 0, py - dB);
          advance(b0 + bLen, py - dB);
        } else {
          R('rope', at(fx, 0, tipY), { rope: ri, next: true });
          addPath(a, 0, tipY);
          a = fx + rr(1.6, 2.6);
        }
      }

    } else if (ty === 'drop') {
      // 下の床へ飛び降りる
      const dh = rr(4, 7);
      const g = 1.6;
      const bLen = 12;
      plat(appLen + g, appLen + g + bLen, 0, W + 2, py - dh);
      addPath(appLen + g + bLen / 2, 0, py - dh);
      advance(appLen + g + bLen, py - dh);
    }
    seg.to = C.path.length;
    seg.plats = [segStart, C.plats.length];
  }

  // ---- ゴールの広場 ----
  segColor++;
  curSeg = nSeg;
  const appLen = 8;
  const A = plat(-0.05, appLen, 0, W, py);
  addCP(A, appLen * 0.5);
  const GS = 13;
  R('walk', at(appLen + GS * 0.62, 0, py));
  const Gp = plat(appLen, appLen + GS, 0, GS, py, { col: 0xfff1b8, t: 1.2, goal: true });
  const gq = at(appLen + GS * 0.62, 0, py);
  C.goal = { x: gq.x, y: py, z: gq.z, yaw: Math.atan2(-hx, -hz) };
  addPath(appLen + GS * 0.62, 0, py);
  C.track.push({ x: px, z: pz, hx: hx, hz: hz, len: appLen + GS * 0.62, seg: nSeg });
  void Gp;

  finishCourseShape(C, true);
  return C;
}

// 落下判定の高さ・進み具合の物差し・範囲（サブルートを足したあとにも計算し直す）
function finishCourseShape(C, withProg) {
  // ---- 落下と判定する高さ（チェックポイントごと。飛び降りる区間は深めに） ----
  for (const c of C.cps) {
    let lo = c.y;
    for (const P of C.plats) if (P.seg === c.seg || P.seg === c.seg + 1) lo = Math.min(lo, P.y - (P.mv && P.mv.ay ? P.mv.amp : 0));
    for (const r of C.ropes) if (!r.dead && (r.seg === c.seg || r.seg === c.seg + 1)) lo = Math.min(lo, r.ay - r.L - ROPE_GRIP - 3);
    c.fallY = lo - 14;
  }

  // ---- 進み具合の物差し（道を細かく区切った点列と累積距離） ----
  if (withProg) {
  const dense = [];
  for (let i = 0; i < C.path.length; i++) {
    const a = C.path[i], b = C.path[i + 1];
    dense.push(a);
    if (!b) break;
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.floor(L / 2);
    for (let k = 1; k < n; k++) {
      const u = k / n;
      dense.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
    }
  }
  let s = 0;
  dense.forEach((p, i) => { if (i > 0) s += Math.hypot(p.x - dense[i - 1].x, p.y - dense[i - 1].y, p.z - dense[i - 1].z); p.s = s; });
  C.prog = dense;
  C.length = s;
  }

  // ---- 範囲 ----
  let minY = 0, maxY = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const P of C.plats) {
    minY = Math.min(minY, P.y - (P.mv && P.mv.ay ? P.mv.amp : 0));
    maxY = Math.max(maxY, P.y + (P.mv && P.mv.ay ? P.mv.amp : 0));
    x0 = Math.min(x0, P.x - P.w / 2); x1 = Math.max(x1, P.x + P.w / 2);
    z0 = Math.min(z0, P.z - P.d / 2); z1 = Math.max(z1, P.z + P.d / 2);
  }
  for (const r of C.ropes) maxY = Math.max(maxY, r.ay);
  C.minY = minY; C.maxY = maxY; C.bounds = { x0: x0, x1: x1, z0: z0, z1: z1 };
  C.groundY = minY - 26;
}


// ===================== サブルート（メインルートの下を、ターザンロープで進む） =====================
// メインルートの床の裏からロープが垂れ下がり、その下の階層を振り子で渡っていく。
// ところどころのスーパートランポリンで、真上のメインルートへ戻れる。
const SUB_COLS = [0xb197fc, 0x63e6be, 0x74c0fc, 0xffa8a8, 0xffd8a8];
function buildSubRoute(C, seed) {
  const rnd = mulberry32(seed);
  const rr = (a, b) => a + (b - a) * rnd();
  const D = C.D;
  C.subRoutes = [];
  // ---- 道の通り道を、向きごとの直線にまとめる ----
  const runs = [];
  for (const t of C.track) {
    const last = runs[runs.length - 1];
    if (last && last.hx === t.hx && last.hz === t.hz &&
        Math.abs(last.x + last.hx * last.len - t.x) < 0.05 && Math.abs(last.z + last.hz * last.len - t.z) < 0.05) last.len += t.len;
    else runs.push({ x: t.x, z: t.z, hx: t.hx, hz: t.hz, len: t.len, seg: t.seg });
  }
  let U = 0;
  for (const r of runs) { r.u0 = U; U += r.len; r.u1 = U; }
  if (!runs.length) return;
  const corners = runs.slice(1).map(r => r.u0);
  const runAt = (u) => { for (const r of runs) if (u <= r.u1) return r; return runs[runs.length - 1]; };
  const pt = (u, lat) => {
    const r = u < 0 ? runs[0] : runAt(u), a = u - r.u0;      // 範囲の外は、端の直線をそのまま延ばす
    return { x: r.x + r.hx * a - r.hz * (lat || 0), z: r.z + r.hz * a + r.hx * (lat || 0), r: r };
  };
  const mainPlats = C.plats.filter(P => !P.sub);
  // その地点の真上にあるメインの床（動く床・崩れる床は、ロープを吊るせないので除く）
  const above = (x, z, margin) => {
    const out = [];
    for (const P of mainPlats) {
      if (P.kind === 'mover' || P.kind === 'crumble') continue;
      if (Math.abs(x - P.x) <= P.w / 2 - margin && Math.abs(z - P.z) <= P.d / 2 - margin) out.push(P);
    }
    return out;
  };

  // ---- サブルートを敷く区間を選ぶ：真上の床の高さの差が小さい範囲 ----
  const BAND = 10.5;
  const samples = [];
  for (let u = 0; u <= U; u += 1) {
    const q = pt(u);
    const ab = above(q.x, q.z, 0.4);
    let lo = Infinity;
    for (const P of ab) lo = Math.min(lo, P.y - P.t);
    samples.push({ u: u, x: q.x, z: q.z, lo: lo, ab: ab });
  }
  const stretches = [];
  let i = 0;
  while (i < samples.length) {
    while (i < samples.length && samples[i].lo === Infinity) i++;
    if (i >= samples.length) break;
    let mn = samples[i].lo, mx = samples[i].lo, j = i, lastCov = i;
    while (j + 1 < samples.length) {
      const s = samples[j + 1];
      if (s.lo !== Infinity) {
        const nmn = Math.min(mn, s.lo), nmx = Math.max(mx, s.lo);
        if (nmx - nmn > BAND) break;
        mn = nmn; mx = nmx; lastCov = j + 1;
      } else if (j + 1 - lastCov > 16) break;        // 真上に床のない所が長く続くなら区切る
      j++;
    }
    const st = { a: samples[i].u, b: samples[lastCov].u, lo: mn };
    if (st.b - st.a >= 26) stretches.push(st);
    i = lastCov + 6;
  }

  stretches.forEach((st, si) => {
    const Lmin = rr(4.8, 6.4);
    let Ys = st.lo - ROPE_TIP - Lmin;
    const Ws = Math.max(6, (D < 3 ? 11 : 10.5 - D * 0.35));
    // ほかの区間のメインの床と、同じくらいの高さでぶつかるなら手前で打ち切る
    for (const s of samples) {
      if (s.u < st.a - 8 || s.u > st.b + 4) continue;
      let hit = false;
      for (const P of mainPlats) {
        if (P.y < Ys - 3.5 || P.y > Ys + 3.8) continue;
        if (Math.abs(s.x - P.x) < P.w / 2 + Ws / 2 + 0.5 && Math.abs(s.z - P.z) < P.d / 2 + Ws / 2 + 0.5) { hit = true; break; }
      }
      if (hit) { if (s.u <= st.a + 4) { st.dead = true; } else st.b = Math.min(st.b, s.u - 8); break; }
    }
    if (st.dead || st.b - st.a < 22) return;
    // 出口（区間の終わり）は真上に床がある地点に合わせる
    while (st.b > st.a + 20) { const q = pt(st.b); if (above(q.x, q.z, 1.8).some(P => P.y - P.t > Ys + 5)) break; st.b -= 1; }
    if (st.b - st.a < 20) return;

    const subPlats = [], steps = [];
    let colI = si;
    const seg0 = runAt(st.a).seg;
    const mk = (u0, u1, o) => {
      // [u0,u1] を道に沿って床にする（曲がり角では四角い床でつなぐ）
      const made = [];
      let a = u0;
      const cs = corners.filter(c => c > u0 - 0.01 && c < u1 + 0.01);
      const cuts = [];
      for (const c of cs) cuts.push(c);
      const pieces = [];
      for (const c of cuts) { pieces.push([a, c - Ws / 2]); a = c + Ws / 2; }
      pieces.push([a, u1]);
      for (const [p0, p1] of pieces) {
        if (p1 - p0 < 0.3) continue;
        const r = runAt((p0 + p1) / 2), m = pt((p0 + p1) / 2);
        const len = p1 - p0, alongX = r.hx !== 0;
        made.push(Object.assign({ x: m.x, z: m.z, y: Ys, w: alongX ? len : Ws, d: alongX ? Ws : len, t: 0.8,
          col: SUB_COLS[colI % SUB_COLS.length], kind: 'plat', cx: m.x, cz: m.z, cy: Ys, dx: 0, dz: 0, dy: 0,
          gone: false, seg: r.seg, sub: true }, o || {}));
      }
      for (const c of cs) {
        const q = pt(c);
        made.push({ x: q.x, z: q.z, y: Ys, w: Ws, d: Ws, t: 0.8, col: SUB_COLS[colI % SUB_COLS.length], kind: 'plat',
          cx: q.x, cz: q.z, cy: Ys, dx: 0, dz: 0, dy: 0, gone: false, seg: runAt(c).seg, sub: true });
      }
      for (const P of made) { C.plats.push(P); subPlats.push(P); }
      return made;
    };
    const walkTo = (fromU, toU, y) => {
      for (const c of corners) if (c > fromU + 0.5 && c < toU - 0.5) { const q = pt(c); steps.push({ k: 'walk', x: q.x, y: y, z: q.z }); }
      const q = pt(toU); steps.push({ k: 'walk', x: q.x, y: y, z: q.z });
    };
    const platAtU = (u) => { const q = pt(u); return subPlats.find(P => !P.gone && Math.abs(q.x - P.x) <= P.w / 2 && Math.abs(q.z - P.z) <= P.d / 2); };
    const addCP = (u) => {
      const q = pt(u), P = platAtU(u);
      if (!P) return null;
      const r = runAt(u);
      const c = { x: q.x, y: Ys, z: q.z, yaw: Math.atan2(-r.hx, -r.hz), plat: P, seg: r.seg, sub: true };
      C.cps.push(c);
      return c;
    };

    // ---- 入口：メインの床の下に広い床 ----
    const entryBack = st.a < 1 ? 8 : 3;
    let ps = st.a - entryBack, cur = st.a + 8;
    let ropes = 0, lastU = st.a;
    const route = { steps: steps, entryU: st.a + 2, Ys: Ys };
    let pendingCP = true;
    while (cur < st.b - 4) {
      // ロープを吊るせる地点を探す（真上のメインの床の裏）
      let found = null;
      for (let r = cur + 1.6; r <= cur + 8 && r < st.b - 6; r += 0.5) {
        const q = pt(r);
        const ab = above(q.x, q.z, 0.5).filter(P => P.y - P.t >= Ys + ROPE_TIP + 4.5 && P.y - P.t <= Ys + ROPE_TIP + 17.5);
        if (!ab.length) continue;
        let Q = ab[0]; for (const P of ab) if (P.y < Q.y) Q = P;
        const L = (Q.y - Q.t) - (Ys + ROPE_TIP);
        let need = Math.max(0.5, Math.acos(Math.max(-1, 1 - 1.45 / L))) + 0.15;
        need = Math.min(need, 1.12);
        const extra = D >= 2 ? rr(0, Math.min(3, 0.4 * D)) : 0;
        const aEnd = Math.max(cur, r - rr(1.6, 2.4));
        const gEnd = r + L * Math.sin(need - 0.15) + 0.2 + extra;
        if (gEnd + 3.5 > st.b + 3) break;
        if (corners.some(c => c > aEnd - Ws / 2 - 0.5 && c < gEnd + Ws / 2 + 3.5)) continue;
        found = { r: r, Q: Q, L: L, need: need, aEnd: aEnd, gEnd: gEnd };
        break;
      }
      if (!found) { cur += 2.5; continue; }
      // 手前の床を確定
      mk(ps, found.aEnd);
      if (pendingCP) { const c = addCP(Math.min(found.aEnd - 1, ps + 4)); if (c) route.cp = route.cp || c; pendingCP = false; }
      walkTo(lastU, found.aEnd - 0.5, Ys);
      const rr0 = pt(found.r), run = runAt(found.r);
      C.ropes.push({ ax: rr0.x, ay: found.Q.y - found.Q.t, az: rr0.z, L: found.L, dx: run.hx, dz: run.hz,
        idleA: Math.min(0.9, Math.asin(Math.min(0.85, (found.r - found.aEnd + 0.6) / found.L))),
        th: 0, om: 0, ph: rnd() * 6.28, need: found.need, cd: 0, seg: run.seg, mount: true, sub: true, stretch: si });
      const ri = C.ropes.length - 1;
      ropes++;
      // 着地する床：ステージが進むと動く床や崩れる床になる
      const Lb = Math.max(3.4, Math.min(8, rr(5, 8) - D * 0.3));
      let B, nextPs;
      const roll = rnd();
      const nearCorner = (u0, u1) => corners.some(c => c > u0 - Ws / 2 - 1 && c < u1 + Ws / 2 + 1);
      if (D >= 3 && roll < 0.22 + D * 0.03 && !nearCorner(found.gEnd - 2.7, found.gEnd + Lb + 2.7)) {
        const amp = Math.min(2.6, 1.2 + D * 0.1);
        const per = rr(3.2, 4.6);
        B = mk(found.gEnd, found.gEnd + Lb, { kind: 'mover', col: 0x8ee3ff, mv: { ax: run.hx, az: run.hz, ay: 0, amp: amp, om: Math.PI * 2 / per, ph: rnd() * 6.28 } })[0];
        nextPs = found.gEnd + Lb + amp - 0.3;          // 一番遠くまで動いたとき、次の床に少し重なる
      } else if (D >= 5 && roll > 0.8 && !nearCorner(found.gEnd, found.gEnd + Lb + 2.4)) {
        const n = Math.ceil(Lb / 2.4);
        const made = [];
        for (let k = 0; k < n; k++) made.push(mk(found.gEnd + k * 2.4 + 0.06, found.gEnd + (k + 1) * 2.4 - 0.06, { kind: 'crumble', col: 0xf2c48d, cr: { st: 0, t: 0 } })[0]);
        B = made[0];
        nextPs = found.gEnd + n * 2.4;
      } else {
        B = null; nextPs = found.gEnd;
      }
      const landU = found.gEnd + 1.6;
      const fq = pt(found.r + found.L * Math.sin(found.need));
      steps.push({ k: 'rope', x: fq.x, y: Ys, z: fq.z, rope: ri, platU: landU });
      const lq = pt(landU);
      steps.push({ k: 'pad', x: lq.x, y: Ys, z: lq.z, platU: landU, plat: B });
      lastU = landU;
      ps = nextPs; cur = Math.max(nextPs, found.gEnd) + Lb;
      if (B) { cur = nextPs + 2; }
      // 2本ごとにチェックポイント、3本ごとに途中の出口（道の端にスーパートランポリン）
      if (ropes % 2 === 0) pendingCP = true;
      if (ropes % 3 === 0 && Ws >= 8.6) route.wantMid = (route.wantMid || []).concat([ps + 1.5]);
    }
    // 最後の床（出口まで）
    mk(ps, st.b + 3);
    if (pendingCP) addCP(Math.min(st.b - 2, ps + 2));
    // 着地先の床に、入れ替えで作った「着地の床」を対応づける
    for (const s of steps) if ((s.k === 'pad' || s.k === 'rope') && !s.plat && s.platU !== undefined) s.plat = platAtU(s.platU);
    // ---- 出口：真上のメインの床へ、スーパートランポリンで戻る ----
    const addExit = (u, lat, final) => {
      const q = pt(u, lat);
      const P = subPlats.find(X => X.kind === 'plat' && Math.abs(q.x - X.x) <= X.w / 2 - 1.8 && Math.abs(q.z - X.z) <= X.d / 2 - 1.8) ||
                (final ? null : platAtU(u));
      if (!P || P.kind !== 'plat') return false;
      const ab = above(q.x, q.z, 1.8).filter(Q => Q.y - Q.t > Ys + 5);
      if (!ab.length) return false;
      let Q = ab[0]; for (const X of ab) if (X.y < Q.y) Q = X;
      const dh = Q.y - Ys;
      C.pads.push({ plat: P, ox: q.x - P.x, oz: q.z - P.z, jv: padJV(dh), dh: dh, anim: 0, kind: 'mega', r: MEGA_R, sub: true });
      if (final) { steps.push({ k: 'walk', x: q.x, y: Ys, z: q.z }); steps.push({ k: 'pad', x: q.x, y: Q.y, z: q.z, plat: Q }); route.exit = Q; }
      return true;
    };
    for (const u of route.wantMid || []) addExit(u, (Ws / 2 - 2) * (rnd() < 0.5 ? 1 : -1), false);
    walkTo(lastU, st.b - 0.5, Ys);
    steps.pop();
    if (!addExit(st.b, 0, true)) {
      // 念のため：出口が置けなかったら、少し手前を試す
      for (let k = 1; k < 12 && !route.exit && st.b - k > lastU + 2; k++) addExit(st.b - k, 0, true);
      for (let k = 1; k < 4 && !route.exit; k++) addExit(st.b + k * 0.8, 0, true);
    }
    // 入口の目印：メインの床の端に、下向きの矢印
    const eq = pt(st.a + 1.5);
    const eab = above(eq.x, eq.z, 0.4);
    if (eab.length) {
      let Q = eab[0]; for (const X of eab) if (X.y > Q.y) Q = X;
      const run = runAt(st.a + 1.5);
      for (const sgn of [1, -1]) {
        const half = (run.hx !== 0 ? Q.d : Q.w) / 2 - 1.4;
        const sq = pt(st.a + 1.5, sgn * half);
        C.signs.push({ x: sq.x, y: Q.y, z: sq.z, yaw: Math.atan2(-(-run.hz * sgn), -(run.hx * sgn)), sub: true, stretch: si });
      }
    }
    route.entry = (() => { const q = pt(st.a + 2); return { x: q.x, y: Ys, z: q.z }; })();
    route.seg = seg0;
    route.stretch = si;
    if (route.exit && steps.some(s => s.k === 'rope')) C.subRoutes.push(route);
    else {
      for (const r of C.ropes) if (r.sub && r.stretch === si) r.dead = true; /* ロープのない区間は作らない */ for (const P of subPlats) P.dead = true; for (let k = C.pads.length - 1; k >= 0; k--) if (C.pads[k].sub && subPlats.includes(C.pads[k].plat)) C.pads.splice(k, 1); for (let k = C.cps.length - 1; k >= 0; k--) if (C.cps[k].sub && subPlats.includes(C.cps[k].plat)) C.cps.splice(k, 1); }
    colI++;
  });

  C.plats = C.plats.filter(P => !P.dead);
  C.signs = C.signs.filter(s => !s.sub || C.subRoutes.some(r => r.stretch === s.stretch));
  // ---- チェックポイントを進み具合の順に並べ直す ----
  const progOf = (x, y, z) => {
    let best = 0, bd = Infinity;
    for (const q of C.prog) { const dd = (q.x - x) ** 2 + (q.z - z) ** 2 + 0.35 * (q.y - y) ** 2; if (dd < bd) { bd = dd; best = q.s; } }
    return best;
  };
  C.cps.forEach((c, k) => { c.ps = k === 0 ? -1 : progOf(c.x, c.y, c.z) + (c.sub ? 0.01 : 0); });
  C.cps.sort((a, b) => a.ps - b.ps);
  for (const s of C.route) if (s.cpo) s.cp = C.cps.indexOf(s.cpo);
  for (const sr of C.subRoutes) if (sr.cp) sr.cpIdx = C.cps.indexOf(sr.cp);
  finishCourseShape(C, false);
}

// ---------- 床の位置（動く床は時間で決まる） ----------
function courseTime() { return RACE.on ? RACE.t : G.elapsed; }

function updateMovers(t) {
  for (const P of G.d.plats) {
    if (P.kind !== 'mover') continue;
    const m = P.mv, s = Math.sin(m.om * t + m.ph) * m.amp;
    const nx = P.x + m.ax * s, ny = P.y + m.ay * s, nz = P.z + m.az * s;
    P.dx = nx - P.cx; P.dy = ny - P.cy; P.dz = nz - P.cz;
    P.cx = nx; P.cy = ny; P.cz = nz;
    if (P.mesh) P.mesh.position.set(nx, ny - P.t / 2, nz);
  }
}

function onPlat(P, x, z, grace) {
  if (P.gone) return false;
  const g = grace === undefined ? EDGE_GRACE : grace;
  return Math.abs(x - P.cx) <= P.w / 2 + g && Math.abs(z - P.cz) <= P.d / 2 + g;
}

// 立っている床を探す：足元から少し下〜段差の高さまでにある、いちばん高い床
function groundAt(x, z, y) {
  let best = null;
  for (const P of G.d.plats) {
    if (P.cy > y + STEP_UP || P.cy < y - 0.12) continue;
    if (!onPlat(P, x, z)) continue;
    if (!best || P.cy > best.cy) best = P;
  }
  return best;
}

// 落下中の着地：この1ステップで天面を上から下へまたいだ床
function landingAt(x, z, yPrev, yNext) {
  let best = null;
  for (const P of G.d.plats) {
    if (!onPlat(P, x, z)) continue;
    const top = P.cy, rise = Math.max(0, P.dy);
    if (yPrev >= top - rise - 0.02 && yNext <= top) {
      if (!best || top > best.cy) best = P;
    }
  }
  return best;
}

// 真下の床（影を落とす場所）
function floorBelow(x, z, y) {
  let best = null;
  for (const P of G.d.plats) {
    if (P.cy > y + 0.05) continue;
    if (!onPlat(P, x, z, 0)) continue;
    if (!best || P.cy > best.cy) best = P;
  }
  return best;
}

function padPos(pd) { return { x: pd.plat.cx + pd.ox, y: pd.plat.cy, z: pd.plat.cz + pd.oz }; }

// トランポリンの上（プレイヤー同士はここでは重なってよい）
function inPadColumn(x, z) {
  if (!G.d) return false;
  for (const pd of G.d.pads) {
    const q = padPos(pd);
    if (Math.hypot(x - q.x, z - q.z) <= pd.r + 0.3) return true;
  }
  return false;
}
function pushOutOfPad() {}       // 屋外コースでは封鎖中も上に乗れる（跳ねないだけ）

// ---------- ターザンロープ ----------
function ropeTip(r, len) {
  const l = len === undefined ? r.L : len, s = Math.sin(r.th), c = Math.cos(r.th);
  return { x: r.ax + r.dx * s * l, y: r.ay - c * l, z: r.az + r.dz * s * l };
}
function ropeInit(r) {
  const w = Math.sqrt(GRAVITY / r.L);
  r.th = r.idleA * Math.sin(r.ph); r.om = r.idleA * w * Math.cos(r.ph);
}
// だれもつかまっていないロープは、決まった振れ幅でゆらゆら揺れ続ける
function ropeIdle(r, dt) {
  const h = dt / 4;
  for (let s = 0; s < 4; s++) {
    let a = -(GRAVITY / r.L) * Math.sin(r.th) - 0.03 * r.om;
    const ca = Math.cos(r.th) - r.om * r.om * r.L / (2 * GRAVITY);
    const amp = Math.acos(Math.max(-1, Math.min(1, ca)));
    if (amp < r.idleA - 0.02) a += 0.9 * Math.sign(r.om || 1);
    else if (amp > r.idleA + 0.05) a -= 0.8 * r.om;
    r.om += a * h; r.th += r.om * h;
  }
}
function tryGrabRope(p) {
  if (!G.d.ropes || p.respawnT > 0 || p.stun > 0 || (RACE.on && ABIL.nopad > 0 && false)) return;
  const hx = p.x, hy = p.y + ROPE_GRIP, hz = p.z;
  for (let i = 0; i < G.d.ropes.length; i++) {
    const r = G.d.ropes[i];
    if (r.dead) continue;
    // 同じロープは、一度着地するまでつかみ直さない。渡り終えた側（ロープより先）からもつかまない
    if (p.ropeLast === i && (p.ropeCD > 0 || !p.landedSince || (p.x - r.ax) * r.dx + (p.z - r.az) * r.dz > 0)) continue;
    const ux = r.dx * Math.sin(r.th), uy = -Math.cos(r.th), uz = r.dz * Math.sin(r.th);
    const vx = hx - r.ax, vy = hy - r.ay, vz = hz - r.az;
    let s = vx * ux + vy * uy + vz * uz;
    s = Math.max(0, Math.min(r.L, s));
    const d = Math.hypot(vx - ux * s, vy - uy * s, vz - uz * s);
    if (s < Math.max(1.5, r.L - 3) || d > ROPE_GRAB_R) continue;      // つかめるのはロープの下のほう（先の玉から3mまで）
    // つかむ：今の速さを振り子の勢いに変える
    const Lg = Math.max(2.5, Math.min(r.L, s));
    const tvx = r.dx * Math.cos(r.th), tvz = r.dz * Math.cos(r.th), tvy = Math.sin(r.th);
    const v = (p.lvx || 0) * tvx + (p.lvz || 0) * tvz + (p.onGround ? 0 : p.vy) * tvy;
    r.om = Math.max(-3.2, Math.min(3.2, v / Lg * 0.85 + r.om * 0.3));
    p.rope = r; p.ropeIdx = i; p.ropeLen = Lg;
    p.onGround = false; p.on = null; p.vy = 0; p.kx = p.kz = 0; p.fling = false; p.boost = false;
    p.f = i + 1;
    playGrab();
    if ((G.ropeHints = (G.ropeHints || 0) + 1) <= 3) showToast(document.body.classList.contains('touch') ? 'はなすボタンで手をはなす' : 'SPACE で手をはなす');
    return;
  }
}
function releaseRope(boost) {
  const p = G.player;
  if (!p || !p.rope) return;
  const r = p.rope, vt = r.om * p.ropeLen;
  p.kx = r.dx * Math.cos(r.th) * vt;
  p.kz = r.dz * Math.cos(r.th) * vt;
  p.vy = Math.sin(r.th) * vt + (boost === false ? 0 : 2.5);
  p.fling = true;
  p.ropeLast = p.ropeIdx; p.ropeCD = ROPE_REGRAB; p.landedSince = false;
  p.rope = null; p.ropeIdx = -1; p.f = 0;
  playRelease();
}
function updateHanging(p, dt, mf, ms) {
  const r = p.rope;
  // 入力のうち、ロープが振れる向きの成分で振りを大きくする（前へ押すと前へ、後ろへ引くと後ろへ）
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const wx = -sy * mf + cy * ms, wz = -cy * mf - sy * ms;
  let u = wx * r.dx + wz * r.dz;
  if (Math.abs(r.th) > ROPE_MAXA && Math.sign(u) === Math.sign(r.th)) u = 0;
  const L = p.ropeLen, h = dt / 4;
  for (let s = 0; s < 4; s++) {
    const a = -(GRAVITY / L) * Math.sin(r.th) - 0.06 * r.om + ROPE_PUMP * u * (4.5 / Math.max(4.5, L)) ** 0.3;
    r.om += a * h; r.th += r.om * h;
  }
  if (r.th > 1.45) { r.th = 1.45; r.om = Math.min(r.om, 0); }
  if (r.th < -1.45) { r.th = -1.45; r.om = Math.max(r.om, 0); }
  const t = ropeTip(r, L);
  // 横方向のずれは少しずつ吸収する
  p.x = t.x; p.z = t.z; p.y = t.y - ROPE_GRIP;
  p.vy = 0; p.onGround = false; p.on = null;
}

// ---------- プレイヤー ----------
function updatePlayer(dt) {
  const p = G.player;
  const ox = p.x, oz = p.z;
  if (p.ropeCD > 0) p.ropeCD -= dt;

  // 動く床に乗っていれば一緒に運ばれる
  if (p.onGround && p.on && p.on.kind === 'mover') {
    p.x += p.on.dx; p.z += p.on.dz; p.y = p.on.cy;
  }

  let mf = 0, ms = 0;
  if (keys.f) mf += 1;
  if (keys.b) mf -= 1;
  if (keys.l) ms -= 1;
  if (keys.r) ms += 1;
  if (stick.active) { ms += stick.x; mf -= stick.y; }
  if (p.stun > 0 || p.respawnT > 0) { mf = 0; ms = 0; }
  const len = Math.hypot(mf, ms);
  if (len > 1) { mf /= len; ms /= len; }
  const moving = len > 0.06;
  if (p.rope) {
    updateHanging(p, dt, mf, ms);
    if (p.stun > 0) releaseRope(false);
    finishPlayerTimers(p, dt);
    p.lvx = (p.x - ox) / Math.max(dt, 1e-4); p.lvz = (p.z - oz) / Math.max(dt, 1e-4);
    return;
  }

  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const dirX = -sy * mf + cy * ms;
  const dirZ = -cy * mf - sy * ms;

  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    const spd = (p.onGround ? MOVE_SPEED : AIR_SPEED) * (p.dash > 0 ? DASH_MUL : 1);
    let vx = dirX * spd + p.kx, vz = dirZ * spd + p.kz;
    if (p.onGround && p.on && p.on.kind === 'conv') { vx += p.on.conv.vx; vz += p.on.conv.vz; }
    p.x += vx * h; p.z += vz * h;

    if (p.onGround) {
      const g = groundAt(p.x, p.z, p.y);
      if (g) { p.on = g; p.y = g.cy; }
      else { p.onGround = false; p.on = null; p.vy = Math.min(p.vy, 0); }
    }
    if (!p.onGround) {
      p.vy -= GRAVITY * h;
      const yPrev = p.y, yNext = p.y + p.vy * h;
      const L = p.vy < 0 ? landingAt(p.x, p.z, yPrev, yNext) : null;
      if (L) {
        p.impact = -p.vy; p.fling = false; p.landedSince = true;
        if (!!L.sub !== !!p.onSub) { p.onSub = !!L.sub; if (p.onSub) showToast('SUB ROUTE'); }
        p.y = L.cy; p.vy = 0; p.onGround = true; p.on = L; p.lastOn = L;
        G.shake = Math.min(0.9, G.shake + 0.12 + Math.max(0, p.impact - 25) * 0.012);
        playLand();
        if (p.boost) { p.dash = Math.max(p.dash, BOOST_DUR); p.boost = false; }
      } else p.y = yNext;
    }
    rotorPivotPush(p);

    // トランポリン・発射台
    if (p.onGround && !(RACE.on && ABIL.nopad > 0)) {
      for (const pd of G.d.pads) {
        const q = padPos(pd);
        if (pd.plat !== p.on || Math.hypot(p.x - q.x, p.z - q.z) > pd.r) continue;
        let jv = pd.jv;
        const sup = RACE.on && ABIL.superPad > 0 && pd.kind !== 'mega';
        if (pd.kind === 'bouncy' && p.impact > 4) {
          // 落ちてきた勢いをそのまま返し、さらに少し上乗せする
          jv = Math.max(jv, Math.sqrt(p.impact * p.impact + 2 * GRAVITY * pd.bonus));
          showToast(p.impact > 18 ? 'BIG BOUNCE!' : 'BOUNCE!');
          playBounce();
        } else if (pd.kind === 'mega') {
          showToast('SUPER JUMP!');
          playMega();
        }
        if (sup) {
          // 能力でスーパーになっている間は、いつもの3倍の高さ（15〜45m）まで跳ぶ
          const rise = Math.min(45, Math.max(15, (jv * jv) / (2 * GRAVITY) * 3));
          jv = Math.max(jv, Math.sqrt(2 * GRAVITY * rise));
          showToast('SUPER JUMP!'); playMega();
        }
        p.vy = jv; p.onGround = false; p.on = null; pd.anim = 1;
        G.fovKick = (pd.kind === 'normal' && !sup) ? 1 : 1.6; playJump();
        break;
      }
    }
    if (p.onGround) p.impact = 0;
    if (p.onGround && !(RACE.on && ABIL.nopad > 0)) {
      for (const L of G.d.launchers) {
        const qx = L.plat.cx + L.ox, qz = L.plat.cz + L.oz;
        if (L.plat !== p.on || Math.hypot(p.x - qx, p.z - qz) > LAUNCH_R) continue;
        p.kx = L.dirx * L.k; p.kz = L.dirz * L.k; p.vy = L.vy;
        p.onGround = false; p.on = null; p.boost = true; L.anim = 1;
        G.fovKick = 1.3; playLaunch();
        break;
      }
    }
  }
  rotorHits(p, dt);
  if (FEATURE_ROPE && !p.rope) tryGrabRope(p);
  p.lvx = (p.x - ox) / Math.max(dt, 1e-4); p.lvz = (p.z - oz) / Math.max(dt, 1e-4);

  if (moving && p.onGround) p.walkPhase += dt * 9.5; else p.walkPhase *= 0.9;
  G.bob = (p.onGround && moving) ? Math.sin(p.walkPhase) * 0.055 : G.bob * 0.9;

  finishPlayerTimers(p, dt);

  // チェックポイントの通過
  if (p.onGround) {
    for (let i = p.cp + 1; i < G.d.cps.length; i++) {
      if (G.d.cps[i].plat === p.on) { p.cp = i; cpPassed(i); break; }
    }
  }
  // 落下 → 最後のチェックポイントから復帰
  const cpc = G.d.cps[p.cp];
  if (!p.onGround && (p.y < Math.min(cpc.y - 18, cpc.fallY) || p.y < G.d.minY - 14)) respawnPlayer();
}

function finishPlayerTimers(p, dt) {
  if (p.dash > 0) { p.dash -= dt; if (p.dash < 0) p.dash = 0; }
  if (p.wave > 0) { p.wave -= dt; if (p.wave < 0) p.wave = 0; }
  // 空中では吹き飛びの勢いがあまり落ちない（発射台・波動で遠くまで飛ぶ）
  const kf = Math.exp(-(p.fling && !p.onGround ? 0.25 : KNOCK_DECAY) * dt);
  p.kx *= kf; p.kz *= kf;
  if (Math.abs(p.kx) < 0.02) p.kx = 0;
  if (Math.abs(p.kz) < 0.02) p.kz = 0;
  if (p.stun > 0) { p.stun -= dt; if (p.stun <= 0) { p.stun = 0; p.inv = RACE_INV; } }
  if (p.inv > 0) { p.inv -= dt; if (p.inv < 0) p.inv = 0; }
  if (p.respawnT > 0) p.respawnT -= dt;
  if (G.fovKick > 0) { G.fovKick -= dt * 1.6; if (G.fovKick < 0) G.fovKick = 0; }
  if (G.shake > 0) { G.shake -= dt * 2.2; if (G.shake < 0) G.shake = 0; }
}

function respawnPlayer() {
  const p = G.player, c = G.d.cps[p.cp];
  const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
  p.x = c.x + Math.cos(a) * r; p.z = c.z + Math.sin(a) * r; p.y = c.y + 0.02;
  p.vy = 0; p.kx = 0; p.kz = 0; p.onGround = true; p.on = c.plat; p.boost = false;
  p.rope = null; p.ropeIdx = -1; p.f = 0; p.fling = false; p.ropeCD = 0; p.landedSince = true;
  p.yaw = c.yaw; p.respawnT = 0.7;
  noteRespawn(p.cp);
  flash('rgba(120,200,255,.45)');
  playFall();
  showToast('もう一度！');
}

function cpPassed(i) {
  const c = G.d.cps[i];
  if (c.flag && !c.lit) {
    c.lit = true;
    c.flag.material = CM.flagOn;
    playCheckpoint();
  }
}

// ---------- 回転バー ----------
function rotorAngle(R, t) { return R.om * t + R.ph; }
function rotorCenter(R) { return { x: R.plat.cx + R.ox, y: R.plat.cy, z: R.plat.cz + R.oz }; }

function rotorPivotPush(p) {
  for (const R of G.d.rotors) {
    const c = rotorCenter(R);
    if (p.y > c.y + 1.6 || p.y < c.y - 0.3) continue;
    const dx = p.x - c.x, dz = p.z - c.z, L = Math.hypot(dx, dz), rr = 0.55 + P_R;
    if (L < rr && L > 1e-4) { p.x = c.x + dx / L * rr; p.z = c.z + dz / L * rr; }
  }
}

function rotorHits(p, dt) {
  const t = courseTime();
  for (const R of G.d.rotors) {
    if (R.hitCD > 0) { R.hitCD -= dt; continue; }
    const c = rotorCenter(R);
    if (p.y > c.y + ROTOR_H || p.y < c.y - 0.4) continue;
    const rx = p.x - c.x, rz = p.z - c.z;
    for (let k = 0; k < R.arms; k++) {
      const a = rotorAngle(R, t) + k * Math.PI;
      const ux = Math.cos(a), uz = Math.sin(a);
      const along = rx * ux + rz * uz, cross = -rx * uz + rz * ux;
      if (along < 0.3 || along > R.len + P_R || Math.abs(cross) > 0.28 + P_R) continue;
      // バーの進む向きへ弾き飛ばす
      const sgn = Math.sign(R.om) || 1;
      const tx = -uz * sgn, tz = ux * sgn;
      const sp = 4.5 + Math.abs(R.om) * along * 0.45;
      p.kx = tx * sp + ux * 3; p.kz = tz * sp + uz * 3;
      p.vy = 6.5; p.onGround = false; p.on = null;
      R.hitCD = 0.6;
      G.shake = 0.6; playHitWave();
      break;
    }
  }
}

// ---------- 崩れる床 ----------
function updateCrumbles(dt) {
  const players = [];
  const p = G.player;
  if (p && p.onGround && p.on) players.push({ x: p.x, z: p.z, y: p.y, on: p.on });
  if (RACE.on) for (const q of NET.players) {
    if (!q || q.slot === NET.slot || !q.init || q.out || !(q.st & 4)) continue;
    players.push({ x: q.x, z: q.z, y: q.y });
  }
  for (const P of G.d.plats) {
    if (P.kind !== 'crumble') continue;
    const cr = P.cr;
    if (cr.st === 0) {
      for (const q of players) {
        if (q.on === P || (Math.abs(q.y - P.cy) < 0.3 && onPlat(P, q.x, q.z, 0))) { cr.st = 1; cr.t = CRUMBLE_T; break; }
      }
    } else if (cr.st === 1) {
      cr.t -= dt;
      if (P.mesh) P.mesh.position.set(P.cx + (Math.random() - 0.5) * 0.12, P.cy - P.t / 2, P.cz + (Math.random() - 0.5) * 0.12);
      if (cr.t <= 0) { cr.st = 2; cr.t = CRUMBLE_BACK; P.gone = true; cr.fall = 0; playCrumble(); }
    } else if (cr.st === 2) {
      cr.t -= dt; cr.fall += dt;
      if (P.mesh) {
        P.mesh.position.y = P.cy - P.t / 2 - 9 * cr.fall * cr.fall;
        P.mesh.visible = cr.fall < 1.2;
      }
      if (cr.t <= 0) {
        cr.st = 0; P.gone = false;
        if (P.mesh) { P.mesh.visible = true; P.mesh.position.set(P.cx, P.cy - P.t / 2, P.cz); P.mesh.scale.setScalar(0.2); cr.pop = 1; }
      }
    }
    if (cr.pop > 0 && P.mesh) {
      cr.pop = Math.max(0, cr.pop - dt * 4);
      P.mesh.scale.setScalar(1 - cr.pop * 0.8);
    }
  }
}

// ---------- 進み具合（順位の計算に使う） ----------
function courseProgress(x, y, z) {
  const pr = G.d.prog;
  let best = 0, bd = Infinity;
  for (const q of pr) {
    const dd = (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) + (FEATURE_SUB ? 0.35 : 2.2) * (q.y - y) * (q.y - y);   // サブルートは真下なので高さの差は軽く見る
    if (dd < bd) { bd = dd; best = q.s; }
  }
  return best;
}

// ===================== 見た目 =====================
// 床の模様は世界座標で貼るので、大きさの違う床でも模様の大きさがそろう
function makeBlockSideTexture() {
  const [c, g] = texCanvas(128, 64);
  g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 14);
  g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, 14, 128, 4);
  g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 56, 128, 8);
  for (const x of [22, 64, 106]) bolt(g, x, 36, 6);
  return finishTex(c, true);
}
function makeBeltTexture() {
  const [c, g] = texCanvas(128, 128);
  g.fillStyle = '#3b3f48'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#4a4f5a';
  for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 3);
  g.fillStyle = '#ffd23d';
  for (const y0 of [8, 72]) {
    g.beginPath(); g.moveTo(24, y0 + 40); g.lineTo(64, y0); g.lineTo(104, y0 + 40); g.lineTo(88, y0 + 40); g.lineTo(64, y0 + 18); g.lineTo(40, y0 + 40); g.closePath(); g.fill();
  }
  return finishTex(c, true);
}
function makeArrowPadTexture() {
  const [c, g] = texCanvas(128, 128);
  g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffe14d';
  for (const y0 of [6, 70]) {
    g.beginPath(); g.moveTo(14, y0 + 48); g.lineTo(64, y0); g.lineTo(114, y0 + 48); g.lineTo(94, y0 + 48); g.lineTo(64, y0 + 20); g.lineTo(34, y0 + 48); g.closePath(); g.fill();
  }
  return finishTex(c, true);
}
function makeBiscuitTexture() {
  const [c, g] = texCanvas(128, 128);
  g.fillStyle = '#e8b878'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#b97f3e'; g.lineWidth = 6; g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#a86f33';
  for (let y = 26; y < 128; y += 26) for (let x = 26; x < 128; x += 26) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(120,70,20,.5)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(20, 90); g.lineTo(50, 70); g.lineTo(62, 84); g.lineTo(100, 52); g.stroke();
  return finishTex(c);
}
function makeGroundTexture() {
  const [c, g] = texCanvas(256, 256);
  const cols = ['#7fcf6f', '#6cc25e'];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = cols[(x + y) % 2]; g.fillRect(x * 128, y * 128, 128, 128); }
  g.fillStyle = 'rgba(255,255,255,.25)';
  for (let k = 0; k < 40; k++) { g.beginPath(); g.arc((k * 73) % 256, (k * 151) % 256, 3, 0, Math.PI * 2); g.fill(); }
  return finishTex(c, true);
}
function makeUnderTexture() {
  const [c, g] = texCanvas(128, 128);
  g.fillStyle = '#d9dcea'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#b3b8cf'; g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  g.fillStyle = '#9aa0bb';
  for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116], [52, 52], [76, 76], [52, 76], [76, 52]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function makeRopeTexture() {
  const [c, g] = texCanvas(32, 64);
  g.fillStyle = '#e8b86a'; g.fillRect(0, 0, 32, 64);
  g.strokeStyle = '#a8742e'; g.lineWidth = 5;
  for (let y = -32; y < 96; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y + 16); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function makeFlagTexture(col) {
  const [c, g] = texCanvas(128, 80);
  g.fillStyle = col; g.fillRect(0, 0, 128, 80);
  g.fillStyle = 'rgba(255,255,255,.9)'; starPath(g, 64, 40, 24, 10, 5); g.fill();
  return finishTex(c);
}
function makeShadowTexture() {
  const [c, g] = texCanvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.7, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeMegaPadTexture() {
  const [c, g] = texCanvas(256, 256);
  const cols = ['#ff5a5f', '#ff9f1a', '#ffd23d', '#4cd964', '#3fb7ff', '#a66bff'];
  for (let k = 0; k < 6; k++) { g.fillStyle = cols[k]; g.beginPath(); g.arc(128, 128, 128 - k * 19, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#fff'; starPath(g, 128, 128, 30, 13, 5); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 7;
  for (let k = 0; k < 3; k++) { const y = 92 - k * 0; void y; }
  return new THREE.CanvasTexture(c);
}
function makeBouncyPadTexture() {
  const [c, g] = texCanvas(256, 256);
  g.fillStyle = '#ff7ab8'; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 9;
  for (const r of [100, 70, 40]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(128, 70); g.lineTo(168, 120); g.lineTo(145, 120); g.lineTo(145, 180); g.lineTo(111, 180); g.lineTo(111, 120); g.lineTo(88, 120); g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
}
function makeDiveSignTexture() {
  const [c, g] = texCanvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,79,160,.92)';
  for (const y0 of [14, 58]) { g.beginPath(); g.moveTo(14, y0); g.lineTo(64, y0 + 46); g.lineTo(114, y0); g.lineTo(94, y0); g.lineTo(64, y0 + 26); g.lineTo(34, y0); g.closePath(); g.fill(); }
  return new THREE.CanvasTexture(c);
}

FLOOR_TEX.wrapS = FLOOR_TEX.wrapT = THREE.RepeatWrapping; FLOOR_TEX.needsUpdate = true;
const CM = {
  top:     new THREE.MeshStandardMaterial({ map: FLOOR_TEX, vertexColors: true, roughness: 0.55, metalness: 0 }),
  side:    new THREE.MeshStandardMaterial({ map: makeBlockSideTexture(), vertexColors: true, roughness: 0.6, metalness: 0 }),
  pole:    new THREE.MeshStandardMaterial({ map: CANDY_TEX, roughness: 0.5, metalness: 0 }),
  ground:  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1, metalness: 0 }),
  toy:     new THREE.MeshStandardMaterial({ map: FLOOR_TEX, vertexColors: true, roughness: 0.6, metalness: 0 }),
  padSide: new THREE.MeshStandardMaterial({ color: 0x2b78d6, roughness: 0.4, metalness: 0.1 }),
  padTop:  new THREE.MeshBasicMaterial({ map: PAD_TEX }),
  megaSide: new THREE.MeshStandardMaterial({ color: 0xff8a00, roughness: 0.35, metalness: 0.2, emissive: 0x803000, emissiveIntensity: 0.3 }),
  megaTop:  new THREE.MeshBasicMaterial({ map: makeMegaPadTexture() }),
  megaBeam: new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  megaRing: new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
  bounSide: new THREE.MeshStandardMaterial({ color: 0xff4fa0, roughness: 0.35, metalness: 0.1 }),
  bounTop:  new THREE.MeshBasicMaterial({ map: makeBouncyPadTexture() }),
  bounBeam: new THREE.MeshBasicMaterial({ color: 0xff6fb5, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  diveSign: new THREE.MeshBasicMaterial({ map: makeDiveSignTexture(), transparent: true, depthWrite: false }),
  arrow:   new THREE.MeshBasicMaterial({ map: makeArrowPadTexture() }),
  biscuit: new THREE.MeshStandardMaterial({ map: makeBiscuitTexture(), roughness: 0.9, metalness: 0 }),
  mover:   new THREE.MeshStandardMaterial({ color: 0x8ee3ff, roughness: 0.4, metalness: 0.05, emissive: 0x2a6f88, emissiveIntensity: 0.25 }),
  arm:     new THREE.MeshStandardMaterial({ map: CANDY_TEX, roughness: 0.4, metalness: 0 }),
  rope:    new THREE.MeshStandardMaterial({ map: makeRopeTexture(), roughness: 0.85, metalness: 0 }),
  under:   new THREE.MeshStandardMaterial({ map: makeUnderTexture(), roughness: 0.6, metalness: 0.1, emissive: 0x8a8fa8, emissiveIntensity: 0.45, vertexColors: true }),
  underBox: new THREE.MeshStandardMaterial({ color: 0xd9dcea, roughness: 0.6, metalness: 0.1, emissive: 0x8a8fa8, emissiveIntensity: 0.45 }),
  knob:    new THREE.MeshStandardMaterial({ color: 0xff3d4a, roughness: 0.3, metalness: 0.1 }),
  flagOff: new THREE.MeshBasicMaterial({ map: makeFlagTexture('#9aa3ad'), side: THREE.DoubleSide }),
  flagOn:  new THREE.MeshBasicMaterial({ map: makeFlagTexture('#2fd06a'), side: THREE.DoubleSide }),
  shadow:  new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, fog: false })
};
const BELT_TEX = makeBeltTexture();

// 箱の面を世界座標のUVで並べる（同じ材質の床はまとめて1回で描く）
function Builder() {
  this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0;
}
Builder.prototype.quad = function (a, b, c, d, nrm, uvs, col) {
  const cc = new THREE.Color(col);
  for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(nrm[0], nrm[1], nrm[2]);
    this.uv.push(t[0], t[1]); this.col.push(cc.r, cc.g, cc.b);
  }
  const n = this.n;
  this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  this.n += 4;
};
Builder.prototype.mesh = function (mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
  g.setIndex(this.idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  return m;
};
function addBox(top, side, x, yTop, z, w, t, d, col, bottom) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = yTop - t, y1 = yTop;
  const u = (v) => v / TILE_M;
  top.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0],
    [[u(x0), u(z1)], [u(x1), u(z1)], [u(x1), u(z0)], [u(x0), u(z0)]], col);
  const sv = (yy) => (yy - y0) / t;
  const sideCol = new THREE.Color(col).multiplyScalar(0.92).getHex();
  side.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[u(x0), 0], [u(x1), 0], [u(x1), 1], [u(x0), 1]], sideCol);
  side.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[u(x1), 0], [u(x0), 0], [u(x0), 1], [u(x1), 1]], sideCol);
  side.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[u(z1), 0], [u(z0), 0], [u(z0), 1], [u(z1), 1]], sideCol);
  side.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[u(z0), 0], [u(z1), 0], [u(z1), 1], [u(z0), 1]], sideCol);
  // 床の裏（サブルートから見上げる面）は明るい金属のパネル
  (bottom || side).quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0],
    bottom ? [[u(x0) * 1.6, u(z0) * 1.6], [u(x1) * 1.6, u(z0) * 1.6], [u(x1) * 1.6, u(z1) * 1.6], [u(x0) * 1.6, u(z1) * 1.6]] : [[0, 0], [1, 0], [1, 0.2], [0, 0.2]],
    bottom ? 0xffffff : sideCol);
  void sv;
}
function boxMesh(P, mat, topMat) {
  const g = new THREE.BoxGeometry(P.w, P.t, P.d);
  const mats = FEATURE_SUB ? [mat, mat, topMat || mat, CM.underBox, mat, mat] : (topMat ? [mat, mat, topMat, mat, mat, mat] : mat);
  const m = new THREE.Mesh(g, mats);
  m.position.set(P.cx, P.cy - P.t / 2, P.cz);
  return m;
}

// ===================== ステージ構築 =====================
function buildStage(si, seed) {
  const D = RACE.on ? Math.min(2 + RACE.no, 12) : si;
  const d = generateCourse(D, seed === undefined ? (si * 7 + 42) : seed);
  G.d = d;
  G.elapsed = 0;
  G.active = true;
  G.fovKick = 0; G.bob = 0; G.shake = 0;

  for (const f of G.fx) { scene.remove(f.grp); f.mat.dispose(); f.smat.dispose(); }
  G.fx = [];
  if (G.group) { scene.remove(G.group); disposeGroup(G.group); }
  if (G.wallMat) { if (G.wallMat.map) G.wallMat.map.dispose(); G.wallMat.dispose(); G.wallMat = null; }
  if (G.belts) for (const b of G.belts) b.tex.dispose();
  const grp = new THREE.Group();
  G.group = grp;
  scene.add(grp);

  // ---- 動かない床はまとめて描く ----
  const top = new Builder(), side = new Builder(), under = new Builder();
  const poles = [];
  G.belts = [];
  for (const P of d.plats) {
    if (P.kind === 'plat') {
      addBox(top, side, P.x, P.y, P.z, P.w, P.t, P.d, P.col, FEATURE_SUB ? under : null);
      poles.push(P);
    } else if (P.kind === 'conv') {
      const tex = BELT_TEX.clone(); tex.needsUpdate = true;
      const along = Math.abs(P.conv.vx) > Math.abs(P.conv.vz) ? 'x' : 'z';
      tex.center.set(0.5, 0.5);
      // 矢印をベルトの流れる向きへ
      const ang = Math.atan2(P.conv.vx, -P.conv.vz);
      tex.rotation = -ang;
      tex.repeat.set((along === 'x' ? P.d : P.w) / 3, (along === 'x' ? P.w : P.d) / 3);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.1 });
      const m = boxMesh(P, new THREE.MeshStandardMaterial({ color: 0x5c6370, roughness: 0.6 }), mat);
      grp.add(m);
      P.mesh = m;
      G.belts.push({ tex: tex, spd: Math.hypot(P.conv.vx, P.conv.vz) / 3 });
      poles.push(P);
    } else if (P.kind === 'crumble') {
      const m = boxMesh(P, CM.biscuit);
      grp.add(m); P.mesh = m;
    } else if (P.kind === 'mover') {
      const m = boxMesh(P, CM.mover);
      grp.add(m); P.mesh = m;
    }
  }
  const topMesh = top.mesh(CM.top), sideMesh = side.mesh(CM.side);
  grp.add(topMesh, sideMesh, under.mesh(CM.under));

  // ---- 床の下の支柱（見た目だけ。高さの感覚をつかみやすくする） ----
  const gy = d.groundY;
  const poleGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  for (const P of poles) {
    const n = (P.w * P.d > 90) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const off = n === 2 ? (k ? 0.25 : -0.25) : 0;
      const x = P.x + (P.w > P.d ? P.w * off : 0), z = P.z + (P.w > P.d ? 0 : P.d * off);
      const h = P.y - P.t - gy;
      if (h < 1) continue;
      // 真下に別の床があれば柱は立てない（床やトランポリンを突き抜けて見えるため）
      let blocked = false;
      for (const Q of d.plats) {
        if (Q === P || Q.y >= P.y - 0.5) continue;
        const mg = Q.sub ? 3.5 : 0.6;     // サブルートのすぐ横を通る柱も立てない
        const qx = Q.w / 2 + (Q.mv && Q.mv.ax ? Q.mv.amp : 0) + mg, qz = Q.d / 2 + (Q.mv && Q.mv.az ? Q.mv.amp : 0) + mg;
        if (Math.abs(x - Q.x) < qx && Math.abs(z - Q.z) < qz) { blocked = true; break; }
      }
      if (blocked) continue;
      const m = new THREE.Mesh(poleGeo, CM.pole);
      m.scale.set(0.35, h, 0.35);
      m.position.set(x, gy + h / 2, z);
      grp.add(m);
    }
  }

  // ---- 地面とおもちゃの積み木（遠景） ----
  const b = d.bounds, cxm = (b.x0 + b.x1) / 2, czm = (b.z0 + b.z1) / 2;
  const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) + 300;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), CM.ground);
  ground.material.map.repeat.set(span / 24, span / 24);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cxm, gy, czm);
  grp.add(ground);
  const toyTop = new Builder(), toySide = new Builder();
  const trnd = mulberry32((seed || si) ^ 0x7a11);
  const R0 = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 22;
  for (let k = 0; k < 46; k++) {
    const a = trnd() * Math.PI * 2, r = R0 + trnd() * 110;
    const x = cxm + Math.cos(a) * r, z = czm + Math.sin(a) * r;
    const w = 6 + trnd() * 14, dd = 6 + trnd() * 14, hgt = 4 + trnd() * 22;
    addBox(toyTop, toySide, x, gy + hgt, z, w, hgt, dd, SEG_COLORS[k % SEG_COLORS.length]);
    if (trnd() < 0.45) addBox(toyTop, toySide, x + (trnd() - .5) * 3, gy + hgt + 3 + trnd() * 5, z + (trnd() - .5) * 3, w * 0.6, 3 + trnd() * 5, dd * 0.6, SEG_COLORS[(k + 3) % SEG_COLORS.length]);
  }
  grp.add(toyTop.mesh(CM.toy), toySide.mesh(CM.side));
  // 遠くで回る大きな歯車
  G.gears = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + trnd(), r = span * 0.3;
    const sz = 14 + trnd() * 16;
    const gm = new THREE.Mesh(GEO.plane, MAT.gears[k % MAT.gears.length]);
    gm.scale.set(sz, sz, 1);
    gm.position.set(cxm + Math.cos(a) * r, gy + sz * 0.45, czm + Math.sin(a) * r);
    gm.rotation.order = 'YXZ';
    gm.rotation.y = -a + Math.PI / 2;
    grp.add(gm);
    G.gears.push({ m: gm, spd: (k % 2 ? 1 : -1) * 0.25 });
  }

  // ---- トランポリン ----
  const padGeo = new THREE.CylinderGeometry(PAD_R, PAD_R + 0.1, 0.32, 24);
  const megaGeo = new THREE.CylinderGeometry(MEGA_R, MEGA_R + 0.25, 0.5, 32);
  const bounGeo = new THREE.CylinderGeometry(BOUNCY_R, BOUNCY_R + 0.15, 0.4, 28);
  G.megaFx = [];
  for (const pd of d.pads) {
    const q = padPos(pd);
    const kind = pd.kind || 'normal';
    const m = kind === 'mega' ? new THREE.Mesh(megaGeo, [CM.megaSide, CM.megaTop, CM.megaSide])
            : kind === 'bouncy' ? new THREE.Mesh(bounGeo, [CM.bounSide, CM.bounTop, CM.bounSide])
            : new THREE.Mesh(padGeo, [CM.padSide, CM.padTop, CM.padSide]);
    pd.h = kind === 'mega' ? 0.5 : kind === 'bouncy' ? 0.4 : 0.32;
    m.position.set(q.x, q.y + pd.h / 2, q.z);
    grp.add(m);
    pd.mesh = m;
    if (kind === 'mega') {
      // 上へ昇っていく光の輪で「ここから空へ」を知らせる
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(MEGA_R * 0.9, MEGA_R * 0.9, 1, 20, 1, true), CM.megaBeam);
      const bh = Math.min(pd.dh, 26);
      beam.scale.y = bh; beam.position.set(q.x, q.y + bh / 2, q.z);
      grp.add(beam);
      const rings = [];
      for (let k = 0; k < 4; k++) {
        const rg = new THREE.Mesh(GEO.megaRing, CM.megaRing);
        rg.position.set(q.x, q.y, q.z); grp.add(rg); rings.push(rg);
      }
      G.megaFx.push({ pd: pd, rings: rings, bh: bh });
    } else if (kind === 'bouncy') {
      // 上の床から見つけやすいように、ピンクの光の柱を立てる
      const bh = (pd.drop || 8) + 2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(BOUNCY_R * 0.85, BOUNCY_R * 0.85, 1, 20, 1, true), CM.bounBeam);
      beam.scale.y = bh; beam.position.set(q.x, q.y + bh / 2, q.z);
      grp.add(beam);
    }
  }
  // 飛び降りる場所の目印（床に描いた下向きの矢印）
  for (const sg of d.signs || []) {
    const m = new THREE.Mesh(GEO.signPlane, CM.diveSign);
    m.position.set(sg.x, sg.y + 0.03, sg.z);
    m.rotation.y = sg.yaw;
    grp.add(m);
  }
  // ---- 発射台 ----
  for (const L of d.launchers) {
    const g2 = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 2.6), CM.arrow);
    base.position.y = 0.09;
    g2.add(base);
    const gl = glowSprite(0xff8a1a, 4); gl.position.y = 0.8; gl.material.opacity = 0.5; g2.add(gl);
    g2.position.set(L.plat.cx + L.ox, L.plat.cy, L.plat.cz + L.oz);
    g2.rotation.y = Math.atan2(-L.dirx, -L.dirz);
    grp.add(g2);
    L.mesh = g2;
  }
  CM.arrow.map.repeat.set(1, 1);

  // ---- ターザンロープ ----
  const ropeGeo = new THREE.CylinderGeometry(0.075, 0.075, 1, 8, 1, true).translate(0, -0.5, 0);
  const barGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.6, 14).rotateZ(Math.PI / 2);
  for (const r of d.ropes) {
    if (r.dead) continue;
    ropeInit(r);
    const bar = new THREE.Group();
    if (r.mount) {
      // メインの床の裏に取り付けた金具
      const plate = new THREE.Mesh(GEO.unit, CM.knob); plate.scale.set(0.9, 0.18, 0.9); plate.position.y = -0.09; bar.add(plate);
      const ring = new THREE.Mesh(GEO.sphere, CM.arm); ring.scale.setScalar(0.22); ring.position.y = -0.25; bar.add(ring);
    } else {
      const b = new THREE.Mesh(barGeo, CM.arm); bar.add(b);
      for (const s of [-1, 1]) { const k = new THREE.Mesh(GEO.sphere, CM.knob); k.scale.setScalar(0.38); k.position.x = s * 1.35; bar.add(k); }
    }
    bar.position.set(r.ax, r.ay + (r.mount ? 0 : 0.1), r.az);
    bar.rotation.y = Math.atan2(-r.dx, -r.dz);       // 棒はロープの振れる向きと直角
    grp.add(bar);
    const m = new THREE.Mesh(ropeGeo, CM.rope.clone());
    m.material.map = CM.rope.map.clone(); m.material.map.needsUpdate = true;
    m.material.map.repeat.set(1, r.L / 0.6);
    m.position.set(r.ax, r.ay, r.az);
    grp.add(m);
    const knot = new THREE.Mesh(GEO.sphere, CM.knob); knot.scale.setScalar(0.2);
    grp.add(knot);
    r.mesh = m; r.knot = knot;
  }

  // ---- 回転バー ----
  for (const R of d.rotors) {
    const c = rotorCenter(R);
    const g2 = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.5, 16), CM.arm);
    post.position.y = 0.75; g2.add(post);
    const arms = new THREE.Group();
    for (let k = 0; k < R.arms; k++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, R.len, 12), CM.arm);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(R.len / 2 * (k ? -1 : 1), 0.6, 0);
      arms.add(arm);
      const knob = new THREE.Mesh(GEO.sphere, CM.knob);
      knob.scale.setScalar(0.42);
      knob.position.set(R.len * (k ? -1 : 1), 0.6, 0);
      arms.add(knob);
    }
    g2.add(arms);
    g2.position.set(c.x, c.y, c.z);
    grp.add(g2);
    R.arms3 = arms;
    R.hitCD = 0;
  }

  // ---- チェックポイントの旗 ----
  const poleG = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8);
  d.cps.forEach((c, i) => {
    if (i === 0) return;
    const g2 = new THREE.Group();
    const pole = new THREE.Mesh(poleG, MAT.goal); pole.position.y = 1.6; g2.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), CM.flagOff);
    flag.position.set(0.68, 2.75, 0); g2.add(flag);
    // 道の端に立てる
    const P = c.plat;
    const sideX = P.w < P.d, off = (sideX ? P.w : P.d) / 2 - 0.4;
    g2.position.set(c.x + (sideX ? off : 0), c.y, c.z + (sideX ? 0 : off));
    g2.rotation.y = c.yaw;
    grp.add(g2);
    c.flag = flag; c.lit = false;
  });

  // ---- ゴール ----
  const goal = new THREE.Group();
  const gpil = new THREE.CylinderGeometry(0.3, 0.3, 5.5, 14);
  const p1 = new THREE.Mesh(gpil, MAT.goal); p1.position.set(-3.2, 2.75, 0);
  const p2 = new THREE.Mesh(gpil, MAT.goal); p2.position.set(3.2, 2.75, 0);
  const ball = new THREE.SphereGeometry(0.45, 14, 10);
  const b1 = new THREE.Mesh(ball, MAT.star); b1.position.set(-3.2, 5.6, 0);
  const b2 = new THREE.Mesh(ball, MAT.star); b2.position.set(3.2, 5.6, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.3), MAT.flag);
  banner.position.set(0, 4.8, 0);
  goal.add(p1, p2, b1, b2, banner);
  const gbeam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 18, 1, true), MAT.goalBeam);
  gbeam.position.set(0, 20, 0);
  goal.add(gbeam);
  goal.position.set(d.goal.x, d.goal.y, d.goal.z);
  goal.rotation.y = d.goal.yaw;
  grp.add(goal);
  G.goalObj = goal;
  G.goalPos = { x: d.goal.x, y: d.goal.y, z: d.goal.z };

  // ---- ジェム ----
  G.powerUps = d.gems.map(gm => {
    const g2 = new THREE.Group();
    g2.add(new THREE.Mesh(GEO.octa, MAT.star));
    const gl = glowSprite(0xffdd22, 3.0); gl.material.opacity = 0.6; g2.add(gl);
    g2.position.set(gm.x, gm.y + 1.1, gm.z);
    grp.add(g2);
    return { x: gm.x, y: gm.y, z: gm.z, obj: g2, got: false };
  });
  G.itemKind = 'dash';
  G.helpGem = null; G.failCp = -1; G.failN = 0; G.padSuperVis = false;
  G.enemies = [];
  G.pads = [];

  // ---- 足元の影 ----
  G.shadows = [];

  // ---- プレイヤー ----
  const sp = RACE.on ? spawnOffset(NET.slot) : { x: 0, z: 0 };
  G.player = {
    x: d.start.x + sp.x, y: 0, z: d.start.z + sp.z,
    vy: 0, yaw: d.start.yaw, pitch: -0.08,
    onGround: true, on: d.plats[0], f: 0, power: 0, dash: 0, stun: 0, inv: 0, fin: false, walkPhase: 0,
    kx: 0, kz: 0, wave: 0, cp: 0, respawnT: 0, boost: false,
    rope: null, ropeIdx: -1, ropeCD: 0, ropeLast: -1, fling: false, lvx: 0, lvz: 0
  };
  syncCamera(0);
  updateHUD();
}

// ---------- ロープの揺れと見た目 ----------
const _ropeQ = new THREE.Quaternion(), _ropeV = new THREE.Vector3(), _ropeDown = new THREE.Vector3(0, -1, 0);
function updateRopes(dt) {
  const d = G.d, p = G.player;
  if (!d.ropes) return;
  const held = new Map();                 // ほかのプレイヤーがつかんでいるロープ → その人の手の位置
  if (RACE.on) for (const q of NET.players) {
    if (!q || q.slot === NET.slot || !q.init || q.out || !q.obj || !(q.f > 0)) continue;
    held.set(q.f - 1, { x: q.x, y: q.y + ROPE_GRIP, z: q.z });
  }
  d.ropes.forEach((r, i) => {
    const mine = p && p.rope === r;
    if (!mine) ropeIdle(r, dt);
    let ux, uy, uz, len = r.L;
    const h = mine ? null : held.get(i);
    if (h) {
      // 見た目だけ、つかんでいる人の手までロープを伸ばす
      ux = h.x - r.ax; uy = h.y - r.ay; uz = h.z - r.az;
      const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      len = l;
    } else {
      ux = r.dx * Math.sin(r.th); uy = -Math.cos(r.th); uz = r.dz * Math.sin(r.th);
    }
    if (r.mesh) {
      _ropeV.set(ux, uy, uz);
      _ropeQ.setFromUnitVectors(_ropeDown, _ropeV);
      r.mesh.quaternion.copy(_ropeQ);
      r.mesh.scale.set(1, len, 1);
      const kl = mine ? p.ropeLen + 0.05 : h ? len + 0.05 : len;
      r.mesh.scale.set(1, kl, 1);
      r.knot.position.set(r.ax + ux * kl, r.ay + uy * kl, r.az + uz * kl);
    }
  });
}

// ---------- 毎フレームのコース演出 ----------
function shadowFor(i, x, y, z) {
  let s = G.shadows[i];
  if (!s) { s = new THREE.Mesh(GEO.shadow, CM.shadow); s.renderOrder = 2; G.group.add(s); G.shadows[i] = s; }
  const P = floorBelow(x, z, y + 0.05);
  if (!P) { s.visible = false; return; }
  const hgt = y - P.cy;
  const k = Math.max(0.35, 1 - hgt / 22);
  s.visible = true;
  s.position.set(x, P.cy + 0.03, z);
  s.scale.setScalar(1.25 * k + 0.3);
  s.material.opacity = 1;
}

function updateCourse(dt) {
  const d = G.d;
  if (!d) return;
  const t = courseTime();
  updateMovers(t);
  updateCrumbles(dt);
  updateRopes(dt);
  for (const R of d.rotors) {
    const c = rotorCenter(R);
    if (R.arms3) { R.arms3.rotation.y = -rotorAngle(R, t); R.arms3.parent.position.set(c.x, c.y, c.z); }
  }
  for (const fx of G.megaFx || []) {
    const q = padPos(fx.pd);
    fx.rings.forEach((rg, k) => {
      const u = ((t * 0.45 + k / fx.rings.length) % 1);
      rg.position.set(q.x, q.y + 0.4 + u * fx.bh, q.z);
      rg.scale.setScalar(1 - u * 0.35);
    });
  }
  CM.megaRing.opacity = 0.75;
  // 能力でスーパーになっている間は、ふつうのトランポリンも金色に見せる
  const supVis = RACE.on && ABIL.superPad > 0;
  if (supVis !== !!G.padSuperVis) {
    G.padSuperVis = supVis;
    for (const pd of d.pads) {
      if (!pd.mesh || (pd.kind && pd.kind !== 'normal' && pd.kind !== 'bouncy')) continue;
      if (!pd.mat0) pd.mat0 = pd.mesh.material;
      pd.mesh.material = supVis ? [CM.megaSide, CM.megaTop, CM.megaSide] : pd.mat0;
    }
  }
  for (const pd of d.pads) {
    const q = padPos(pd);
    pd.anim = Math.max(0, pd.anim - dt * 3);
    if (pd.mesh) {
      pd.mesh.position.set(q.x, q.y + (pd.h || 0.32) / 2 - pd.anim * 0.08, q.z);
      pd.mesh.scale.set(1 + pd.anim * 0.15, 1 - pd.anim * 0.5, 1 + pd.anim * 0.15);
    }
  }
  for (const L of d.launchers) {
    L.anim = Math.max(0, L.anim - dt * 2.5);
    if (L.mesh) L.mesh.position.set(L.plat.cx + L.ox, L.plat.cy, L.plat.cz + L.oz);
  }
  CM.arrow.map.offset.y = (CM.arrow.map.offset.y - dt * 1.4) % 1;
  if (G.belts) for (const bl of G.belts) bl.tex.offset.y = (bl.tex.offset.y - dt * bl.spd) % 1;

  // 影：自分と、見えている他のプレイヤー
  let k = 0;
  const p = G.player;
  if (p && !(SPEC.on && RACE.on)) shadowFor(k++, p.x, p.y, p.z);
  if (RACE.on) for (const q of NET.players) {
    if (!q || !q.obj || !q.obj.visible || (q.slot === NET.slot && !SPEC.on)) continue;
    shadowFor(k++, q.x, q.y, q.z);
  }
  for (let i = k; i < G.shadows.length; i++) G.shadows[i].visible = false;
}

// ---------- 効果音（コース用） ----------
function playLaunch()     { tone('sawtooth', 180, 1200, 0.35, 0.12); tone('sine', 300, 1600, 0.4, 0.12); }
function playCheckpoint() { [784, 1047, 1319].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.14, 0.15), i * 80)); }
function playGrab()       { tone('triangle', 520, 780, 0.12, 0.12); }
function playRelease()    { tone('sine', 700, 1100, 0.18, 0.10); }
function playMega()       { tone('triangle', 260, 1500, 0.7, 0.16); setTimeout(() => tone('sine', 520, 2400, 0.5, 0.10), 90); }
function playBounce()     { tone('sine', 200, 900, 0.35, 0.16); tone('triangle', 400, 1300, 0.3, 0.10); }
function playFall()       { tone('sine', 900, 200, 0.45, 0.14); }
function playCrumble()    { tone('square', 140, 60, 0.25, 0.10); }

// 画面中央に短い文字を出す
let toastT = 0;
function showToast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 1100);
}

// ===================== 波動（ショックウェーブ） =====================
// プレイヤー同士の押し合い（お互いが半分ずつ退くので、両側で解決すると完全に分離する）
function resolvePlayerCollision() {
  if (!RACE.on || !G.player || !G.d) return;
  const p = G.player;
  if (inPadColumn(p.x, p.z)) return;
  const R = P_R * 2;
  for (const q of NET.players) {
    if (!q || q.slot === NET.slot || !q.init) continue;
    if (p.y >= q.y + EYE || q.y >= p.y + EYE) continue;   // 高さが重なっていない
    if (inPadColumn(q.x, q.z)) continue;
    let dx = p.x - q.x, dz = p.z - q.z;
    let L = Math.hypot(dx, dz);
    if (L >= R) continue;
    if (L < 1e-4) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); L = 1; }
    const push = (R - L) * 0.5;
    p.x += (dx / L) * push;
    p.z += (dz / L) * push;
  }
}

// 正面45度・射程 WAVE_R の扇形に入っているか（0＝外、大きいほど強い）
function inWaveRange(ox, oy, oz, yaw, x, y, z) {
  if (Math.abs(y - oy) > WAVE_DY) return 0;
  const dx = x - ox, dz = z - oz;
  const L = Math.hypot(dx, dz);
  if (L > WAVE_R) return 0;
  if (L > 0.6) {                                   // 密着時は向き無関係で当たる
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if ((dx * fx + dz * fz) / L < Math.cos(WAVE_HALF)) return 0;
  }
  return Math.max(0.35, 1 - L / WAVE_R);           // 近いほど強い
}

function waveDir(ox, oz, x, z) {
  const dx = x - ox, dz = z - oz;
  const L = Math.hypot(dx, dz);
  if (L < 1e-4) { const a = Math.random() * Math.PI * 2; return { x: Math.cos(a), z: Math.sin(a) }; }
  return { x: dx / L, z: dz / L };
}

function waveHitEnemies() {}       // 追跡者はいない

function applyBlast(dx, dz, k) {
  const p = G.player;
  if (!p) return;
  if (p.rope) releaseRope(false);       // 波動を受けるとロープから手がはなれる
  p.kx += dx * WAVE_KNOCK * k;
  p.kz += dz * WAVE_KNOCK * k;
  p.vy = Math.max(p.vy, WAVE_LIFT * k);
  p.onGround = false;
  G.shake = Math.min(0.7, G.shake + 0.5);
  flash('rgba(255,210,0,.25)');
  playHitWave();
}

function fireWave() {
  const p = G.player;
  if (!p || !G.active) return;
  if (SPEC.on && RACE.on) return;
  if (p.wave > 0 || p.stun > 0) return;
  if (RACE.on && RACE.phase !== 'run') return;
  p.wave = WAVE_CD;
  spawnWaveFx(p.x, p.y, p.z, RACE.on ? NET.slot : 0, p.yaw);
  playWave();
  if (RACE.on) {
    if (NET.host) hostWave(NET.slot, p.x, p.y, p.z, p.yaw);
    else send(NET.hostConn, { t: 'wave', x: r2(p.x), y: r2(p.y), z: r2(p.z), w: r2(p.yaw) });
  } else {
    waveHitEnemies(p.x, p.y, p.z, p.yaw);
  }
}

// 見た目（正面へ広がるワイヤーフレームの円錐）
function spawnWaveFx(x, y, z, slot, yaw) {
  charCast(charOfSlot(slot), yaw);
  const col = WAVE_COLOR;
  const grp = new THREE.Group();
  grp.position.set(x, y + 0.95, z);
  grp.rotation.y = yaw;

  // 明るい世界でも見えるよう、光を足すのではなく色を重ねて描く（線は濃いオレンジ、面は黄色）
  const mk = (op, wire) => {
    const m = new THREE.MeshBasicMaterial({
      color: wire ? 0xff8a00 : col, transparent: true, opacity: op, wireframe: wire,
      depthWrite: false, fog: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(GEO.cone, m);
    mesh.rotation.x = Math.PI / 2;   // 頂点が -Z（正面）を向く
    mesh.position.z = -0.5;          // 頂点を自分の位置に合わせる
    grp.add(mesh);
    return m;
  };
  const mat  = mk(0.85, true);
  const smat = mk(0.30, false);

  scene.add(grp);
  G.fx.push({ grp: grp, mat: mat, smat: smat, t: 0 });
}

function updateWaveFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    f.t += dt;
    const u = f.t / WAVE_FX_DUR;
    if (u >= 1) {
      scene.remove(f.grp);
      f.mat.dispose(); f.smat.dispose();
      G.fx.splice(i, 1);
      continue;
    }
    f.grp.scale.setScalar(0.6 + u * WAVE_R);
    f.mat.opacity  = 0.85 * (1 - u);
    f.smat.opacity = 0.30 * (1 - u * u);
  }
}

// 波動のクールダウン表示
const waveBarEl  = document.getElementById('waveBar');
const waveFillEl = document.getElementById('waveFill');
const waveBtnEl  = document.getElementById('waveBtn');
function updateWaveUi() {
  const p = G.player;
  if (!p) return;
  const ready = p.wave <= 0;
  const pct = ready ? 100 : (1 - p.wave / WAVE_CD) * 100;
  waveFillEl.style.width = pct + '%';
  waveFillEl.classList.toggle('cool', !ready);
  if (waveBtnEl) waveBtnEl.classList.toggle('cool', !ready);
}

// ===================== 判定 =====================
// ---------- ジェムの復活と、助けのジェム ----------
function gemClock() { return RACE.on ? RACE.t : G.elapsed; }
function gemTaken(pu) {
  pu.got = true;
  pu.backT = gemClock() + GEM_BACK;
  if (pu.obj) pu.obj.visible = false;
}
function updateGems() {
  const now = gemClock();
  for (const pu of G.powerUps) {
    if (pu.got && pu.backT !== undefined && now >= pu.backT) {
      pu.got = false; pu.backT = undefined;
      if (pu.obj) { pu.obj.visible = true; pu.pop = 1; }
    }
  }
  const h = G.helpGem;
  if (h && h.got && now >= h.backT) { h.got = false; h.obj.visible = true; h.pop = 1; }
}
// 同じチェックポイントから何度もやり直しているとき、その場所にジェムを置く（本人にだけ見える）
function noteRespawn(cp) {
  if (G.failCp === cp) G.failN++; else { G.failCp = cp; G.failN = 1; removeHelpGem(); }
  if (G.failN >= HELP_FAILS && !G.helpGem) {
    const c = G.d.cps[cp];
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const x = c.x + fx * 2.6, z = c.z + fz * 2.6;
    const g2 = new THREE.Group();
    g2.add(new THREE.Mesh(GEO.octa, MAT.star));
    const gl = glowSprite(0xff6fd8, 3.4); gl.material.opacity = 0.7; g2.add(gl);
    g2.position.set(x, c.y + 1.1, z);
    G.group.add(g2);
    G.helpGem = { x: x, y: c.y, z: z, obj: g2, got: false, cp: cp, pop: 1 };
    showToast('ジェムが出た！');
  }
}
function removeHelpGem() {
  const h = G.helpGem;
  if (!h) return;
  if (h.obj && h.obj.parent) h.obj.parent.remove(h.obj);
  G.helpGem = null;
}

function checkPowerUps() {
  const p = G.player;
  updateGems();
  const h = G.helpGem;
  if (h && G.player.cp !== h.cp) { removeHelpGem(); G.failN = 0; }
  else if (h && !h.got) {
    const dx = h.x - p.x, dz = h.z - p.z;
    if (Math.abs(h.y - p.y) <= 2.4 && dx * dx + dz * dz <= 1.6 * 1.6) {
      h.got = true; h.backT = gemClock() + GEM_BACK; h.obj.visible = false;
      if (RACE.on) raceWantItem(-1);
      else { p.dash = Math.max(p.dash, DASH_DUR); playPower(); }
    }
  }
  for (const pu of G.powerUps) {
    if (pu.got) continue;
    const dx = pu.x - p.x, dz = pu.z - p.z;
    if (Math.abs(pu.y - p.y) > 2.4) continue;
    if (dx * dx + dz * dz > 1.6 * 1.6) continue;
    if (RACE.on) { raceWantItem(G.powerUps.indexOf(pu)); continue; }
    gemTaken(pu);
    p.dash = Math.max(p.dash, DASH_DUR);
    playPower();
    updateHUD();
  }
}

function checkGoal() {
  const p = G.player, g = G.goalPos;
  if (Math.abs(p.y - g.y) > 3) return;
  const dx = g.x - p.x, dz = g.z - p.z;
  if (dx * dx + dz * dz > 2.6 * 2.6) return;
  if (RACE.on) { raceLocalGoal(); return; }
  G.active = false;
  playGoal();
  Session.onClear(G.elapsed);
  setTimeout(showClear, 900);
  showToast('GOAL!');
}

// ===================== カメラ =====================
function syncCamera(dt) {
  if (SPEC.on && RACE.on && specCamera()) return;
  const p = G.player;
  const sh = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 0.16 : 0;
  if (VIEW.third) {
    thirdCamera(p.x, p.y, p.z, p.yaw, p.pitch, dt);
    camera.position.y += sh;
  } else {
    camera.position.set(p.x, p.y + EYE + G.bob + sh, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
  }

  const targetFov = BASE_FOV + G.fovKick * 15;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10 + 0.15);
    camera.updateProjectionMatrix();
  }

  // 三人称でも灯りは本人の頭の位置（カメラ位置だと本人の周りが暗くなる）
  headLight.position.set(p.x, p.y + EYE, p.z);
  powerLight.position.copy(headLight.position);
  powerLight.intensity = p.power > 0 ? 1.6 : 0;
}

// ===================== 演出更新 =====================
function updateVisuals(dt, now) {
  updateWaveFx(dt);
  if (G.gears) for (const gr of G.gears) gr.m.rotation.z += gr.spd * dt;
  for (const pu of G.helpGem ? G.powerUps.concat([G.helpGem]) : G.powerUps) {
    if (pu.got) continue;
    pu.obj.rotation.y += dt * 2.2;
    pu.obj.rotation.x += dt * 1.1;
    pu.obj.position.y = pu.y + 1.1 + Math.sin(now / 340) * 0.18;
    if (pu.pop > 0) { pu.pop = Math.max(0, pu.pop - dt * 3); pu.obj.scale.setScalar(1 - pu.pop * 0.9); }   // ぽんと現れる
  }

  // パワー中の画面色
  const p = G.player;
  if (p && p.power > 0) {
    const blink = (p.power <= POWER_BLINK && Math.floor(now / 120) % 2 === 0) ? 0 : 1;
    tintEl.style.background = 'radial-gradient(circle at 50% 50%, rgba(255,221,0,0) 40%, rgba(255,190,0,.28) 100%)';
    tintEl.style.opacity = String(0.9 * blink);
  } else if (!flashing) {
    tintEl.style.opacity = '0';
  }
}

// ===================== HUD / ミニマップ =====================
const hStage = document.getElementById('hStage');
const hScore = document.getElementById('hScore');
const hLives = document.getElementById('hLives');
const hFloor = document.getElementById('hFloor');
const hBonus = document.getElementById('hBonus');
const hPower = document.getElementById('hPower');
const tintEl = document.getElementById('tint');

let flashing = false;
function flash(color) {
  flashing = true;
  tintEl.style.background = color;
  tintEl.style.opacity = '1';
  setTimeout(() => { tintEl.style.opacity = '0'; flashing = false; }, 260);
}

function updateHUD() {
  hStage.textContent = 'STAGE ' + (Session.stageIndex + 1);
  const b = Session.bestOf(Session.stageIndex);
  hScore.textContent = b === null ? 'BEST --' : 'BEST ' + fmtTime(b);
  hLives.textContent = '';
}

function updateHUDLive() {
  const p = G.player, d = G.d;
  if (!p || !d) return;
  const pr = Math.min(100, Math.round(courseProgress(p.x, p.y, p.z) / d.length * 100));
  hFloor.textContent = 'CHECK ' + p.cp + ' / ' + (d.cps.length - 1) + '　' + pr + '%';
  hBonus.textContent = RACE.on ? '' : 'TIME ' + fmtTime(G.elapsed);
  hPower.textContent = p.dash > 0 ? 'DASH ' + p.dash.toFixed(1) : '';
  if (!RACE.on) {
    dashBarEl.style.opacity = p.dash > 0 ? '1' : '0';
    dashFillEl.style.width = Math.max(0, Math.min(1, p.dash / DASH_DUR)) * 100 + '%';
  }
  updateWaveUi();
  document.body.classList.toggle('hanging', !!p.rope);
  if (RACE.on) raceHud();
}

// ===================== サウンド =====================
// 音源は assets/audio/ から読み込む
// bgm: 冒頭 0.558 秒（無音）を除いた 64.000 秒 = 12フレーズ分をシームレスループ
const BGM_LOOP_SEC = 118.783;   // 48小節ちょうど（曲の頭から最後までを丸ごとループ）
const BGM_VOL = 0.8;

let muted = false;
let audioCtx = null;
const BUF = { bgm: null, jump: null, goal: null };
let bgmSrc = null, bgmGain = null, bgmWant = false, bgmFallback = null;
let audioInit = false;

function ac() {
  if (!audioCtx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { audioCtx = new C(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

function initAudio() {
  if (audioInit) return;
  const a = ac();
  if (!a) { initFallback(); return; }
  audioInit = true;
  const jobs = [['jump', 'assets/audio/jump.mp3'], ['goal', 'assets/audio/goal.mp3'], ['bgm', 'assets/audio/bgm.mp3']];
  for (const job of jobs) {
    fetch(job[1])
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => a.decodeAudioData(ab,
        (buf) => { BUF[job[0]] = buf; if (job[0] === 'bgm' && bgmWant) startBGM(); },
        () => { if (job[0] === 'bgm') initFallback(); }))
      .catch(() => { if (job[0] === 'bgm') initFallback(); });
  }
}

// Web Audio が使えない環境向けの保険
function initFallback() {
  if (bgmFallback) return;
  try {
    bgmFallback = new Audio('assets/audio/bgm.mp3');
    bgmFallback.loop = true;
    bgmFallback.volume = BGM_VOL;
  } catch (e) {}
}

// MP3のデコーダ遅延で先頭に無音が付く場合があるため、実音の開始位置を測る
function firstSound(buf) {
  const ch = buf.getChannelData(0);
  const n = Math.min(ch.length, Math.floor(buf.sampleRate * 2));
  for (let i = 0; i < n; i++) if (Math.abs(ch[i]) > 0.002) return i / buf.sampleRate;
  return 0;
}

// --- BGM: タイトルからゲームオーバーまで途切れさせない ---
function startBGM() {
  bgmWant = true;
  if (muted) return;
  const a = ac();
  if (!a) {
    initFallback();
    if (bgmFallback) { const pr = bgmFallback.play(); if (pr && pr.catch) pr.catch(() => {}); }
    return;
  }
  if (!BUF.bgm) { initAudio(); return; }
  if (bgmSrc) return;

  const off = 0;                     // 頭の休符も曲の一部なので削らない
  bgmGain = a.createGain();
  bgmGain.gain.value = BGM_VOL;
  bgmGain.connect(a.destination);

  bgmSrc = a.createBufferSource();
  bgmSrc.buffer = BUF.bgm;
  bgmSrc.loop = true;
  bgmSrc.loopStart = off;
  bgmSrc.loopEnd = Math.min(off + BGM_LOOP_SEC, BUF.bgm.duration);
  bgmSrc.connect(bgmGain);
  bgmSrc.start(0, off);
}

initAudio();
startBGM();
// 自動再生がブロックされた場合は最初の操作で開始
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { ac(); initAudio(); startBGM(); }, { passive: true }));

function toggleMute() {
  muted = !muted;
  if (bgmFallback) bgmFallback.muted = muted;
  if (muted) { if (bgmGain) bgmGain.gain.value = 0; }
  else {
    ac();
    if (bgmGain) bgmGain.gain.value = BGM_VOL;
    if (!bgmSrc) startBGM();
  }
}

// --- 効果音 ---
function playBuf(key, vol) {
  if (muted) return;
  const v = Math.max(0, Math.min(1, vol));
  if (v <= 0.01) return;
  const a = ac();
  if (!a || !BUF[key]) return;
  const s = a.createBufferSource();
  s.buffer = BUF[key];
  const g = a.createGain();
  g.gain.value = v;
  s.connect(g); g.connect(a.destination);
  s.start(0);
}

// 音源からの距離で音量を落とす（遠くの敵のバウンドは小さく）
function distGain(x, y, z) {
  const p = G.player;
  if (!p) return 1;
  const d = Math.hypot(x - p.x, y - p.y, z - p.z);
  return Math.max(0, Math.min(1, 1 - (d - 5) / 30));
}

function playJump(gain) { playBuf('jump', 0.75 * (gain === undefined ? 1 : gain)); }
function playGoal()     { playBuf('goal', 0.85); }

// --- 合成音（着地・パワーアップ・撃破・ミス）---
function tone(type, f0, f1, dur, vol) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function playLand()  { tone('sine', 220, 90, 0.1, 0.09); }
function playWave()  { tone('sine', 1050, 130, 0.34, 0.17); tone('triangle', 420, 70, 0.30, 0.10); }
function playHitWave() { tone('square', 260, 90, 0.20, 0.13); }
function playTick()  { tone('square', 1400, 1400, 0.03, 0.05); }
function playZap()   { tone('sawtooth', 2200, 120, 0.45, 0.20); tone('square', 900, 60, 0.4, 0.12); }
function playDeny()  { tone('square', 320, 150, 0.28, 0.15); }
function playDark()  { tone('sine', 500, 60, 0.7, 0.16); }
function playPower() { [660, 880, 1320].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.16, 0.16), i * 70)); }
function playKill()  { tone('square', 700, 140, 0.16, 0.14); }
function playDead()  { tone('sawtooth', 420, 70, 0.55, 0.16); }

// ===================== 画面遷移 =====================
const scTitle = document.getElementById('scTitle');
const scClear = document.getElementById('scClear');
const hudEl   = document.getElementById('hud');
const pauseEl = document.getElementById('pause');

function hideAll() {
  document.body.classList.remove('playing');
  ['scTitle', 'scClear', 'scMiss', 'scOver', 'scJoin', 'scRoom', 'scResult'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.classList.add('hidden');
  });
}
function showTitle() {
  hideAll(); exitLock();
  G.active = false;
  stageSelRender();
  document.body.classList.remove('race');
  document.body.classList.remove('playing');
  scTitle.classList.remove('hidden');
  hudEl.style.opacity = '0';
}
function showGame() {
  hideAll();
  document.body.classList.add('playing');
  // 名前欄などにフォーカスが残っているとキー入力が素通しされてしまうので外す
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  hudEl.style.opacity = '1';
}

function showClear() {
  if (RACE.on) return;
  hideAll(); exitLock();
  document.getElementById('clearAdded').textContent = fmtTime(Session.lastTime);
  document.getElementById('clearTotal').textContent = 'BEST ' + fmtTime(Session.best);
  document.getElementById('clearLives').textContent = 'STAGE ' + (Session.stageIndex + 1);
  document.getElementById('clearExtra').textContent = Session.newBest ? 'NEW RECORD!' : '';
  scClear.classList.remove('hidden');
  hudEl.style.opacity = '0';
}

// ===================== 入力 =====================
const isTouch = window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const keys = { f: false, b: false, l: false, r: false, tl: false, tr: false };
const stick = { active: false, x: 0, y: 0, id: null };
let locked = false;

function keyMap(k) {
  switch (k) {
    case 'w': case 'W': case 'ArrowUp':    return 'f';
    case 's': case 'S': case 'ArrowDown':  return 'b';
    case 'a': case 'A': case 'ArrowLeft':  return 'l';
    case 'd': case 'D': case 'ArrowRight': return 'r';
    case 'q': case 'Q': return 'tl';     // 左に旋回
    case 'e': case 'E': return 'tr';     // 右に旋回
  }
  return null;
}
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;   // 入力欄では素通し
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (e.key === 'v' || e.key === 'V') { toggleView(); return; }
  if (FEATURE_ROPE && e.key === ' ' && G.player && G.player.rope) { releaseRope(); e.preventDefault(); return; }
  if ((e.key === 'r' || e.key === 'R') && G.active && G.player && !(SPEC.on && RACE.on) && !G.player.fin && G.player.respawnT <= 0) { respawnPlayer(); return; }
  if (SPEC.on && RACE.on) {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  { specPick(-1); e.preventDefault(); return; }
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') { specPick(1);  e.preventDefault(); return; }
  }
  const m = keyMap(e.key);
  if (m) { keys[m] = true; e.preventDefault(); ac(); }
});
window.addEventListener('keyup', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const m = keyMap(e.key);
  if (m) { keys[m] = false; e.preventDefault(); }
});

// --- マウス視点 ---
// ポインタロックが使えない環境（iframe内、Esc直後の再ロック制限など）でも
// 必ず操作できるよう、ロックはあくまで「快適化」であり必須にしない。
let lockGrace = 0;
let lockFailed = false;
let dragging = false, dragX = 0, dragY = 0, dragMoved = 0;

function requestLock() {
  lockGrace = 1.0;
  if (isTouch || lockFailed || !glCanvas.requestPointerLock) return;
  try {
    const pr = glCanvas.requestPointerLock();
    if (pr && pr.catch) pr.catch(() => { lockFailed = true; });
  } catch (e) { lockFailed = true; }
}
function exitLock() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }

document.addEventListener('pointerlockchange', () => {
  locked = (document.pointerLockElement === glCanvas);
  if (locked) { lockGrace = 0; lockFailed = false; }
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; locked = false; });

// ロック中は移動量で、非ロック時はカーソル位置で視点を動かす（クリック不要）
let hoverOn = false, hoverX = 0, hoverY = 0;

document.addEventListener('mousemove', e => {
  const p = G.player;
  if (!p) return;
  if (locked) {
    p.yaw   -= e.movementX * 0.0022;
    p.pitch -= e.movementY * 0.0022;
    p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch));
    return;
  }
  if (dragging) {                       // ドラッグ中は1:1の直接操作（微調整用）
    const dx = e.clientX - dragX, dy = e.clientY - dragY;
    dragX = e.clientX; dragY = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    p.yaw   -= dx * 0.004;
    p.pitch -= dy * 0.004;
    p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch));
    return;
  }
  // クリックなしのホバー操舵：画面中央からのカーソルのズレで旋回する
  const r = wrap.getBoundingClientRect();
  if (!r.width || !r.height) return;
  hoverX = ((e.clientX - r.left) / r.width) * 2 - 1;
  hoverY = ((e.clientY - r.top) / r.height) * 2 - 1;
  hoverOn = (hoverX >= -1 && hoverX <= 1 && hoverY >= -1 && hoverY <= 1);
});
document.addEventListener('mouseleave', () => { hoverOn = false; });

const TURN_YAW = 3.0, TURN_PITCH = 1.9, HOVER_DEAD = 0.14;
function curve(v) {
  const a = Math.abs(v);
  if (a <= HOVER_DEAD) return 0;
  const t = (a - HOVER_DEAD) / (1 - HOVER_DEAD);
  return t * t * Math.sign(v);          // 中央付近は緩く、端ほど速く
}
function applyLookInput(dt) {
  const p = G.player;
  if (!p) return;
  let yawV = 0;
  if (keys.tl) yawV += 1;
  if (keys.tr) yawV -= 1;
  p.yaw += yawV * TURN_YAW * dt;
  if (isTouch || locked || dragging || !hoverOn) return;
  p.yaw   -= curve(hoverX) * TURN_YAW * dt;
  p.pitch -= curve(hoverY) * TURN_PITCH * dt;
  p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch));
}

glCanvas.addEventListener('mousedown', e => {
  if (isTouch || e.button !== 0) return;
  ac();
  if (SPEC.on && RACE.on) { specPick(1); return; }
  if (locked) { if (G.active) fireWave(); return; }
  // ロックしていないときはドラッグで視点操作
  dragging = true; dragX = e.clientX; dragY = e.clientY; dragMoved = 0;
  e.preventDefault();
});

window.addEventListener('mouseup', e => {
  if (!dragging || e.button !== 0) return;
  dragging = false;
  if (dragMoved > 6) return;                 // ドラッグだった -> 視点操作のみ
  if (SPEC.on && RACE.on) { specPick(1); return; }
  if (!lockFailed) requestLock();            // ほぼ動いていない -> ロックを試す
  else if (G.active) fireWave();             // ロックが使えない環境では波動を発射
});

glCanvas.addEventListener('contextmenu', e => e.preventDefault());
pauseEl.addEventListener('click', () => { ac(); requestLock(); });

// --- タッチ操作 ---
const stickBase = document.getElementById('stickBase');
const stickKnob = document.getElementById('stickKnob');
const touchLayer = document.getElementById('touch');
let lookId = null, lookX = 0, lookY = 0;
const STICK_R = 58;

function localPos(t) {
  const r = wrap.getBoundingClientRect();
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}

touchLayer.addEventListener('touchstart', ev => {
  ev.preventDefault(); ac();
  const r = wrap.getBoundingClientRect();
  for (let n = 0; n < ev.changedTouches.length; n++) {
    const t = ev.changedTouches[n];
    const q = localPos(t);
    if (t.target && t.target.id === 'waveBtn') { fireWave(); continue; }
    if (t.target && t.target.id === 'ropeBtn') { releaseRope(); continue; }
    if (t.target && t.target.id === 'viewBtn') { toggleView(); continue; }
    if (q.x < r.width * 0.5 && stick.id === null) {
      stick.id = t.identifier; stick.active = true; stick.x = 0; stick.y = 0;
      stickBase.style.left = q.x + 'px'; stickBase.style.top = q.y + 'px';
      stickKnob.style.left = q.x + 'px'; stickKnob.style.top = q.y + 'px';
      stickBase.style.opacity = '1'; stickKnob.style.opacity = '1';
      stickBase.dataset.ox = q.x; stickBase.dataset.oy = q.y;
    } else if (q.x >= r.width * 0.5 && lookId === null) {
      lookId = t.identifier; lookX = q.x; lookY = q.y;
    }
  }
}, { passive: false });

touchLayer.addEventListener('touchmove', ev => {
  ev.preventDefault();
  const p = G.player;
  for (let n = 0; n < ev.changedTouches.length; n++) {
    const t = ev.changedTouches[n];
    const q = localPos(t);
    if (t.identifier === stick.id) {
      const ox = parseFloat(stickBase.dataset.ox), oy = parseFloat(stickBase.dataset.oy);
      let dx = q.x - ox, dy = q.y - oy;
      const L = Math.hypot(dx, dy);
      const cl = Math.min(L, STICK_R);
      const ang = Math.atan2(dy, dx);
      stickKnob.style.left = (ox + Math.cos(ang) * cl) + 'px';
      stickKnob.style.top  = (oy + Math.sin(ang) * cl) + 'px';
      stick.x = (Math.cos(ang) * cl) / STICK_R;
      stick.y = (Math.sin(ang) * cl) / STICK_R;
      if (L < 8) { stick.x = 0; stick.y = 0; }
    } else if (t.identifier === lookId && p) {
      p.yaw   -= (q.x - lookX) * 0.006;
      p.pitch -= (q.y - lookY) * 0.006;
      p.pitch = Math.max(-1.35, Math.min(1.35, p.pitch));
      lookX = q.x; lookY = q.y;
    }
  }
}, { passive: false });

function endTouch(ev) {
  ev.preventDefault();
  for (let n = 0; n < ev.changedTouches.length; n++) {
    const t = ev.changedTouches[n];
    if (t.identifier === stick.id) {
      stick.id = null; stick.active = false; stick.x = 0; stick.y = 0;
      stickBase.style.opacity = '0'; stickKnob.style.opacity = '0';
    }
    if (t.identifier === lookId) lookId = null;
  }
}
touchLayer.addEventListener('touchend', endTouch, { passive: false });
touchLayer.addEventListener('touchcancel', endTouch, { passive: false });

// --- メニューボタン ---
function startStage(si) {
  buildStage(si);
  showGame();
  requestLock();
}
let stageSel = 0;
function stageSelRender() {
  const max = Session.unlocked();
  stageSel = Math.max(0, Math.min(stageSel, max));
  const el = document.getElementById('stageNum');
  if (el) el.textContent = 'STAGE ' + (stageSel + 1);
  const b = Session.bestOf(stageSel);
  const bl = document.getElementById('stageBest');
  if (bl) bl.textContent = b === null ? '' : 'BEST ' + fmtTime(b);
  const pv = document.getElementById('stagePrev'), nx = document.getElementById('stageNext');
  if (pv) pv.classList.toggle('off', stageSel <= 0);
  if (nx) nx.classList.toggle('off', stageSel >= max);
}
document.getElementById('stagePrev').onclick = () => { stageSel--; stageSelRender(); };
document.getElementById('stageNext').onclick = () => { stageSel++; stageSelRender(); };
document.getElementById('btnPlay').onclick      = () => { ac(); Session.reset(stageSel); startStage(stageSel); };
document.getElementById('btnNext').onclick      = () => { ac(); Session.stageIndex++; stageSel = Session.stageIndex; startStage(Session.stageIndex); };
document.getElementById('btnRetry').onclick     = () => { ac(); startStage(Session.stageIndex); };
document.getElementById('btnClearTitle').onclick = showTitle;

// ===================== メインループ =====================
let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 0.016;
  lastT = t;

  if (lockGrace > 0) lockGrace -= dt;
  // ロック待ちでもゲームは止めない（キー操作は常に有効）。案内だけ出す
  if (!isTouch) pauseEl.classList.toggle('on', G.active && !locked && !lockFailed && lockGrace <= 0 && !(SPEC.on && RACE.on));
  else pauseEl.classList.remove('on');

  const running = G.active && G.player;

  if (running) {
    applyLookInput(dt);
    if (!RACE.on) G.elapsed += dt;
    updateCourse(dt);
    if (RACE.on) {
      raceTick(dt);
    } else {
      updatePlayer(dt);
      checkPowerUps();
      if (G.active) checkGoal();
    }
    updateVisuals(dt, t);
    syncCamera(dt);
    updateSelfChr(dt);
    updateHUDLive();
  } else if (G.player) {
    if (G.d) updateCourse(dt);
    syncCamera(dt);
  }

  skyDome.position.copy(camera.position);
  renderer.render(scene, camera);
}

resize();
showTitle();
requestAnimationFrame(loop);

// ===================== 対戦（レース） =====================
// 通信は PeerJS のスター型。ホストが中継と裁定（敵の移動・接触・アイテム・順位）を担う。
const PEER_PREFIX = 'tc3d-race-';

const NET = {
  on: false, host: false, peer: null, hostConn: null,
  conns: {},                 // slot -> DataConnection（ホストのみ）
  slot: 0, code: '', name: '',
  players: []                // index = slot
};

const RACE = {
  on: false, phase: 'idle',  // idle / count / run / done
  t: 0, count: 0, no: 0, si: 2, seed: 0,
  order: [], sendT: 0, ezT: 0, reqT: {}
};

// 退出したプレイヤーの観戦状態
const SPEC = { on: false, target: -1 };

// ジェムのルーレットと、自分にかかっている妨害効果
const ABIL = {
  spin: 0, spinKind: 0, winner: -1,   // ルーレット演出
  zap: 0, nopad: 0, dark: 0,          // 自分が受けている効果の残り秒数
  superPad: 0                         // 自分のトランポリンがスーパーになっている残り秒数
};
function abilReset() { ABIL.spin = 0; ABIL.winner = -1; ABIL.zap = 0; ABIL.nopad = 0; ABIL.dark = 0; ABIL.superPad = 0; applyDarkness(); rouletteHide(); }

const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

// ---------- DOM ----------
const scJoin    = document.getElementById('scJoin');
const scRoom    = document.getElementById('scRoom');
const scResult  = document.getElementById('scResult');
const countEl   = document.getElementById('count');
const goalMsgEl = document.getElementById('goalMsg');
const stunMsgEl = document.getElementById('stunMsg');
const dashBarEl = document.getElementById('dashBar');
const dashFillEl= document.getElementById('dashFill');
const rbRank = document.getElementById('rbRank');
const rbTime = document.getElementById('rbTime');
const rbLeft = document.getElementById('rbLeft');

function netErr(msg) {
  document.getElementById('netMsg').textContent = msg || '';
  document.getElementById('netMsg2').textContent = msg || '';
}

// ---------- 共通ヘルパ ----------
function getName() {
  const el = document.getElementById('myName');
  let v = (el && el.value || '').trim().slice(0, 8);
  if (!v) { try { v = localStorage.getItem('tc3d_name') || ''; } catch (e) {} }
  if (!v) v = 'PLAYER';
  try { localStorage.setItem('tc3d_name', v); } catch (e) {}
  return v;
}

function send(conn, m) { try { if (conn && conn.open) conn.send(m); } catch (e) {} }
function hostBroadcast(m, exceptSlot) {
  for (const k in NET.conns) {
    if (exceptSlot !== undefined && +k === exceptSlot) continue;
    send(NET.conns[k], m);
  }
}

function addPlayer(slot, name, skin) {
  NET.players[slot] = {
    slot: slot, name: name || PNAMES[slot], skin: skinIndex(skin),
    x: 0, y: 0, z: 0, yaw: 0, f: 0, st: 0,
    tx: 0, ty: 0, tz: 0, tyaw: 0,
    init: false, fin: false, time: 0, pts: 0, total: 0,
    lives: START_LIVES, out: false, pitch: 0,
    cool: 0, obj: null
  };
  return NET.players[slot];
}
function activePlayers() { return NET.players.filter(q => !!q); }
// レースに参加している人（退出者を除く）
function racers() { return NET.players.filter(q => !!q && !q.out); }
function freeSlot() {
  for (let i = 0; i < MAX_PLAYERS; i++) if (!NET.players[i]) return i;
  return -1;
}
function playerList() {
  return activePlayers().map(q => [q.slot, q.name, r1(q.total), q.lives, q.out ? 1 : 0, q.skin]);
}
function applyPlayerList(a) {
  const keep = {};
  for (const row of a) {
    const slot = row[0];
    const q = NET.players[slot] || addPlayer(slot, row[1]);
    q.name = row[1]; q.total = row[2];
    if (row.length > 3) { q.lives = row[3]; q.out = !!row[4]; }
    if (row.length > 5) q.skin = skinIndex(row[5]);
    if (slot === NET.slot && row.length > 5) {
      if (MY_SKIN.v !== q.skin && MY_SKIN.want !== false) skinMsg('ほかの人と同じキャラだったので「' + SKIN_NAMES[q.skin] + '」になりました');
      MY_SKIN.v = q.skin;
    }
    keep[slot] = true;
  }
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (NET.players[i] && !keep[i]) removeAvatar(NET.players[i]), NET.players[i] = null;
  }
  lobbyRefresh();
}

// レース開始位置（同じ場所の周りに円形に並ぶ）
function spawnOffset(slot) {
  const a = (slot / MAX_PLAYERS) * Math.PI * 2;
  return { x: Math.cos(a) * 1.25, z: Math.sin(a) * 1.25 };
}

// 敵が狙う相手＝一番近い未ゴールのプレイヤー
function nearestTarget(e) {
  let best = null, bd = Infinity;
  for (const q of NET.players) {
    if (!q || !q.init || q.fin || q.out) continue;
    const dx = q.x - e.x, dy = (q.y - e.y) * 0.7, dz = q.z - e.z;
    const dd = dx * dx + dy * dy + dz * dz;
    if (dd < bd) { bd = dd; best = q; }
  }
  return best;
}

// ---------- アバター ----------
function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(3,8,16,.72)';
  g.fillRect(0, 12, 256, 40);
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
  g.lineWidth = 3; g.strokeRect(1.5, 13.5, 253, 37);
  g.fillStyle = '#ffffff';
  g.font = 'bold 26px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(name).slice(0, 8), 128, 33);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false
  }));
  sp.scale.set(2.4, 0.6, 1);
  return sp;
}

function makeAvatar(slot, name, skin) {
  const col = PCOLORS[slot];
  const g = new THREE.Group();
  const chr = makeCharacter(col, skin);
  if (chr) {
    g.add(chr.root);
    g.userData.chr = chr;
    // 明るい世界なので光のにじみは控えめにして、足元に寄せる（誰の色かが分かる程度）
    const gl = glowSprite(col, 2.2); gl.position.y = 0.35; gl.material.opacity = 0.45; g.add(gl);
    const tag = nameTag(name, col); tag.position.y = 2.2; g.add(tag);
    g.userData.glow = gl;
    return g;
  }
  const lit  = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c141d, emissive: col, emissiveIntensity: 0.14, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 1.00, 12), dark);
  body.position.y = 0.52; g.add(body);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.13, 12), lit);
  belt.position.y = 0.94; g.add(belt);
  const head = new THREE.Mesh(GEO.sphere, dark);
  head.scale.setScalar(0.29); head.position.y = 1.31; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.08), lit);
  visor.position.set(0, 1.34, -0.24); g.add(visor);   // ローカル -Z が正面

  const gl = glowSprite(col, 3.0); gl.position.y = 1.0; g.add(gl);
  const tag = nameTag(name, col); tag.position.y = 2.1; g.add(tag);
  g.userData.glow = gl;
  return g;
}

function removeAvatar(q) {
  if (q && q.obj) {
    charDispose(q.obj.userData.chr);
    scene.remove(q.obj); q.obj = null;
  }
}
function buildAvatars() {
  for (const q of NET.players) {
    if (!q) continue;
    removeAvatar(q);
    if (q.out) continue;                       // 退出者は場にいない
    if (q.slot === NET.slot && !SPEC.on) continue;   // 観戦中は自分のアバターも表示する
    q.obj = makeAvatar(q.slot, q.name, q.skin);
    scene.add(q.obj);
  }
}
function clearAvatars() { for (const q of NET.players) removeAvatar(q); }

// ---------- ルーム作成 / 参加 ----------
let idTry = 0;
function createRoom() {
  if (typeof Peer === 'undefined') { netErr('通信ライブラリを読み込めません（インターネット接続が必要です）'); return; }
  netErr('');
  NET.name = getName();
  NET.host = true; NET.slot = 0;
  NET.players = []; NET.conns = {};
  addPlayer(0, NET.name, MY_SKIN.v);
  NET.code = String(Math.floor(1000 + Math.random() * 9000));

  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  NET.peer = new Peer(PEER_PREFIX + NET.code, { debug: 0 });
  NET.peer.on('open', () => { NET.on = true; idTry = 0; showRoom(); });
  NET.peer.on('connection', (conn) => hostAccept(conn));
  NET.peer.on('error', (err) => {
    const ty = String(err && err.type);
    if (ty === 'unavailable-id' && idTry < 5) { idTry++; createRoom(); return; }
    if (ty === 'peer-unavailable') return;
    netErr('接続エラー: ' + ty);
  });
}

function hostAccept(conn) {
  conn.on('open', () => {
    if (RACE.phase === 'count' || RACE.phase === 'run') { send(conn, { t: 'busy' }); return; }
    const slot = freeSlot();
    if (slot < 0) { send(conn, { t: 'full' }); return; }
    conn._slot = slot;
    NET.conns[slot] = conn;
    const nm = (conn.metadata && conn.metadata.name) ? String(conn.metadata.name).slice(0, 8) : PNAMES[slot];
    // キャラかぶりはさせない：希望のキャラが使われていたら空いているキャラにする
    addPlayer(slot, nm, freeSkin(conn.metadata && conn.metadata.skin, slot));
    send(conn, { t: 'welcome', slot: slot, list: playerList() });
    hostBroadcast({ t: 'lobby', list: playerList() }, slot);
    lobbyRefresh();
  });
  conn.on('data', (m) => hostHandle(conn._slot, m));
  conn.on('close', () => hostDrop(conn._slot));
  conn.on('error', () => hostDrop(conn._slot));
}

function hostDrop(slot) {
  if (slot == null || !NET.players[slot]) return;
  removeAvatar(NET.players[slot]);
  NET.players[slot] = null;
  delete NET.conns[slot];
  hostBroadcast({ t: 'lobby', list: playerList() });
  lobbyRefresh();
  if (RACE.phase === 'run') checkRaceEnd();
}

function joinRoom() {
  if (typeof Peer === 'undefined') { netErr('通信ライブラリを読み込めません（インターネット接続が必要です）'); return; }
  const code = (document.getElementById('joinCode').value || '').trim();
  if (!/^\d{4}$/.test(code)) { netErr('4桁の数字を入力してください'); return; }
  netErr('接続中...');
  NET.name = getName();
  NET.host = false; NET.code = code;
  NET.players = []; NET.conns = {};

  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  NET.peer = new Peer({ debug: 0 });
  NET.peer.on('open', () => {
    const conn = NET.peer.connect(PEER_PREFIX + code, { reliable: true, metadata: { name: NET.name, skin: MY_SKIN.v } });
    NET.hostConn = conn;
    conn.on('data', (m) => guestHandle(m));
    conn.on('close', () => netLost('ホストとの接続が切れました'));
    conn.on('error', () => netErr('ルームに接続できませんでした'));
    setTimeout(() => { if (!NET.on) netErr('ルームが見つかりません（コードを確認してください）'); }, 9000);
  });
  NET.peer.on('error', (err) => {
    const ty = String(err && err.type);
    netErr(ty === 'peer-unavailable' ? 'そのコードのルームは見つかりません' : '接続エラー: ' + ty);
  });
}

function netLost(msg) {
  if (!NET.on) return;
  NET.on = false; RACE.on = false; RACE.phase = 'idle';
  G.active = false;
  document.body.classList.remove('race');
  clearAvatars();
  hideAll(); scJoin.classList.remove('hidden'); hudEl.style.opacity = '0';
  netErr(msg || '接続が切れました');
}

function leaveRoom() {
  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  NET.on = false; NET.peer = null; NET.hostConn = null; NET.conns = {};
  RACE.on = false; RACE.phase = 'idle'; G.active = false;
  document.body.classList.remove('race');
  clearAvatars();
  NET.players = [];
  countEl.classList.remove('on');
  goalMsgEl.classList.remove('on');
  stunMsgEl.classList.remove('on');
  netErr('');
  showTitle();
}

// ---------- ロビー ----------
function showRoom() {
  hideAll();
  document.getElementById('roomCode').textContent = NET.code;
  document.getElementById('roomHint').textContent = NET.host
    ? 'このコードを教えて集まってもらおう（最大6人）'
    : 'ホストがレースを始めるのを待っています';
  document.getElementById('btnRaceStart').style.display = NET.host ? '' : 'none';
  scRoom.classList.remove('hidden');
  hudEl.style.opacity = '0';
  lobbyRefresh();
}

function lobbyRefresh() {
  const box = document.getElementById('playerList');
  if (!box) return;
  box.innerHTML = '';
  for (const q of activePlayers()) {
    const row = document.createElement('div');
    row.className = 'pl';
    row.innerHTML =
      '<span class="dot" style="background:' + PCOLORS_CSS[q.slot] + '"></span>' +
      '<img class="face" src="' + SKIN_THUMBS[skinIndex(q.skin)] + '" alt="">' +
      '<span class="nm">' + escapeHtml(q.name) + '</span>' +
      (q.out ? '<span class="outp">OUT</span>' : '<span class="lv">' + '\u2665'.repeat(Math.max(0, q.lives)) + '</span>') +
      (q.slot === 0 ? '<span class="tagh">HOST</span>' : '') +
      (q.slot === NET.slot ? '<span class="tagme">&nbsp;YOU</span>' : '');
    box.appendChild(row);
  }
  renderSkinPickers();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- レース開始 ----------
function hostStartRace() {
  if (!NET.host) return;
  const seed = (Math.random() * 0x7fffffff) | 0;
  const si = 2 + (RACE.no % 3);          // 5 / 6 / 7 階建てを順に
  hostBroadcast({ t: 'start', seed: seed, si: si, no: RACE.no });
  raceBuild(seed, si, RACE.no);
}

function raceBuild(seed, si, no) {
  RACE.on = true; RACE.no = no; RACE.si = si; RACE.seed = seed;
  RACE.phase = 'count'; RACE.count = 3.2; RACE.t = 0;
  RACE.order = []; RACE.sendT = 0; RACE.ezT = 0; RACE.reqT = {};

  for (const q of NET.players) {
    if (!q) continue;
    q.fin = false; q.time = 0; q.pts = 0; q.cool = 0; q.st = 4;
  }

  const me = NET.players[NET.slot];
  SPEC.on = !!(me && me.out);
  SPEC.target = -1;
  abilReset();

  document.body.classList.add('race');
  buildStage(si, seed);
  buildAvatars();

  // 全員の座標をスタート地点で初期化しておく（位置が届くまで原点扱いになる罠の対策）
  const d = G.d;
  for (const q of NET.players) {
    if (!q || q.out) continue;
    const o = spawnOffset(q.slot);
    q.x = q.tx = d.start.x + o.x;
    q.y = q.ty = d.start.y;
    q.z = q.tz = d.start.z + o.z;
    q.yaw = q.tyaw = d.start.yaw;
    q.f = 0; q.init = true;
    if (q.obj) { q.obj.position.set(q.x, q.y, q.z); q.obj.rotation.y = q.yaw; }
  }

  hideAll(); showGame();
  goalMsgEl.classList.remove('on');
  stunMsgEl.classList.remove('on');
  countEl.classList.add('on');
  countEl.firstChild.textContent = '3';
  specBanner();
  if (!SPEC.on) requestLock();
}

// ---------- 観戦 ----------
// 退出したプレイヤーは、走っている誰かの一人称視点で見学する
function specCandidates() {
  return NET.players.filter(q => !!q && !q.out && q.init);
}
function specPick(dir) {
  const list = specCandidates();
  if (!list.length) { SPEC.target = -1; specBanner(); return; }
  let idx = list.findIndex(q => q.slot === SPEC.target);
  if (idx < 0) idx = 0;
  else idx = (idx + dir + list.length) % list.length;
  SPEC.target = list[idx].slot;
  specBanner();
}
function specTarget() {
  if (SPEC.target < 0) return null;
  const q = NET.players[SPEC.target];
  return (q && !q.out) ? q : null;
}
function specUpdate() {
  if (!specTarget()) specPick(0);
}
// 観戦カメラ＝対象プレイヤーの目の位置と向き
function specCamera() {
  const q = specTarget();
  if (!q) return false;
  if (VIEW.third) thirdCamera(q.x, q.y, q.z, q.yaw, q.pitch || 0, 1 / 60);
  else {
    camera.position.set(q.x, q.y + EYE, q.z);
    camera.rotation.set(q.pitch || 0, q.yaw, 0);
  }
  headLight.position.set(q.x, q.y + EYE, q.z);
  powerLight.position.copy(camera.position);
  powerLight.intensity = 0;
  return true;
}
function specBanner() {
  const el = document.getElementById('specMsg');
  if (!el) return;
  if (!SPEC.on || !RACE.on) { el.classList.remove('on'); return; }
  const q = specTarget();
  el.classList.add('on');
  el.innerHTML = q
    ? 'SPECTATING<small><span style="color:' + PCOLORS_CSS[q.slot] + '">' +
      escapeHtml(q.name) + '</span> の視点　／　A・D キーまたはクリックで切替</small>'
    : 'SPECTATING<small>まだ誰も走っていません</small>';
}

// ---------- 毎フレーム ----------
function raceTick(dt) {
  if (RACE.phase === 'count') {
    RACE.count -= dt;
    const n = Math.ceil(RACE.count);
    countEl.firstChild.textContent = n > 0 ? String(n) : 'GO!';
    if (RACE.count <= -0.7) { countEl.classList.remove('on'); RACE.phase = 'run'; }
  } else if (RACE.phase === 'run') {
    RACE.t += dt;
    if (!SPEC.on) updatePlayer(dt);
  }
  if (SPEC.on) specUpdate();
  abilTick(dt);

  updateRemotes(dt);
  if (!SPEC.on) {
    resolvePlayerCollision();
    syncLocalToList();
  }

  if (RACE.phase === 'run' && !SPEC.on && !G.player.fin) {
    checkPowerUps();
    checkGoal();
  }
  if (RACE.phase === 'run') {
    if (NET.host) hostRaceUpdate(dt);
    if (!SPEC.on) netSendPos(dt);
  }

  stunMsgEl.classList.toggle('on', G.player.stun > 0);
}

function syncLocalToList() {
  const q = NET.players[NET.slot];
  if (!q) return;
  const p = G.player;
  q.x = p.x; q.y = p.y; q.z = p.z; q.yaw = p.yaw; q.pitch = p.pitch; q.f = p.f; q.init = true;
  q.st = (p.dash > 0 ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.onGround ? 4 : 0);
}

function updateRemotes(dt) {
  const k = Math.min(1, dt * 16);
  for (const q of NET.players) {
    if (!q || !q.obj || (q.slot === NET.slot && !SPEC.on)) continue;
    // 落下して旗から復帰したときは、空中を飛んで戻らず一瞬で移す
    if (Math.abs(q.tx - q.x) + Math.abs(q.ty - q.y) + Math.abs(q.tz - q.z) > 14) { q.x = q.tx; q.y = q.ty; q.z = q.tz; }
    q.x += (q.tx - q.x) * k;
    q.y += (q.ty - q.y) * k;
    q.z += (q.tz - q.z) * k;
    let dy = q.tyaw - q.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    q.yaw += dy * k;
    q.obj.position.set(q.x, q.y, q.z);
    const stunned = (q.st & 2) !== 0;
    const chr = q.obj.userData.chr;
    if (chr) {
      q.obj.rotation.y = 0;                        // 向きはキャラ側で決める（親の回転と二重にしない）
      const hr = (q.f > 0 && G.d && G.d.ropes) ? G.d.ropes[q.f - 1] : null;
      const htilt = hr ? Math.atan2((q.x - hr.ax) * hr.dx + (q.z - hr.az) * hr.dz, hr.ay - (q.y + ROPE_GRIP)) : 0;
      charDrive(chr, dt, q.x, q.y, q.z, q.yaw, (q.st & 4) !== 0, stunned, hr ? Math.atan2(-hr.dx, -hr.dz) : undefined, htilt);
    } else q.obj.rotation.y = q.yaw;
    if (q.userDataBlink === undefined) q.userDataBlink = 0;
    q.userDataBlink += dt;
    // 一人称で観戦している相手の体は、カメラがその中に入るので描かない
    const inside = SPEC.on && !VIEW.third && q.slot === SPEC.target;
    q.obj.visible = !inside && (!stunned || (Math.floor(q.userDataBlink * 8) % 2 === 0));
  }
}

function netSendPos(dt) {
  RACE.sendT += dt;
  if (RACE.sendT < 1 / NET_HZ) return;
  RACE.sendT = 0;
  if (NET.host) {
    const a = [];
    for (const q of NET.players) {
      if (!q) continue;
      a.push([q.slot, r2(q.x), r2(q.y), r2(q.z), r2(q.yaw), q.f, q.st | 0, r2(q.pitch || 0)]);
    }
    hostBroadcast({ t: 'snap', a: a });
  } else {
    const p = G.player;
    send(NET.hostConn, {
      t: 'pos', x: r2(p.x), y: r2(p.y), z: r2(p.z), w: r2(p.yaw), pt: r2(p.pitch), f: p.f,
      s: (p.dash > 0 ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.onGround ? 4 : 0)
    });
  }
}

// ---------- ホストの裁定 ----------
function hostRaceUpdate(dt) {
  // 制限時間
  if (RACE.t >= RACE_LIMIT) {
    for (const q of racers()) if (!q.fin) hostFinish(q.slot, RACE_LIMIT);
  }
}

// 波動の裁定（敵はホストが動かし、当たったプレイヤーには吹き飛びを送る）
function hostWave(slot, x, y, z, yaw) {
  if (slot !== NET.slot) spawnWaveFx(x, y, z, slot, yaw);
  waveHitEnemies(x, y, z, yaw);
  for (const q of NET.players) {
    if (!q || q.slot === slot || !q.init || q.fin || q.out) continue;
    const k = inWaveRange(x, y, z, yaw, q.x, q.y, q.z);
    if (!k) continue;
    const d = waveDir(x, z, q.x, q.z);
    if (q.slot === NET.slot) applyBlast(d.x, d.z, k);
    else send(NET.conns[q.slot], { t: 'blast', dx: r2(d.x), dz: r2(d.z), k: r2(k) });
  }
  hostBroadcast({ t: 'wfx', s: slot, x: r2(x), y: r2(y), z: r2(z), w: r2(yaw) }, slot);
}

function applyStun() {
  G.player.stun = RACE_STUN;
  G.player.dash = 0;
  flash('rgba(255,20,60,.35)');
  playKill();
}

function hostFinish(slot, time) {
  if (RACE.order.some(o => o.slot === slot)) return;
  RACE.order.push({ slot: slot, time: time });
  RACE.order.sort((a, b) => a.time - b.time);
  const q = NET.players[slot];
  if (q) { q.fin = true; q.time = time; }
  hostBroadcast({ t: 'ord', a: RACE.order.map(o => [o.slot, r2(o.time)]) });
  checkRaceEnd();
}

function checkRaceEnd() {
  if (!NET.host || RACE.phase !== 'run') return;
  const list = racers();
  if (list.length === 0) return;
  if (list.some(q => !q.fin)) return;
  hostEndRace();
}

// 最下位のタイムが1位のポイントに、ブービーが2位に……という配点
function computePoints(order) {
  const n = order.length;
  return order.map((o, k) => ({ slot: o.slot, time: o.time, pts: r1(order[n - 1 - k].time) }));
}

function hostEndRace() {
  const res = computePoints(RACE.order);
  for (const r of res) {
    const q = NET.players[r.slot];
    if (q) { q.pts = r.pts; q.total = r1((q.total || 0) + r.pts); }
  }

  // ライフの増減。ビリは -1、トップは +1（ただし3人以上いるときだけ）
  const n = res.length;
  if (n >= 2) {
    const last = NET.players[res[n - 1].slot];
    if (last) last.lives -= 1;
    if (n >= 3) {
      const first = NET.players[res[0].slot];
      if (first) first.lives += 1;
    }
  }
  for (const q of activePlayers()) if (q.lives <= 0) { q.lives = 0; q.out = true; }

  const a = res.map(r => {
    const q = NET.players[r.slot];
    return [r.slot, r2(r.time), r.pts, q ? q.total : r.pts,
            q ? q.lives : 0, (q && q.out) ? 1 : 0];
  });
  RACE.no++;
  hostBroadcast({ t: 'end', a: a, no: RACE.no });
  applyEnd(a);
}

// 全員のライフを戻して新シリーズを開始
function hostResetSeries() {
  if (!NET.host) return;
  for (const q of activePlayers()) { q.lives = START_LIVES; q.out = false; }
  hostBroadcast({ t: 'lobby', list: playerList() });
  hostStartRace();
}

function applyEnd(a) {
  for (const row of a) {
    const q = NET.players[row[0]];
    if (q && row.length > 4) { q.lives = row[4]; q.out = !!row[5]; }
  }
  RACE.phase = 'done';
  RACE.on = false;
  SPEC.on = false;
  abilReset();
  G.active = false;
  document.body.classList.remove('race');
  countEl.classList.remove('on');
  stunMsgEl.classList.remove('on');
  goalMsgEl.classList.remove('on');
  exitLock();
  clearAvatars();
  showResult(a);
}

// ---------- ゴール ----------
function raceLocalGoal() {
  const p = G.player;
  if (p.fin) return;
  p.fin = true;
  playGoal();
  if (NET.host) hostFinish(NET.slot, RACE.t);
  else send(NET.hostConn, { t: 'fin', time: RACE.t });
  showGoalBanner();
}

function showGoalBanner() {
  const me = RACE.order.findIndex(o => o.slot === NET.slot);
  goalMsgEl.classList.add('on');
  goalMsgEl.querySelector('small').textContent =
    (me >= 0 ? (me + 1) + '位 / ' : '') + RACE.t.toFixed(2) + '秒　― 他のプレイヤーを待っています';
}

// ---------- アイテム（ダッシュ） ----------
function raceWantItem(i) {
  if (i < -1) return;                              // -1 は「助けのジェム」（自分だけに出る）
  const now = RACE.t;
  if (RACE.reqT[i] !== undefined && now - RACE.reqT[i] < 0.5) return;
  RACE.reqT[i] = now;
  if (NET.host) hostGrantItem(i, NET.slot);
  else send(NET.hostConn, { t: 'want', i: i });
}

function hostGrantItem(i, slot) {
  if (i !== -1) {
    const pu = G.powerUps[i];
    if (!pu || pu.got) return;
    pu.got = true;
  }
  const kind = pickAbility(slot);
  hostBroadcast({ t: 'got', i: i, slot: slot, k: kind });
  applyItem(i, slot, kind);
}

// ルーレットの中身を決める。0=雷 1=トランポリン封鎖 2=暗闇 3=スーパー（自分） 4=スーパー（自分以外）
// 下位ほど 3、上位ほど 4 が出やすい。3と4を合わせた確率は人数で決まる（2人40%〜6人60%）
function abilityOdds(slot) {
  const list = racers().slice();
  const n = list.length;
  list.sort((x, y) => {
    if (x.fin !== y.fin) return x.fin ? -1 : 1;
    return prog(y) - prog(x);
  });
  const r = Math.max(0, list.findIndex(q => q.slot === slot));
  const pmax = Math.min(0.6, Math.max(0.4, 0.4 + (n - 2) * 0.05));
  const t = n > 1 ? r / (n - 1) : 0;               // 0=1位 〜 1=最下位
  const pSelf = pmax * t, pOthers = pmax * (1 - t), rest = (1 - pmax) / 3;
  return [rest, rest, rest, pSelf, pOthers];
}
function pickAbility(slot) {
  const odds = abilityOdds(slot);
  let u = Math.random();
  for (let k = 0; k < odds.length; k++) { if (u < odds[k]) return k; u -= odds[k]; }
  return 0;
}

// ジェムを取ると、スピードアップは即座に、能力はルーレットが止まってから発動する
function applyItem(i, slot, kind) {
  const pu = i >= 0 ? G.powerUps[i] : null;
  if (pu) gemTaken(pu);
  if (i === -1 && slot === NET.slot) removeHelpGem();
  if (slot === NET.slot && !SPEC.on) { G.player.dash = DASH_DUR; playPower(); }
  // 前のルーレットが回っている途中なら、その能力をすぐ発動してから次を回す（取りこぼさない）
  if (ABIL.spin > 0) { ABIL.spin = 0; abilFire(ABIL.spinKind, ABIL.winner); }
  ABIL.spin = ROULETTE_SPIN;
  ABIL.winner = slot;
  ABIL.spinKind = kind;
  rouletteShow();
}

// ルーレットが止まった瞬間に能力を発動する
function abilFire(kind, winner) {
  const mine = (winner === NET.slot);
  rouletteResult(kind, winner);
  if (SPEC.on) return;                             // 観戦者には効かない
  if (kind === 3) {                                // 取った本人のトランポリンがスーパーに
    if (mine) superPadOn();
    return;
  }
  if (mine) return;                                // ほかの能力は、取った本人には効かない
  if (kind === 4) {
    superPadOn();
  } else if (kind === 0) {
    ABIL.zap = ABIL_ZAP;
    G.player.stun = Math.max(G.player.stun, ABIL_ZAP);
    G.player.dash = 0;
    flash('rgba(255,238,68,.45)');
    playZap();
  } else if (kind === 1) {
    ABIL.nopad = ABIL_NOPAD;
    flash('rgba(255,136,17,.28)');
    playDeny();
  } else {
    ABIL.dark = ABIL_DARK;
    applyDarkness();
    flash('rgba(20,0,40,.5)');
    playDark();
  }
}

// 効果時間の経過
function superPadOn() {
  ABIL.superPad = ABIL_SUPER;
  flash('rgba(255,200,0,.35)');
  playMega();
}
function abilTick(dt) {
  if (ABIL.superPad > 0) ABIL.superPad = Math.max(0, ABIL.superPad - dt);
  if (ABIL.spin > 0) {
    ABIL.spin -= dt;
    rouletteSpinFrame();
    if (ABIL.spin <= 0) { ABIL.spin = 0; abilFire(ABIL.spinKind, ABIL.winner); }
  }
  if (ABIL.zap > 0) ABIL.zap = Math.max(0, ABIL.zap - dt);
  if (ABIL.nopad > 0) ABIL.nopad = Math.max(0, ABIL.nopad - dt);
  if (ABIL.dark > 0) {
    ABIL.dark = Math.max(0, ABIL.dark - dt);
    if (ABIL.dark === 0) applyDarkness();
  }
  abilHud();
}

// ---------- 暗闇 ----------
// 完全な闇にはせず、手元の灯りで少し先だけ見える濃さにする
let darkOn = false;
function applyDarkness() {
  const want = (ABIL.dark > 0);
  if (want === darkOn) return;
  darkOn = want;
  if (want) {
    scene.fog.density = DARK_FOG;
    scene.fog.color.setHex(0x000004);
    scene.background.setHex(0x000004);
    skyDome.visible = false;
    AMB.intensity = DARK_AMBIENT * 0.5;
    HEMI.intensity = 0.06;
    SUN.intensity = 0;
    headLight.intensity = 2.2;
    headLight.distance = 16;
    MAT.ceil.emissiveIntensity = 0.15;
  } else {
    scene.fog.density = BASE_FOG;
    scene.fog.color.setHex(SKY_COL);
    scene.background.setHex(SKY_COL);
    skyDome.visible = true;
    AMB.intensity = BASE_AMB;
    HEMI.intensity = BASE_HEMI;
    SUN.intensity = BASE_SUN;
    headLight.intensity = BASE_HEAD;
    headLight.distance = BASE_HEAD_DIST;
    MAT.ceil.emissiveIntensity = 1.0;
  }
}

// ---------- ルーレット演出 ----------
const rouEl = document.getElementById('roulette');
const rouIcon = document.getElementById('rouIcon');
const rouName = document.getElementById('rouName');
const rouWho = document.getElementById('rouWho');
let rouFrame = 0, rouTimer = 0, rouSafe = 0;
function rouletteHide() {
  clearTimeout(rouTimer); clearTimeout(rouSafe);
  if (rouEl) rouEl.classList.remove('on', 'done');
}
function rouletteShow() {
  if (!rouEl) return;
  rouFrame = 0;
  clearTimeout(rouTimer); clearTimeout(rouSafe);
  // 念のため：ゲームの更新が止まっていても、一定時間で必ず消す
  rouSafe = setTimeout(rouletteHide, ROULETTE_SPIN * 1000 + 4000);
  rouEl.classList.add('on');
  rouEl.classList.remove('done');
  const w = NET.players[ABIL.winner];
  rouWho.innerHTML = w
    ? '<span style="color:' + PCOLORS_CSS[w.slot] + '">' + escapeHtml(w.name) + '</span> がジェムを取得'
    : 'ジェム取得';
}
function rouletteSpinFrame() {
  if (!rouEl) return;
  rouFrame++;
  const k = Math.floor(rouFrame / 4) % ABIL_LABELS.length;   // 高速で切り替わる演出
  rouIcon.textContent = ABIL_LABELS[k].charAt(0);
  rouName.textContent = ABIL_LABELS[k];
  rouName.style.color = ABIL_COLORS[k];
  if (rouFrame % 4 === 0) playTick();
}
function rouletteResult(kind, winner) {
  if (!rouEl) return;
  const mine = (winner === NET.slot);
  rouIcon.textContent = ABIL_LABELS[kind].charAt(0);
  rouName.textContent = ABIL_LABELS[kind];
  rouName.style.color = ABIL_COLORS[kind];
  rouEl.classList.add('done');
  const w = NET.players[winner];
  const who = w ? '<span style="color:' + PCOLORS_CSS[w.slot] + '">' + escapeHtml(w.name) + '</span>' : '?';
  if (kind === 3) rouWho.innerHTML = mine ? who + ' のトランポリンが <b>' + ABIL_SUPER + '秒間スーパー</b> に！' : who + ' のトランポリンが <b>スーパー</b> に';
  else if (kind === 4) rouWho.innerHTML = mine ? who + ' → 他の全員のトランポリンが <b>スーパー</b> に' : who + ' のせいで、トランポリンが <b>' + ABIL_SUPER + '秒間スーパー</b> に';
  else rouWho.innerHTML = mine
    ? who + ' → 他の全員に <b>' + ABIL_NAMES[kind] + '</b>'
    : who + ' の <b>' + ABIL_NAMES[kind] + '</b> を受けた';
  clearTimeout(rouTimer);
  rouTimer = setTimeout(rouletteHide, 1500);
}

// ---------- 効果のHUD ----------
const abilEl = document.getElementById('abilBar');
function abilHud() {
  if (!abilEl) return;
  const out = [];
  if (ABIL.zap > 0)   out.push('<span style="color:' + ABIL_COLORS[0] + '">' + ABIL_LABELS[0] + ' ' + ABIL.zap.toFixed(1) + '</span>');
  if (ABIL.nopad > 0) out.push('<span style="color:' + ABIL_COLORS[1] + '">' + ABIL_LABELS[1] + ' ' + ABIL.nopad.toFixed(1) + '</span>');
  if (ABIL.dark > 0)  out.push('<span style="color:' + ABIL_COLORS[2] + '">' + ABIL_LABELS[2] + ' ' + ABIL.dark.toFixed(1) + '</span>');
  if (ABIL.superPad > 0) out.push('<span style="color:' + ABIL_COLORS[3] + '">SUPER JUMP ' + ABIL.superPad.toFixed(1) + '</span>');
  abilEl.innerHTML = out.join('　');
  abilEl.classList.toggle('on', out.length > 0);
}

// ---------- 受信 ----------
function hostHandle(slot, m) {
  if (slot == null || !m) return;
  const q = NET.players[slot];
  if (!q) return;
  if (m.t === 'skin') {
    if (RACE.phase === 'count' || RACE.phase === 'run') return;   // レース中は変えられない
    const k = skinIndex(m.k);
    if (!skinOwner(k, slot)) q.skin = k;                          // ほかの人が使っていたら変えない（一覧を送り直して元に戻させる）
    hostBroadcast({ t: 'lobby', list: playerList() });
    lobbyRefresh();
    return;
  }
  if (m.t === 'pos') {
    q.tx = m.x; q.ty = m.y; q.tz = m.z; q.tyaw = m.w; q.pitch = m.pt || 0; q.f = m.f; q.st = m.s | 0;
    q.init = true;
    // ホストは裁定に実測値を使うので、補間せず即反映
    q.x = m.x; q.y = m.y; q.z = m.z;
  } else if (m.t === 'want') {
    hostGrantItem(m.i, slot);
  } else if (m.t === 'wave') {
    hostWave(slot, m.x, m.y, m.z, m.w);
  } else if (m.t === 'fin') {
    hostFinish(slot, Math.max(0, Math.min(RACE_LIMIT, +m.time || 0)));
  }
}

function guestHandle(m) {
  if (!m) return;
  switch (m.t) {
    case 'welcome':
      NET.on = true; NET.slot = m.slot;
      applyPlayerList(m.list);
      netErr('');
      showRoom();
      break;
    case 'lobby':
      applyPlayerList(m.list);
      break;
    case 'full': netErr('このルームは満員です（最大6人）'); break;
    case 'busy': netErr('レース中のため参加できません。終わるまで待ってください'); break;
    case 'start':
      raceBuild(m.seed, m.si, m.no);
      break;
    case 'snap':
      for (const row of m.a) {
        const q = NET.players[row[0]];
        if (!q || q.slot === NET.slot) continue;
        q.tx = row[1]; q.ty = row[2]; q.tz = row[3]; q.tyaw = row[4];
        q.f = row[5]; q.st = row[6] | 0; q.pitch = row[7] || 0; q.init = true;
      }
      break;
    case 'ez':
      for (let i = 0; i < m.a.length && i < G.enemies.length; i++) {
        const e = G.enemies[i], r = m.a[i];
        if (e.tx === undefined) { e.x = r[0]; e.y = r[1]; e.z = r[2]; }
        e.tx = r[0]; e.ty = r[1]; e.tz = r[2]; e.ang = r[3];
      }
      break;
    case 'stun':  applyStun(); break;
    case 'wfx':   spawnWaveFx(m.x, m.y, m.z, m.s, m.w); break;
    case 'blast': applyBlast(m.dx, m.dz, m.k); break;
    case 'got':  applyItem(m.i, m.slot, m.k | 0); break;
    case 'ord':
      RACE.order = m.a.map(r => ({ slot: r[0], time: r[1] }));
      for (const q of NET.players) if (q) q.fin = RACE.order.some(o => o.slot === q.slot);
      for (const o of RACE.order) if (NET.players[o.slot]) NET.players[o.slot].time = o.time;
      if (G.player && G.player.fin) showGoalBanner();
      break;
    case 'end':
      RACE.no = m.no;
      for (const row of m.a) {
        const q = NET.players[row[0]];
        if (q) { q.time = row[1]; q.pts = row[2]; q.total = row[3]; }
      }
      applyEnd(m.a);
      break;
  }
}

// ---------- 結果画面 ----------
function showResult(a) {
  hideAll();
  hudEl.style.opacity = '0';
  document.getElementById('resTitle').textContent = 'RACE ' + RACE.no + '  RESULT';

  const tbl = document.getElementById('resTable');
  tbl.innerHTML = '';
  a.forEach((row, k) => {
    const q = NET.players[row[0]];
    const nm = q ? q.name : PNAMES[row[0]];
    const el = document.createElement('div');
    el.className = 'rw' + (row[0] === NET.slot ? ' me' : '');
    el.innerHTML =
      '<span class="rk' + (k === 0 ? ' g1' : '') + '">' + (k + 1) + '位</span>' +
      '<span class="dot" style="background:' + PCOLORS_CSS[row[0]] + '"></span>' +
      '<span class="nm">' + escapeHtml(nm) + '</span>' +
      '<span class="tm">' + Number(row[1]).toFixed(2) + '</span>' +
      '<span class="pt">+' + Number(row[2]).toFixed(1) + '</span>' +
      '<span class="lv">' + (row[5] ? 'OUT' : '\u2665'.repeat(Math.max(0, row[4] || 0))) + '</span>';
    tbl.appendChild(el);
  });

  const tot = document.getElementById('totalTable');
  tot.innerHTML = '';
  const sorted = a.slice().sort((x, y) => y[3] - x[3]);
  sorted.forEach((row, k) => {
    const q = NET.players[row[0]];
    const nm = q ? q.name : PNAMES[row[0]];
    const el = document.createElement('div');
    el.className = 'rw' + (row[0] === NET.slot ? ' me' : '');
    el.innerHTML =
      '<span class="rk' + (k === 0 ? ' g1' : '') + '">' + (k + 1) + '</span>' +
      '<span class="dot" style="background:' + PCOLORS_CSS[row[0]] + '"></span>' +
      '<span class="nm">' + escapeHtml(nm) + '</span>' +
      '<span class="tm"></span>' +
      '<span class="pt">' + Number(row[3]).toFixed(1) + '</span>';
    tot.appendChild(el);
  });

  // ライフの増減とチャンピオン表示
  const left = racers();
  const champEl = document.getElementById('champ');
  const over = left.length <= 1;
  if (over) {
    champEl.textContent = left.length === 1
      ? '\uD83C\uDFC6 CHAMPION : ' + left[0].name
      : '全員が退出しました';
  } else {
    champEl.textContent = '';
  }

  const btn = document.getElementById('btnNextRace');
  btn.style.display = NET.host ? '' : 'none';
  btn.textContent = over ? '新シリーズを開始' : '次のレース';
  btn.dataset.reset = over ? '1' : '';
  scResult.classList.remove('hidden');
}

// ---------- レース用HUD ----------
function prog(q) { return courseProgress(q.x, q.y, q.z); }
function liveRank() {
  const list = activePlayers().slice();
  list.sort((x, y) => {
    if (x.fin !== y.fin) return x.fin ? -1 : 1;
    if (x.fin && y.fin) return x.time - y.time;
    return prog(y) - prog(x);
  });
  return list.findIndex(q => q.slot === NET.slot) + 1;
}

function raceHud() {
  const n = racers().length;
  const me = NET.players[NET.slot];
  if (SPEC.on) {
    hStage.textContent = 'RACE ' + (RACE.no + 1);
    hScore.textContent = '観戦中';
    hLives.textContent = '';
    hBonus.textContent = ''; hPower.textContent = ''; hFloor.textContent = '';
    rbRank.textContent = '-';
    rbTime.textContent = RACE.t.toFixed(1);
    rbLeft.textContent = '残り ' + (n - RACE.order.length) + '人';
    dashBarEl.style.opacity = '0';
    return;
  }
  hStage.textContent = 'RACE ' + (RACE.no + 1);
  hScore.textContent = r1(me ? me.total : 0) + ' pt';
  hLives.textContent = me ? '\u2665'.repeat(Math.max(0, me.lives)) : '';
  hBonus.textContent = '';
  hPower.textContent = G.player.dash > 0 ? 'DASH ' + G.player.dash.toFixed(1) : '';

  rbRank.textContent = liveRank() + ' / ' + n + '位';
  rbTime.textContent = RACE.t.toFixed(1);
  rbLeft.textContent = '残り ' + (n - RACE.order.length) + '人';

  const d = G.player.dash;
  dashBarEl.style.opacity = d > 0 ? '1' : '0';
  dashFillEl.style.width = Math.max(0, Math.min(1, d / DASH_DUR)) * 100 + '%';
}

// ---------- ボタン配線 ----------
document.getElementById('btnCreate').onclick = () => { ac(); createRoom(); };
document.getElementById('btnJoinOpen').onclick = () => {
  netErr(''); hideAll(); scJoin.classList.remove('hidden'); hudEl.style.opacity = '0';
};
document.getElementById('btnJoinBack').onclick = () => { netErr(''); leaveRoom(); };
document.getElementById('btnJoinGo').onclick = () => { ac(); joinRoom(); };
document.getElementById('btnLeaveRoom').onclick = leaveRoom;
document.getElementById('btnResultLeave').onclick = leaveRoom;
document.getElementById('btnRaceStart').onclick = () => {
  if (!NET.host) return;
  netErr('');
  hostStartRace();
};
document.getElementById('btnNextRace').onclick = () => {
  if (!NET.host) return;
  const btn = document.getElementById('btnNextRace');
  if (btn.dataset.reset === '1') hostResetSeries(); else hostStartRace();
};

(function initName() {
  const el = document.getElementById('myName');
  if (!el) return;
  try { el.value = localStorage.getItem('tc3d_name') || ''; } catch (e) {}
})();

// ===================== 3Dキャラクター =====================
// 体: Mixamo のキャラクター6体（スキンのみ使用）
// 動き: Quaternius "Universal Animation Library" (CC0) の7本を、各キャラの骨へ移し替えたもの（assets/characters/）
const SKIN_NAMES = ['キャップ', 'ミント', 'ネズミ', 'マフラー', 'グランマ', 'ハット'];
const SKIN_FILES = ['assets/characters/cap.glb', 'assets/characters/mint.glb', 'assets/characters/mouse.glb', 'assets/characters/muffler.glb', 'assets/characters/granny.glb', 'assets/characters/hat.glb'];
const SKIN_THUMBS = ['assets/characters/cap.jpg', 'assets/characters/mint.jpg', 'assets/characters/mouse.jpg', 'assets/characters/muffler.jpg', 'assets/characters/granny.jpg', 'assets/characters/hat.jpg'];
const SKINS = [];                 // 読み込んだキャラ { scene, clips, srcH, ready }
const CHAR = { ready: false, failed: false };   // 1体目が読めたら ready
const CHAR_H = 1.75;              // ゲーム内での身長（目線 EYE=1.62 に合わせる）
const RUN_REF = 7.2;              // Sprint_Loop が自然に見える速度（＝通常の移動速度）
const JOG_REF = 4.2;              // Jog_Fwd_Loop が自然に見える速度
const CAST_T = 0.45;              // 波動のポーズを見せる時間
const TINT = 0.08;                // テクスチャにプレイヤーカラーを混ぜる割合（キャラの色を活かすため弱め）
// 下半身の骨（Mixamo と Quaternius の両方の名前に対応）
const LOWER_BONE = /(^|[^A-Za-z])(root|pelvis|thigh|calf|foot|ball)|Hips|UpLeg|Leg|Foot|Toe/;

function skinIndex(k) {
  k = k | 0;
  return (k >= 0 && k < SKIN_NAMES.length) ? k : 0;
}
// 自分が選んでいるキャラ
const MY_SKIN = { v: 0 };
try { MY_SKIN.v = skinIndex(+localStorage.getItem('tc3d_skin')); } catch (e) {}

// 視点（一人称 / 三人称）
const VIEW = { third: false, dist: 4.4, cur: 4.4 };
try { VIEW.third = localStorage.getItem('tc3d_view') === '3'; } catch (e) {}

let selfChr = null;               // 三人称視点で見える自分のキャラ

// 骨で変形したあとの実際の身長を測る（素材ごとに単位や骨の縮尺が違うため）。
// 軽量化で座標と骨の重みが整数に圧縮されているが、このバージョンの three.js の
// boneTransform は圧縮を戻さずに読むので、同じ計算を自前で行う
function attrScale(a) {
  if (!a.normalized) return 1;
  const arr = a.array;
  return (arr instanceof Int16Array) ? 1 / 32767 : (arr instanceof Uint16Array) ? 1 / 65535
    : (arr instanceof Int8Array) ? 1 / 127 : (arr instanceof Uint8Array) ? 1 / 255 : 1;
}
function measureSkinnedHeight(root) {
  // skeleton.pose() は使わない（圧縮の係数が骨の行列に入っているため、ファイルのままの姿勢で測る）
  root.updateMatrixWorld(true);
  const base = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
  const si = new THREE.Vector4(), sw = new THREE.Vector4();
  let lo = Infinity, hi = -Infinity;
  root.traverse(m => {                            // 体が複数の部品に分かれていても全部を測る
    if (!m.isSkinnedMesh) return;
    const g = m.geometry.attributes;
    const kp = attrScale(g.position), kw = attrScale(g.skinWeight);
    const bones = m.skeleton.bones, inv = m.skeleton.boneInverses;
    const mats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
    for (let i = 0; i < g.position.count; i += 3) {
      base.fromBufferAttribute(g.position, i).multiplyScalar(kp).applyMatrix4(m.bindMatrix);
      si.fromBufferAttribute(g.skinIndex, i);
      sw.fromBufferAttribute(g.skinWeight, i).multiplyScalar(kw);
      acc.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = sw.getComponent(j);
        if (w === 0) continue;
        acc.addScaledVector(t.copy(base).applyMatrix4(mats[si.getComponent(j)]), w);
      }
      if (acc.y < lo) lo = acc.y;
      if (acc.y > hi) hi = acc.y;
    }
  });
  return (hi > lo) ? hi - lo : 1.83;
}

function loadSkin(k, url) {
  const sk = { ready: false, scene: null, clips: {}, srcH: 1.83 };
  SKINS[k] = sk;
  const fail = () => { if (k === 0) CHAR.failed = true; skinProgress(); };
  fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(ab => {
    new THREE.GLTFLoader().parse(ab, '', (gltf) => {
      sk.scene = gltf.scene;
      sk.srcH = measureSkinnedHeight(gltf.scene);
      gltf.scene.traverse(o => {
        if (o.isMesh && o.material && o.material.map) {
          // 画面の出力はガンマ補正なしなので、テクスチャの色をそのまま使う
          o.material.map.encoding = THREE.LinearEncoding;
          o.material.map.needsUpdate = true;
        }
      });
      for (const clip of gltf.animations) sk.clips[clip.name] = clip;
      // 波動は上半身だけ動かす（走りながら撃てるように、脚の動きは走りのまま残す）
      const cast = sk.clips.Spell_Simple_Shoot;
      if (cast) {
        const upper = cast.tracks.filter(t => !LOWER_BONE.test(t.name.split('.')[0]));
        sk.clips.Cast_Upper = new THREE.AnimationClip('Cast_Upper', cast.duration, upper);
      }
      sk.ready = true;
      if (k === 0) CHAR.ready = true;
      skinProgress();
    }, fail);
  }).catch(fail);
}

// タイトル画面に読み込みの進み具合を出す
function skinProgress() {
  const el = document.getElementById('skinLabel');
  if (!el) return;
  const done = SKINS.filter(s => s && s.ready).length;
  el.textContent = done < SKIN_FILES.length ? 'CHARACTER（読み込み中 ' + done + '/' + SKIN_FILES.length + '）' : 'CHARACTER';
}

function initCharacterModel() {
  if (typeof THREE.GLTFLoader === 'undefined') { CHAR.failed = true; return; }
  skinProgress();
  SKIN_FILES.forEach((url, k) => loadSkin(k, url));
}

// テクスチャ付きの体は「白 → プレイヤーカラー」をほんの少し混ぜて色分けする
const _tintW = new THREE.Color(), _tintC = new THREE.Color();
function charColors(c, col) {
  if (!c || c.col === col) return;
  c.col = col;
  for (const m of c.mats) {
    if (m.map) {
      _tintC.setHex(col);
      m.color.copy(_tintW.setRGB(1, 1, 1).lerp(_tintC, TINT));
      m.emissive.copy(_tintW.setRGB(1, 1, 1).lerp(_tintC, TINT * 2));
    } else if (m.userData.joint) {
      m.emissive.setHex(col);
    } else {
      m.color.setHex(col);
      m.emissive.setHex(col);
    }
  }
}

// キャラ1体を生成する。root の原点＝足元、ローカル -Z が正面
function makeCharacter(col, skin) {
  let sk = SKINS[skinIndex(skin)];
  if (!sk || !sk.ready) sk = SKINS[0];            // まだ読めていなければ1体目で代用
  if (!sk || !sk.ready) return null;
  const model = THREE.SkeletonUtils.clone(sk.scene);
  const mats = [];
  const made = new Map();                          // 元の材質ごとに1つ作る（部品が材質を共有している場合）
  model.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;                       // 骨で動くので、静止時の外接球では判定できない
    const src = o.material;
    if (made.has(src)) { o.material = made.get(src); return; }
    let m;
    if (src.map) {
      // 暗いステージでも見えるよう、テクスチャ自体を少し発光させる
      m = new THREE.MeshStandardMaterial({
        map: src.map, emissiveMap: src.map, emissiveIntensity: 0.28,
        roughness: 0.8, metalness: 0, skinning: true
      });
    } else if (/joint/i.test(src.name)) {
      m = new THREE.MeshStandardMaterial({ color: 0x10161f, emissive: col, emissiveIntensity: 0.10, roughness: 0.8, metalness: 0.1, skinning: true });
      m.userData.joint = true;
    } else {
      m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.32, roughness: 0.55, metalness: 0.05, skinning: true });
    }
    made.set(src, m);
    mats.push(m);
    o.material = m;
  });
  model.scale.multiplyScalar(CHAR_H / sk.srcH);
  model.rotation.y = Math.PI;                      // glTFの正面(+Z)をゲームの正面(-Z)へ

  const root = new THREE.Group();
  // ロープにぶら下がったとき、手の位置を中心に体を傾けるための入れ子
  const pivot = new THREE.Group(), holder = new THREE.Group();
  pivot.position.y = ROPE_GRIP; holder.position.y = -ROPE_GRIP;
  root.add(pivot); pivot.add(holder); holder.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const act = {};
  for (const name in sk.clips) {
    const a = mixer.clipAction(sk.clips[name]);
    if (name === 'Jump_Start' || name === 'Jump_Land' || name === 'Cast_Upper') {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    act[name] = a;
  }
  // ロープにぶら下がる腕のポーズ用に、腕の骨を探しておく
  const arms = [];
  for (const side of ['Left', 'Right']) {
    let A = null, F = null, H = null;
    model.traverse(o => {
      if (!o.isBone) return;
      if (new RegExp(side + 'Arm$').test(o.name)) A = o;
      else if (new RegExp(side + 'ForeArm$').test(o.name)) F = o;
      else if (new RegExp(side + 'Hand$').test(o.name)) H = o;
    });
    if (A && F && H) arms.push({ A: A, F: F, H: H, side: side === 'Left' ? 1 : -1 });
  }
  const c = {
    root: root, mixer: mixer, act: act, cur: '', col: -1, skin: SKINS.indexOf(sk), mats: mats,
    arms: arms, hangW: 0, model: model, pivot: pivot,
    px: null, py: 0, pz: 0, vx: 0, vz: 0,
    face: 0, air: false, fell: false, airT: 0, landT: 0, castT: 0
  };
  charColors(c, col);
  charPlay(c, 'Idle_Loop', 0);
  return c;
}

function charDispose(c) {
  if (!c) return;
  c.mixer.stopAllAction();
  c.root.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });   // 骨用テクスチャを解放（形状とスキンは全員で共有なので残す）
  for (const m of c.mats) m.dispose();
}

// ---------- キャラ選択（タイトル画面とロビー） ----------
// 対戦ルームの中で、そのキャラをほかの人が使っているか
function skinOwner(k, exceptSlot) {
  if (typeof NET === 'undefined' || !NET.on) return null;
  return NET.players.find(q => q && q.slot !== exceptSlot && q.skin === k) || null;
}
// 希望のキャラが使われていたら、空いているキャラを返す（6体いるので必ず空きがある）
function freeSkin(pref, exceptSlot) {
  pref = skinIndex(pref);
  if (!skinOwner(pref, exceptSlot)) return pref;
  for (let i = 1; i <= SKIN_NAMES.length; i++) { const k = (pref + i) % SKIN_NAMES.length; if (!skinOwner(k, exceptSlot)) return k; }
  return pref;
}
function skinMsg(t) {
  const el = document.getElementById('skinMsg');
  if (!el) return;
  el.textContent = t;
  clearTimeout(skinMsg.t);
  if (t) skinMsg.t = setTimeout(() => { el.textContent = ''; }, 3500);
}
function setMySkin(k) {
  k = skinIndex(k);
  const own = NET.on ? skinOwner(k, NET.slot) : null;
  if (own) { skinMsg('「' + SKIN_NAMES[k] + '」は ' + own.name + ' さんが選んでいます'); return; }
  MY_SKIN.v = k;
  try { localStorage.setItem('tc3d_skin', String(k)); } catch (e) {}
  if (NET.on) {
    const me = NET.players[NET.slot];
    if (me) me.skin = k;
    if (NET.host) { hostBroadcast({ t: 'lobby', list: playerList() }); }
    else send(NET.hostConn, { t: 'skin', k: k });
    lobbyRefresh();
  }
  renderSkinPickers();
}
function renderSkinPickers() {
  for (const id of ['skinPick', 'skinPick2']) {
    const box = document.getElementById(id);
    if (!box) continue;
    if (!box.children.length) {
      SKIN_NAMES.forEach((nm, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<img src="' + SKIN_THUMBS[k] + '" alt=""><span>' + nm + '</span>';
        b.onclick = () => setMySkin(k);
        box.appendChild(b);
      });
    }
    Array.from(box.children).forEach((b, k) => {
      b.classList.toggle('on', k === MY_SKIN.v);
      const own = (NET.on && id === 'skinPick2') ? skinOwner(k, NET.slot) : null;
      b.classList.toggle('taken', !!own);
      if (own) b.dataset.who = own.name; else delete b.dataset.who;
    });
  }
}

function charPlay(c, name, fade, force) {
  if (c.cur === name && !force) return;
  const a = c.act[name];
  if (!a) return;
  const prev = c.act[c.cur];
  a.reset();
  a.setEffectiveTimeScale(1);
  a.setEffectiveWeight(1);
  a.play();
  if (prev && prev !== a) {
    if (fade > 0) { prev.fadeOut(fade); a.fadeIn(fade); } else prev.stop();
  }
  c.cur = name;
}

// 波動を撃つポーズ（上半身だけ上書きする）
function charCast(c, yaw) {
  if (!c || !c.act.Cast_Upper) return;
  c.castT = CAST_T;
  c.face = yaw;                                    // 撃つ方向へ即座に向き直る
  const a = c.act.Cast_Upper;
  a.reset();
  a.setEffectiveTimeScale(1.15);
  a.setEffectiveWeight(30);                        // 他の動きより圧倒的に重くして上半身を上書き
  a.fadeIn(0.05);
  a.play();
}
function charOfSlot(slot) {
  if (!RACE.on || slot === NET.slot) return VIEW.third ? selfChr : null;
  const q = NET.players[slot];
  return (q && q.obj && q.obj.userData.chr) ? q.obj.userData.chr : null;
}

function angLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// 位置・接地・ダッシュの状態からアニメーションを選んで進める
function charDrive(c, dt, x, y, z, yaw, onGround, stunned, hangYaw, hangTilt) {
  // 速度は位置の変化から求める（自分も他プレイヤーも同じ扱いにできる）
  if (c.px === null) { c.px = x; c.py = y; c.pz = z; c.face = yaw; }
  const dx = x - c.px, dy = y - c.py, dz = z - c.pz;
  c.px = x; c.py = y; c.pz = z;
  let rawVy = 0;
  if (dt > 0.0001 && dx * dx + dz * dz < 9) {
    const k = Math.min(1, dt * 12);
    c.vx += (dx / dt - c.vx) * k;
    c.vz += (dz / dt - c.vz) * k;
    rawVy = dy / dt;
  } else { c.vx = 0; c.vz = 0; }                   // ワープ（再スタートなど）は速度に数えない
  const spd = Math.hypot(c.vx, c.vz);

  // 体の向き：走っているときは進行方向、止まっているときと撃つときは視線の向き
  let want = yaw;
  if (c.castT <= 0 && !stunned && spd > 1.2) want = Math.atan2(-c.vx, -c.vz);
  if (hangYaw !== undefined) want = hangYaw;       // ぶら下がり中は、ロープの振れる向きを向く
  c.face = angLerp(c.face, want, Math.min(1, dt * 12));
  c.root.rotation.y = c.face;

  const hanging = hangYaw !== undefined;
  c.hangW += ((hanging ? 1 : 0) - c.hangW) * Math.min(1, dt * 10);
  c.tilt = (c.tilt || 0) + (((hanging ? (hangTilt || 0) * 0.85 : 0)) - (c.tilt || 0)) * Math.min(1, dt * 14);
  c.pivot.rotation.x = c.tilt;
  if (hanging) {
    c.air = true; c.fell = false; c.airT = 0;
    charPlay(c, 'Jump_Loop', 0.15);
  } else if (!onGround) {
    if (!c.air) {
      c.air = true; c.airT = 0; c.fell = false;
      // 上へ弾かれた＝トランポリン。落ちただけなら空中ポーズへ
      charPlay(c, rawVy > 3 ? 'Jump_Start' : 'Jump_Loop', 0.1, true);
    } else if (rawVy < -3) {
      c.fell = true;                               // 落下中
    } else if (rawVy > 3 && c.fell) {
      // 落下からそのまま跳ね返った。他プレイヤーは位置が補間されて速度の反転が
      // 数フレームに分かれるので、「落ちていた」ことを覚えておいて判定する
      c.fell = false; c.airT = 0;
      charPlay(c, 'Jump_Start', 0.06, true);
    }
    c.airT += dt;
    if (c.cur === 'Jump_Start' && c.airT > 0.5) charPlay(c, 'Jump_Loop', 0.3);
  } else {
    if (c.air) {
      c.air = false;
      c.landT = spd > 2 ? 0.14 : 0.40;             // 走りながらの着地は短く切り上げる
      charPlay(c, 'Jump_Land', 0.06, true);
      c.act.Jump_Land.setEffectiveTimeScale(1.6);
    }
    if (c.landT > 0) c.landT -= dt;
    else if (stunned || spd < 0.6) charPlay(c, 'Idle_Loop', 0.2);
    else {
      const fast = (c.cur === 'Sprint_Loop') ? spd > 4.6 : spd > 5.4;
      if (fast) {
        charPlay(c, 'Sprint_Loop', 0.15);
        c.act.Sprint_Loop.setEffectiveTimeScale(Math.max(0.8, Math.min(1.7, spd / RUN_REF)));
      } else {
        charPlay(c, 'Jog_Fwd_Loop', 0.15);
        c.act.Jog_Fwd_Loop.setEffectiveTimeScale(Math.max(0.7, Math.min(1.35, spd / JOG_REF)));
      }
    }
  }

  if (c.castT > 0) {
    c.castT -= dt;
    if (c.castT <= 0) c.act.Cast_Upper.fadeOut(0.18);
  }
  c.mixer.update(dt);
  if (c.hangW > 0.02) armsUp(c, c.hangW);
}

// 両腕を頭の上へ伸ばして、ロープを握る形にする（アニメーションの上から骨を回す）
const _aw = new THREE.Vector3(), _bw = new THREE.Vector3(), _cw = new THREE.Vector3(), _dw = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qd = new THREE.Quaternion();
function aimBone(bone, child, dir, w) {
  bone.getWorldPosition(_aw); child.getWorldPosition(_bw);
  _cw.subVectors(_bw, _aw).normalize();
  _qd.setFromUnitVectors(_cw, dir);
  bone.getWorldQuaternion(_qa);
  _qb.copy(_qd).multiply(_qa);                     // 向けたあとの世界での回転
  bone.parent.getWorldQuaternion(_qp).invert();
  _qb.premultiply(_qp);                            // 親から見た回転へ
  bone.quaternion.slerp(_qb, w);
  bone.updateMatrixWorld(true);
}
function armsUp(c, w) {
  if (!c.arms.length) return;
  c.root.updateMatrixWorld(true);
  const f = c.face, fx = -Math.sin(f), fz = -Math.cos(f);
  const L = c.arms.find(a => a.side === 1), R = c.arms.find(a => a.side === -1);
  if (!L || !R) return;
  L.A.getWorldPosition(_aw); R.A.getWorldPosition(_bw);
  const sx = _bw.x - _aw.x, sz = _bw.z - _aw.z, sl = Math.hypot(sx, sz) || 1;   // 左肩→右肩
  for (const a of c.arms) {
    const k = a.side === 1 ? 1 : -1;                // 内側へ寄せて、両手が頭の上で合うように
    _dw.set(sx / sl * 0.28 * k + fx * 0.12, 1, sz / sl * 0.28 * k + fz * 0.12).normalize();
    aimBone(a.A, a.F, _dw, w);
    aimBone(a.F, a.H, _dw, w);
  }
}

// ---------- 自分のキャラ（三人称視点のときだけ表示） ----------
function updateSelfChr(dt) {
  // 選んでいるキャラが（後から読み込み完了したものも含めて）変わったら作り直す
  const want = (SKINS[MY_SKIN.v] && SKINS[MY_SKIN.v].ready) ? MY_SKIN.v : 0;
  if (selfChr && selfChr.skin !== want) {
    scene.remove(selfChr.root); charDispose(selfChr); selfChr = null;
  }
  if (!selfChr) {
    if (!CHAR.ready) return;
    selfChr = makeCharacter(0x00ffcc, want);
    selfChr.root.visible = false;
    scene.add(selfChr.root);
  }
  const p = G.player;
  const show = VIEW.third && !!p && !(SPEC.on && RACE.on);
  if (!show) { selfChr.root.visible = false; selfChr.px = null; return; }
  charColors(selfChr, RACE.on ? PCOLORS[NET.slot] : 0x00ffcc);
  selfChr.root.position.set(p.x, p.y, p.z);
  charDrive(selfChr, dt, p.x, p.y, p.z, p.yaw, p.onGround, p.stun > 0, p.rope ? Math.atan2(-p.rope.dx, -p.rope.dz) : undefined, p.rope ? p.rope.th : 0);
  // カメラが体にめり込む近さでは隠す。しびれている間は点滅
  const blink = p.stun > 0 && (Math.floor(performance.now() / 125) % 2 === 1);
  selfChr.root.visible = VIEW.cur > 0.9 && !blink;
}

// ---------- 三人称カメラ ----------
function camBlocked(x, y, z) {
  const d = G.d;
  if (!d) return false;
  for (const P of d.plats) {
    if (P.gone) continue;
    if (Math.abs(x - P.cx) < P.w / 2 + 0.2 && Math.abs(z - P.cz) < P.d / 2 + 0.2 &&
        y < P.cy + 0.25 && y > P.cy - P.t - 0.25) return true;
  }
  return false;
}

// 対象の右肩ごしに後ろから見る。壁・床・天井に当たる手前までカメラを寄せる
function thirdCamera(x, y, z, yaw, pitch, dt) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = -Math.sin(yaw) * cp, fy = sp, fz = -Math.cos(yaw) * cp;   // 視線の向き
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);                       // 右向き
  const bx = x, by = y + 1.5, bz = z;
  const N = 14;
  let best = 0;
  const at = (d, out) => {
    const u = d / VIEW.dist;
    out.x = bx - fx * d + rx * 0.55 * u;
    // 見上げてもカメラが足元より下（床の中）へ潜らないよう、低い位置で止めて見上げる形にする。
    // 壁際で寄りきったときは目線の高さ（一人称と同じ）になる
    out.y = Math.max(by - fy * d + 0.45 * u + 0.12 * (1 - u), y + 0.35);
    out.z = bz - fz * d + rz * 0.55 * u;
    return out;
  };
  const tmp = thirdCamera.tmp || (thirdCamera.tmp = { x: 0, y: 0, z: 0 });
  for (let i = 1; i <= N; i++) {
    const d = VIEW.dist * i / N;
    at(d, tmp);
    if (camBlocked(tmp.x, tmp.y, tmp.z)) break;
    best = d;
  }
  // 寄るのは即座に（めり込み防止）、離れるのはなめらかに
  if (best < VIEW.cur) VIEW.cur = best;
  else VIEW.cur += (best - VIEW.cur) * Math.min(1, dt * 6);
  at(VIEW.cur, tmp);
  camera.position.set(tmp.x, tmp.y, tmp.z);
  camera.rotation.set(pitch, yaw, 0);
}

function toggleView() {
  VIEW.third = !VIEW.third;
  VIEW.cur = VIEW.dist;
  try { localStorage.setItem('tc3d_view', VIEW.third ? '3' : '1'); } catch (e) {}
  viewLabel();
}
function viewLabel() {
  const el = document.getElementById('viewBtn');
  if (el) el.textContent = VIEW.third ? '3RD' : '1ST';
}
viewLabel();
initCharacterModel();
renderSkinPickers();
