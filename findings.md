# Findings — STATION DRIFT

- Drift is emergent from the physics: at speed, corners with radius under ~v/1.55 m can't be followed with grip steering, so drifting is required, not cosmetic.
- Bloom needs threshold >= 1.0 with HDR neon (MeshBasicMaterial color x2-4); lower thresholds turn every lit wall white.
- A hidden Claude browser pane stops requestAnimationFrame and keeps presenting the last frame; drive frames manually (window.__step) for checks.
- three r183: THREE.Clock is deprecated, use THREE.Timer; IcosahedronGeometry is already non-indexed.
