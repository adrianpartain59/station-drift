# Passability check

Proves that no obstacle, and no sequence of obstacles, is impossible to get through.

```bash
npm run verify
```

That is `node tools/verify/passability.mjs --map classic --mode easy --seeds 200 --km 12` (about 2.5 minutes).
There are two maps and two modes, and a script for each pair:

| | CLASSIC map | SKYWAY map |
|---|---|---|
| EASY | `npm run verify` | `npm run verify:skyway` |
| HARD | `npm run verify:hard` | `npm run verify:skyway:hard` |

Options: `--map skyway|classic`, `--mode easy|hard`, `--seeds N`, `--from N` (first seed), `--km N`, `--no-bots`,
`--verbose`. Exit code 1 on any failure.

The game itself offers one of the four: HARD on SKYWAY. The page has no picker for the map or the mode, and no key
switches them. The other three are still built and still checked by these scripts. In the browser they are reached
with `?mode=easy` and `?map=classic` (either or both), for that page load only; the game is then named next to the
score and keeps its own best.

Each mode is held to its own stated contract (the `RULE` table at the top of the script):

| | steering the search may use | reaction | margin round the hull | state the ship may already be in | narrowest opening |
|---|---|---|---|---|---|
| easy (assisted handling) | 75% of lateral grip | 0.45 s | 0.3 m | any position, any sideways speed | 6.0 m |
| hard (manual handling) | 41% of the turn rate | 0.45 s | 0.2 m | any position, nose up to 13 degrees off the corridor either way | 5.0 m |

Hard asks more of the player and says so. In hard:
- a sweeping laser is treated as blocking its whole sweep, so the proof never relies on timing;
- a laser fence that runs on from a cap through a bend is exempt from the sight rule (the cap is the
  decision; the fence only asks that the open lane is held), and only ever shuts the inside lane, so a
  slide that runs wide runs away from it;
- obstacle hits are judged on the bot that drives on grip. The sliding bot's obstacle and wall hits are
  reported, not judged: hard's slide is meant to run wide, and a simple driver is not a fair judge of it.

`npm run fingerprint` checks that the CLASSIC map is still exactly the game it was, in both modes: EASY as it
was when HARD was split off, HARD as it was when the SKYWAY map was added (course layout and autopilot trace
hashed over six seeds, one hash per mode). Run it after any change to shared code.

## The SKYWAY map

SKYWAY's stations use the same rows, the same layout code and the same contract as CLASSIC. Its open air is
different in three ways, and the check is stricter for each:

- **Hills.** A crest hides what is beyond it. Sight is checked in 3D: the line from the pilot's eye (3 m above
  the road, the lower of the two cameras) to the obstacle (2 m above the road) has to clear the road by 0.25 m
  wherever it passes over it.
- **Sweepers.** Open-air obstacles stand on calm sweepers (radius 400 m or more), not dead straights. The
  search gives away the turning the sweeper itself needs: v^2 / R at the inside rail comes off the sideways
  acceleration it may use, in both directions, and time is counted at the inside rail's closing speed, the
  fastest there is. On a straight both corrections are exactly zero, which is why CLASSIC's numbers do not move.
- **Movers.** Everything in open air moves (rocks circling a beacon, drones sweeping a band, a turning bar of
  light, a hauler running up and down a lane). Each moves inside a fixed envelope painted on the deck. The
  layout, the bots and the search treat the whole envelope as solid, so the proof never relies on timing; and
  the check samples every mover's real motion for 45 s and fails if any part ever leaves its envelope.

- **Speed zones.** In HARD, SKYWAY's open air runs at twice the ships' speed (`SHIP.AIR_SPEED`, set per map and
  mode in `core/Maps.js`). The road brakes the ship over the last 198 m before a ship's mouth and launches it
  over the 170 m after the exit (`Track.F`, `Pace.airFactor`). Each group is searched at the top speed of the
  stretch it stands on, and neither sight nor room is counted from further back than the point where the ship
  is down to that speed. The bots are held to it as well: the check fails if either is ever more than 3% over
  the top speed the course is laid out for at that point (it prints the most they were). `--air N` tries
  another factor (`--air 1` is one speed everywhere); `?air=N` does the same in the game.

The self-test shoves station rows 45 m and movers 130 m (they stand with more room in hand, so 45 m does not
make them unfair), and on SKYWAY it only passes if the movers are caught on every seed in their own right.
Where open air runs faster than the ships the movers' shove grows by the same factor (260 m at 2x): the
same time on the road.

