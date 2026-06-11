# CHIBI CLASH 🕹️

A complete 2D pixel-art real-time fighting game in the browser. KOF-style mechanics, cute retro
aesthetic. **Zero external assets** — every sprite, background, effect, and sound is generated
procedurally at runtime (Canvas pixel baking + Web Audio synthesis).

## Run

```bash
npm i && npm run dev
```

Open the printed URL (default http://localhost:5173).

## Modes

- **Single Player (vs CPU)** — pick AI difficulty Lv.1 Chibi / Lv.2 Fighter / Lv.3 Boss
- **Local 2-Player** — shared keyboard

## Controls

|              | Player 1 | Player 2        |
|--------------|----------|-----------------|
| Move         | A / D    | ← / →           |
| Jump         | W        | ↑               |
| Crouch/Block | S        | ↓               |
| Light Punch  | J        | Numpad 1 (or ,) |
| Heavy Punch  | K        | Numpad 2 (or .) |
| Special      | L        | Numpad 3 (or /) |
| **Super**    | K + L    | NP2 + NP3       |

Block by holding **back**; block lows with **down-back**. Jump-ins must be blocked standing.
On hit, cancel Light → Heavy → Special. Land hits to fill the power bar — when it reads
**SUPER OK!**, press Punch + Special for a screen-dimming super.

ESC pauses, M mutes. Best of 3 rounds, 99-second timer, match stats at the end.

## Architecture

```
src/
  main.js        fixed-timestep 60fps core loop, app states
  input.js       multi-key edge-latched keyboard state
  ai.js          3-tier reaction-delayed decision-tree CPU
  character.js   fighter state machine, frame data, physics
  collision.js   AABB pushbox/hurtbox/hitbox intersection
  game.js        match flow, hit resolution, hitstop, projectiles
  renderer.js    integer-scaled crisp pixel rendering
  sprites.js     procedural sprite-sheet baker (chibi fighters)
  background.js  parallax arena + beat-synced pixel crowd
  effects.js     pooled particles (hit sparks, KO rays, dust)
  hud.js         health/meter bars, timer, combo popups
  audio.js       chiptune tracker + synthesized SFX (Web Audio)
  font.js        3x5 procedural pixel font
  menu.js        title / mode / difficulty / char select / results
  constants.js   global tuning
```
