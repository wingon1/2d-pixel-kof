// ── Menus: title, mode select, difficulty, character select, results ─────
import { VIEW_W, VIEW_H } from './constants.js';
import { drawText, drawTextShadow, textWidth } from './font.js';
import { menuKey, wasPressed, wasTyped } from './input.js';
import { ROSTER, bakeFighter } from './sprites.js';
import { AI_LEVELS } from './ai.js';

const TITLE_1 = 'CHIBI';
const TITLE_2 = 'CLASH';

export class Menu {
  constructor(audio) {
    this.audio = audio;
    this.screen = 'title';
    this.sel = 0;
    this.t = 0;
    this.result = null;
    this.config = { mode: 'cpu', aiLevel: 2, p1: 0, p2: 1 };
    this.pickPhase = 0; // char select: 0 = P1 picking, 1 = P2 picking
    this.cursor = [0, 1];
    // preview sprites
    this.preview = ROSTER.map(r => bakeFighter(r.pal));
    this.previewAlt = ROSTER.map(r => bakeFighter(r.alt));
    this.stars = Array.from({ length: 40 }, (_, i) => ({
      x: (i * 137) % VIEW_W, y: (i * 83) % VIEW_H, s: 0.2 + (i % 3) * 0.25,
    }));
    // online state (managed by main.js)
    this.online = false;        // results screen belongs to an online match
    this.netLines = [];         // status text on the netwait screen
    this.netCode = '';          // room code to display big
    this.netDone = false;       // netwait is showing a final error/notice
    this.netChar = null;        // { cursor, locked, remoteLocked, remoteChar, isHost }
    this.joinSlots = ['', '', '', ''];  // room-code entry
    this.joinCursor = 0;
    this.resultsNote = '';      // e.g. "WAITING FOR RIVAL..."
    this.touchMode = false;     // on-screen controls active (mobile)
  }

  go(screen) {
    this.screen = screen;
    this.sel = 0;
    this.t = 0;
  }

  showResults(result) {
    this.result = result;
    this.resultsNote = '';
    this.go('results');
    this.audio.music('menu');
  }

