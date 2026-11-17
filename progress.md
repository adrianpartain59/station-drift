# Progress — STATION DRIFT

## 2026-11-16
- Scaffolded Vite + three@0.183.0; wrote core (Constants/EventBus/GameState/Game), level (Track, WorldBuilder, Entities, Materials, Sky+Dust), gameplay (ShipPhysics, ShipModel, Autopilot), systems (CameraRig, Effects, Audio, Input), ui (HUD), index.html.
- Node fairness test (scratchpad tests/fair.mjs): autopilot finishes 3 km on seeds 3/11/42/77/1234; 0-3 crashes, 2-16 wall hits; no obstacle row ever fully blocked.
- Browser checks (Claude pane, frames stepped by hand): title, station interior, windows onto planets, station exit to open space, cockpit view, drift sparks/chain, game over, 4 restarts with no console errors and stable geometry count. ~120 fps at 800x600.
- `npm run build` passes.
- Not checked: real keyboard feel (needs Adrian), audio by ear, mobile/touch, gamepad.
