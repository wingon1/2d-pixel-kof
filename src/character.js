// ── Fighter: state machine, frame data, physics ──────────────────────────
import {
  FLOOR_Y, WALL_L, WALL_R, GRAVITY, WALK_SPEED, BACK_SPEED, JUMP_VY, JUMP_VX,
  MAX_HP, MAX_METER, SUPER_COST, LV_MID, LV_LOW, LV_HIGH, PUSH_W, PUSH_H, CROUCH_H,
} from './constants.js';

// Frame data. Poses are [startup, active, recovery]. Boxes are fighter-local,
// facing right, origin = feet center, y up = negative.
export const ATTACKS = {
  light: {
    startup: 4, active: 3, recovery: 8, dmg: 5, hitstun: 14, blockstun: 9,
    hitstop: 3, kbx: 1.3, level: LV_MID, sfx: 'light', shake: 0,
    pose: ['lightWind', 'lightHit', 'lightWind'],
    hitbox: { x: 8, y: -25, w: 15, h: 8 },
    cancels: ['heavy', 'special'], meter: [7, 3],
  },
  heavy: {
    startup: 8, active: 4, recovery: 15, dmg: 11, hitstun: 20, blockstun: 13,
    hitstop: 6, kbx: 2.6, level: LV_MID, sfx: 'heavy', shake: 4,
    pose: ['heavyWind', 'heavyHit', 'heavyWind'],
    hitbox: { x: 9, y: -33, w: 17, h: 14 },           // reaches up: anti-air capable
    cancels: ['special'], meter: [13, 6],
  },
  clight: {
    startup: 4, active: 3, recovery: 9, dmg: 4, hitstun: 14, blockstun: 10,
    hitstop: 3, kbx: 1.1, level: LV_LOW, sfx: 'light', shake: 0,
    pose: ['crouch', 'clightHit', 'crouch'], crouching: true,
    hitbox: { x: 8, y: -12, w: 14, h: 8 },
    cancels: ['cheavy', 'special'], meter: [7, 3],
  },
  cheavy: {
    startup: 9, active: 4, recovery: 18, dmg: 9, hitstun: 26, blockstun: 14,
    hitstop: 6, kbx: 2.0, level: LV_LOW, sfx: 'heavy', shake: 3, knockdown: true,
    pose: ['crouch', 'cheavyHit', 'cheavyHit'], crouching: true,
    hitbox: { x: 5, y: -7, w: 20, h: 7 },
    cancels: [], meter: [11, 5],
  },
  jatk: {
    startup: 5, active: 12, recovery: 4, dmg: 7, hitstun: 16, blockstun: 11,
    hitstop: 4, kbx: 1.4, level: LV_HIGH, sfx: 'light', shake: 2, air: true,
    pose: ['jumpUp', 'jatk', 'jatk'],
    hitbox: { x: 2, y: -22, w: 15, h: 14 },
    cancels: [], meter: [9, 4],
  },
  special: {
    startup: 12, active: 2, recovery: 18, projectile: 'small', sfx: 'special',
    pose: ['specialWind', 'specialHit', 'specialHit'],
    cancels: [], meter: [5, 0],
  },
  super: {
    startup: 12, active: 2, recovery: 26, projectile: 'super', sfx: 'super',
    pose: ['superPose', 'specialHit', 'specialHit'], invuln: 20,
    cancels: [], meter: [0, 0],
  },
};

export const PROJ = {
  small: {
    dmg: 8, hitstun: 18, blockstun: 12, hitstop: 4, kbx: 1.8, level: LV_MID,
    speed: 3.1, w: 12, h: 12, chip: 1, shake: 2, meter: [8, 4],
  },
  super: {
    dmg: 26, hitstun: 30, blockstun: 18, hitstop: 10, kbx: 3.4, level: LV_MID,
    speed: 2.4, w: 28, h: 28, chip: 5, shake: 7, knockdown: true, meter: [0, 6],
  },
};

const HURT_STAND = { x: -9, y: -42, w: 18, h: 42 };
const HURT_CROUCH = { x: -9, y: -30, w: 18, h: 30 };
const HURT_AIR = { x: -9, y: -38, w: 18, h: 32 };

let NEXT_ID = 1;

export class Character {
  constructor({ name, sprites, controller }) {
    this.id = NEXT_ID++;
    this.name = name;
    this.sprites = sprites;
    this.controller = controller;
    this.foe = null;
    this.resetRound(0, 1);
    // match stats
    this.stats = { damageDealt: 0, maxCombo: 0, perfects: 0, roundsWon: 0 };
  }