  // returns an action for main.js or null
  update() {
    this.t++;
    const k = menuKey;
    const beep = () => this.audio.sfx('move');
    const pick = () => this.audio.sfx('select');

    switch (this.screen) {
      case 'title': {
        if (k.confirm()) {
          this.audio.ensure();
          this.audio.music('menu');
          pick();
          this.go('mode');
        }
        break;
      }
      case 'mode': {
        const items = 4;
        if (k.up()) { this.sel = (this.sel + items - 1) % items; beep(); }
        if (k.down()) { this.sel = (this.sel + 1) % items; beep(); }
        if (k.back()) { this.go('title'); beep(); }
        if (k.confirm()) {
          if (this.sel === 1 && this.touchMode) {
            // local 2P needs a shared keyboard — not available on touch
            this.audio.sfx('block');
            break;
          }
          pick();
          if (this.sel === 0) { this.config.mode = 'cpu'; this.go('difficulty'); }
          else if (this.sel === 1) { this.config.mode = '2p'; this.startCharSelect(); }
          else if (this.sel === 2) this.go('online');
          else this.go('controls');
        }
        break;
      }
      case 'online': {
        if (k.up()) { this.sel = (this.sel + 2) % 3; beep(); }
        if (k.down()) { this.sel = (this.sel + 1) % 3; beep(); }
        if (k.back()) { this.go('mode'); beep(); }
        if (k.confirm()) {
          pick();
          if (this.sel === 0) return { type: 'quickmatch' };
          if (this.sel === 1) return { type: 'createroom' };
          this.joinSlots = ['', '', '', ''];
          this.joinCursor = 0;
          this.go('joinCode');
        }
        break;
      }
      case 'joinCode': {
        const slots = this.joinSlots;
        const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        // physical typing (touch-stick WASD is excluded via wasTyped)
        for (let i = 0; i < 26; i++) {
          if (wasTyped('Key' + ABC[i])) {
            slots[this.joinCursor] = ABC[i];
            this.joinCursor = Math.min(3, this.joinCursor + 1);
            beep();
          }
        }
        // stick / arrow entry
        if (wasPressed('ArrowLeft')) { this.joinCursor = Math.max(0, this.joinCursor - 1); beep(); }
        if (wasPressed('ArrowRight')) { this.joinCursor = Math.min(3, this.joinCursor + 1); beep(); }
        const cyc = wasPressed('ArrowUp') ? 1 : wasPressed('ArrowDown') ? -1 : 0;
        if (cyc) {
          const idx = ABC.indexOf(slots[this.joinCursor]);
          slots[this.joinCursor] = idx < 0
            ? (cyc > 0 ? 'A' : 'Z')
            : ABC[(idx + cyc + 26) % 26];
          beep();
        }
        if (wasPressed('Backspace')) {
          if (slots[this.joinCursor]) slots[this.joinCursor] = '';
          else if (this.joinCursor > 0) { this.joinCursor--; slots[this.joinCursor] = ''; }
          beep();
        }
        if (wasPressed('Escape')) { this.go('online'); beep(); }
        if (wasPressed('Enter') && slots.every(s => s)) {
          pick();
          return { type: 'joinroom', code: slots.join('') };
        }
        break;
      }
      case 'netwait': {
        if (wasPressed('Escape') ||
            (this.netDone && (wasPressed('Enter') || wasPressed('KeyJ')))) {
          beep();
          return { type: 'cancelnet' };
        }
        break;
      }
      case 'netchar': {
        const nc = this.netChar;
        if (!nc) break;
        if (wasPressed('Escape')) return { type: 'cancelnet' };
        if (!nc.locked) {
          if (wasPressed('KeyA') || wasPressed('ArrowLeft') ||
              wasPressed('KeyD') || wasPressed('ArrowRight')) {
            nc.cursor = 1 - nc.cursor; beep();
          }
          if (wasPressed('KeyJ') || wasPressed('Enter')) {
            nc.locked = true; pick();
            return { type: 'netpick', c: nc.cursor };
          }
        }
        break;
      }
      case 'difficulty': {
        if (k.up()) { this.sel = (this.sel + 2) % 3; beep(); }
        if (k.down()) { this.sel = (this.sel + 1) % 3; beep(); }
        if (k.back()) { this.go('mode'); beep(); }
        if (k.confirm()) {
          pick();
          this.config.aiLevel = this.sel + 1;
          this.startCharSelect();
        }
        break;
      }
      case 'charSelect': {
        const p = this.pickPhase;
        const moveL = p === 0 ? wasPressed('KeyA') : (wasPressed('ArrowLeft') || wasPressed('KeyA'));
        const moveR = p === 0 ? wasPressed('KeyD') : (wasPressed('ArrowRight') || wasPressed('KeyD'));
        const ok = p === 0
          ? (wasPressed('KeyJ') || wasPressed('Enter'))
          : (this.config.mode === '2p'
            ? (wasPressed('Numpad1') || wasPressed('Comma') || wasPressed('Enter'))
            : (wasPressed('KeyJ') || wasPressed('Enter')));
        if (moveL || moveR) { this.cursor[p] = 1 - this.cursor[p]; beep(); }
        if (wasPressed('Escape')) { this.go('mode'); beep(); break; }
        if (ok) {
          pick();
          if (p === 0) {
            this.config.p1 = this.cursor[0];
            if (this.config.mode === 'cpu') {
              // CPU auto-picks after a beat
              this.config.p2 = this.cursor[1] = 1 - this.cursor[0];
              return this.buildStart();
            }
            this.pickPhase = 1;
          } else {
            this.config.p2 = this.cursor[1];
            return this.buildStart();
          }
        }
        break;
      }
      case 'controls': {
        if (k.confirm() || k.back()) { this.audio.sfx('select'); this.go('mode'); }
        break;
      }
      case 'results': {
        if (k.up() || k.down()) { this.sel = 1 - this.sel; beep(); }
        if (k.confirm()) {
          pick();
          if (this.sel === 0) return { type: 'rematch' };
          if (this.online) return { type: 'leavenet' };
          this.go('title');
          this.audio.music('menu');
        }
        break;
      }
      default: break;
    }
    return null;
  }

