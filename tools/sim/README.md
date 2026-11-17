# Node simulations (pre-redesign physics)

Run from the project root, e.g. `node tools/sim/fair2.mjs "$PWD" 3000`.

- `fair2.mjs`: autopilot drives 3 km on five seeds; reports crashes, hops, what it hit.
- `corner.mjs`: held drifts through 25 real station corners in three steering styles.
- `hold.mjs`: what holding drift + a steer key does to heading over 1.25 s.
