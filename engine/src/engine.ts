/**
 * Fast Track rules engine (individual play, six-sided board).
 *
 * Pure and serializable: the same code runs in the app (to show legal moves)
 * and on the server (as the authority). No team rules yet.
 *
 * Board model
 *   Main track: 84 spaces, 14 per seat section. For seat s the section starts at s*14.
 *     offset 0      fast-track corner of seat s (the "own colour" fast-track space)
 *     offset 1-4    outward along the arm
 *     offset 5-9    across the outer end of the arm
 *     offset 7      home entrance (home row runs inward from here)
 *     offset 9      holding-pen exit
 *     offset 10-13  back inward to the next seat's fast-track corner
 *   Travel is clockwise = increasing index.
 */

export const SEATS = 6;
export const SECTION = 14;
export const TRACK = SEATS * SECTION; // 84
export const HOME_LEN = 4;
export const HAND_SIZE = 5;
export const HOME_ENTRANCE_OFFSET = 7;
export const PEN_EXIT_OFFSET = 9;

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JK';
export type Suit = 'S' | 'H' | 'D' | 'C' | null;
export interface Card { id: number; rank: Rank; suit: Suit }

export type Zone = 'pen' | 'main' | 'home' | 'bull';
/** idx: pen = slot, main = 0..83, home = 0..3 (0 is next to the entrance), bull = 0 */
/**
 * fast:   the peg has travelled along the fast track and is committed to it.
 * landed: the peg has just stopped on a fast-track corner. It counts as on the fast track
 *         (it must be moved first) but may still either circle or carry on around the main track.
 */
export interface Peg { zone: Zone; idx: number; fast: boolean; landed?: boolean }
export interface PegRef { p: number; g: number }
export interface Pos { zone: Zone; idx: number; seat?: number }

export interface Player {
  seat: number;
  name: string;
  bot: boolean;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  pegs: Peg[];
}

export interface Rules {
  /** true: a Jack swaps one of your pegs with an opponent's. false: it may swap any two pegs of different colours. */
  jackSwapNeedsOwnPeg: boolean;
}
export const DEFAULT_RULES: Rules = { jackSwapNeedsOwnPeg: true };

export interface GameState {
  rules: Rules;
  players: Player[];
  turn: number;
  winner: number | null;
  rng: number;
  cuts: { p: number; card: Card }[];
  moveCount: number;
}

export interface Part { p: number; g: number; to: Peg; path: Pos[]; bump: PegRef | null }
export type Move =
  | { key: string; type: 'move'; dir: 'fwd' | 'back'; parts: Part[] }
  | { key: string; type: 'exit'; p: number; g: number; to: Peg; path: Pos[]; bump: PegRef | null }
  | { key: string; type: 'bullExit'; p: number; g: number; to: Peg; path: Pos[]; bump: PegRef | null }
  | { key: string; type: 'swap'; a: PegRef; b: PegRef }
  | { key: string; type: 'penalty'; p: number; g: number }
  | { key: string; type: 'none' };

export const PLAY_AGAIN: ReadonlySet<Rank> = new Set<Rank>(['A', 'JK', 'K', 'Q', 'J', '6']);
export const SEATS_FOR: Record<number, number[]> = {
  2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
};

export const ftIndex = (seat: number) => ((seat % SEATS) + SEATS) % SEATS * SECTION;
export const homeEntrance = (seat: number) => seat * SECTION + HOME_ENTRANCE_OFFSET;
export const penExit = (seat: number) => seat * SECTION + PEN_EXIT_OFFSET;
export const isFT = (idx: number) => idx % SECTION === 0;
const wrap = (i: number) => ((i % TRACK) + TRACK) % TRACK;

export function cardValue(rank: Rank): number {
  switch (rank) {
    case 'A': case 'JK': case 'J': case 'Q': case 'K': return 1;
    default: return parseInt(rank, 10);
  }
}

