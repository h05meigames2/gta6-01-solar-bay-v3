// SOLAR BAY — open-world crime game core (canvas 2D, top-down).
// One state object, plain functions: player on foot / driving, traffic,
// pedestrians, police + wanted, missions, combat, HUD, minimap, save.

import { buildWorld, WORLD_W, WORLD_H, ROAD_W, BEACH_Y, WATER_Y } from './world.js';
import { clamp, lerp, dist2, angleTo, angleDiff, makeRng } from './rng.js';

const SAVE_KEY = 'solarbay-save-v3';
const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e0b13c', '#7bc47f', '#b06fc0', '#d9d9d9', '#4a4a55', '#e07a2e'];
const PED_COLORS = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0', '#6b4a2f'];
const PED_SHIRTS = ['#d94f3d', '#3d7bd9', '#e0b13c', '#7bc47f', '#b06fc0', '#eeeeee', '#222831', '#e07a2e'];

export const MISSIONS = [
  {
    name: 'Paket Pertama',
    brief: 'Mara butuh kurir. Ambil paket di Kios Pelabuhan, antar ke garasi. Jangan bikin ribut.',
    steps: [
      { text: 'Ambil paket di Kios Pelabuhan', x: 1500, y: 2260, r: 70 },
      { text: 'Antar paket ke Mara\'s Garage', x: 500, y: 500, r: 80 },
    ],
    reward: 300,
  },
  {
    name: 'Mobil Pesanan',
    brief: 'Pembeli mau Comet GT kuning di Solar Mall. Curi, bawa ke garasi. Polisi pasti ngejar.',
    steps: [
      { text: 'Curi Comet GT kuning di Solar Mall', x: 2600, y: 500, r: 90, needCar: 'comet' },
      { text: 'Bawa Comet GT ke Mara\'s Garage', x: 500, y: 500, r: 90, needCar: 'comet' },
    ],
    reward: 600,
  },
  {
    name: 'Dermaga Vex',
    brief: 'Geng Vex nongkrong di dermaga dan ngacak-ngacak wilayah Mara. Usir mereka. Bawa pentungan atau pistol.',
    steps: [
      { text: 'Datangi Dermaga Vex', x: 1500, y: 2400, r: 90 },
      { text: 'Kalahkan 4 anggota Vex (0/4)', x: 1500, y: 2400, r: 260, needKills: 4 },
    ],
    reward: 900,
  },
];