  resetRound(x, facing) {
    this.x = x; this.y = FLOOR_Y;
    this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.hp = MAX_HP;
    this.dispHp = MAX_HP;       // residual yellow bar
    this.residualDelay = 0;
    this.meter = this.meter ?? 0;
    this.state = 'idle';
    this.stateT = 0;
    this.t = 0;
    this.attack = null;
    this.hasHit = false;        // active hitbox consumed
    this.hitConnected = false;  // for cancels
    this.cancelT = 0;
    this.spawnedProj = false;
    this.projCd = 0;            // special (projectile) cooldown — no spamming
    this.airAttacked = false;
    this.knockdownPending = false;
    this.lastHitLow = false;
    this.flashT = 0;
    this.comboTaken = 0;        // hits taken in current combo
    this.cmd = null;
    this.tookDamageThisRound = false;
  }

  get airborne() { return this.y < FLOOR_Y - 0.01; }
  get crouching() {
    return this.state === 'crouch' ||
      (this.state === 'attack' && ATTACKS[this.attack]?.crouching) ||
      (this.state === 'blockstun' && this.blockLow);
  }
  get alive() { return this.hp > 0; }

  canAct() {
    return ['idle', 'walkF', 'walkB', 'crouch'].includes(this.state);
  }

  // Can this fighter block an incoming attack of `level` right now?
  blockCheck(level) {
    if (this.airborne) return false;
    const inBlockableState = this.canAct() || this.state === 'blockstun';
    if (!inBlockableState) return false;
    const c = this.cmd; if (!c) return false;
    const back = this.facing > 0 ? c.left : c.right;
    if (!back) return false;
    if (c.down) return level !== LV_HIGH;   // crouch-block: low + mid
    return level !== LV_LOW;                // stand-block: high + mid
  }

  invulnerable() {
    if (this.state === 'knockdown' || this.state === 'getup') return true;
    if (this.state === 'attack' && this.attack === 'super' &&
        this.stateT < ATTACKS.super.invuln) return true;
    return false;
  }

  // ── boxes (fighter-local, mirrored by collision.worldBox) ──────────────
  pushboxLocal() {
    const h = this.crouching ? CROUCH_H : PUSH_H;
    return { x: -PUSH_W / 2, y: -h, w: PUSH_W, h };
  }
  hurtboxLocal() {
    if (this.invulnerable()) return null;
    if (this.state === 'ko' || this.state === 'kotimer') return null;
    if (this.airborne) return HURT_AIR;
    if (this.crouching) return HURT_CROUCH;
    // extended hurtbox while attacking → whiffs are punishable
    if (this.state === 'attack' && this.attack && !ATTACKS[this.attack].projectile) {
      const hb = ATTACKS[this.attack].hitbox;
      return { x: -9, y: -42, w: 9 + Math.min(18, hb.x + hb.w - 4), h: 42 };
    }
    return HURT_STAND;
  }
  hitboxLocal() {
    if (this.state !== 'attack' || this.hasHit) return null;
    const a = ATTACKS[this.attack];
    if (!a || a.projectile) return null;
    const t = this.stateT;
    if (t >= a.startup && t < a.startup + a.active) return a.hitbox;
    return null;
  }
  attackPhase() {
    if (this.state !== 'attack') return null;
    const a = ATTACKS[this.attack];
    if (this.stateT < a.startup) return 0;
    if (this.stateT < a.startup + a.active) return 1;
    return 2;
  }

  // ── actions ────────────────────────────────────────────────────────────
  startAttack(key, game) {
    this.state = 'attack';
    this.attack = key;
    this.stateT = 0;
    this.hasHit = false;
    this.hitConnected = false;
    this.cancelT = 0;
    this.spawnedProj = false;
    this.vx = 0;
    if (key === 'super') {
      this.meter = 0;
      game.startSuperFlash(this);
    }
    if (key === 'jatk') this.airAttacked = true;
    game.audio.sfx(key === 'super' ? 'superGo' : 'whiff');
  }

  trySuper(c, game) {
    if (this.meter < SUPER_COST || this.airborne) return false;
    const punch = c.lp || c.hp || ((c.lpHeld || c.hpHeld) && c.sp);
    const combo = (c.sp && (c.lpHeld || c.hpHeld)) || ((c.lp || c.hp) && c.spHeld) || (c.sp && (c.lp || c.hp));
    if (!combo && !(punch && c.spHeld)) return false;
    this.startAttack('super', game);
    return true;
  }

