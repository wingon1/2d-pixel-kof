// ── Match controller: rounds, hit resolution, hitstop, projectiles ───────
import {
  VIEW_W, FLOOR_Y, WALL_L, WALL_R, ROUND_TIME, ROUNDS_TO_WIN,
  PUSH_W, comboScale,
} from './constants.js';
import { Character, ATTACKS, PROJ } from './character.js';
import { aabb, worldBox, overlapX } from './collision.js';
import { bakeFighter, bakeProjectile } from './sprites.js';
import { Background } from './background.js';
import { Effects } from './effects.js';
import { drawHUD } from './hud.js';
import { drawTextShadow } from './font.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const S1 = {}, S2 = {}, S3 = {}, S4 = {}; // scratch boxes (zero-GC)

export class Game {
  constructor({ p1, p2, audio, onMatchEnd }) {
    // p1/p2: { name, pal, controller }
    this.audio = audio;
    this.onMatchEnd = onMatchEnd;
    this.rng = mulberry32((Date.now() & 0xffffff) ^ 0x9e37);

    const f1 = new Character({ name: p1.name, sprites: bakeFighter(p1.pal), controller: p1.controller });
    const f2 = new Character({ name: p2.name, sprites: bakeFighter(p2.pal), controller: p2.controller });
    f1.foe = f2; f2.foe = f1;
    f1.meter = 0; f2.meter = 0;
    this.fighters = [f1, f2];
    this.projSprites = [
      { small: bakeProjectile(p1.pal, false), super: bakeProjectile(p1.pal, true) },
      { small: bakeProjectile(p2.pal, false), super: bakeProjectile(p2.pal, true) },
    ];

    this.bg = new Background();
    this.audio.onBeat(() => this.bg.beat());
    this.fx = new Effects();
    this.projectiles = [];

    this.t = 0;
    this.round = 0;
    this.hitstop = 0;
    this.shakeT = 0; this.shakeMag = 0; this.shakeDirX = 0;
    this.superFlash = null;   // { t, owner }
    this.superDim = 0;
    this.comboDisplay = [{ count: 0, timer: 0 }, { count: 0, timer: 0 }];
    this.announce = { text: '', timer: 0, dur: 1, big: false, color: '', sub: '' };
    this.roundActive = false;
    this.phase = 'intro';     // intro | fight | koWait | roundEnd | done
    this.phaseT = 0;
    this.roundTimer = ROUND_TIME;
    this.lastTimerSec = ROUND_TIME;
    this.startRound();
  }

  setAnnounce(text, dur = 70, big = false, color = '#ffe14f', sub = '') {
    this.announce = { text, timer: dur, dur, big, color, sub };
  }

  startRound() {
    this.round++;
    const [f1, f2] = this.fighters;
    f1.resetRound(VIEW_W / 2 - 75, 1);
    f2.resetRound(VIEW_W / 2 + 75, -1);
    this.projectiles.length = 0;
    this.roundTimer = ROUND_TIME;
    this.lastTimerSec = ROUND_TIME;
    this.phase = 'intro';
    this.phaseT = 0;
    this.roundActive = false;
    this.superFlash = null;
    this.hitstop = 0;
    this.setAnnounce(`ROUND ${this.round}`, 70, true, '#ffe14f');
    this.audio.sfx('round');
  }

