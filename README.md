# SOLAR BAY — open-world crime

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/h05meigames2/gta6-01-solar-bay-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/h05meigames2/gta6-01-solar-bay-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLAR BAY is an original open-world crime game built for make.fun's "Make GTA 6" bounty ($1,666 in USDC). A sun-soaked bay city to explore on foot and by car: steal cars, outrun the police across 5 wanted levels, run 3 story missions for Mara, fight the Vex crew at the docks, with traffic, pedestrians, a day/night cycle, procedural sound, a HUD with minimap, and a local save. No Rockstar / GTA names, characters, art or music — everything here is original.

## The city

Solar Bay is a seeded 3200×2560 open world: a road grid with towers, shops and houses, parks, parking lots, a beach and a bay with a wooden pier. Landmarks: Mara's Garage, Kios Pelabuhan, Solar Mall Lot (home of the yellow Comet GT), Klinik Teluk, Dermaga Vex and a hideout.

## Story — 3 missions

1. **Paket Pertama** — pick up a parcel at Kios Pelabuhan and deliver it to Mara's Garage (+$300).
2. **Mobil Pesanan** — steal the yellow Comet GT from Solar Mall and bring it to the garage (+$600).
3. **Dermaga Vex** — clear 4 Vex crew members off the docks (+$900). Finish all three and the city is yours — free roam.

## Systems

- **On foot & driving** — walk, sprint, steal any parked or traffic car (E), drive with acceleration, steering and collisions.
- **Traffic & pedestrians** — cars follow the road grid and turn at intersections; pedestrians stroll the sidewalks and flee gunfire.
- **Wanted & police** — stealing, assault and destroying police cars raise your wanted level (1–5 stars); police cars spawn, chase and ram you. Lay low to cool off; get caught on foot and you're busted.
- **Combat** — punch (Space/F) and shoot (mouse click). Enemies have health bars and drop cash.
- **HUD & minimap** — cash, wanted stars, health, speed, mission objective, live minimap with police blips and the mission marker.
- **Save** — progress autosaves to localStorage; continue from the title screen (N starts fresh).
- **Sound** — fully procedural WebAudio: engine hum, police siren, gunshots, pickups, mission jingles and a slow synth pad. No audio files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — or serve `game/` with any static server and open `game/index.html`. No build step, no network requests.

## Controls

WASD / arrows — move or drive · E — steal / exit car · Space/F — punch · Click — shoot · H — horn · M — mission brief · P — pause · R — restart

---

<sub>Entered on [make.fun](https://make.fun/?ref=77v1ce78&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