## The shape of the map

```bash
npm run mapcheck
```

is `node tools/verify/mapcheck.mjs --map skyway --seeds 300 --km 12`. It fails if:

- two different stretches of track come within 12 m of each other's footprint in plan (road and rails) without
  at least 18 m of height between their decks (a spiral passing under itself is the only thing that does);
- anything but a ship's own run-in and run-out is over, under or beside it (within 150 m of its axis, 60 m of its ends);
- a spiral is not what it says: whole turns, one steady slope;
- a bend's own inside edge has no real radius, or the heading strays more than 85 degrees from world forward
  outside a spiral (whole spiral turns aside);
- a slope is steeper than 13%, a crest is tighter than R 700 m or a dip tighter than R 420 m, the slope has a
  kink, a ramp starts or ends abruptly (the vertical curvature may not jump), or a station is not level.

It also reports what the map is made of: how much is open air, how wide, how much of that is a real bend, how
long the bends last at cruise speed, and how much of the bending is on a slope. `--map classic` reports the
same for the old map (which has no height, so only the overlap rule binds).

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

## How a slide feels (hard mode)

`npm run feel` is not a pass/fail check. It prints, for the slide as it stands:

- how sharp it is: how long one held key takes to turn the ship 45 and 90 degrees, with and without SPACE,
  and how far the ship slides out when SPACE goes down in the middle of a corner;
- what four scripted players do on every station bend of 40 seeds, by bend radius: one who holds everything,
  one who eases the arrow on and off like a person (hands 0.18 s behind eyes), one who presses SPACE late,
  and one who does not drift at all. For each: how many bends end clean, on the outside wall, or on the
  inside wall, how much of the corridor's width was used, and the boost banked.

`npm run feel:skyway` (`--map skyway`) runs the same players, plus one who takes the wide line (out, in to the
apex, out again), over every open-air bend of the SKYWAY map, by radius with the hairpins apart, and over its
ships' corners. It adds how long the slide was held, how many metres of the road's width were crossed and how
far the ship travelled sliding: what "wide and long" comes to in numbers.

Run it before and after changing the slide or steering numbers in `SHIP.MANUAL`. `NAME=value` shows a change
side by side; `--brief` with sets separated by `/` gives one line per set:

```bash
node tools/verify/feel.mjs SLIDE_WIND=0.9
node tools/verify/feel.mjs --brief SLIDE_WIND=0.9 / SLIDE_WIND=0.9 BITE_TIME=0.5
```

## Frame times

Open the game from the dev server with `?perf=<seconds>` (and `?bot&autostart&mute`) and it measures real
frame times for that long, then freezes and reports them: in the page title, in `window.__perf`, and in the dev
server's log (`[perf] ...`). The tab has to be in front: a hidden tab is throttled by the browser.

## The look

The game draws in black and one colour, picked afresh for each run (`src/systems/Look.js`: every number is in the
`LOOK` table at the top, the colours in `LOOKS`). `?look=<name>` holds one colour (`toxic`, `noir`, `blood`,
`violet`, `ice`, `teal`, `ember`, `rose`, `amber`, `acid`); `?look=classic` turns the whole thing off and draws
the game in full colour as before. It is drawing only: no tool here reads it, and the fingerprints do not move.
From the browser console, `__game.look.cfg` is the live `LOOK` table and `__game.look.pick('ice')` switches colour.

## The soundtrack

The track is `src/systems/Music.js`: every number that shapes it is in the tables at the top. To hear or measure
it without playing, open `/tools/audio/render.html` on the dev server. It renders the track offline through the
game's master chain, plays it, offers the WAV, and prints peak and RMS level. `?mode=idle|station|drive|tour`,
`&intensity=0..1`, `&bars=N`, `&off=drums,bass,pad,lead,arp,fx` to leave layers out (the pad alone is how the
chords were checked).

## Trying another speed

`?speed=2` in the game and `--speed 2` on `passability.mjs` and `feel.mjs` multiply everything measured in
metres per second (cruise, start speed, and the rates that go with them). It is a test hook: nothing is saved,
no best is kept, and the game's own numbers do not change. The course is laid out for whatever speed is live,
so the check still means what it says at any speed; expect far fewer obstacles at a higher one, because the
straights and calm sweepers do not get longer.