// ---------- random ----------
function rand(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(state: { rng: number }, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newDeck(): Card[] {
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const d: Card[] = [];
  let id = 0;
  for (const s of suits) for (const r of ranks) d.push({ id: id++, rank: r, suit: s });
  d.push({ id: id++, rank: 'JK', suit: null }, { id: id++, rank: 'JK', suit: null });
  return d;
}

const CUT_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'JK'];

export interface NewGameOptions {
  players: { name: string; bot?: boolean }[];
  seed?: number;
  rules?: Partial<Rules>;
}

export function createGame(opts: NewGameOptions): GameState {
  const n = opts.players.length;
  const seats = SEATS_FOR[n];
  if (!seats) throw new Error('Fast Track needs 2 to 6 players');
  const state: GameState = {
    rules: { ...DEFAULT_RULES, ...(opts.rules || {}) },
    players: [], turn: 0, winner: null,
    rng: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    cuts: [], moveCount: 0,
  };
  opts.players.forEach((pl, i) => {
    const deck = shuffle(state, newDeck());
    state.players.push({
      seat: seats[i], name: pl.name, bot: !!pl.bot, deck, hand: [], discard: [],
      pegs: [0, 1, 2, 3].map((s) => ({ zone: 'pen' as Zone, idx: s, fast: false })),
    });
  });
  // Cut for first turn: highest card starts, tied players cut again.
  let contenders = state.players.map((_, i) => i);
  while (contenders.length > 1) {
    const round = contenders.map((p) => {
      const d = state.players[p].deck;
      return { p, card: d[Math.floor(rand(state) * d.length)] };
    });
    state.cuts = round;
    const best = Math.max(...round.map((c) => CUT_ORDER.indexOf(c.card.rank)));
    contenders = round.filter((c) => CUT_ORDER.indexOf(c.card.rank) === best).map((c) => c.p);
  }
  state.turn = contenders[0];
  for (let p = 0; p < n; p++) drawTo(state, p, HAND_SIZE);
  return state;
}

function drawTo(state: GameState, p: number, size: number) {
  const pl = state.players[p];
  while (pl.hand.length < size) {
    if (pl.deck.length === 0) {
      if (pl.discard.length === 0) break;
      pl.deck = shuffle(state, pl.discard);
      pl.discard = [];
    }
    pl.hand.push(pl.deck.pop()!);
  }
}

// ---------- occupancy ----------
export function occupant(state: GameState, zone: Zone, idx: number, seat?: number): PegRef | null {
  for (let p = 0; p < state.players.length; p++) {
    const pl = state.players[p];
    if (zone === 'home' && pl.seat !== seat) continue;
    for (let g = 0; g < pl.pegs.length; g++) {
      const peg = pl.pegs[g];
      if (peg.zone === zone && peg.idx === idx) return { p, g };
    }
  }
  return null;
}

interface Dest { to: Peg; path: Pos[]; bump: PegRef | null }
interface Gen { dests: Dest[]; ownBlocked: boolean }

function landing(state: GameState, p: number, pos: Pos): { ok: boolean; bump: PegRef | null } {
  const occ = occupant(state, pos.zone, pos.idx, pos.seat);
  if (!occ) return { ok: true, bump: null };
  if (occ.p === p) return { ok: false, bump: null };
  return { ok: true, bump: occ };
}

/** Walk n spaces forward along one route. Returns the end position or why it failed. */
function walkForward(state: GameState, p: number, g: number, n: number, route: 'main' | 'fast'):
  { path: Pos[] | null; ownBlocked: boolean } {
  const pl = state.players[p];
  const seat = pl.seat;
  const peg = pl.pegs[g];
  let cur: Pos = { zone: peg.zone, idx: peg.idx, seat };
  const path: Pos[] = [];
  for (let k = 0; k < n; k++) {
    let next: Pos;
    if (cur.zone === 'home') {
      if (cur.idx + 1 >= HOME_LEN) return { path: null, ownBlocked: false };
      next = { zone: 'home', idx: cur.idx + 1, seat };
    } else if (route === 'fast' && isFT(cur.idx) && cur.idx !== ftIndex(seat)) {
      next = { zone: 'main', idx: wrap(cur.idx + SECTION) };
    } else if (cur.idx === homeEntrance(seat)) {
      next = { zone: 'home', idx: 0, seat };
    } else {
      next = { zone: 'main', idx: wrap(cur.idx + 1) };
    }
    const occ = occupant(state, next.zone, next.idx, next.seat);
    if (occ && occ.p === p) return { path: null, ownBlocked: true };
    path.push(next);
    cur = next;
  }
  return { path, ownBlocked: false };
}

/** All places peg g of player p can reach moving exactly n forward. */
export function genForward(state: GameState, p: number, g: number, n: number): Gen {
  const pl = state.players[p];
  const peg = pl.pegs[g];
  const out: Gen = { dests: [], ownBlocked: false };
  if (peg.zone === 'pen' || peg.zone === 'bull') return out;
  const atFT = peg.zone === 'main' && isFT(peg.idx);
  const atOwnFT = atFT && peg.idx === ftIndex(pl.seat);
  const routes: ('main' | 'fast')[] = [];
  if (peg.zone === 'home' || !atFT || atOwnFT) routes.push('main');
  else if (peg.fast) routes.push('fast');
  else routes.push('main', 'fast');

  for (const route of routes) {
    const w = walkForward(state, p, g, n, route);
    if (w.ownBlocked) out.ownBlocked = true;
    if (w.path) {
      const end = w.path[w.path.length - 1];
      const fast = route === 'fast' && end.zone === 'main' && isFT(end.idx);
      const land = landing(state, p, end);
      const landed = !fast && end.zone === 'main' && isFT(end.idx);
      if (land.ok) out.dests.push({ to: { zone: end.zone, idx: end.idx, fast, ...(landed ? { landed } : {}) }, path: w.path, bump: land.bump });
    }
    // Bull's eye: from the main track, pass a fast-track space with exactly one step left.
    if (route === 'main' && peg.zone === 'main' && n >= 2) {
      const w2 = walkForward(state, p, g, n - 1, 'main');
      if (w2.path) {
        const end = w2.path[w2.path.length - 1];
        if (end.zone === 'main' && isFT(end.idx)) {
          const land = landing(state, p, { zone: 'bull', idx: 0 });
          if (land.ok) {
            out.dests.push({
              to: { zone: 'bull', idx: 0, fast: false },
              path: [...w2.path, { zone: 'bull', idx: 0 }], bump: land.bump,
            });
          }
        }
      }
    }
  }
  return out;
}

/** All places peg g of player p can reach moving exactly n backward. */
export function genBackward(state: GameState, p: number, g: number, n: number): Gen {
  const pl = state.players[p];
  const peg = pl.pegs[g];
  const out: Gen = { dests: [], ownBlocked: false };
  if (peg.zone !== 'main') return out;
  // A peg travelling the fast track can only back out from the corner nearest its pen.
  if (peg.fast && peg.idx !== ftIndex(pl.seat + 1)) return out;
  const path: Pos[] = [];
  let idx = peg.idx;
  let blockedAt = -1;
  for (let k = 0; k < n; k++) {
    idx = wrap(idx - 1);
    const occ = occupant(state, 'main', idx);
    if (occ && occ.p === p) { blockedAt = k; break; }
    path.push({ zone: 'main', idx });
  }
  if (blockedAt >= 0) out.ownBlocked = true;
  if (blockedAt < 0) {
    const end = path[path.length - 1];
    const land = landing(state, p, end);
    if (land.ok) out.dests.push({ to: { zone: 'main', idx: end.idx, fast: false, ...(isFT(end.idx) ? { landed: true } : {}) }, path, bump: land.bump });
  }
  if (n >= 2 && (blockedAt < 0 || blockedAt >= n - 1)) {
    const pre = path.slice(0, n - 1);
    const end = pre[pre.length - 1];
    if (end && isFT(end.idx)) {
      const land = landing(state, p, { zone: 'bull', idx: 0 });
      if (land.ok) {
        out.dests.push({ to: { zone: 'bull', idx: 0, fast: false }, path: [...pre, { zone: 'bull', idx: 0 }], bump: land.bump });
      }
    }
  }
  return out;
}

/** The fast-track peg that must be moved before anything else (nearest its exit), if any. */
export function priorityFastPeg(state: GameState, p: number): number | null {
  const pl = state.players[p];
  let best: number | null = null;
  let bestHops = 99;
  pl.pegs.forEach((peg, g) => {
    if (peg.zone !== 'main' || (!peg.fast && !peg.landed)) return;
    const hops = (((ftIndex(pl.seat) - peg.idx) / SECTION) % SEATS + SEATS) % SEATS;
    if (hops < bestHops) { bestHops = hops; best = g; }
  });
  return best;
}

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function place(state: GameState, p: number, g: number, to: Peg, bump: PegRef | null) {
  if (bump) state.players[bump.p].pegs[bump.g] = { zone: 'pen', idx: bump.g, fast: false };
  state.players[p].pegs[g] = { zone: to.zone, idx: to.idx, fast: to.fast, ...(to.landed ? { landed: true } : {}) };
}

const posKey = (t: Peg) => `${t.zone}.${t.idx}`;

/** Every legal way for the player on turn to use this card. Never empty. */
export function legalMoves(state: GameState, cardId: number): Move[] {
  const p = state.turn;
  const pl = state.players[p];
  const card = pl.hand.find((c) => c.id === cardId);
  if (!card || state.winner !== null) return [];
  const rank = card.rank;
  const n = cardValue(rank);
  const P = priorityFastPeg(state, p);
  const cands = P !== null ? [P] : [0, 1, 2, 3];
  let ownBlocked = false;
  const moves: Move[] = [];
  const single = (dir: 'fwd' | 'back', g: number, d: Dest): Move => ({
    key: `m:${dir}:${g}>${posKey(d.to)}`, type: 'move', dir,
    parts: [{ p, g, to: d.to, path: d.path, bump: d.bump }],
  });
  const backward = (): Move[] => {
    const out: Move[] = [];
    for (const g of cands) {
      const gen = genBackward(state, p, g, n);
      if (g === P && gen.ownBlocked) ownBlocked = true;
      for (const d of gen.dests) out.push(single('back', g, d));
    }
    return out;
  };
  const dead = (): Move[] =>
    P !== null && ownBlocked ? [{ key: `pen:${P}`, type: 'penalty', p, g: P }] : [{ key: 'none', type: 'none' }];

  if (rank === '4') {
    const back = backward();
    return back.length ? back : dead();
  }

  // Forward moves
  for (const g of cands) {
    const gen = genForward(state, p, g, n);
    if (g === P && gen.ownBlocked) ownBlocked = true;
    for (const d of gen.dests) moves.push(single('fwd', g, d));
  }
  if (rank === '7') {
    for (const a of cands) {
      for (let first = 1; first <= 6; first++) {
        for (const dA of genForward(state, p, a, first).dests) {
          // The first part of a split may not be placed on the fast track.
          if (dA.to.zone === 'main' && isFT(dA.to.idx)) continue;
          const tmp = clone(state);
          place(tmp, p, a, dA.to, dA.bump);
          const P2 = priorityFastPeg(tmp, p);
          const seconds = P2 !== null ? [P2] : [0, 1, 2, 3];
          for (const b of seconds) {
            if (b === a) continue;
            for (const dB of genForward(tmp, p, b, 7 - first).dests) {
              moves.push({
                key: `m:fwd:${a}>${posKey(dA.to)}|${b}>${posKey(dB.to)}`, type: 'move', dir: 'fwd',
                parts: [
                  { p, g: a, to: dA.to, path: dA.path, bump: dA.bump },
                  { p, g: b, to: dB.to, path: dB.path, bump: dB.bump },
                ],
              });
            }
          }
        }
      }
    }
  }

  // Alternative effects
  if (P === null && (rank === 'A' || rank === 'JK' || rank === '6')) {
    const g = pl.pegs.findIndex((x) => x.zone === 'pen');
    if (g >= 0) {
      const to: Peg = { zone: 'main', idx: penExit(pl.seat), fast: false };
      const land = landing(state, p, to);
      if (land.ok) moves.push({ key: 'x', type: 'exit', p, g, to, path: [{ zone: 'main', idx: to.idx }], bump: land.bump });
    }
  }
  if (P === null && (rank === 'K' || rank === 'Q' || rank === 'J')) {
    const g = pl.pegs.findIndex((x) => x.zone === 'bull');
    if (g >= 0) {
      const to: Peg = { zone: 'main', idx: ftIndex(pl.seat), fast: false };
      const land = landing(state, p, to);
      if (land.ok) moves.push({ key: `b:${g}`, type: 'bullExit', p, g, to, path: [{ zone: 'main', idx: to.idx }], bump: land.bump });
    }
  }
  if (rank === 'J') {
    const onBoard: PegRef[] = [];
    state.players.forEach((q, qi) => q.pegs.forEach((peg, gi) => {
      if (peg.zone === 'main' || peg.zone === 'bull') onBoard.push({ p: qi, g: gi });
    }));
    for (let i = 0; i < onBoard.length; i++) {
      for (let j = i + 1; j < onBoard.length; j++) {
        const a = onBoard[i], b = onBoard[j];
        if (a.p === b.p) continue;
        if (state.rules.jackSwapNeedsOwnPeg && a.p !== p && b.p !== p) continue;
        if (P !== null && !((a.p === p && a.g === P) || (b.p === p && b.g === P))) continue;
        moves.push({ key: `s:${a.p}.${a.g}-${b.p}.${b.g}`, type: 'swap', a, b });
      }
    }
  }
  if (moves.length) return moves;

  // A fast-track peg stopped by one of its own colour goes back to the pen.
  if (P !== null && ownBlocked) return dead();
  // Otherwise, when nothing can go forward, a peg must go backward by the card's value.
  const back = backward();
  return back.length ? back : dead();
}

/** Play a card with one of its legal moves. Returns a new state; the input is not changed. */
export function applyMove(prev: GameState, cardId: number, moveKey: string): GameState {
  const move = legalMoves(prev, cardId).find((m) => m.key === moveKey);
  if (!move) throw new Error(`Illegal move ${moveKey} for card ${cardId}`);
  const state = clone(prev);
  const p = state.turn;
  const pl = state.players[p];
  const ci = pl.hand.findIndex((c) => c.id === cardId);
  const card = pl.hand.splice(ci, 1)[0];
  pl.discard.push(card);
  state.moveCount++;

  switch (move.type) {
    case 'move': for (const part of move.parts) place(state, part.p, part.g, part.to, part.bump); break;
    case 'exit': case 'bullExit': place(state, move.p, move.g, move.to, move.bump); break;
    case 'swap': {
      const A = state.players[move.a.p].pegs[move.a.g];
      const B = state.players[move.b.p].pegs[move.b.g];
      const a: Peg = { zone: B.zone, idx: B.idx, fast: false };
      const b: Peg = { zone: A.zone, idx: A.idx, fast: false };
      state.players[move.a.p].pegs[move.a.g] = a;
      state.players[move.b.p].pegs[move.b.g] = b;
      break;
    }
    case 'penalty': state.players[move.p].pegs[move.g] = { zone: 'pen', idx: move.g, fast: false }; break;
    case 'none': break;
  }

  if (pl.pegs.every((x) => x.zone === 'home')) { state.winner = p; return state; }
  if (PLAY_AGAIN.has(card.rank)) {
    if (pl.hand.length === 0) drawTo(state, p, HAND_SIZE);
  } else {
    drawTo(state, p, HAND_SIZE);
    state.turn = (p + 1) % state.players.length;
  }
  return state;
}

/** What one player is allowed to see: other players' hands and all draw piles are hidden. */
export function viewFor(state: GameState, viewer: number) {
  return {
    ...clone({ rules: state.rules, turn: state.turn, winner: state.winner, cuts: state.cuts, moveCount: state.moveCount }),
    players: state.players.map((pl, i) => ({
      seat: pl.seat, name: pl.name, bot: pl.bot, pegs: clone(pl.pegs),
      handCount: pl.hand.length, deckCount: pl.deck.length,
      lastDiscard: pl.discard.length ? pl.discard[pl.discard.length - 1] : null,
      hand: i === viewer ? clone(pl.hand) : null,
    })),
  };
}

// ---------- bot ----------
function remaining(peg: Peg, seat: number): number {
  if (peg.zone === 'pen') return 95;
  if (peg.zone === 'home') return (HOME_LEN - 1 - peg.idx) * 0.3;
  if (peg.zone === 'bull') return 15;
  const d = wrap(homeEntrance(seat) - peg.idx);
  if (isFT(peg.idx) && peg.idx !== ftIndex(seat)) {
    const hops = (((ftIndex(seat) - peg.idx) / SECTION) % SEATS + SEATS) % SEATS;
    const viaFast = hops + HOME_ENTRANCE_OFFSET;
    return 4 + (peg.fast ? viaFast : Math.min(viaFast, d));
  }
  return 4 + d;
}

export function evaluate(state: GameState, p: number): number {
  if (state.winner === p) return 10000;
  let mine = 0, theirs = 0;
  state.players.forEach((pl, i) => {
    const sum = pl.pegs.reduce((s, peg) => s + remaining(peg, pl.seat), 0);
    if (i === p) mine = sum; else theirs += sum;
  });
  return -mine + (0.6 * theirs) / Math.max(1, state.players.length - 1);
}

/** One-step lookahead: the card and move that leave the bot best off. */
export function chooseBotMove(state: GameState): { cardId: number; move: Move } {
  const p = state.turn;
  const pl = state.players[p];
  const penCount = pl.pegs.filter((x) => x.zone === 'pen').length;
  let best: { cardId: number; move: Move } | null = null;
  let bestScore = -Infinity;
  const seen = new Set<Rank>();
  for (const card of pl.hand) {
    if (seen.has(card.rank)) continue;
    seen.add(card.rank);
    for (const move of legalMoves(state, card.id)) {
      let score = evaluate(applyMove(state, card.id, move.key), p);
      if (PLAY_AGAIN.has(card.rank)) score += 1;
      const opensPen = card.rank === 'A' || card.rank === 'JK' || card.rank === '6';
      if (opensPen && move.type !== 'exit' && penCount > 0) score -= 6;
      if (move.type === 'none') score -= opensPen ? 8 : 0.5;
      if (score > bestScore) { bestScore = score; best = { cardId: card.id, move }; }
    }
  }
  return best!;
}