  readAttackInput(c, game) {
    // super first (punch + special)
    if (this.trySuper(c, game)) return true;
    if (this.airborne) {
      if ((c.lp || c.hp) && !this.airAttacked && this.state !== 'attack') {
        this.startAttack('jatk', game); return true;
      }
      return false;
    }
    if (c.sp && this.projCd <= 0) { this.startAttack('special', game); return true; }
    const low = c.down;
    if (c.hp) { this.startAttack(low ? 'cheavy' : 'heavy', game); return true; }
    if (c.lp) { this.startAttack(low ? 'clight' : 'light', game); return true; }
    return false;
  }

  tryCancel(c, game) {
    if (this.state !== 'attack' || !this.hitConnected || this.cancelT <= 0) return false;
    const a = ATTACKS[this.attack];
    // super cancel from any connected normal
    if (!a.projectile && this.meter >= SUPER_COST && this.trySuper(c, game)) return true;
    for (const next of a.cancels) {
      const want =
        (next === 'heavy' && c.hp && !c.down) ||
        (next === 'cheavy' && c.hp && c.down) ||
        (next === 'special' && c.sp && this.projCd <= 0);
      if (want) { this.startAttack(next, game); return true; }
    }
    return false;
  }

  onConnect() {
    this.hasHit = true;
    this.hitConnected = true;
    this.cancelT = 12;
  }

  // ── per-tick update ────────────────────────────────────────────────────
  update(game) {
    this.t++;
    if (this.flashT > 0) this.flashT--;
    if (this.cancelT > 0) this.cancelT--;
    if (this.projCd > 0) this.projCd--;

    // residual health bar catches up after a short delay
    if (this.residualDelay > 0) this.residualDelay--;
    else if (this.dispHp > this.hp) this.dispHp = Math.max(this.hp, this.dispHp - 0.6);

    const c = this.controller.poll(game, this, this.foe);
    this.cmd = c;

    // face the opponent whenever free on the ground
    if (!this.airborne && this.canAct() && this.foe) {
      this.facing = this.foe.x >= this.x ? 1 : -1;
    }

    this.stateT++;

    switch (this.state) {
      case 'idle': case 'walkF': case 'walkB': case 'crouch': {
        if (!game.roundActive) { this.vx = 0; this.toIdle(); break; }
        if (this.readAttackInput(c, game)) break;
        if (c.down) {
          this.state = 'crouch'; this.vx = 0;
        } else if (c.upPressed || (c.up && this.stateT < 2)) {
          // jump (straight / forward / back)
          this.vy = JUMP_VY;
          this.vx = c.right ? JUMP_VX : c.left ? -JUMP_VX : 0;
          this.y -= 0.1;
          this.state = 'jump'; this.stateT = 0;
          this.airAttacked = false;
          game.audio.sfx('jump');
        } else if (c.left || c.right) {
          const dir = c.right ? 1 : -1;
          const fwd = dir === this.facing;
          this.vx = dir * (fwd ? WALK_SPEED : BACK_SPEED);
          this.state = fwd ? 'walkF' : 'walkB';
        } else {
          this.vx = 0;
          if (this.state !== 'idle') { this.state = 'idle'; this.stateT = 0; }
        }
        break;
      }
      case 'jump': {
        if (game.roundActive) this.readAttackInput(c, game);
        break;
      }
      case 'attack': {
        const a = ATTACKS[this.attack];
        if (a.air) {
          // air attack rides jump physics; ends on landing (handled below)
          if (this.stateT >= a.startup + a.active + a.recovery) {
            this.state = 'jump';
          }
        } else {
          if (this.tryCancel(c, game)) break;
          // small forward step on heavy
          if (this.attack === 'heavy' && this.attackPhase() === 1 && this.stateT === a.startup) {
            this.x += this.facing * 4;
          }
          // spawn projectile at first active frame
          if (a.projectile && !this.spawnedProj && this.stateT >= a.startup) {
            this.spawnedProj = true;
            game.spawnProjectile(this, a.projectile);
          }
          if (this.stateT >= a.startup + a.active + a.recovery) {
            this.attack = null;
            this.toIdle();
          }
        }
        break;
      }
      case 'hitstun': {
        this.vx *= 0.86;
        if (this.stateT >= this.stunT) {
          if (this.airborne) { /* falls until landing -> knockdown */ }
          else if (this.knockdownPending) this.enterKnockdown();
          else this.toIdle();
        }
        break;
      }
      case 'blockstun': {
        this.vx *= 0.82;
        if (this.stateT >= this.stunT) this.toIdle();
        break;
      }
      case 'knockdown': {
        this.vx *= 0.8;
        if (this.stateT >= 34) { this.state = 'getup'; this.stateT = 0; }
        break;
      }
      case 'getup': {
        if (this.stateT >= 14) this.toIdle();
        break;
      }
      default: break; // ko, victory: static
    }

    // ── physics ──
    if (this.state === 'victory') this.vx = 0;
    if (this.state === 'ko' && !this.airborne) this.vx *= 0.8;
    this.x += this.vx;
    if (this.airborne || this.vy < 0) {
      this.vy += GRAVITY;
      this.y += this.vy;
      if (this.y >= FLOOR_Y) {
        this.y = FLOOR_Y; this.vy = 0;
        if (this.state === 'jump') { this.toIdle(); game.audio.sfx('land'); }
        else if (this.state === 'attack' && ATTACKS[this.attack]?.air) {
          this.attack = null; this.toIdle(); game.audio.sfx('land');
        } else if (this.state === 'hitstun') {
          if (this.knockdownPending) this.enterKnockdown();
          else this.toIdle();
        } else if (this.state === 'ko') {
          game.audio.sfx('thud');
        }
      }
    }
    this.x = Math.max(WALL_L + PUSH_W / 2, Math.min(WALL_R - PUSH_W / 2, this.x));
  }

