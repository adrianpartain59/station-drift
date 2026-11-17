# STATION DRIFT: movement + obstacle redesign

Branch `movement-redesign` (baseline `main` @ db2593e). Started 2026-11-16.

## Goal
Rebuild from scratch how the ship plays (model, handling, speed, drift, camera feel, scoring,
pickups, HUD, sounds) and the obstacles (what they are, how they look, placement and sequencing).
Keep the map and scenery exactly as they are (Track centreline/sections, WorldBuilder, Sky, Materials).

Adrian's words: "an easy and fun drifting mechanic based on drifting mechanics from other games
that should feel like a car drifting game." Easy and intuitive, still hard enough not to get boring.
Old version: movement "extremely hard", "cheap and annoying"; obstacles sequenced so they were
"impossible to get through".

Done means:
- Plays in Adrian's Chrome: easy, intuitive, fun, difficulty builds. Both camera views kept.
- No obstacle or obstacle sequence is ever impossible at the speed the game asks for,
  proved by an automated check across many seeds.
- `npm run build` passes, no console errors.

## Current Phase
Phase 2

## Phases
### Phase 1: Read the codebase, research drift games, write the design
- Status: complete (design in findings.md)

### Phase 2: Headless core (no three.js): Constants, Track trim, Course, ShipPhysics, Autopilot
- Status: in_progress

### Phase 3: Verification tooling (tools/verify): reachability proof + sight lines + bot runs, many seeds
- Status: pending

### Phase 4: Browser layer: ShipModel, CourseView, CameraRig, Effects, Audio, Input, HUD, Game wiring
- Status: pending

### Phase 5: Browser playtest (stepped frames), tune, `npm run build`, console clean
- Status: pending

### Phase 6: Commit, push branch, open in Adrian's Chrome, hand-over note
- Status: pending

## Next Step
Write src/core/Constants.js gameplay blocks, trim Track.js to centreline + piece records, then Course.js.

## Decisions Made
| Decision | Why |
|---|---|
| Speed cut from 66-128 m/s to ~38-54 m/s cruise | Map corners are car-scale (R 30-72 m, 15-21 m wide). At the old speed a corner lasted under a second; a drift needs 1-3 s to be felt and steered |
| Drift = hold SPACE: ship follows the bend by itself, steer only shifts your line; release = boost | Mario Kart / OutRun 2 lesson: direction lock, no spin-outs, road-following assist, reward on exit |
| Grip steering is lateral-acceleration limited (gets wider with speed) | Car intuition: too fast for a corner means run wide, so brake or drift. Early corners can be steered, later ones need the drift |
| No hull, no hop. Run ends when the checkpoint clock runs out | Walls and obstacles cost speed and combo, never instant death; the clock makes drifting well (boosts) the way to survive |
| All obstacles are static footprints (boxes and posts) placed around a designed safe line | Passability is geometric, so it can be proved; no timing obstacles (doors, sweeping lasers, spinners) |
| Gameplay placement moved out of Track.js into src/gameplay/Course.js with its own RNG | Centreline stays a pure function of the seed; map generator untouched |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
