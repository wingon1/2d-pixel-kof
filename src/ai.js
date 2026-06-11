// ── 3-tier CPU AI: reaction-delayed decision tree ────────────────────────
// The AI never cheats inputs: it emits the same command object a human
// controller produces, and perceives the opponent through a snapshot
// buffer delayed by its reaction time.

import { ATTACKS } from './character.js';
import { SUPER_COST } from './constants.js';

export const AI_LEVELS = {
  1: { // "Chibi AI" — wanders, mashes, barely blocks
    name: 'LV.1 CHIBI', delay: 30, blockChance: 0.08, blockAcc: 0.4,
    combo: 0, antiAir: 0, punish: 0, aggression: 0.35,
    attackRate: 0.03, jumpRate: 0.006, fireballRate: 0.004, superRate: 0.002,
    projReact: 0,
  },
  2: { // "Fighter AI" — solid arcade opponent
    name: 'LV.2 FIGHTER', delay: 15, blockChance: 0.5, blockAcc: 0.8,
    combo: 0.6, antiAir: 0.25, punish: 0.35, aggression: 0.6,
    attackRate: 0.07, jumpRate: 0.01, fireballRate: 0.01, superRate: 0.01,
    projReact: 0.4,
  },
  3: { // "Boss AI" — frame-reading menace
    name: 'LV.3 BOSS', delay: 5, blockChance: 0.8, blockAcc: 0.95,
    combo: 0.95, antiAir: 0.9, punish: 0.95, aggression: 0.85,
    attackRate: 0.18, jumpRate: 0.005, fireballRate: 0.02, superRate: 0.04,
    projReact: 0.8,
  },
};

function blankCmd() {
  return {
    left: false, right: false, up: false, down: false, upPressed: false,
    lp: false, hp: false, sp: false, lpHeld: false, hpHeld: false, spHeld: false,
  };
}

