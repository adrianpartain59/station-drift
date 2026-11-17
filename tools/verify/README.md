# Passability check

Proves that no obstacle, and no sequence of obstacles, is impossible to get through.

```bash
npm run verify
```

That is `node tools/verify/passability.mjs --seeds 200 --km 12` (about 2.5 minutes). Options:
`--seeds N`, `--from N` (first seed), `--km N`, `--no-bots`, `--verbose`. Exit code 1 on any failure.

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

When you change anything in `SHIP`, `DRIFT`, `MAX_BOOST_GAIN` (Constants.js) or `FAIR` / the
designers (Course.js), run it again.