  toIdle() {
    this.state = 'idle'; this.stateT = 0; this.knockdownPending = false;
  }
  enterKnockdown() {
    this.state = 'knockdown'; this.stateT = 0; this.vx = 0;
    this.knockdownPending = false;
  }

  // ── damage intake; returns damage actually dealt ───────────────────────
  takeHit(data, { blocked, scale, attackerFacing }) {
    const kb = data.kbx * attackerFacing;
    if (blocked) {
      const chip = data.chip || 0;
      this.hp = Math.max(1, this.hp - chip);   // chip damage never KOs
      if (chip > 0) { this.residualDelay = 30; this.tookDamageThisRound = true; }
      this.blockLow = this.cmd?.down ?? false;
      this.state = 'blockstun'; this.stateT = 0;
      this.stunT = data.blockstun;
      this.vx = kb * 0.8;
      this.meter = Math.min(MAX_METER, this.meter + (data.meter?.[1] ?? 3) * 0.5);
      return chip;
    }
    const dmg = Math.max(1, Math.round(data.dmg * scale));
    this.hp = Math.max(0, this.hp - dmg);
    this.tookDamageThisRound = true;
    this.residualDelay = 36;
    this.flashT = 4;
    this.lastHitLow = data.level === LV_LOW;
    this.meter = Math.min(MAX_METER, this.meter + (data.meter?.[1] ?? 4));
    this.comboTaken++;
    // interrupt whatever we were doing
    this.attack = null;
    if (this.hp <= 0) {
      this.state = 'ko'; this.stateT = 0;
      this.vx = kb * 1.4; this.vy = -4.2;
      this.y -= 0.2;
      return dmg;
    }
    if (data.knockdown || this.airborne) {
      this.knockdownPending = true;
      this.state = 'hitstun'; this.stateT = 0;
      this.stunT = data.hitstun;
      this.vx = kb * 1.2; this.vy = -3.4; this.y -= 0.2;
    } else {
      this.state = 'hitstun'; this.stateT = 0;
      this.stunT = data.hitstun;
      this.vx = kb;
    }
    return dmg;
  }

  // ── animation pose selection ───────────────────────────────────────────
  getPose() {
    const s = this.state;
    if (s === 'idle') return ['idle0', 'idle1', 'idle2', 'idle3'][(this.t >> 4) & 3];
    if (s === 'walkF') return 'walk' + ((this.t >> 3) & 3);
    if (s === 'walkB') return 'walk' + (3 - ((this.t >> 3) & 3));
    if (s === 'crouch') return 'crouch';
    if (s === 'jump') return this.vy < 1 ? 'jumpUp' : 'jumpFall';
    if (s === 'attack') {
      const a = ATTACKS[this.attack];
      return a ? a.pose[this.attackPhase()] : 'idle0';
    }
    if (s === 'hitstun') return this.lastHitLow ? 'hitLo' : 'hitHi';
    if (s === 'blockstun') return this.blockLow ? 'blockLo' : 'blockHi';
    if (s === 'knockdown') return this.stateT < 26 ? 'knockdown' : 'getup';
    if (s === 'getup') return 'getup';
    if (s === 'ko') return this.airborne ? 'hitHi' : 'ko';
    if (s === 'victory') return ['victory0', 'victory1'][(this.t >> 4) & 1];
    return 'idle0';
  }
}