  shake(mag, dur, dirX = 0) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
    this.shakeDirX = dirX;
  }

  spawnProjectile(owner, kind) {
    if (kind === 'small' &&
        this.projectiles.some(p => p.owner === owner && p.kind === 'small')) return;
    const idx = this.fighters.indexOf(owner);
    const big = kind === 'super';
    this.projectiles.push({
      owner, kind,
      x: owner.x + owner.facing * 18,
      y: FLOOR_Y - (big ? 24 : 22),
      vx: owner.facing * PROJ[kind].speed,
      t: 0, dead: false,
      frames: this.projSprites[idx][kind],
    });
    this.audio.sfx(kind === 'super' ? 'superGo' : 'special');
  }

  startSuperFlash(owner) {
    this.superFlash = { t: 38, owner };
    this.superDim = 90;
    this.shake(2, 10);
    this.setAnnounce('SUPER!', 40, false, owner.sprites.pal.aura);
  }

  // ── main tick ──────────────────────────────────────────────────────────
  update() {
    this.t++;
    this.bg.update();
    this.fx.update();
    if (this.announce.timer > 0) this.announce.timer--;
    for (const cd of this.comboDisplay) if (cd.timer > 0) cd.timer--;
    if (this.shakeT > 0) this.shakeT--; else this.shakeMag = 0;
    if (this.superDim > 0) this.superDim--;

    // super flash freezes the whole world
    if (this.superFlash) {
      this.superFlash.t--;
      const o = this.superFlash.owner;
      this.fx.superTrail(o.x + o.facing * 4, o.y - 24, o.sprites.pal.aura);
      if (this.superFlash.t <= 0) this.superFlash = null;
      return;
    }
    // hitstop freezes fighters & projectiles (particles keep flying)
    if (this.hitstop > 0) { this.hitstop--; return; }

    this.phaseT++;
    switch (this.phase) {
      case 'intro': {
        if (this.phaseT === 70) { this.setAnnounce('FIGHT!', 36, true, '#ff5b7d'); this.audio.sfx('superGo'); }
        if (this.phaseT >= 90) { this.phase = 'fight'; this.roundActive = true; }
        break;
      }
      case 'fight': {
        this.roundTimer -= 1 / 60;
        const sec = Math.ceil(this.roundTimer);
        if (sec !== this.lastTimerSec) {
          this.lastTimerSec = sec;
          if (sec <= 5 && sec > 0) this.audio.sfx('timer');
        }
        if (this.roundTimer <= 0) this.endRoundByTime();
        break;
      }
      case 'koWait': {
        if (this.phaseT >= 70) this.endRound(this.koWinner);
        break;
      }
      case 'roundEnd': {
        if (this.phaseT >= 150) {
          const champ = this.fighters.find(f => f.stats.roundsWon >= ROUNDS_TO_WIN);
          if (champ || this.round >= 5) {
            this.phase = 'done';
            this.audio.music(null);
            this.onMatchEnd(this.matchResult(champ));
          } else this.startRound();
        }
        break;
      }
      default: break;
    }

    // fighters
    for (const f of this.fighters) f.update(this);

    // pushbox separation (no phasing through each other)
    this.resolvePush();

    // strikes & projectiles
    if (this.phase === 'fight' || this.phase === 'koWait') {
      this.resolveStrikes();
      this.updateProjectiles();
    }

    // combo bookkeeping
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      const inCombo = f.state === 'hitstun' || f.state === 'ko' || f.knockdownPending;
      if (!inCombo && f.comboTaken > 0) f.comboTaken = 0;
    }
  }

  resolvePush() {
    const [a, b] = this.fighters;
    if (a.state === 'ko' || b.state === 'ko') return;
    const pa = worldBox(S1, a.pushboxLocal(), a.x, a.y, a.facing);
    const pb = worldBox(S2, b.pushboxLocal(), b.x, b.y, b.facing);
    if (!aabb(pa, pb)) return;
    // vertical overlap only counts when both near same height band
    const ox = overlapX(pa, pb);
    if (ox <= 0) return;
    const dir = a.x <= b.x ? 1 : -1;
    let pushA = -dir * ox / 2, pushB = dir * ox / 2;
    a.x += pushA; b.x += pushB;
    // wall correction: if someone got shoved into a wall, give it back
    const minX = WALL_L + PUSH_W / 2, maxX = WALL_R - PUSH_W / 2;
    for (const [f, g] of [[a, b], [b, a]]) {
      if (f.x < minX) { g.x += minX - f.x; f.x = minX; }
      if (f.x > maxX) { g.x -= f.x - maxX; f.x = maxX; }
    }
    a.x = Math.max(minX, Math.min(maxX, a.x));
    b.x = Math.max(minX, Math.min(maxX, b.x));
  }

  resolveStrikes() {
    for (let i = 0; i < 2; i++) {
      const atk = this.fighters[i], def = this.fighters[1 - i];
      const hbL = atk.hitboxLocal();
      if (!hbL) continue;
      const hb = worldBox(S1, hbL, atk.x, atk.y, atk.facing);
      const hurtL = def.hurtboxLocal();
      if (!hurtL) continue;
      const hurt = worldBox(S2, hurtL, def.x, def.y, def.facing);
      if (!aabb(hb, hurt)) continue;
      const data = ATTACKS[atk.attack];
      atk.onConnect();
      this.applyHit(atk, def, data, i,
        Math.min(hb.x + hb.w, hurt.x + hurt.w) - 4,
        Math.max(hb.y, hurt.y) + Math.min(hb.h, hurt.h) / 2);
    }
  }

  applyHit(atk, def, data, atkIndex, sparkX, sparkY) {
    const blocked = def.blockCheck(data.level);
    const cx = sparkX ?? (def.x + (atk.x - def.x) / 2);
    const cy = sparkY ?? def.y - 26;
    if (blocked) {
      def.takeHit(data, { blocked: true, scale: 1, attackerFacing: atk.facing });
      atk.meter = Math.min(100, atk.meter + (data.meter?.[0] ?? 5) * 0.5);
      this.fx.blockSpark(cx, cy);
      this.audio.sfx('block');
      this.hitstop = 2;
      this.pushCornered(atk, def, data);
      return;
    }
    const scale = comboScale(def.comboTaken);
    const dmg = def.takeHit(data, { blocked: false, scale, attackerFacing: atk.facing });
    atk.stats.damageDealt += dmg;
    atk.meter = Math.min(100, atk.meter + (data.meter?.[0] ?? 5));
    const heavy = (data.hitstop ?? 3) >= 6;
    this.fx.hitSpark(cx, cy, heavy, atk.sprites.pal.aura);
    this.audio.sfx(data.sfx === 'super' ? 'superHit' : (heavy ? 'heavy' : 'light'));
    this.hitstop = Math.min(10, Math.max(2, data.hitstop ?? 3));
    if (data.shake) this.shake(data.shake, 10, atk.facing);
    this.pushCornered(atk, def, data);
    // combo display
    if (def.comboTaken >= 2) {
      const cd = this.comboDisplay[atkIndex];
      cd.count = def.comboTaken; cd.timer = 50;
      atk.stats.maxCombo = Math.max(atk.stats.maxCombo, def.comboTaken);
    }
    if (def.hp <= 0 && this.phase === 'fight') this.ko(atk, def);
  }

  pushCornered(atk, def, data) {
    // attacker gets pushed off a cornered defender
    if (def.x <= WALL_L + PUSH_W / 2 + 2 || def.x >= WALL_R - PUSH_W / 2 - 2) {
      atk.x -= atk.facing * (data.kbx ?? 1.5) * 2.2;
    }
  }

  ko(winner, loser) {
    this.phase = 'koWait';
    this.phaseT = 0;
    this.roundActive = false;
    this.koWinner = winner;
    this.setAnnounce('K.O.!', 70, true, '#ff4f5e');
    this.audio.sfx('ko');
    this.hitstop = 14;
    this.shake(7, 22, winner.facing);
    this.fx.koRays(loser.x, loser.y - 24);
  }

  endRoundByTime() {
    this.roundActive = false;
    const [f1, f2] = this.fighters;
    this.setAnnounce('TIME UP!', 70, true);
    if (f1.hp === f2.hp) { this.phase = 'roundEnd'; this.phaseT = 0; return; } // draw: no point
    this.endRound(f1.hp > f2.hp ? f1 : f2, true);
  }

  endRound(winner, byTime = false) {
    this.phase = 'roundEnd';
    this.phaseT = 0;
    this.roundActive = false;
    winner.stats.roundsWon++;
    const perfect = !winner.tookDamageThisRound && !byTime;
    if (perfect) winner.stats.perfects++;
    if (winner.state !== 'ko') { winner.state = 'victory'; winner.stateT = 0; winner.vx = 0; }
    this.setAnnounce(`${winner.name} WINS!`, 130, false, '#3ee7ff',
      perfect ? 'PERFECT!' : '');
    this.audio.sfx('win');
  }

  matchResult(champ) {
    const [f1, f2] = this.fighters;
    const winner = champ || (f1.stats.roundsWon === f2.stats.roundsWon ? null
      : (f1.stats.roundsWon > f2.stats.roundsWon ? f1 : f2));
    return {
      winner: winner ? winner.name : 'DRAW',
      winnerIndex: winner ? this.fighters.indexOf(winner) : -1,
      stats: this.fighters.map(f => ({
        name: f.name,
        damage: Math.round(f.stats.damageDealt),
        maxCombo: f.stats.maxCombo,
        perfects: f.stats.perfects,
        rounds: f.stats.roundsWon,
      })),
    };
  }

  updateProjectiles() {
    const ps = this.projectiles;
    for (const p of ps) {
      p.t++;
      p.x += p.vx;
      const d = PROJ[p.kind];
      if (p.x < -30 || p.x > VIEW_W + 30) { p.dead = true; continue; }
      if (p.kind === 'super' && (this.t & 1)) {
        this.fx.superTrail(p.x, p.y, p.owner.sprites.pal.aura);
      }
      // vs defender
      const def = p.owner.foe;
      const box = S3; box.x = p.x - d.w / 2; box.y = p.y - d.h / 2; box.w = d.w; box.h = d.h;
      const hurtL = def.hurtboxLocal();
      if (hurtL) {
        const hurt = worldBox(S4, hurtL, def.x, def.y, def.facing);
        if (aabb(box, hurt)) {
          p.dead = true;
          const facing = p.vx > 0 ? 1 : -1;
          const fake = { ...d, sfx: p.kind === 'super' ? 'super' : 'heavy' };
          this.applyHitFromProj(p.owner, def, fake, facing, p.x, p.y);
          continue;
        }
      }
    }
    // projectile clash
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.dead || b.dead || a.owner === b.owner) continue;
      if (Math.abs(a.x - b.x) < 14 && Math.abs(a.y - b.y) < 16) {
        // super beats small
        if (a.kind !== b.kind) { (a.kind === 'small' ? a : b).dead = true; }
        else { a.dead = b.dead = true; }
        this.fx.hitSpark((a.x + b.x) / 2, a.y, true, '#ffffff');
        this.audio.sfx('block');
      }
    }
    this.projectiles = ps.filter(p => !p.dead);
  }

  applyHitFromProj(atk, def, data, facing, x, y) {
    const atkIndex = this.fighters.indexOf(atk);
    const blocked = def.blockCheck(data.level);
    if (blocked) {
      def.takeHit(data, { blocked: true, scale: 1, attackerFacing: facing });
      this.fx.blockSpark(x, y);
      this.audio.sfx('block');
      this.hitstop = 2;
      return;
    }
    const scale = comboScale(def.comboTaken);
    const dmg = def.takeHit(data, { blocked: false, scale, attackerFacing: facing });
    atk.stats.damageDealt += dmg;
    atk.meter = Math.min(100, atk.meter + (data.meter?.[0] ?? 5));
    const heavy = data.hitstop >= 6;
    this.fx.hitSpark(x, y, heavy, atk.sprites.pal.aura);
    this.audio.sfx(data.sfx === 'super' ? 'superHit' : 'heavy');
    this.hitstop = Math.min(12, data.hitstop);
    if (data.shake) this.shake(data.shake, 12, facing);
    if (def.comboTaken >= 2) {
      const cd = this.comboDisplay[atkIndex];
      cd.count = def.comboTaken; cd.timer = 50;
      atk.stats.maxCombo = Math.max(atk.stats.maxCombo, def.comboTaken);
    }
    if (def.hp <= 0 && this.phase === 'fight') this.ko(atk, def);
  }

  // ── drawing ────────────────────────────────────────────────────────────
  draw(ctx, renderer) {
    const midX = (this.fighters[0].x + this.fighters[1].x) / 2;
    this.bg.draw(ctx, midX);

    const dim = this.superFlash || this.superDim > 40;
    for (const f of this.fighters) renderer.drawShadow(ctx, f);
    // draw the non-acting fighter first so attackers render on top
    const order = [...this.fighters].sort((a, b) =>
      (a.state === 'attack' ? 1 : 0) - (b.state === 'attack' ? 1 : 0));
    for (const f of order) renderer.drawFighter(ctx, f);
    this.drawProjectiles(ctx);

    if (dim) {
      ctx.fillStyle = 'rgba(8,4,26,0.62)';
      ctx.fillRect(-8, -8, VIEW_W + 16, 286);
      // spotlight: redraw the super owner + projectiles above the dim
      const o = this.superFlash ? this.superFlash.owner
        : this.fighters.find(f => this.projectiles.some(p => p.owner === f && p.kind === 'super'))
          || this.fighters[0];
      renderer.drawShadow(ctx, o);
      renderer.drawFighter(ctx, o);
      this.drawProjectiles(ctx);
    }

    this.fx.draw(ctx);
    drawHUD(ctx, this);

    if (!this.roundActive && this.phase === 'roundEnd') {
      drawTextShadow(ctx, 'GET READY...', VIEW_W / 2, 200, '#cabcf0', 1, 'center');
    }
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      const img = p.frames[(p.t >> 3) & 1];
      ctx.drawImage(img, Math.round(p.x - img.width / 2), Math.round(p.y - img.height / 2));
    }
  }
}
