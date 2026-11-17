# Passability check

Proves that no obstacle, and no sequence of obstacles, is impossible to get through.

```bash
npm run verify
```

That is `node tools/verify/passability.mjs --seeds 200 --km 12` (about 2.5 minutes) and checks EASY mode.
`npm run verify:hard` (or `--mode hard`) checks HARD. Other options: `--seeds N`, `--from N` (first seed),
`--km N`, `--no-bots`, `--verbose`. Exit code 1 on any failure.

Each mode is held to its own stated contract (the `RULE` table at the top of the script):

| | grip the search may use | reaction | margin round the hull | sideways speed the ship may already have | narrowest opening |
|---|---|---|---|---|---|
| easy | 75% | 0.45 s | 0.3 m | any | 6.0 m |
| hard | 90% | 0.35 s | 0.2 m | up to 60% of its top | 5.0 m |

Hard asks more of the player and says so. In hard, a sweeping laser is treated as blocking its whole sweep, so
the proof never relies on timing. A laser fence that runs on from a cap through a bend is exempt from the
sight rule (the cap is the decision; the fence only asks that the chosen lane is held), and both bots drive
every one of them on the real physics.

What it checks on every seed, using the real `Track` and `Course`:

1. **Sight.** Every obstacle stands on a straight and is in plain sight (a straight line inside the
   station walls) for at least 1 s before the ship reaches it at top speed.
2. **Search.** An exhaustive search of the ship's sideways motion at the fastest speed it can ever
   have there (cruise + the biggest boost), using 75% of its lateral grip and its real travel-angle
   limit. For each group of obstacles, starting 0.45 s after it comes into sight: every state the
   ship could be in (any position across the corridor, any sideways speed) that was not already
   doomed by something it saw earlier must still have a collision-free way through, with 0.3 m to
   spare around the hull. The player's knowledge is limited to what is visible; no hindsight.
3. **Drive.** Two keyboard-limited bots (left / right / nothing, drift, brake, 0.22 s between
   deciding and doing, no knowledge of what they cannot see) drive the real physics: one flat out,
   one that never drifts. Neither may touch an obstacle.

The search is written from scratch in the script and shares no placement code with `Course.js`.

```bash
node tools/verify/passability.mjs --self-test
```

shoves every obstacle 45 m back toward the bend before it and expects the check to fail on every
seed. If that ever passes, the check has stopped checking.

When you change anything in `SHIP`, `DRIFT`, `FAIR` or `COURSE` (Constants.js), a mode's overrides
(core/Modes.js) or the designers (Course.js), run it again for both modes.