  startCharSelect() {
    this.pickPhase = 0;
    this.cursor = [0, 1];
    this.go('charSelect');
  }

  buildStart() {
    const { p1, p2 } = this.config;
    const mirror = p1 === p2;
    return {
      type: 'start',
      mode: this.config.mode,
      aiLevel: this.config.aiLevel,
      p1Pal: ROSTER[p1].pal,
      p2Pal: mirror ? ROSTER[p2].alt : ROSTER[p2].pal,
    };
  }

  // ── drawing ────────────────────────────────────────────────────────────
  drawBackdrop(ctx) {
    const bands = ['#171034', '#1d1442', '#241a52', '#2c2062'];
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, i * 70, VIEW_W, 70);
    });
    ctx.fillStyle = '#cabcf0';
    for (const s of this.stars) {
      const tw = (Math.sin(this.t / 30 + s.x) + 1) / 2;
      if (tw > 0.3) ctx.fillRect(s.x, (s.y + this.t * s.s * 0.15) % VIEW_H, 1, 1);
    }
    // checkered floor strip
    ctx.fillStyle = '#241a4e';
    ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26);
    ctx.fillStyle = '#2f2362';
    for (let x = 0; x < VIEW_W; x += 16)
      ctx.fillRect(x + ((this.t >> 3) % 16), VIEW_H - 26, 8, 26);
  }

  drawLogo(ctx, y) {
    const bounce = Math.round(Math.sin(this.t / 24) * 3);
    drawTextShadow(ctx, TITLE_1, VIEW_W / 2 - 2, y + bounce, '#3ee7ff', 6, 'center', '#0b2a4a');
    drawTextShadow(ctx, TITLE_2, VIEW_W / 2 + 2, y + 44 - bounce, '#ff4fa0', 6, 'center', '#4a0b2a');
    drawText(ctx, 'CUTE FISTS. SERIOUS FRAMES.', VIEW_W / 2, y + 92, '#ffe14f', 1, 'center');
  }

  drawFighterPreview(ctx, sprites, x, flip, poseSet = ['idle0', 'idle1', 'idle2', 'idle3']) {
    const pose = poseSet[(this.t >> 4) % poseSet.length];
    const img = sprites.poses[pose];
    ctx.save();
    if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(img, -32, VIEW_H - 26 - 55); }
    else ctx.drawImage(img, x - 32, VIEW_H - 26 - 55);
    ctx.restore();
  }

  drawMenuList(ctx, items, y, gap = 18) {
    items.forEach((it, i) => {
      const on = i === this.sel;
      const color = on ? '#ffe14f' : '#9a8cc8';
      if (on) drawText(ctx, '>', VIEW_W / 2 - textWidth(it, 2) / 2 - 14, y + i * gap, '#ff4fa0', 2);
      drawTextShadow(ctx, it, VIEW_W / 2, y + i * gap, color, 2, 'center');
    });
  }

  draw(ctx) {
    this.drawBackdrop(ctx);
    switch (this.screen) {
      case 'title': {
        this.drawLogo(ctx, 50);
        this.drawFighterPreview(ctx, this.preview[0], 70, false);
        this.drawFighterPreview(ctx, this.preview[1], VIEW_W - 70, true);
        if ((this.t >> 5) % 2 === 0) {
          drawTextShadow(ctx, this.touchMode ? 'TAP START' : 'PRESS ENTER',
            VIEW_W / 2, 196, '#fff', 2, 'center');
        }
        drawText(ctx, 'INSERT COIN', VIEW_W / 2, 218, '#7a6aa8', 1, 'center');
        drawText(ctx, '60FPS - ZERO ASSETS - 100% PROCEDURAL', VIEW_W / 2, VIEW_H - 10, '#4a3a78', 1, 'center');
        break;
      }
      case 'mode': {
        drawTextShadow(ctx, 'SELECT MODE', VIEW_W / 2, 38, '#3ee7ff', 3, 'center');
        const localLabel = this.touchMode ? 'LOCAL 2-PLAYER (PC ONLY)' : 'LOCAL 2-PLAYER (VS HUMAN)';
        const items = ['SINGLE PLAYER (VS CPU)', localLabel, 'ONLINE MATCH (WI-FI)', 'CONTROLS'];
        items.forEach((it, i) => {
          const on = i === this.sel;
          const disabled = i === 1 && this.touchMode;
          const color = disabled ? '#4a3a78' : on ? '#ffe14f' : '#9a8cc8';
          if (on) drawText(ctx, '>', VIEW_W / 2 - textWidth(it, 2) / 2 - 14, 96 + i * 24, '#ff4fa0', 2);
          drawTextShadow(ctx, it, VIEW_W / 2, 96 + i * 24, color, 2, 'center');
        });
        if (this.sel === 1 && this.touchMode) {
          drawText(ctx, 'NEEDS A SHARED KEYBOARD - PLAY ONLINE INSTEAD!', VIEW_W / 2, 200, '#ff5b7d', 1, 'center');
        }
        drawText(ctx, this.touchMode ? 'STICK: MOVE   START/LP: OK   BACK: BACK'
          : 'W/S: MOVE   ENTER: OK   ESC: BACK', VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'online': {
        drawTextShadow(ctx, 'ONLINE MATCH', VIEW_W / 2, 42, '#3ee7ff', 3, 'center');
        this.drawMenuList(ctx,
          ['QUICK MATCH (RANDOM RIVAL)', 'CREATE ROOM (HOST A FRIEND)', 'JOIN ROOM (ENTER CODE)'], 104, 26);
        const blurbs = [
          'FIND A RANDOM OPPONENT ONLINE!',
          'GET A 4-LETTER CODE TO SHARE.',
          "TYPE YOUR FRIEND'S ROOM CODE.",
        ];
        drawText(ctx, blurbs[this.sel], VIEW_W / 2, 196, '#ffe14f', 1, 'center');
        drawText(ctx, 'PEER-TO-PEER. BOTH PLAYERS NEED INTERNET.', VIEW_W / 2, 214, '#7a6aa8', 1, 'center');
        drawText(ctx, 'W/S: MOVE   ENTER: OK   ESC: BACK', VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'joinCode': {
        drawTextShadow(ctx, 'JOIN ROOM', VIEW_W / 2, 44, '#3ee7ff', 3, 'center');
        drawText(ctx, 'ENTER THE 4-LETTER ROOM CODE', VIEW_W / 2, 78, '#fff', 1, 'center');
        const full = this.joinSlots.every(s => s);
        for (let i = 0; i < 4; i++) {
          const x = VIEW_W / 2 - 66 + i * 36;
          const active = i === this.joinCursor;
          ctx.fillStyle = active && (this.t >> 4) % 2 === 0 ? '#ffe14f'
            : active ? '#ff4fa0' : '#352a60';
          ctx.fillRect(x, 102, 30, 38);
          ctx.fillStyle = '#1d1442';
          ctx.fillRect(x + 2, 104, 26, 34);
          if (this.joinSlots[i]) {
            drawText(ctx, this.joinSlots[i], x + 15, 111, '#fff', 4, 'center');
          }
          if (active) { // cycle hints above/below the cursor slot
            drawText(ctx, '+', x + 15, 92, '#3ee7ff', 1, 'center');
            drawText(ctx, '-', x + 15, 146, '#3ee7ff', 1, 'center');
          }
        }
        const hint = this.touchMode
          ? 'STICK UP/DOWN: LETTER   LEFT/RIGHT: SLOT'
          : 'TYPE A-Z OR ARROWS   BACKSPACE: DELETE';
        drawText(ctx, hint, VIEW_W / 2, 166, '#ffe14f', 1, 'center');
        drawText(ctx, full ? (this.touchMode ? 'START: CONNECT!' : 'ENTER: CONNECT!') : ' ',
          VIEW_W / 2, 182, (this.t >> 4) % 2 === 0 ? '#3ee7ff' : '#fff', 2, 'center');
        drawText(ctx, this.touchMode ? 'BACK: CANCEL' : 'ESC: BACK',
          VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'netwait': {
        drawTextShadow(ctx, 'ONLINE MATCH', VIEW_W / 2, 40, '#3ee7ff', 3, 'center');
        if (this.netCode) {
          drawText(ctx, 'ROOM CODE', VIEW_W / 2, 78, '#9a8cc8', 1, 'center');
          const flash = (this.t >> 4) % 2 === 0 ? '#ffe14f' : '#fff';
          drawTextShadow(ctx, this.netCode.split('').join(' '), VIEW_W / 2, 92, flash, 5, 'center');
          drawText(ctx, 'SHARE THIS CODE WITH YOUR FRIEND!', VIEW_W / 2, 134, '#fff', 1, 'center');
        }
        this.netLines.forEach((ln, i) => {
          drawTextShadow(ctx, ln, VIEW_W / 2, (this.netCode ? 156 : 110) + i * 16,
            this.netDone ? '#ff5b7d' : '#ffe14f', this.netDone ? 2 : 1, 'center');
        });
        if (!this.netDone) {
          const dots = '.'.repeat(1 + ((this.t / 24) | 0) % 3);
          drawText(ctx, dots, VIEW_W / 2, (this.netCode ? 176 : 132), '#3ee7ff', 3, 'center');
        }
        drawText(ctx, this.netDone ? 'ENTER / ESC: BACK' : 'ESC: CANCEL',
          VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'netchar': {
        const nc = this.netChar || { cursor: 0 };
        drawTextShadow(ctx, 'CHOOSE YOUR FIGHTER', VIEW_W / 2, 32, '#3ee7ff', 3, 'center');
        drawTextShadow(ctx, `YOU ARE ${nc.isHost ? 'P1 (LEFT)' : 'P2 (RIGHT)'}`,
          VIEW_W / 2, 58, '#ffe14f', 1, 'center');
        for (let i = 0; i < 2; i++) {
          const cx = VIEW_W / 2 + (i === 0 ? -92 : 92);
          const selected = nc.cursor === i;
          const blink = selected && !nc.locked && (this.t >> 3) % 2 === 0;
          ctx.fillStyle = nc.locked && selected ? '#3ee76a'
            : blink ? '#ffe14f' : selected ? '#ff4fa0' : '#352a60';
          ctx.fillRect(cx - 47, 66, 94, 132);
          ctx.fillStyle = '#1d1442';
          ctx.fillRect(cx - 44, 69, 88, 126);
          const pose = selected ? ['victory0', 'victory1'][(this.t >> 4) % 2]
            : ['idle0', 'idle1', 'idle2', 'idle3'][(this.t >> 4) % 4];
          ctx.drawImage(this.preview[i].poses[pose], 12, 0, 40, 56, cx - 40, 76, 80, 112);
          drawTextShadow(ctx, ROSTER[i].pal.name, cx, 204, selected ? '#fff' : '#9a8cc8', 1, 'center');
          if (selected) drawText(ctx, 'YOU', cx - 42, 73, '#3ee7ff', 1);
          if (nc.remoteLocked && nc.remoteChar === i) {
            drawText(ctx, 'RIVAL', cx + 18, 73, '#ff5b7d', 1);
          }
        }
        const status = nc.locked
          ? (nc.remoteLocked ? 'BOTH READY! STARTING...' : 'WAITING FOR RIVAL...')
          : 'A/D: MOVE   J OR ENTER: LOCK IN';
        drawText(ctx, status, VIEW_W / 2, 218, nc.locked ? '#ffe14f' : '#fff', 1, 'center');
        drawText(ctx, 'ESC: LEAVE MATCH', VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'difficulty': {
        drawTextShadow(ctx, 'CPU DIFFICULTY', VIEW_W / 2, 42, '#3ee7ff', 3, 'center');
        this.drawMenuList(ctx, [AI_LEVELS[1].name, AI_LEVELS[2].name, AI_LEVELS[3].name], 104, 26);
        const blurbs = [
          'WANDERS AND MASHES. GO WILD!',
          'BLOCKS AND CHAINS COMBOS. FAIR FIGHT.',
          'FRAME-READING MENACE. GOOD LUCK.',
        ];
        drawText(ctx, blurbs[this.sel], VIEW_W / 2, 196, '#ffe14f', 1, 'center');
        drawText(ctx, 'W/S: MOVE   ENTER: OK   ESC: BACK', VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'charSelect': {
        drawTextShadow(ctx, 'CHOOSE YOUR FIGHTER', VIEW_W / 2, 32, '#3ee7ff', 3, 'center');
        const who = this.pickPhase === 0 ? 'PLAYER 1'
          : (this.config.mode === '2p' ? 'PLAYER 2' : 'CPU');
        drawTextShadow(ctx, `${who} PICK!`, VIEW_W / 2, 58, '#ffe14f', 1, 'center');
        for (let i = 0; i < 2; i++) {
          const cx = VIEW_W / 2 + (i === 0 ? -92 : 92);
          const selected = this.cursor[this.pickPhase] === i;
          const blink = selected && (this.t >> 3) % 2 === 0;
          // frame
          ctx.fillStyle = blink ? '#ffe14f' : selected ? '#ff4fa0' : '#352a60';
          ctx.fillRect(cx - 47, 66, 94, 132);
          ctx.fillStyle = '#1d1442';
          ctx.fillRect(cx - 44, 69, 88, 126);
          const mirror = this.pickPhase === 1 && this.config.p1 === i;
          const spr = mirror ? this.previewAlt[i] : this.preview[i];
          const pose = selected ? ['victory0', 'victory1'][(this.t >> 4) % 2]
            : ['idle0', 'idle1', 'idle2', 'idle3'][(this.t >> 4) % 4];
          // 2x crop so the cat face is big and readable
          ctx.drawImage(spr.poses[pose], 12, 0, 40, 56, cx - 40, 76, 80, 112);
          drawTextShadow(ctx, ROSTER[i].pal.name, cx, 204, selected ? '#fff' : '#9a8cc8', 1, 'center');
          if (this.pickPhase === 1 && this.config.p1 === i) {
            drawText(ctx, 'P1', cx - 42, 73, '#3ee7ff', 1);
          }
        }
        const hint = this.pickPhase === 0 ? 'P1: A/D + J TO PICK'
          : 'P2: ARROWS + NUMPAD1 (OR ,) TO PICK';
        drawText(ctx, hint, VIEW_W / 2, 218, '#7a6aa8', 1, 'center');
        drawText(ctx, 'ESC: BACK', VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'controls': {
        drawTextShadow(ctx, 'CONTROLS', VIEW_W / 2, 30, '#3ee7ff', 3, 'center');
        const rows = [
          ['', 'PLAYER 1', 'PLAYER 2'],
          ['MOVE', 'A / D', 'LEFT / RIGHT'],
          ['JUMP', 'W', 'UP'],
          ['CROUCH-BLOCK', 'S', 'DOWN'],
          ['LIGHT PUNCH', 'J', 'NUMPAD 1 (,)'],
          ['HEAVY PUNCH', 'K', 'NUMPAD 2 (.)'],
          ['SPECIAL', 'L', 'NUMPAD 3 (/)'],
          ['SUPER', 'K + L', 'NP2 + NP3'],
        ];
        rows.forEach((r, i) => {
          const y = 58 + i * 14;
          const c = i === 0 ? '#ffe14f' : '#fff';
          drawText(ctx, r[0], 60, y, '#9a8cc8', 1);
          drawText(ctx, r[1], 230, y, c, 1);
          drawText(ctx, r[2], 350, y, c, 1);
        });
        drawText(ctx, 'BLOCK: HOLD BACK. LOW BLOCK: BACK + DOWN.', VIEW_W / 2, 186, '#ffe14f', 1, 'center');
        drawText(ctx, 'CANCEL LIGHT INTO HEAVY INTO SPECIAL ON HIT!', VIEW_W / 2, 198, '#ffe14f', 1, 'center');
        drawText(ctx, 'ESC: PAUSE   M: MUTE', VIEW_W / 2, 214, '#7a6aa8', 1, 'center');
        drawText(ctx, 'ENTER: BACK', VIEW_W / 2, 230, '#7a6aa8', 1, 'center');
        break;
      }
      case 'results': {
        const r = this.result;
        if (!r) break;
        drawTextShadow(ctx, 'MATCH RESULTS', VIEW_W / 2, 26, '#3ee7ff', 3, 'center');
        const wc = (this.t >> 4) % 2 === 0 ? '#ffe14f' : '#ff4fa0';
        drawTextShadow(ctx, r.winner === 'DRAW' ? 'DRAW GAME!' : `${r.winner} WINS!`,
          VIEW_W / 2, 54, wc, 2, 'center');
        if (r.winnerIndex >= 0) {
          const spr = this.preview[ROSTER.findIndex(x => x.pal.name === r.winner)] || this.preview[0];
          const pose = ['victory0', 'victory1'][(this.t >> 4) % 2];
          ctx.drawImage(spr.poses[pose], VIEW_W / 2 - 32, 64);
        }
        const rows = [
          ['', r.stats[0].name, r.stats[1].name],
          ['ROUNDS WON', r.stats[0].rounds, r.stats[1].rounds],
          ['DAMAGE DEALT', r.stats[0].damage, r.stats[1].damage],
          ['MAX COMBO', r.stats[0].maxCombo + ' HITS', r.stats[1].maxCombo + ' HITS'],
          ['PERFECT ROUNDS', r.stats[0].perfects, r.stats[1].perfects],
        ];
        rows.forEach((row, i) => {
          const y = 128 + i * 13;
          drawText(ctx, String(row[0]), 70, y, '#9a8cc8', 1);
          drawText(ctx, String(row[1]), 250, y, i === 0 ? '#3ee7ff' : '#fff', 1);
          drawText(ctx, String(row[2]), 360, y, i === 0 ? '#ff4fa0' : '#fff', 1);
        });
        const items = ['REMATCH', this.online ? 'LEAVE MATCH' : 'BACK TO TITLE'];
        items.forEach((it, i) => {
          const on = i === this.sel;
          if (on) drawText(ctx, '>', VIEW_W / 2 - textWidth(it, 1) / 2 - 10, 206 + i * 14, '#ff4fa0', 1);
          drawText(ctx, it, VIEW_W / 2, 206 + i * 14, on ? '#ffe14f' : '#9a8cc8', 1, 'center');
        });
        if (this.resultsNote) {
          drawText(ctx, this.resultsNote, VIEW_W / 2, 238,
            (this.t >> 4) % 2 === 0 ? '#ffe14f' : '#fff', 1, 'center');
        }
        break;
      }
      default: break;
    }
  }
}
