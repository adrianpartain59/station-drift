# STATION DRIFT — task plan

## Goal
A fast, procedurally generated space runner (three.js) where drifting a ship through space-station
corridors is the core mechanic. Underground street-drift culture, moved from Tokyo nights to orbit.

Must have (from Adrian, 2026-11-16):
- Starts entering a station; stations alternate with open-space stretches between them
- Windows in stations show space; always near a planet/star (or several); visible space dust
- Third person + switchable first person (inside the ship)
- Drifting is THE mechanic (ship-themed, feels like car drifting)
- Coins, a variety of obstacles, a boost mechanic
- Scenic, detailed environment; looks like its own thing, not Star Wars

## Current Phase
Phase 6 (complete) — awaiting Adrian's playtest

## Phases
### Phase 1: Scaffold
- Status: complete — Vite + three@0.183.0 in ~/LocalStorage/Dev/StationDrift

### Phase 2: Core loop + track generator + drift physics
- Status: complete

### Phase 3: World art (station corridors, hull, windows, space lane, sky, planets, dust)
- Status: complete

### Phase 4: Obstacles, coins, boost pads, scoring, HUD, cameras
- Status: complete

### Phase 5: Procedural audio + game feel
- Status: complete

### Phase 6: Playtest in browser, fix, build
- Status: complete

### Phase 7: Drift rework after Adrian's playtest (2026-11-16)
- Status: complete — held drift = fixed-radius arc (R 30/55/115 by steer), nose locked at 22-39 deg slip, straighten on release, charge by hold time, floor aim line + camera look into the arc

### Phase 8: Hop replaces manual boost (2026-11-16)
- Status: complete — W/up = hop (tap short, hold full), costs 1/3 thrust; obstacles have heights (green = hoppable); tripwire + overhead girder added; spinner arm 3.6 m short of walls; starlight off indoors (glare fix)

## Next Step
Adrian plays the hop; tune HOP.* and obstacle weights from his notes.

## Decisions Made
| Decision | Why |
|---|---|
| three.js + Vite, not the BLUESHIFT engine | Adrian wants a scenic, lit, detailed 3D environment; the BLUESHIFT engine is a neon line renderer |
| Ship physics in the track's local frame (s, x, facing ψ, travel φ) | Exact corridor collision and curvature-driven drift; corners tighter than the steer rate can follow force a drift |
| Track heading clamped to ±55° of world forward | A procedural path that can't loop back into itself |
| Bloom on, with a quality toggle | The neon look needs it; the skill says off by default, but this is the look Adrian asked for |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| Drift charge never built (tier stuck at -1) | 1 | Code read DRIFT.MIN_SLIP; constant lived at SHIP.DRIFT_MIN_SLIP, so the check compared to undefined. Moved to DRIFT.MIN_SLIP |
| Overblown bloom, white glare | 1-3 | Bloom threshold 1.0, strength 0.5; neon x2; removed ship headlight (floor specular hotspot); thinner trails |
| Exterior window band visible through glass from inside | 1 | Exterior neon is front-facing and wound outward (neonOut) |
| Holding drift spun the ship (72 deg nose in 0.5 s, wall before SPARK) | 1 | Drift was a yaw RATE; replaced with a held arc radius + fixed slip angle |
| White glare in corridors | 3 | Not the laser or camera-near-lights: the sun DirectionalLight lit enclosed corridors (no shadows) -> floor specular hot spot. Found by hiding objects one by one and reading pixels; fixed by fading the sun indoors |
| Hidden browser pane pauses rAF and shows stale frames | 1 | window.__step(n, dt) runs fixed frames; ?jump=&cam= params; fresh navigation per screenshot |
