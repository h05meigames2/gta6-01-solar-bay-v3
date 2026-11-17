// SOLAR BAY boot: canvas, input, game loop, debug API for headless tests.
// The game itself lives in game.js; this file only wires it to the page.

import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { stageScene } from './shots.js';

const canvas = document.getElementById('game');
const audio = createAudio();
const game = createGame(canvas, audio);
const G = game.G;

game.start();

const params = new URLSearchParams(location.search);
const shot = params.get('shot');

function snapshot() {
  const m = game.currentMission();
  return {
    screen: G.screen,
    cash: G.cash,
    wanted: G.wanted,
    mission: m ? { name: m.name, step: game.currentStep() ? game.currentStep().text : '' } : null,
    missionStep: G.missionStep,
    missionIdx: G.missionIdx,
    cars: G.cars,
    peds: G.peds,
    police: G.police,
    enemies: G.enemies,
    bullets: G.bullets,
    player: G.player,
    stolen: G.stolen,
    driven: G.driven,
    clock: G.clock,
    storyDone: G.storyDone,
  };
}

// Debug / automation API (used by the headless screenshot + smoke scripts).
window.__solarbay = snapshot();
window.__solarbay.stage = (name) => stageScene(game, name);
window.__solarbay.teleport = (x, y) => {
  G.player.x = x; G.player.y = y;
  if (G.player.car) { G.player.car.x = x; G.player.car.y = y; }
};
window.__solarbay.setWanted = (n) => {
  G.wanted = n;
  if (n > 0) audio.startSiren(); else audio.stopSiren();
};
window.__solarbay.giveCar = () => {
  const car = game.nearestCar(100000);
  if (car) game.enterCar(car);
};
Object.defineProperty(window.__solarbay, 'screen', { get: () => G.screen });
Object.defineProperty(window.__solarbay, 'cash', { get: () => G.cash });
Object.defineProperty(window.__solarbay, 'wanted', { get: () => G.wanted });
Object.defineProperty(window.__solarbay, 'missionStep', { get: () => G.missionStep });
Object.defineProperty(window.__solarbay, 'missionIdx', { get: () => G.missionIdx });
Object.defineProperty(window.__solarbay, 'stolen', { get: () => G.stolen });
Object.defineProperty(window.__solarbay, 'driven', { get: () => G.driven });
Object.defineProperty(window.__solarbay, 'storyDone', { get: () => G.storyDone });
Object.defineProperty(window.__solarbay, 'clock', { get: () => G.clock });
Object.defineProperty(window.__solarbay, 'mission', { get: () => { const m = game.currentMission(); return m ? { name: m.name } : null; } });
Object.defineProperty(window.__solarbay, 'cars', { get: () => G.cars });
Object.defineProperty(window.__solarbay, 'peds', { get: () => G.peds });
Object.defineProperty(window.__solarbay, 'police', { get: () => G.police });
Object.defineProperty(window.__solarbay, 'enemies', { get: () => G.enemies });
Object.defineProperty(window.__solarbay, 'bullets', { get: () => G.bullets });
Object.defineProperty(window.__solarbay, 'player', { get: () => G.player });

// ---------- input ----------
function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  audio.unlock();
  G.keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Enter') {
    if (G.screen === 'start') game.startNewGame();
    else if (G.screen === 'busted' || G.screen === 'wasted') {
      G.screen = 'play';
      audio.startMusic();
      if (G.wanted > 0) audio.startSiren();
    }
  } else if (e.code === 'KeyN' && G.screen === 'start') {
    try { localStorage.removeItem('solarbay-save-v3'); } catch (err) { /* ignore */ }
    location.reload();
  } else if (e.code === 'KeyP' && (G.screen === 'play' || G.screen === 'pause')) {
    G.screen = G.screen === 'play' ? 'pause' : 'play';
  } else if (e.code === 'KeyR' && G.screen === 'pause') {
    try { localStorage.removeItem('solarbay-save-v3'); } catch (err) { /* ignore */ }
    location.reload();
  } else if (e.code === 'KeyE' && G.screen === 'play') {
    game.tryInteract();
  } else if (e.code === 'KeyM' && G.screen === 'play') {
    const m = game.currentMission();
    if (m) {
      const s = game.currentStep();
      G.toasts.length = 0;
      G.toasts.push({ text: `${m.name} — ${m.brief}`, t: 0, dur: 6 });
      if (s) G.toasts.push({ text: `Tujuan: ${s.text} · Hadiah $${m.reward}`, t: 0, dur: 6 });
    }
  }
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
window.addEventListener('blur', () => { G.keys = {}; G.mouse.down = false; });

canvas.addEventListener('mousemove', (e) => {
  const p = canvasPos(e);
  G.mouse.x = p.x; G.mouse.y = p.y;
});
canvas.addEventListener('mousedown', (e) => {
  audio.unlock();
  const p = canvasPos(e);
  G.mouse.x = p.x; G.mouse.y = p.y;
  G.mouse.down = true;
  if (G.screen === 'play') {
    const w = game.screenToWorld(p.x, p.y);
    game.shootAt(w.x, w.y);
  }
});
window.addEventListener('mouseup', () => { G.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- scene staging for screenshots ----------
if (shot) {
  stageScene(game, shot);
} else {
  // Keep the start screen alive behind the title: gentle camera drift.
  G.camera.x = 200;
  G.camera.y = 300;
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