export function makeAIController(level) {
  const cfg = AI_LEVELS[level];
  const buf = [];                 // foe snapshots, one per tick
  let plan = { type: 'idle', dur: 20 };
  let comboStep = 0;
  let comboSeq = null;
  let blockTimer = 0;
  let blockLowWanted = false;
  let thinkCooldown = 0;

  function snapshot(foe, game) {
    buf.push({
      state: foe.state, attack: foe.attack, stateT: foe.stateT,
      x: foe.x, y: foe.y, airborne: foe.airborne, vy: foe.vy,
      hitConnected: foe.hitConnected,
    });
    if (buf.length > 64) buf.shift();
  }
  const delayed = () => buf[Math.max(0, buf.length - 1 - cfg.delay)] || buf[buf.length - 1];

  function pickPlan(self, foe, view, dist, rng) {
    // weighted intent selection by distance & aggression
    const r = rng();
    if (dist > 150) {
      if (r < cfg.fireballRate * 14) return { type: 'fireball', dur: 2 };
      if (r < 0.75) return { type: 'move', dir: 1, dur: 22 + (rng() * 20 | 0) };
      return { type: 'move', dir: -1, dur: 12 };
    }
    if (dist > 60) {
      if (r < cfg.jumpRate * 16 && cfg.combo > 0) return { type: 'jumpIn', dur: 2 };
      if (r < 0.7) return { type: 'move', dir: 1, dur: 14 + (rng() * 14 | 0) };
      if (r < 0.85) return { type: 'idle', dur: 10 };
      return { type: 'move', dir: -1, dur: 10 };
    }
    // close range
    if (r < cfg.attackRate * 8) {
      // choose a string
      if (cfg.combo > 0 && rng() < cfg.combo) {
        comboSeq = rng() < 0.3 ? ['clight', 'cheavy'] : ['light', 'heavy', 'special'];
      } else {
        comboSeq = [rng() < 0.5 ? 'light' : 'heavy'];
      }
      comboStep = 0;
      return { type: 'attack', dur: 45 };
    }
    if (r < cfg.attackRate * 8 + 0.18) return { type: 'move', dir: -1, dur: 10 };
    if (r < cfg.attackRate * 8 + 0.3 && level === 1) {
      return { type: 'move', dir: rng() < 0.5 ? 1 : -1, dur: 16 };
    }
    return { type: 'idle', dur: 6 + (rng() * 10 | 0) };
  }

  return {
    human: false,
    level,
    poll(game, self, foe) {
      const cmd = blankCmd();
      if (!game.roundActive) return cmd;
      snapshot(foe, game);
      const view = delayed();
      if (!view) return cmd;
      const rng = game.rng;
      const dist = Math.abs(foe.x - self.x);
      const toFoe = foe.x >= self.x ? 1 : -1;
      const fwd = (on) => { if (toFoe > 0) cmd.right = on; else cmd.left = on; };
      const back = (on) => { if (toFoe > 0) cmd.left = on; else cmd.right = on; };
      const press = (b) => { cmd[b] = true; cmd[b + 'Held'] = true; };

      // can't do anything while locked
      if (!self.canAct() && self.state !== 'attack' && self.state !== 'jump') {
        return cmd;
      }

      // ── reaction layer (interrupts plans) ──
      const foeAttacking = view.state === 'attack' && view.attack &&
        !ATTACKS[view.attack]?.projectile;
      const foeStartup = foeAttacking && view.stateT < (ATTACKS[view.attack].startup + ATTACKS[view.attack].active);

      // 1) Block incoming attacks
      if (blockTimer <= 0 && foeStartup && dist < 80 && self.canAct()) {
        if (rng() < cfg.blockChance) {
          const lvl = ATTACKS[view.attack].level;
          const correct = rng() < cfg.blockAcc;
          blockLowWanted = correct ? (lvl === 'low') : rng() < 0.5;
          blockTimer = 18 + cfg.delay;
        }
      }
      // 2) React to projectiles
      if (blockTimer <= 0 && cfg.projReact > 0 && self.canAct()) {
        // projectile owned by foe, ahead of us, flying toward us
        const proj = game.projectiles.find(p => p.owner !== self &&
          Math.abs(p.x - self.x) < 110 &&
          Math.sign(p.x - self.x) === toFoe && Math.sign(p.vx) === -toFoe);
        if (proj && rng() < cfg.projReact * 0.15) {
          if (rng() < 0.45) { plan = { type: 'jumpIn' }; }
          else { blockLowWanted = false; blockTimer = 24; }
        }
      }
      // 3) Anti-air: punish jumps (Boss specialty)
      if (cfg.antiAir > 0 && view.airborne && view.vy > -2 && dist < 85 &&
          self.canAct() && rng() < cfg.antiAir * 0.25) {
        press('hp');                       // upward-reaching heavy
        return cmd;
      }
      // 4) Whiff punish: foe stuck in recovery near us
      if (cfg.punish > 0 && foeAttacking && !view.hitConnected &&
          view.stateT >= (ATTACKS[view.attack].startup + ATTACKS[view.attack].active) &&
          dist < 62 && self.canAct() && rng() < cfg.punish * 0.8) {
        if (self.meter >= SUPER_COST && rng() < cfg.superRate * 25 + (level === 3 ? 0.7 : 0)) {
          press('hp'); press('sp');        // SUPER!
        } else {
          comboSeq = ['light', 'heavy', 'special'];
          comboStep = 0; plan = { type: 'attack' };
          press('lp');
        }
        return cmd;
      }

      // 5) Close-range pressure (L2/L3): open a chain on a passive foe
      if (cfg.combo > 0 && dist < 46 && self.canAct() && !foeStartup &&
          !view.airborne && rng() < cfg.attackRate * 1.6) {
        comboSeq = rng() < 0.3 ? ['clight', 'cheavy'] : ['light', 'heavy', 'special'];
        comboStep = 0; plan = { type: 'attack', dur: 45 };
        if (comboSeq[0] === 'clight') { cmd.down = true; press('lp'); }
        else press('lp');
        return cmd;
      }

      // ── blocking hold ──
      if (blockTimer > 0) {
        blockTimer--;
        back(true);
        cmd.down = blockLowWanted;
        return cmd;
      }

      // ── combo continuation (cancel timing) ──
      if (self.state === 'attack' && comboSeq && comboStep < comboSeq.length - 1) {
        if (self.hitConnected && self.cancelT > 0 && rng() < cfg.combo + 0.2) {
          comboStep++;
          const next = comboSeq[comboStep];
          if (next === 'heavy') press('hp');
          else if (next === 'cheavy') { cmd.down = true; press('hp'); }
          else if (next === 'special') {
            if (self.meter >= SUPER_COST && rng() < (level === 3 ? 0.8 : 0.25)) {
              press('hp'); press('sp');    // cancel into super
            } else press('sp');
          }
        }
        return cmd;
      }
      if (self.state === 'attack' || self.state === 'jump') {
        // jump-in attack timing
        if (self.state === 'jump' && plan.type === 'jumpIn' && self.vy > 0 &&
            Math.abs(foe.x - self.x) < 55 && !self.airAttacked) {
          press('lp');
        }
        return cmd;
      }

      // ── plan layer ──
      if (thinkCooldown > 0) thinkCooldown--;
      plan.dur = (plan.dur ?? 0) - 1;
      if (plan.dur <= 0 && thinkCooldown <= 0) {
        plan = pickPlan(self, foe, view, dist, rng);
        thinkCooldown = level === 1 ? 10 : 4;
      }

      switch (plan.type) {
        case 'move': {
          if (plan.dir > 0) fwd(true); else back(true);
          break;
        }
        case 'fireball': {
          press('sp'); plan = { type: 'idle', dur: 12 };
          break;
        }
        case 'jumpIn': {
          fwd(true); cmd.up = true; cmd.upPressed = true;
          plan = { type: 'idle', dur: 8 };
          break;
        }
        case 'attack': {
          if (dist > 42) { fwd(true); }
          else if (comboSeq) {
            const first = comboSeq[0];
            comboStep = 0;
            if (first === 'clight') { cmd.down = true; press('lp'); }
            else if (first === 'light') press('lp');
            else if (first === 'heavy') press('hp');
            plan = { type: 'idle', dur: 4 };
          }
          break;
        }
        default: break; // idle
      }

      // L1 wildcard mash
      if (level === 1 && self.canAct() && rng() < cfg.attackRate) {
        const r = rng();
        if (r < 0.45) press('lp');
        else if (r < 0.8) press('hp');
        else press('sp');
      }
      // random super when bar is full (low levels still get to be flashy)
      if (self.meter >= SUPER_COST && dist < 120 && rng() < cfg.superRate) {
        press('hp'); press('sp');
      }
      return cmd;
    },
  };
}
