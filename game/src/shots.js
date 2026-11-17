// Screenshot scene staging for SOLAR BAY: each named scene puts the game
// into a state that shows several systems at once (chase + wanted +
// minimap + mission, driving in traffic, combat at the docks, title).
// Used by ?shot=<name> and by the headless screenshot script.

export function stageScene(game, name) {
  const G = game.G;
  const world = G.world;
  const p = G.player;

  function putPlayerInCarAt(x, y, model) {
    let car = null;
    for (const c of G.cars) {
      if (c.model === model && !c.police && !c.wrecked) { car = c; break; }
    }
    if (!car) return null;
    car.x = x; car.y = y;
    car.angle = 0;
    car.speed = 0;
    p.x = x; p.y = y; p.angle = 0;
    game.enterCar(car);
    return car;
  }

  function centreCamera() {
    G.camera.x = Math.max(0, Math.min(world.W - 1280, p.x - 640));
    G.camera.y = Math.max(0, Math.min(world.H - 720, p.y - 360));
  }

  if (name === 'start') {
    // Title screen over the city: golden hour, camera over downtown.
    G.clock = 0.4;
    G.camera.x = 900;
    G.camera.y = 700;
    return;
  }

  game.startNewGame();

  if (name === 'drive') {
    G.clock = 0.42;
    const car = putPlayerInCarAt(1200, 500, 'sport');
    if (car) car.speed = 320;
    G.keys['KeyW'] = true;
    // A few extra cars ahead on the same avenue.
    for (const c of G.cars) {
      if (c.traffic && Math.abs(c.y - 500) < 60 && c.x > 1200 && c.x < 1900) c.speed = 150;
    }
    centreCamera();
  } else if (name === 'chase') {
    G.clock = 0.38;
    G.missionIdx = 1;
    G.missionStep = 1;
    // On the east-west avenue (y=800) so the chase runs down a real road.
    const car = putPlayerInCarAt(1400, 800, 'comet');
    if (car) car.speed = 380;
    G.keys['KeyW'] = true;
    G.wanted = 3;
    G.crimeTimer = 0;
    G.audio.startSiren();
    game.spawnPolice(4);
    // Police close behind, mid-chase.
    G.police.forEach((cop, i) => {
      cop.x = 1400 - 180 - i * 90;
      cop.y = 800 + (i % 2 === 0 ? -40 : 40);
      cop.angle = 0;
      cop.speed = 420;
    });
    centreCamera();
  } else if (name === 'combat') {
    G.clock = 0.6;
    G.missionIdx = 2;
    G.missionStep = 1;
    p.x = 1420; p.y = 2320;
    p.angle = Math.PI / 2;
    p.onFoot = true;
    p.car = null;
    game.spawnVex(4);
    G.enemies.forEach((e, i) => {
      e.x = 1500 + (i - 1.5) * 70;
      e.y = 2400 + (i % 2) * 30;
    });
    G.wanted = 2;
    G.crimeTimer = 0;
    G.audio.startSiren();
    game.spawnPolice(1);
    centreCamera();
  }
  // Clean frame for the screenshot: no startup toasts, no controls hint.
  G.toasts.length = 0;
  G.time = 30;
}
