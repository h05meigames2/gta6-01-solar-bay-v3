// SOLAR BAY city layout: a fixed seeded grid of roads, blocks, buildings,
// parks, parking lots and named landmarks. Everything is generated from one
// seed so the map is identical on every load.

import { makeRng, clamp } from './rng.js';

export const WORLD_W = 3200;
export const WORLD_H = 2560;
export const ROAD_W = 72;
export const BEACH_Y = 2340;   // sand starts here
export const WATER_Y = 2440;   // bay water starts here

const PALETTES = {
  tower: ['#7d8aa0', '#6b7c94', '#8a94a6', '#5f7089'],
  shop: ['#c98a4b', '#b5763f', '#a8645a', '#7a9b6d'],
  house: ['#d9a066', '#c98f7a', '#b8a06a', '#9db08a'],
  roof: ['#4a5568', '#5d4a3a', '#374151', '#6b4a3a'],
};

export function buildWorld(seed = 20261117) {
  const rng = makeRng(seed);
  const roadsV = [];
  for (let x = 200; x <= 2900; x += 300) roadsV.push(x);
  const roadsH = [];
  for (let y = 200; y <= 2300; y += 300) roadsH.push(y);

  const buildings = [];
  const trees = [];
  const parks = [];
  const lots = [];

  function addBuilding(bx, by, bw, bh, kind) {
    const palette = PALETTES[kind] || PALETTES.house;
    buildings.push({
      x: bx, y: by, w: bw, h: bh,
      color: rng.pick(palette),
      roof: rng.pick(PALETTES.roof),
      tall: kind === 'tower' ? rng.range(14, 26) : rng.range(4, 10),
      kind,
    });
  }

  // Blocks sit between neighbouring roads; each block gets buildings, a park,
  // a parking lot, or stays an open plaza.
  for (let i = 0; i < roadsV.length - 1; i++) {
    for (let j = 0; j < roadsH.length - 1; j++) {
      const bx0 = roadsV[i] + ROAD_W / 2 + 14;
      const by0 = roadsH[j] + ROAD_W / 2 + 14;
      const bx1 = roadsV[i + 1] - ROAD_W / 2 - 14;
      const by1 = roadsH[j] + 300 - ROAD_W / 2 - 14;
      const bw = bx1 - bx0, bh = by1 - by0;
      const roll = rng.next();
      if (roll < 0.16) {
        // Park: grass + scattered trees.
        parks.push({ x: bx0, y: by0, w: bw, h: bh });
        const n = rng.int(6, 11);
        for (let t = 0; t < n; t++) {
          trees.push({ x: bx0 + rng.range(16, bw - 16), y: by0 + rng.range(16, bh - 16), r: rng.range(9, 15) });
        }
      } else if (roll < 0.26) {
        // Parking lot: flat asphalt with painted bays.
        lots.push({ x: bx0, y: by0, w: bw, h: bh });
      } else {
        // Buildings: one big tower, or a row of shops / houses.
        if (rng.chance(0.3)) {
          addBuilding(bx0 + 14, by0 + 14, bw - 28, bh - 28, 'tower');
        } else {
          const vertical = rng.chance(0.5);
          if (vertical) {
            const n = rng.int(2, 3);
            for (let k = 0; k < n; k++) {
              const w2 = bw / n - 12;
              addBuilding(bx0 + k * (bw / n) + 6, by0 + 10, w2, bh - 20, rng.pick(['shop', 'house']));
            }
          } else {
            const n = rng.int(2, 3);
            for (let k = 0; k < n; k++) {
              const h2 = bh / n - 12;
              addBuilding(bx0 + 10, by0 + k * (bh / n) + 6, bw - 20, h2, rng.pick(['shop', 'house']));
            }
          }
        }
      }
    }
  }

  // Named landmarks (story places). Kept clear of random buildings by
  // carving them out of the block they sit in is overkill: they sit on
  // plazas at fixed spots the generator leaves open (road corners).
  const landmarks = {
    garage: { name: "Mara's Garage", x: 500, y: 500, label: 'GARAGE' },
    kiosk: { name: 'Kios Pelabuhan', x: 1500, y: 2260, label: 'KIOSK' },
    mallLot: { name: 'Solar Mall Lot', x: 2600, y: 500, label: 'MALL' },
    clinic: { name: 'Klinik Teluk', x: 500, y: 2000, label: 'CLINIC' },
    docks: { name: 'Dermaga Vex', x: 1500, y: 2400, label: 'DOCKS' },
    hideout: { name: 'Hideout', x: 2900, y: 2000, label: 'HIDEOUT' },
  };

  // Pier: a wooden walkway from the beach into the bay.
  const pier = { x: 1470, y: BEACH_Y, w: 60, h: WATER_Y - BEACH_Y + 70 };

  function onRoad(x, y) {
    for (const rx of roadsV) if (Math.abs(x - rx) < ROAD_W / 2) return true;
    for (const ry of roadsH) if (Math.abs(y - ry) < ROAD_W / 2) return true;
    return false;
  }
  function inWater(x, y) {
    if (y < WATER_Y) return false;
    // The pier is walkable.
    if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
    return true;
  }
  function hitsBuilding(x, y, r) {
    for (const b of buildings) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return b;
    }
    return null;
  }
  function resolveCircle(x, y, r) {
    // Push a circle out of buildings and water; returns corrected position.
    let nx = x, ny = y;
    for (let pass = 0; pass < 2; pass++) {
      const b = hitsBuilding(nx, ny, r);
      if (b) {
        const cx = clamp(nx, b.x, b.x + b.w);
        const cy = clamp(ny, b.y, b.y + b.h);
        let dx = nx - cx, dy = ny - cy;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < 0.001) { dx = 0; dy = -1; }
        else { dx /= d; dy /= d; }
        nx = cx + dx * (r + 0.5);
        ny = cy + dy * (r + 0.5);
      }
      if (inWater(nx, ny)) {
        ny = WATER_Y - r - 1;
      }
      nx = clamp(nx, r, WORLD_W - r);
      ny = clamp(ny, r, WORLD_H - r);
    }
    return { x: nx, y: ny };
  }
  function nearestRoadPoint(x, y) {
    let best = null, bestD = Infinity;
    for (const rx of roadsV) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 200, 2300) }; }
    }
    for (const ry of roadsH) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { x: clamp(x, 200, 2900), y: ry }; }
    }
    return best;
  }

  return {
    W: WORLD_W, H: WORLD_H, roadsV, roadsH, buildings, trees, parks, lots,
    landmarks, pier, onRoad, inWater, hitsBuilding, resolveCircle, nearestRoadPoint,
  };
}