export function createGame(canvas, audio) {
  const ctx = canvas.getContext('2d');
  const world = buildWorld(20261117);
  const rng = makeRng(987654321);

  const G = {
    screen: 'start',
    world, canvas, ctx, audio,
    time: 0, clock: 0.42, // 0..1, 0.42 = golden late afternoon
    keys: {}, mouse: { x: 640, y: 360, down: false },
    camera: { x: 500, y: 500 },
    player: {
      x: 500, y: 620, angle: -Math.PI / 2, speed: 0,
      onFoot: true, health: 100, car: null, radius: 12,
      lastDamage: -99, punchCd: 0, shootCd: 0, sprint: false,
    },
    cars: [], peds: [], police: [], enemies: [], bullets: [], particles: [], pickups: [],
    cash: 120, wanted: 0, wantedTimer: 0, crimeTimer: 0,
    missionIdx: 0, missionStep: 0, missionKills: 0, storyDone: false,
    driven: 0, stolen: 0, bustedTimer: 0,
    toasts: [], saveTimer: 0, hasSave: false,
    stats: { shots: 0, hits: 0, punches: 0 },
  };

  // ---------- spawning ----------
  function spawnCar(x, y, angle, opts = {}) {
    const car = {
      x, y, angle, speed: 0,
      color: opts.color || rng.pick(CAR_COLORS),
      model: opts.model || 'sedan',
      parked: !!opts.parked,
      traffic: !!opts.traffic,
      axis: opts.axis || 'v', dir: opts.dir || 1, road: opts.road ?? 0,
      lane: 0, turnCd: 0, hp: opts.hp ?? 120, police: !!opts.police,
      wrecked: false, sirenPhase: rng.next() * Math.PI * 2,
    };
    if (car.traffic) {
      car.lane = car.axis === 'v'
        ? (car.dir > 0 ? -16 : 16)
        : (car.dir > 0 ? 16 : -16);
    }
    G.cars.push(car);
    return car;
  }

  function spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const axis = rng.chance(0.5) ? 'v' : 'h';
      const road = rng.int(0, axis === 'v' ? world.roadsV.length - 1 : world.roadsH.length - 1);
      const dir = rng.chance(0.5) ? 1 : -1;
      const along = rng.range(240, axis === 'v' ? 2260 : 2860);
      const x = axis === 'v' ? world.roadsV[road] : along;
      const y = axis === 'v' ? along : world.roadsH[road];
      const c = spawnCar(x, y, axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
        { traffic: true, axis, dir, road, color: rng.pick(CAR_COLORS) });
      c.speed = rng.range(90, 150);
    }
  }

  function spawnParked() {
    // Parked cars along roads and in lots — the stealable fleet.
    const spots = [
      [560, 236, 0], [644, 236, 0], [860, 536, Math.PI / 2], [236, 860, Math.PI / 2],
      [1160, 836, 0], [2060, 1136, Math.PI], [2360, 1736, 0], [1760, 2036, Math.PI / 2],
      [2660, 836, Math.PI], [836, 1736, 0], [1460, 536, 0], [2960, 1436, Math.PI / 2],
    ];
    for (const [x, y, a] of spots) {
      spawnCar(x, y, a, { parked: true, color: rng.pick(CAR_COLORS) });
    }
    // The mission Comet GT: bright yellow coupe in the mall lot.
    spawnCar(2600, 500, Math.PI / 2, { parked: true, color: '#ffd21f', model: 'comet' });
    // A fast car near the garage for a quick start.
    spawnCar(560, 470, -Math.PI / 2, { parked: true, color: '#c22e2e', model: 'sport' });
  }

  function spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const p = world.nearestRoadPoint(rng.range(250, 2950), rng.range(250, 2250));
      G.peds.push({
        x: p.x + rng.range(-50, 50), y: p.y + rng.range(-50, 50),
        angle: rng.range(0, Math.PI * 2), speed: 0,
        tx: p.x, ty: p.y, wait: rng.range(0, 3),
        skin: rng.pick(PED_COLORS), shirt: rng.pick(PED_SHIRTS),
        hp: 50, flee: 0, state: 'walk',
      });
    }
  }

  function spawnPolice(n) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(550, 750);
      const p = world.nearestRoadPoint(
        clamp(G.player.x + Math.cos(a) * d, 260, 2940),
        clamp(G.player.y + Math.sin(a) * d, 260, 2240));
      const car = spawnCar(p.x, p.y, angleTo(p.x, p.y, G.player.x, G.player.y),
        { police: true, color: '#20242e', hp: 140 });
      G.police.push(car);
    }
  }

  function spawnVex(n) {
    for (let i = 0; i < n; i++) {
      G.enemies.push({
        x: 1500 + rng.range(-160, 160), y: 2380 + rng.range(-40, 60),
        angle: rng.range(0, Math.PI * 2), speed: 0, hp: 100,
        shirt: '#7a1f1f', skin: rng.pick(PED_COLORS), punchCd: 0, state: 'guard',
      });
    }
  }

  function addParticles(x, y, n, color, speed = 120) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(speed * 0.3, speed);
      G.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rng.range(0.3, 0.8), max: 0.8, color, size: rng.range(2, 5),
      });
    }
  }

  function toast(text, dur = 3.5) {
    G.toasts.push({ text, t: 0, dur });
    if (G.toasts.length > 4) G.toasts.shift();
  }

  function addWanted(n, reason) {
    if (G.wanted >= 5) return;
    G.wanted = Math.min(5, G.wanted + n);
    G.crimeTimer = 0;
    if (reason) toast(reason + ' — Wanted +' + n, 3);
    if (G.wanted > 0) audio.startSiren();
  }

  // ---------- missions ----------
  function currentMission() {
    return G.missionIdx < MISSIONS.length ? MISSIONS[G.missionIdx] : null;
  }
  function currentStep() {
    const m = currentMission();
    return m ? m.steps[G.missionStep] : null;
  }
  function missionTarget() {
    const s = currentStep();
    return s ? { x: s.x, y: s.y, r: s.r } : null;
  }

  function completeMission() {
    const m = currentMission();
    if (!m) return;
    G.cash += m.reward;
    audio.cash(); audio.missionDone();
    toast(`Misi selesai: ${m.name}  +$${m.reward}`, 5);
    addParticles(G.player.x, G.player.y, 26, '#ffd21f', 200);
    G.missionIdx++;
    G.missionStep = 0;
    G.missionKills = 0;
    saveGame();
    if (G.missionIdx >= MISSIONS.length) {
      G.storyDone = true;
      toast('CERITA SELESAI — Solar Bay milikmu sekarang. Free roam!', 6);
    } else {
      const nm = currentMission();
      toast(`Misi baru: ${nm.name} — ${nm.brief}`, 6);
    }
  }

  function updateMissions(dt) {
    const m = currentMission();
    if (!m) return;
    const s = m.steps[G.missionStep];
    if (!s) return;
    const p = G.player;
    if (s.needCar === 'comet') {
      const inComet = p.car && p.car.model === 'comet';
      if (G.missionStep === 0 && inComet) { G.missionStep = 1; toast('Comet GT didapat! Bawa ke garasi Mara.', 4); audio.pickup(); }
      else if (G.missionStep === 1 && inComet && dist2(p.x, p.y, s.x, s.y) < s.r * s.r) completeMission();
      return;
    }
    if (s.needKills) {
      if (G.missionStep === 1) {
        if (G.enemies.length === 0 && G.missionKills >= s.needKills) completeMission();
        else if (G.enemies.length === 0 && G.missionKills < s.needKills) spawnVex(s.needKills - G.missionKills);
      } else if (dist2(p.x, p.y, s.x, s.y) < s.r * s.r) {
        G.missionStep = 1;
        spawnVex(s.needKills);
        toast('Vex datang! Kalahkan mereka semua.', 4);
        addWanted(1, 'Perkelahian di dermaga');
      }
      return;
    }
    if (dist2(p.x, p.y, s.x, s.y) < s.r * s.r) {
      if (G.missionStep < m.steps.length - 1) {
        G.missionStep++;
        audio.pickup();
        toast(m.steps[G.missionStep].text, 4);
      } else {
        completeMission();
      }
    }
  }

  // ---------- save / load ----------
  function saveGame() {
    try {
      const p = G.player;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: G.cash, missionIdx: G.missionIdx, missionStep: G.missionStep,
        x: Math.round(p.x), y: Math.round(p.y), health: p.health,
        wanted: G.wanted, clock: G.clock, storyDone: G.storyDone,
      }));
      G.hasSave = true;
    } catch (e) { /* storage unavailable */ }
  }
  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      G.cash = s.cash ?? 120;
      G.missionIdx = s.missionIdx ?? 0;
      G.missionStep = s.missionStep ?? 0;
      G.player.x = s.x ?? 500; G.player.y = s.y ?? 620;
      G.player.health = s.health ?? 100;
      G.wanted = s.wanted ?? 0;
      G.clock = s.clock ?? 0.42;
      G.storyDone = !!s.storyDone;
      G.hasSave = true;
      return true;
    } catch (e) { return false; }
  }
  function checkSave() {
    try { G.hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) { G.hasSave = false; }
  }

  // ---------- combat ----------
  function shootAt(wx, wy) {
    const p = G.player;
    if (p.shootCd > 0 || G.screen !== 'play') return;
    p.shootCd = 0.28;
    const a = angleTo(p.x, p.y, wx, wy);
    G.bullets.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.5, fromPlayer: true });
    G.stats.shots++;
    audio.shoot();
    addParticles(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 3, '#ffdd55', 160);
    // Nearby peds flee from the shot.
    for (const ped of G.peds) {
      if (dist2(ped.x, ped.y, p.x, p.y) < 500 * 500) { ped.flee = 3; }
    }
  }

  function punch() {
    const p = G.player;
    if (p.punchCd > 0 || G.screen !== 'play') return;
    p.punchCd = 0.4;
    G.stats.punches++;
    audio.punch();
    const reach = 46;
    const hx = p.x + Math.cos(p.angle) * reach;
    const hy = p.y + Math.sin(p.angle) * reach;
    let hitSomething = false;
    for (const e of G.enemies) {
      if (dist2(e.x, e.y, hx, hy) < 40 * 40) {
        e.hp -= 25;
        e.x += Math.cos(p.angle) * 14; e.y += Math.sin(p.angle) * 14;
        addParticles(e.x, e.y, 6, '#ff5555', 140);
        hitSomething = true;
        if (e.hp <= 0) killEnemy(e);
      }
    }
    for (const ped of G.peds) {
      if (dist2(ped.x, ped.y, hx, hy) < 34 * 34) {
        ped.hp -= 25; ped.flee = 4;
        ped.x += Math.cos(p.angle) * 16; ped.y += Math.sin(p.angle) * 16;
        hitSomething = true;
        if (ped.hp <= 0) killPed(ped);
      }
    }
    if (!hitSomething) addParticles(hx, hy, 3, '#ffffff', 60);
  }

  function killEnemy(e) {
    G.missionKills++;
    addParticles(e.x, e.y, 22, '#ff4444', 220);
    dropCash(e.x, e.y, 40);
    G.enemies.splice(G.enemies.indexOf(e), 1);
    const s = currentStep();
    if (s && s.needKills) {
      toast(`Vex dikalahkan (${G.missionKills}/${s.needKills})`, 2.5);
      const idx = MISSIONS[G.missionIdx].steps[1].text.indexOf('(');
      MISSIONS[G.missionIdx].steps[1].text = `Kalahkan 4 anggota Vex (${G.missionKills}/4)`;
    }
  }

  function killPed(ped) {
    addParticles(ped.x, ped.y, 16, '#cc2222', 180);
    dropCash(ped.x, ped.y, rng.int(10, 40));
    G.peds.splice(G.peds.indexOf(ped), 1);
    addWanted(1, 'Warga diserang');
    // Keep the streets populated.
    setTimeout(() => { if (G.screen === 'play') spawnPeds(1); }, 4000);
  }

  function dropCash(x, y, amount) {
    G.pickups.push({ x: x + rng.range(-14, 14), y: y + rng.range(-14, 14), amount, t: 0 });
  }

  function damagePlayer(amount, source) {
    const p = G.player;
    const now = G.time;
    if (now - p.lastDamage < 0.5) return;
    p.lastDamage = now;
    p.health -= amount;
    addParticles(p.x, p.y, 8, '#ff2222', 150);
    if (p.health <= 0) {
      p.health = 0;
      wasted();
    }
  }

  function wasted() {
    const lost = Math.floor(G.cash * 0.1);
    G.cash -= lost;
    G.wanted = 0;
    audio.stopSiren();
    audio.busted();
    G.screen = 'wasted';
    G.wastedLost = lost;
    // Clear police, respawn at the clinic.
    for (const c of G.police) { const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1); }
    G.police = [];
    exitCar(true);
    G.player.x = 500; G.player.y = 2000;
    G.player.health = 100;
    saveGame();
  }

  function busted() {
    const fine = Math.min(100, G.cash);
    G.cash -= fine;
    G.wanted = 0;
    audio.stopSiren();
    audio.busted();
    G.screen = 'busted';
    G.bustedFine = fine;
    for (const c of G.police) { const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1); }
    G.police = [];
    exitCar(true);
    G.player.x = 500; G.player.y = 620;
    G.player.health = 100;
    saveGame();
  }

  // ---------- car enter / exit ----------
  function nearestCar(maxD) {
    let best = null, bestD = maxD * maxD;
    for (const c of G.cars) {
      if (c.police || c.wrecked) continue;
      const d = dist2(c.x, c.y, G.player.x, G.player.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    const p = G.player;
    p.car = car;
    p.onFoot = false;
    car.parked = false;
    car.traffic = false;
    car.speed = 0;
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    if (!car.wasStolenByPlayer) {
      car.wasStolenByPlayer = true;
      G.stolen++;
      addWanted(1, 'Mobil dicuri');
      toast(`Mencuri ${car.model === 'comet' ? 'Comet GT' : 'mobil'} — kabur!`, 3);
    } else {
      toast('Masuk mobil', 1.5);
    }
    audio.startEngine();
  }

  function exitCar(silent) {
    const p = G.player;
    if (!p.car) return;
    const car = p.car;
    p.car = null;
    p.onFoot = true;
    car.parked = true;
    car.speed = 0;
    const side = Math.PI / 2;
    p.x = car.x + Math.cos(car.angle + side) * 34;
    p.y = car.y + Math.sin(car.angle + side) * 34;
    const fixed = world.resolveCircle(p.x, p.y, p.radius);
    p.x = fixed.x; p.y = fixed.y;
    audio.stopEngine();
    if (!silent) toast('Keluar mobil', 1.5);
  }

  function tryInteract() {
    const p = G.player;
    if (p.onFoot) {
      const car = nearestCar(52);
      if (car) enterCar(car);
    } else {
      exitCar(false);
    }
  }

  // ---------- per-frame update ----------
  function update(dt) {
    G.time += dt;
    G.clock = (G.clock + dt / 480) % 1; // a full day in 8 minutes
    for (const t of G.toasts) t.t += dt;
    G.toasts = G.toasts.filter((t) => t.t < t.dur);
    for (const pt of G.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.96; pt.vy *= 0.96;
    }
    G.particles = G.particles.filter((pt) => pt.life > 0);
    for (const b of G.bullets) {
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    G.bullets = G.bullets.filter((b) => b.life > 0 && b.x > 0 && b.x < WORLD_W && b.y > 0 && b.y < WORLD_H);

    if (G.screen !== 'play') return;
    const p = G.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    if (p.health < 100 && G.time - p.lastDamage > 8) p.health = Math.min(100, p.health + 4 * dt);

    // Wanted decay: lay low and the heat cools off.
    G.crimeTimer += dt;
    if (G.wanted > 0 && G.crimeTimer > 14) {
      const nearCop = G.police.some((c) => dist2(c.x, c.y, p.x, p.y) < 520 * 520);
      if (!nearCop) {
        G.wanted--;
        G.crimeTimer = 0;
        toast('Wanted turun — polisi kehilangan jejak.', 3);
        if (G.wanted === 0) audio.stopSiren();
      }
    }
    // Keep police numbers matched to wanted level.
    const wantCops = G.wanted === 0 ? 0 : Math.min(2 + G.wanted, 6);
    if (G.police.length < wantCops) spawnPolice(wantCops - G.police.length);
    if (G.police.length > wantCops) {
      const extra = G.police.pop();
      const i = G.cars.indexOf(extra);
      if (i >= 0) G.cars.splice(i, 1);
    }

    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateMissions(dt);

    // Camera follows the player.
    const vw = canvas.width, vh = canvas.height;
    G.camera.x = clamp(p.x - vw / 2, 0, Math.max(0, WORLD_W - vw));
    G.camera.y = clamp(p.y - vh / 2, 0, Math.max(0, WORLD_H - vh));

    // Engine sound follows speed; autosave.
    if (p.car) audio.setEngine(Math.abs(p.car.speed) / 620);
    else audio.setEngine(0);
    G.saveTimer += dt;
    if (G.saveTimer > 20) { G.saveTimer = 0; saveGame(); }
  }

  function updatePlayer(dt) {
    const p = G.player;
    const k = G.keys;
    if (p.onFoot) {
      let mx = 0, my = 0;
      if (k['KeyW'] || k['ArrowUp']) my -= 1;
      if (k['KeyS'] || k['ArrowDown']) my += 1;
      if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
      if (k['KeyD'] || k['ArrowRight']) mx += 1;
      const sprint = k['ShiftLeft'] || k['ShiftRight'];
      const speed = sprint ? 265 : 175;
      if (mx || my) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        p.angle = Math.atan2(my, mx);
        const nx = p.x + mx * speed * dt;
        const ny = p.y + my * speed * dt;
        const fixed = world.resolveCircle(nx, ny, p.radius);
        p.x = fixed.x; p.y = fixed.y;
        p.speed = speed;
      } else {
        p.speed = 0;
      }
      if (k['Space'] || k['KeyF']) punch();
      if (G.mouse.down) {
        const w = screenToWorld(G.mouse.x, G.mouse.y);
        shootAt(w.x, w.y);
      }
    } else if (p.car) {
      const car = p.car;
      const forward = (k['KeyW'] || k['ArrowUp']) ? 1 : 0;
      const back = (k['KeyS'] || k['ArrowDown']) ? 1 : 0;
      const left = (k['KeyA'] || k['ArrowLeft']) ? 1 : 0;
      const right = (k['KeyD'] || k['ArrowRight']) ? 1 : 0;
      const top = car.model === 'sport' ? 640 : car.model === 'comet' ? 600 : 520;
      const accel = 420, brake = 700;
      if (forward) car.speed += accel * dt;
      if (back) car.speed -= (car.speed > 0 ? brake : accel * 0.6) * dt;
      if (!forward && !back) car.speed *= Math.pow(0.4, dt);
      car.speed = clamp(car.speed, -180, top);
      const steer = (right - left) * (car.speed >= 0 ? 1 : -1);
      car.angle += steer * 2.4 * dt * clamp(Math.abs(car.speed) / 220, 0, 1);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const before = { x: car.x, y: car.y };
      const fixed = world.resolveCircle(nx, ny, 18);
      if (Math.abs(fixed.x - nx) > 0.5 || Math.abs(fixed.y - ny) > 0.5) {
        car.speed *= 0.45;
        addParticles(car.x, car.y, 3, '#ffcc44', 90);
      }
      car.x = fixed.x; car.y = fixed.y;
      G.driven += Math.hypot(car.x - before.x, car.y - before.y);
      p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = car.speed;
      if (k['KeyH']) audio.horn();
      if (G.mouse.down) {
        const w = screenToWorld(G.mouse.x, G.mouse.y);
        shootAt(w.x, w.y);
      }
    }
  }

  function updateTraffic(dt) {
    for (const c of G.cars) {
      if (!c.traffic || c.wrecked) continue;
      c.turnCd = Math.max(0, c.turnCd - dt);
      // Slow down if another car is right ahead in the same lane.
      let targetSpeed = 130;
      for (const o of G.cars) {
        if (o === c || o.wrecked) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const ahead = Math.cos(c.angle) * dx + Math.sin(c.angle) * dy;
        const side = Math.abs(-Math.sin(c.angle) * dx + Math.cos(c.angle) * dy);
        if (ahead > 0 && ahead < 78 && side < 26) { targetSpeed = 0; break; }
      }
      c.speed = lerp(c.speed, targetSpeed, Math.min(1, dt * 2));
      const step = c.speed * dt;
      let nx = c.x + Math.cos(c.angle) * step;
      let ny = c.y + Math.sin(c.angle) * step;
      // At an intersection, sometimes turn onto the crossing road.
      const roads = c.axis === 'v' ? world.roadsH : world.roadsV;
      for (const r of roads) {
        const along = c.axis === 'v' ? ny : nx;
        if (Math.abs(along - r) < 6 && c.turnCd <= 0 && rng.chance(0.3)) {
          const newDir = rng.chance(0.5) ? 1 : -1;
          c.axis = c.axis === 'v' ? 'h' : 'v';
          c.dir = newDir;
          c.angle = c.axis === 'v' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
          c.turnCd = 2;
          if (c.axis === 'v') { nx = r; ny = c.axis === 'v' ? ny : ny; c.x = r + (newDir > 0 ? -16 : 16); }
          else { ny = r; c.y = r + (newDir > 0 ? 16 : -16); }
          break;
        }
      }
      // Keep inside the road grid; bounce back at the edges.
      if (nx < 180 || nx > 2920 || ny < 180 || ny > 2320) {
        c.dir *= -1;
        c.angle += Math.PI;
        c.turnCd = 1;
      } else {
        c.x = nx; c.y = ny;
      }
    }
  }

  function updatePeds(dt) {
    for (const ped of G.peds) {
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = angleTo(G.player.x, G.player.y, ped.x, ped.y);
        ped.angle = a;
        const nx = ped.x + Math.cos(a) * 200 * dt;
        const ny = ped.y + Math.sin(a) * 200 * dt;
        const fixed = world.resolveCircle(nx, ny, 10);
        ped.x = fixed.x; ped.y = fixed.y;
        continue;
      }
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      const d = dist2(ped.x, ped.y, ped.tx, ped.ty);
      if (d < 12 * 12) {
        const np = world.nearestRoadPoint(
          clamp(ped.x + rng.range(-260, 260), 240, 2960),
          clamp(ped.y + rng.range(-260, 260), 240, 2260));
        ped.tx = np.x + rng.range(-40, 40);
        ped.ty = np.y + rng.range(-40, 40);
        ped.wait = rng.range(0, 2.5);
        continue;
      }
      const a = angleTo(ped.x, ped.y, ped.tx, ped.ty);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * 62 * dt;
      const ny = ped.y + Math.sin(a) * 62 * dt;
      const fixed = world.resolveCircle(nx, ny, 10);
      ped.x = fixed.x; ped.y = fixed.y;
    }
  }

  function updatePolice(dt) {
    const p = G.player;
    for (const cop of [...G.police]) {
      if (cop.wrecked) continue;
      const target = angleTo(cop.x, cop.y, p.x, p.y);
      const diff = angleDiff(cop.angle, target);
      cop.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
      const top = 470;
      cop.speed = lerp(cop.speed, top, Math.min(1, dt * 1.4));
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      const fixed = world.resolveCircle(nx, ny, 18);
      if (Math.abs(fixed.x - nx) > 0.5 || Math.abs(fixed.y - ny) > 0.5) cop.speed *= 0.5;
      cop.x = fixed.x; cop.y = fixed.y;
      cop.sirenPhase += dt * 6;
      const d = Math.hypot(cop.x - p.x, cop.y - p.y);
      if (d < 46) {
        if (p.onFoot) {
          G.bustedTimer += dt;
          if (G.bustedTimer > 1.2) { G.bustedTimer = 0; busted(); return; }
        } else if (p.car) {
          // Ram: shove the player's car and damage it.
          const push = angleTo(cop.x, cop.y, p.car.x, p.car.y);
          p.car.x += Math.cos(push) * 26 * dt * 10;
          p.car.y += Math.sin(push) * 26 * dt * 10;
          p.car.speed *= 0.94;
          p.car.hp -= 26 * dt;
          addParticles(p.car.x, p.car.y, 2, '#ffcc44', 80);
          if (p.car.hp <= 0) {
            p.car.wrecked = true;
            addParticles(p.car.x, p.car.y, 30, '#ff7722', 260);
            audio.punch();
            toast('Mobilmu hancur! Keluar!', 3);
            exitCar(true);
          }
        }
      } else {
        G.bustedTimer = Math.max(0, G.bustedTimer - dt * 2);
      }
    }
  }

  function updateEnemies(dt) {
    const p = G.player;
    for (const e of [...G.enemies]) {
      e.punchCd = Math.max(0, e.punchCd - dt);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 420) {
        e.state = 'chase';
        const a = angleTo(e.x, e.y, p.x, p.y);
        e.angle = a;
        if (d > 34) {
          const nx = e.x + Math.cos(a) * 150 * dt;
          const ny = e.y + Math.sin(a) * 150 * dt;
          const fixed = world.resolveCircle(nx, ny, 11);
          e.x = fixed.x; e.y = fixed.y;
        } else if (e.punchCd <= 0) {
          e.punchCd = 0.9;
          damagePlayer(9, 'vex');
          audio.punch();
        }
      } else {
        e.state = 'guard';
      }
    }
  }

  function updateBullets(dt) {
    for (const b of [...G.bullets]) {
      if (!b.fromPlayer) continue;
      // Hit enemies.
      for (const e of [...G.enemies]) {
        if (dist2(b.x, b.y, e.x, e.y) < 16 * 16) {
          e.hp -= 34;
          G.stats.hits++;
          addParticles(b.x, b.y, 5, '#ff5555', 120);
          b.life = 0;
          if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit pedestrians.
      for (const ped of [...G.peds]) {
        if (dist2(b.x, b.y, ped.x, ped.y) < 14 * 14) {
          ped.hp -= 34;
          G.stats.hits++;
          ped.flee = 4;
          addParticles(b.x, b.y, 5, '#ff5555', 120);
          b.life = 0;
          if (ped.hp <= 0) killPed(ped);
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit police cars.
      for (const cop of [...G.police]) {
        if (dist2(b.x, b.y, cop.x, cop.y) < 20 * 20) {
          cop.hp -= 34;
          G.stats.hits++;
          addParticles(b.x, b.y, 6, '#ffcc44', 130);
          b.life = 0;
          if (cop.hp <= 0) {
            cop.wrecked = true;
            addParticles(cop.x, cop.y, 34, '#ff7722', 300);
            addWanted(2, 'Mobil polisi dihancurkan');
            const i = G.police.indexOf(cop);
            if (i >= 0) G.police.splice(i, 1);
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit buildings: bullet stops.
      if (world.hitsBuilding(b.x, b.y, 2)) {
        addParticles(b.x, b.y, 3, '#cccccc', 70);
        b.life = 0;
      }
    }
  }

  function updatePickups(dt) {
    const p = G.player;
    for (const pk of [...G.pickups]) {
      pk.t += dt;
      if (dist2(pk.x, pk.y, p.x, p.y) < 30 * 30) {
        G.cash += pk.amount;
        audio.cash();
        toast(`+$${pk.amount}`, 1.5);
        G.pickups.splice(G.pickups.indexOf(pk), 1);
      } else if (pk.t > 25) {
        G.pickups.splice(G.pickups.indexOf(pk), 1);
      }
    }
  }

  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: G.camera.x + sx * scaleX,
      y: G.camera.y + sy * scaleY,
    };
  }

  // ---------- rendering ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function inView(x, y, m = 80) {
    return x > G.camera.x - m && x < G.camera.x + canvas.width + m &&
      y > G.camera.y - m && y < G.camera.y + canvas.height + m;
  }

  function drawWorld() {
    const cam = G.camera;
    const vw = canvas.width, vh = canvas.height;
    // Base grass.
    ctx.fillStyle = '#6f9e5f';
    ctx.fillRect(0, 0, vw, vh);
    // Beach + bay (world-space rects, camera-relative).
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(-cam.x, BEACH_Y - cam.y, WORLD_W, WATER_Y - BEACH_Y);
    ctx.fillStyle = '#2f6fb2';
    ctx.fillRect(-cam.x, WATER_Y - cam.y, WORLD_W, WORLD_H - WATER_Y);
    // Animated wave lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const wy = WATER_Y + 18 + i * 22;
      const yy = wy - cam.y + Math.sin(G.time * 1.4 + i * 1.7) * 3;
      ctx.beginPath();
      for (let x = -cam.x; x < -cam.x + vw + 40; x += 40) {
        const y = yy + Math.sin(x * 0.02 + G.time * 2 + i) * 3;
        if (x === -cam.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Parks.
    for (const pk of world.parks) {
      if (!inView(pk.x + pk.w / 2, pk.y + pk.h / 2, 200)) continue;
      ctx.fillStyle = '#5d8a4e';
      ctx.fillRect(pk.x - cam.x, pk.y - cam.y, pk.w, pk.h);
    }
    // Parking lots.
    for (const lot of world.lots) {
      if (!inView(lot.x + lot.w / 2, lot.y + lot.h / 2, 200)) continue;
      ctx.fillStyle = '#4c5158';
      ctx.fillRect(lot.x - cam.x, lot.y - cam.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 20; x < lot.x + lot.w - 10; x += 44) {
        ctx.beginPath();
        ctx.moveTo(x - cam.x, lot.y + 8 - cam.y);
        ctx.lineTo(x - cam.x, lot.y + 34 - cam.y);
        ctx.stroke();
      }
    }
    // Sidewalks + roads.
    for (const rx of world.roadsV) {
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(rx - ROAD_W / 2 - 8 - cam.x, -cam.y, ROAD_W + 16, WORLD_H);
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(rx - ROAD_W / 2 - cam.x, -cam.y, ROAD_W, WORLD_H);
    }
    for (const ry of world.roadsH) {
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(-cam.x, ry - ROAD_W / 2 - 8 - cam.y, WORLD_W, ROAD_W + 16);
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(-cam.x, ry - ROAD_W / 2 - cam.y, WORLD_W, ROAD_W);
    }
    // Centre dashes.
    ctx.fillStyle = '#e8c33c';
    for (const rx of world.roadsV) {
      for (let y = 0; y < WORLD_H; y += 56) {
        if (y - cam.y > -20 && y - cam.y < vh + 20) ctx.fillRect(rx - 2 - cam.x, y - cam.y, 4, 28);
      }
    }
    for (const ry of world.roadsH) {
      for (let x = 0; x < WORLD_W; x += 56) {
        if (x - cam.x > -20 && x - cam.x < vw + 20) ctx.fillRect(x - cam.x, ry - 2 - cam.y, 28, 4);
      }
    }
    // Pier planks.
    const pier = world.pier;
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(pier.x - cam.x, pier.y - cam.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let y = pier.y + 12; y < pier.y + pier.h; y += 14) {
      ctx.beginPath();
      ctx.moveTo(pier.x - cam.x, y - cam.y);
      ctx.lineTo(pier.x + pier.w - cam.x, y - cam.y);
      ctx.stroke();
    }
    // Buildings (fake-3D: shadow + top face + roof inset + windows).
    for (const b of world.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      const sx = b.x - cam.x, sy = b.y - cam.y;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(sx + b.tall * 0.7, sy + b.tall * 0.7, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(sx, sy, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(sx + 7, sy + 7, b.w - 14, b.h - 14);
      if (b.kind === 'tower') {
        ctx.fillStyle = 'rgba(255,240,180,0.75)';
        const cols = Math.max(2, Math.floor(b.w / 26));
        const rows = Math.max(2, Math.floor(b.h / 26));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            if (((i * 7 + j * 3 + b.x) % 5) < 3) {
              ctx.fillRect(sx + 12 + i * 24, sy + 12 + j * 24, 10, 12);
            }
          }
        }
      }
    }
    // Trees.
    for (const t of world.trees) {
      if (!inView(t.x, t.y, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(t.x + 3 - cam.x, t.y + 4 - cam.y, t.r, t.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f7a37';
      ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57a047';
      ctx.beginPath(); ctx.arc(t.x - 3 - cam.x, t.y - 3 - cam.y, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Landmark labels.
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (const key of Object.keys(world.landmarks)) {
      const lm = world.landmarks[key];
      if (!inView(lm.x, lm.y, 60)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(lm.label).width + 12;
      rr(lm.x - w / 2 - cam.x, lm.y - 34 - cam.y, w, 18, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(lm.label, lm.x - cam.x, lm.y - 21 - cam.y);
    }
  }

  function drawCar(c) {
    const cam = G.camera;
    const sx = c.x - cam.x, sy = c.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(c.angle);
    if (c.wrecked) {
      ctx.fillStyle = '#222222';
      rr(-21, -11, 42, 22, 5);
      ctx.fillStyle = 'rgba(80,80,80,0.8)';
      ctx.beginPath(); ctx.arc(-6, -4, 8 + Math.sin(G.time * 9) * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    // Wheels.
    ctx.fillStyle = '#111111';
    ctx.fillRect(-15, -13, 9, 5); ctx.fillRect(-15, 8, 9, 5);
    ctx.fillRect(7, -13, 9, 5); ctx.fillRect(7, 8, 9, 5);
    // Body.
    ctx.fillStyle = c.color;
    rr(-21, -11, 42, 22, 6);
    // Windshield + roof.
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(8, -8, 7, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-6, -8, 12, 16);
    if (c.model === 'comet' || c.model === 'sport') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-19, -2, 34, 4);
    }
    if (c.police) {
      const on = Math.sin(c.sirenPhase) > 0;
      ctx.fillStyle = on ? '#ff2222' : '#2244ff';
      ctx.fillRect(-4, -11, 8, 5);
      ctx.fillStyle = on ? '#2244ff' : '#ff2222';
      ctx.fillRect(-4, 6, 8, 5);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLISI', 0, 2);
    }
    ctx.restore();
    // Headlight glow at night.
    const daylight = 0.5 + 0.5 * Math.sin((G.clock - 0.25) * Math.PI * 2);
    if (daylight < 0.45) {
      ctx.fillStyle = 'rgba(255,240,170,0.25)';
      ctx.beginPath();
      ctx.arc(sx + Math.cos(c.angle) * 30, sy + Math.sin(c.angle) * 30, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, skin, shirt, r, label) {
    const sx = x - G.camera.x, sy = y - G.camera.y;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx + 2, sy + 3, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(sx + Math.cos(angle) * 3, sy + Math.sin(angle) * 3, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(angle) * r, sy + Math.sin(angle) * r);
    ctx.lineTo(sx + Math.cos(angle) * (r + 9), sy + Math.sin(angle) * (r + 9));
    ctx.stroke();
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx, sy - r - 8);
    }
  }

  function drawMarker() {
    const t = missionTarget();
    if (!t || G.screen !== 'play') return;
    const sx = t.x - G.camera.x, sy = t.y - G.camera.y;
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    // Ground beam.
    ctx.fillStyle = 'rgba(255,210,31,0.14)';
    ctx.fillRect(sx - 26, sy - 90, 52, 130);
    // Pulsing diamond.
    ctx.save();
    ctx.translate(sx, sy - 26);
    ctx.rotate(Math.PI / 4);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ffd21f';
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 3;
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.restore();
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const d = Math.round(Math.hypot(G.player.x - t.x, G.player.y - t.y));
    ctx.fillText(d + 'm', sx, sy - 48);
  }

  function drawMinimap() {
    const mw = 216, mh = 164;
    const mx = canvas.width - mw - 14, my = 14;
    const sc = mw / WORLD_W;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,20,0.78)';
    rr(mx - 4, my - 4, mw + 8, mh + 8, 8);
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    // Water.
    ctx.fillStyle = '#2f6fb2';
    ctx.fillRect(mx, my + WATER_Y * sc, mw, mh - WATER_Y * sc);
    // Roads.
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = 2;
    for (const rx of world.roadsV) {
      ctx.beginPath(); ctx.moveTo(mx + rx * sc, my); ctx.lineTo(mx + rx * sc, my + mh); ctx.stroke();
    }
    for (const ry of world.roadsH) {
      ctx.beginPath(); ctx.moveTo(mx, my + ry * sc); ctx.lineTo(mx + mw, my + ry * sc); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = 'rgba(200,205,215,0.7)';
    for (const b of world.buildings) {
      ctx.fillRect(mx + b.x * sc, my + b.y * sc, Math.max(1.5, b.w * sc), Math.max(1.5, b.h * sc));
    }
    // Mission target.
    const t = missionTarget();
    if (t) {
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath(); ctx.arc(mx + t.x * sc, my + t.y * sc, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a5b00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police blips (red) and player (white arrow).
    ctx.fillStyle = '#ff3333';
    for (const c of G.police) {
      ctx.beginPath(); ctx.arc(mx + c.x * sc, my + c.y * sc, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    const p = G.player;
    ctx.save();
    ctx.translate(mx + p.x * sc, my + p.y * sc);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 4, my - 4, mw + 8, mh + 8);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SOLAR BAY', mx, my + mh + 18);
  }

  function drawHUD() {
    const p = G.player;
    // Top-left: cash + wanted.
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    rr(12, 12, 250, 64, 8);
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('$' + G.cash.toLocaleString('en-US'), 24, 42);
    ctx.font = 'bold 20px sans-serif';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < G.wanted ? '#ff3333' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', 24 + i * 26, 68);
    }
    if (G.wanted > 0) {
      ctx.fillStyle = '#ff6666';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('WANTED', 160, 68);
    }
    // Bottom-left: health bar.
    ctx.fillStyle = 'rgba(8,12,20,0.72)';
    rr(12, canvas.height - 52, 220, 40, 8);
    ctx.fillStyle = '#333a44';
    rr(22, canvas.height - 38, 150, 14, 4);
    ctx.fillStyle = p.health > 50 ? '#4ade80' : p.health > 25 ? '#facc15' : '#ef4444';
    rr(22, canvas.height - 38, 150 * (p.health / 100), 14, 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('HP ' + Math.ceil(p.health), 178, canvas.height - 26);
    // Bottom-right: speed when driving.
    if (p.car) {
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      rr(canvas.width - 132, canvas.height - 52, 120, 40, 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.18) + ' km/h', canvas.width - 24, canvas.height - 24);
      ctx.textAlign = 'left';
    }
    // Bottom-centre: mission objective.
    const m = currentMission();
    if (m) {
      const s = currentStep();
      const text = `${m.name}: ${s ? s.text : ''}`;
      ctx.font = 'bold 15px sans-serif';
      const w = ctx.measureText(text).width + 28;
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      rr((canvas.width - w) / 2, canvas.height - 46, w, 32, 8);
      ctx.fillStyle = '#ffd21f';
      ctx.textAlign = 'center';
      ctx.fillText(text, canvas.width / 2, canvas.height - 24);
      ctx.textAlign = 'left';
    }
    // Toasts (top centre).
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    let ty = 190;
    for (const t of G.toasts) {
      const a = t.t > t.dur - 0.6 ? Math.max(0, (t.dur - t.t) / 0.6) : 1;
      ctx.globalAlpha = a;
      const w = ctx.measureText(t.text).width + 24;
      ctx.fillStyle = 'rgba(8,12,20,0.78)';
      rr((canvas.width - w) / 2, ty, w, 28, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t.text, canvas.width / 2, ty + 19);
      ty += 34;
    }
    ctx.globalAlpha = 1;
    // Controls hint (fades after 25 s of play).
    if (G.time < 25 && G.screen === 'play') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('WASD jalan / nyetir · E curi & keluar mobil · Klik tembak · Spasi pukul · M misi · P jeda', 14, canvas.height - 62);
    }
    // Crosshair.
    if (G.screen === 'play') {
      const mx = G.mouse.x, my = G.mouse.y;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 13, my); ctx.lineTo(mx - 5, my); ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 13, my);
      ctx.moveTo(mx, my - 13); ctx.lineTo(mx, my - 5); ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 13); ctx.stroke();
    }
    drawMinimap();
  }

  function drawOverlay(title, lines, foot) {
    ctx.fillStyle = 'rgba(5,8,16,0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(title, canvas.width / 2, 190);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    let y = 250;
    for (const line of lines) {
      ctx.fillText(line, canvas.width / 2, y);
      y += 32;
    }
    if (foot) {
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '16px sans-serif';
      ctx.fillText(foot, canvas.width / 2, canvas.height - 60);
    }
    ctx.textAlign = 'left';
  }

  function render() {
    const vw = canvas.width, vh = canvas.height;
    ctx.clearRect(0, 0, vw, vh);
    drawWorld();
    // Cash pickups.
    for (const pk of G.pickups) {
      if (!inView(pk.x, pk.y, 30)) continue;
      const bob = Math.sin(G.time * 5 + pk.x) * 3;
      ctx.fillStyle = '#7dff8a';
      ctx.beginPath(); ctx.arc(pk.x - G.camera.x, pk.y + bob - G.camera.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b3d16';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', pk.x - G.camera.x, pk.y + bob - G.camera.y + 4);
      ctx.textAlign = 'left';
    }
    drawMarker();
    // Parked + traffic + police cars.
    for (const c of G.cars) if (inView(c.x, c.y, 60)) drawCar(c);
    // Pedestrians.
    for (const ped of G.peds) {
      if (!inView(ped.x, ped.y, 30)) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.skin, ped.shirt, 9);
    }
    // Vex enemies.
    for (const e of G.enemies) {
      if (!inView(e.x, e.y, 30)) continue;
      drawPerson(e.x, e.y, e.angle, e.skin, e.shirt, 11, 'VEX');
      ctx.fillStyle = '#333a44';
      rr(e.x - 16 - G.camera.x, e.y - 24 - G.camera.y, 32, 5, 2);
      ctx.fillStyle = '#ef4444';
      rr(e.x - 16 - G.camera.x, e.y - 24 - G.camera.y, 32 * Math.max(0, e.hp / 100), 5, 2);
    }
    // Player.
    const p = G.player;
    if (p.onFoot) {
      drawPerson(p.x, p.y, p.angle, '#e8b98a', '#14b8a6', 12);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x - G.camera.x, p.y - G.camera.y, 16, 0, Math.PI * 2); ctx.stroke();
    }
    // Bullets.
    ctx.fillStyle = '#ffe066';
    for (const b of G.bullets) {
      ctx.beginPath(); ctx.arc(b.x - G.camera.x, b.y - G.camera.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Particles.
    for (const pt of G.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x - G.camera.x, pt.y - G.camera.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Day / night lighting.
    const daylight = 0.5 + 0.5 * Math.sin((G.clock - 0.25) * Math.PI * 2);
    if (daylight < 0.98) {
      ctx.fillStyle = `rgba(8,12,40,${((1 - daylight) * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (daylight > 0.35 && daylight < 0.75) {
      const warm = (0.2 - Math.abs(daylight - 0.55)) * 0.6;
      if (warm > 0) {
        ctx.fillStyle = `rgba(255,140,40,${warm.toFixed(3)})`;
        ctx.fillRect(0, 0, vw, vh);
      }
    }
    // HUD + screens.
    if (G.screen === 'play' || G.screen === 'pause') drawHUD();
    if (G.screen === 'start') {
      drawOverlay('SOLAR BAY', [
        'Kota teluk yang panas. Mara menunggumu di garasi.',
        'Curi mobil, kabur dari polisi, selesaikan 3 misi.',
        '',
        'WASD / Panah — jalan & nyetir      E — curi / keluar mobil',
        'Klik — tembak      Spasi — pukul      M — misi      P — jeda',
        '',
        G.hasSave ? 'Save ditemukan — ENTER untuk lanjutkan, N untuk baru.' : 'Tidak ada save — ENTER untuk mulai.',
      ], 'Game orisinal — tanpa nama, karakter, atau aset GTA / Rockstar. · ENTER mulai');
    } else if (G.screen === 'pause') {
      drawOverlay('JEDA', ['Istirahat dulu, Solar Bay menunggumu.', '', 'P — lanjutkan      R — mulai dari awal'], '');
    } else if (G.screen === 'busted') {
      drawOverlay('TERTANGKAP', [`Polisi menangkapmu. Denda $${G.bustedFine}.`, '', 'ENTER — bebas dan lanjutkan'], '');
    } else if (G.screen === 'wasted') {
      drawOverlay('TUMBANG', [`Kamu tumbang di jalan. Kehilangan $${G.wastedLost}.`, 'Klinik Teluk merawatmu kembali.', '', 'ENTER — bangkit dan lanjutkan'], '');
    } else if (G.screen === 'play' && G.storyDone && !G.doneShown) {
      G.doneShown = true;
      toast('CERITA SELESAI — Solar Bay milikmu!', 6);
    }
  }

  // ---------- public API ----------
  function startNewGame() {
    G.screen = 'play';
    audio.unlock();
    audio.startMusic();
    const m = currentMission();
    if (m) toast(`Misi: ${m.name} — ${m.steps[0].text}`, 5);
    toast('WASD jalan/nyetir · E curi mobil · Klik tembak · Spasi pukul', 6);
  }

  function start() {
    spawnTraffic(16);
    spawnParked();
    spawnPeds(26);
    checkSave();
    if (G.hasSave) loadGame();
  }

  return {
    G, start, startNewGame, update, render, saveGame, loadGame, checkSave,
    tryInteract, shootAt, punch, screenToWorld,
    currentMission, currentStep, missionTarget, spawnPolice, spawnVex,
    enterCar, exitCar, nearestCar,
  };
}
