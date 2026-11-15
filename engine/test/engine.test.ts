import * as FT from '../src/engine';

let passed = 0, failed = 0;
function ok(cond: any, name: string) {
  if (cond) passed++; else { failed++; console.log('FAIL', name); }
}
function eq(a: any, b: any, name: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${name}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
}

/** A 2-player game (seats 0 and 3) with player 0 on turn holding the given ranks. */
function setup(ranks: FT.Rank[], pegs0: Partial<FT.Peg>[] = [], pegs1: Partial<FT.Peg>[] = []) {
  const s = FT.createGame({ players: [{ name: 'a' }, { name: 'b' }], seed: 7 });
  s.turn = 0;
  const pl = s.players[0];
  const all = [...pl.hand, ...pl.deck];
  pl.hand = ranks.map((r) => { const i = all.findIndex((c) => c.rank === r); return all.splice(i, 1)[0]; });
  pl.deck = all;
  pegs0.forEach((x, i) => (s.players[0].pegs[i] = { zone: 'pen', idx: i, fast: false, ...x } as FT.Peg));
  pegs1.forEach((x, i) => (s.players[1].pegs[i] = { zone: 'pen', idx: i, fast: false, ...x } as FT.Peg));
  return s;
}
const card = (s: FT.GameState, r: FT.Rank) => s.players[s.turn].hand.find((c) => c.rank === r)!.id;
const keys = (s: FT.GameState, r: FT.Rank) => FT.legalMoves(s, card(s, r)).map((m) => m.key).sort();
const E0 = FT.homeEntrance(0), X0 = FT.penExit(0);

// --- setup
{
  const s = FT.createGame({ players: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], seed: 1 });
  eq(s.players.map((p) => p.seat), [0, 2, 4], 'three players sit on alternate arms');
  ok(s.players.every((p) => p.hand.length === 5 && p.deck.length === 49), 'five cards each from a 54-card deck');
}
// --- leaving the pen
{
  const s = setup(['A', '6', 'JK', 'K', '5']);
  eq(keys(s, 'A'), ['x'], 'ace leaves the pen');
  eq(keys(s, '6'), ['x'], 'six leaves the pen');
  eq(keys(s, 'JK'), ['x'], 'joker leaves the pen');
  eq(keys(s, 'K'), ['none'], 'king cannot leave the pen');
  eq(keys(s, '5'), ['none'], 'five has no effect with nothing in play');
  const t = FT.applyMove(s, card(s, '6'), 'x');
  eq(t.players[0].pegs[0], { zone: 'main', idx: X0, fast: false }, 'six goes only to the exit space');
  eq(t.turn, 0, 'six plays again');
  eq(t.players[0].hand.length, 4, 'no draw after a play-again card');
  const u = FT.applyMove(s, card(s, '5'), 'none');
  eq(u.turn, 1, 'turn passes after an ordinary card');
  eq(u.players[0].hand.length, 5, 'hand refilled to five');
}
// --- all five are play-again cards: fresh hand of five
{
  let s = setup(['K', 'K', 'Q', 'Q', 'J']);
  for (let i = 0; i < 5; i++) s = FT.applyMove(s, s.players[0].hand[0].id, 'none');
  eq([s.turn, s.players[0].hand.length], [0, 5], 'new hand of five after five play-again cards');
}
// --- backward four, then straight into home
{
  let s = setup(['4', '5', '2', '3', '8'], [{ zone: 'main', idx: X0 }]);
  eq(keys(s, '4'), [`m:back:0>main.${X0 - 4}`], 'four moves backward');
  s = FT.applyMove(s, card(s, '4'), `m:back:0>main.${X0 - 4}`);
  s.turn = 0;
  eq(keys(s, '5'), ['m:fwd:0>home.2'], 'after backing past the entrance, exact count enters home');
  eq(keys(s, '8'), ['m:back:0>main.81'], 'card too big for home forces a backward move');
}
// --- home row: exact count, no hopping, safe
{
  const s = setup(['2', '3', 'J', '9', '10'], [{ zone: 'home', idx: 0 }, { zone: 'home', idx: 2 }]);
  eq(keys(s, '2'), ['none'], 'cannot hop own peg inside home');
  eq(keys(s, '3'), ['none'], 'cannot overshoot home');
  ok(!keys(s, 'J').some((k) => k.startsWith('s:')), 'home pegs cannot be swapped');
}
// --- own pegs block, opponents get bumped
{
  const s = setup(['2', '3', '5', '9', '10'], [{ zone: 'main', idx: 20 }, { zone: 'main', idx: 22 }], [{ zone: 'main', idx: 25 }]);
  ok(!keys(s, '2').includes('m:fwd:0>main.22'), 'cannot land on own peg');
  ok(!keys(s, '3').includes('m:fwd:0>main.23'), 'cannot hop own peg');
  ok(!keys(s, '5').includes('m:fwd:0>main.25') && keys(s, '5').includes('m:fwd:1>main.27'), 'blocked peg cannot use the card but another can');
}
{
  const s = setup(['3', '5', '2', '9', '10'], [{ zone: 'main', idx: 22 }], [{ zone: 'main', idx: 25 }]);
  const t = FT.applyMove(s, card(s, '3'), 'm:fwd:0>main.25');
  eq(t.players[1].pegs[0], { zone: 'pen', idx: 0, fast: false }, 'landing on an opponent sends it to its pen');
}
// --- fast track
{
  // Seat 0 peg sits on seat 2's corner (idx 28), just landed.
  let s = setup(['2', '3', '5', '9', '10'], [{ zone: 'main', idx: 28, landed: true }, { zone: 'main', idx: 40 }]);
  eq(keys(s, '2'), ['m:fwd:0>main.30', 'm:fwd:0>main.56'], 'a just-landed peg must move first, and may circle or stay on the main track');
  eq(FT.applyMove(s, card(s, '2'), 'm:fwd:0>main.30').players[0].pegs[0], { zone: 'main', idx: 30, fast: false }, 'carrying on around the main track leaves the fast track');
  s = FT.applyMove(s, card(s, '2'), 'm:fwd:0>main.56');
  eq(s.players[0].pegs[0], { zone: 'main', idx: 56, fast: true }, 'two hops around the fast track');
  s.turn = 0;
  eq(keys(s, '3'), ['m:fwd:0>main.1'], 'must move the fast-track peg first; it leaves at its own corner');
  eq(keys(s, '9'), ['m:fwd:0>main.' + E0], 'own corner then seven to the home entrance');
  eq(keys(s, '10'), ['m:fwd:0>home.0'], 'fast track straight into home');
  eq(keys(s, '5'), ['m:fwd:0>main.3'], 'cannot stay on the fast track past its own corner');
}
{
  // Blocked by own colour on the fast track: back to the pen.
  const s = setup(['2', '3', '4', '9', '10'], [{ zone: 'main', idx: 56, fast: true }, { zone: 'main', idx: 70 }]);
  eq(keys(s, '2'), ['pen:0'], 'fast-track peg that would hop its own colour returns to the pen');
  eq(keys(s, '4'), ['none'], 'fast-track peg can only back out from the corner nearest its pen');
  const t = FT.applyMove(s, card(s, '2'), 'pen:0');
  eq(t.players[0].pegs[0].zone, 'pen', 'penalty applied');
}
{
  const s = setup(['4', '3', '5', '9', '10'], [{ zone: 'main', idx: 14, fast: true }]);
  eq(keys(s, '4'), ['m:back:0>main.10'], 'backs out from the corner nearest its pen');
}
{
  // A peg riding the fast track freezes everything else: no leaving the pen, no other peg, no bull's-eye exit.
  const s = setup(['A', '6', 'JK', 'K', '7'], [{ zone: 'main', idx: 56, fast: true }, { zone: 'pen', idx: 1 }, { zone: 'bull', idx: 0 }, { zone: 'main', idx: 40 }], [{ zone: 'main', idx: 80 }]);
  eq(keys(s, 'A'), ['m:fwd:0>main.70'], 'ace cannot leave the pen or move another peg while a peg rides the fast track');
  eq(keys(s, 'JK'), ['m:fwd:0>main.70'], 'joker cannot leave the pen while a peg rides the fast track');
  eq(keys(s, '6'), ['m:fwd:0>main.4'], 'six cannot leave the pen while a peg rides the fast track');
  eq(keys(s, 'K'), ['m:fwd:0>main.70'], 'king cannot leave the bull\'s eye while a peg rides the fast track');
  const k7 = keys(s, '7');
  ok(k7.length > 0 && k7.every((k) => k.startsWith('m:fwd:0>')), 'seven must start with the fast-track peg');
  ok(k7.includes('m:fwd:0>main.5') && k7.includes('m:fwd:0>main.1|3>main.44'), 'seven can finish on another peg once the fast-track peg has left');
  const s2 = setup(['J', '4', '2', '9', '10'], [{ zone: 'main', idx: 56, fast: true }, { zone: 'pen', idx: 1 }, { zone: 'bull', idx: 0 }, { zone: 'main', idx: 40 }], [{ zone: 'main', idx: 80 }]);
  const kj = keys(s2, 'J');
  ok(kj.includes('m:fwd:0>main.70') && kj.every((k) => k === 'm:fwd:0>main.70' || k === 's:0.0-1.0'), 'jack may only move or swap the fast-track peg');
  eq(keys(s2, '4'), ['none'], 'four cannot back up another peg while a peg rides the fast track');
  eq(keys(s2, '2'), ['m:fwd:0>main.0'], 'number cards move only the fast-track peg');
  // Still frozen while it sits on its own corner waiting to leave the fast track.
  const s3 = setup(['A', '6', '2', '9', '10'], [{ zone: 'main', idx: 0, fast: true }, { zone: 'pen', idx: 1 }, { zone: 'main', idx: 40 }]);
  eq([keys(s3, 'A'), keys(s3, '6'), keys(s3, '2')], [['m:fwd:0>main.1'], ['m:fwd:0>main.6'], ['m:fwd:0>main.2']], 'frozen until the peg steps off its own corner');
  // Two pegs riding: the one nearest its exit goes first.
  const s4 = setup(['2', 'A', '3', '9', '10'], [{ zone: 'main', idx: 28, fast: true }, { zone: 'main', idx: 56, fast: true }]);
  eq(keys(s4, 'A'), ['m:fwd:1>main.70'], 'with two on the fast track, the one nearest its exit moves first');
}
{
  // Out of the pen, then exactly five to the corner: that peg is now on the fast track.
  let s = setup(['5', 'A', '6', '4', '3'], [{ zone: 'main', idx: X0 }, { zone: 'pen', idx: 1 }, { zone: 'main', idx: 40 }]);
  s = FT.applyMove(s, card(s, '5'), 'm:fwd:0>main.14');
  eq(s.players[0].pegs[0], { zone: 'main', idx: 14, fast: false, landed: true }, 'landing exactly on a corner puts the peg on the fast track');
  s.turn = 0;
  eq(keys(s, 'A'), ['m:fwd:0>main.15', 'm:fwd:0>main.28'], 'a just-landed peg blocks leaving the pen with an ace');
  eq(keys(s, '6'), ['m:fwd:0>main.1', 'm:fwd:0>main.20'], 'a just-landed peg blocks leaving the pen with a six');
  eq(keys(s, '3'), ['m:fwd:0>main.17', 'm:fwd:0>main.56'], 'a just-landed peg blocks moving another peg');
  eq(keys(s, '4'), ['m:back:0>main.10'], 'a just-landed peg can back out the way it came');
  const t = FT.applyMove(s, card(s, '3'), 'm:fwd:0>main.17'); t.turn = 0;
  ok(keys(t, 'A').includes('x') && keys(t, 'A').includes('m:fwd:2>main.41'), 'once it moves off the corner, other pegs and the pen are free again');
}
{
  // Backing onto a corner counts too; a swap or leaving the bull's eye does not.
  let s = setup(['4', 'A', '2', '9', '10'], [{ zone: 'main', idx: 18 }, { zone: 'pen', idx: 1 }]);
  s = FT.applyMove(s, card(s, '4'), 'm:back:0>main.14'); s.turn = 0;
  eq(keys(s, 'A'), ['m:fwd:0>main.15', 'm:fwd:0>main.28'], 'backing onto a corner also counts as on the fast track');
  let b = setup(['K', 'A', '2', '9', '10'], [{ zone: 'bull', idx: 0 }, { zone: 'pen', idx: 1 }]);
  b = FT.applyMove(b, card(b, 'K'), 'b:0');
  ok(keys(b, 'A').includes('x'), 'a peg that left the bull\'s eye does not freeze the others');
}
// --- bull's eye
{
  let s = setup(['6', '5', 'K', '2', 'A'], [{ zone: 'main', idx: X0 }]);
  ok(keys(s, '6').includes('m:fwd:0>bull.0'), 'overshoot a fast-track corner by one to reach the bull\'s eye');
  ok(keys(s, '5').includes('m:fwd:0>main.14'), 'exact count lands on the corner');
  s = FT.applyMove(s, card(s, '6'), 'm:fwd:0>bull.0');
  eq(keys(s, '2'), ['none'], 'number cards cannot leave the bull\'s eye');
  eq(keys(s, 'A'), ['x'], 'ace cannot leave the bull\'s eye');
  eq(keys(s, 'K'), ['b:0'], 'king leaves the bull\'s eye');
  s = FT.applyMove(s, card(s, 'K'), 'b:0');
  eq(s.players[0].pegs[0], { zone: 'main', idx: 0, fast: false }, 'bull\'s eye exits to own corner');
}
{
  const s = setup(['A', '2', '3', '9', '10'], [{ zone: 'main', idx: 14 }]);
  ok(!keys(s, 'A').includes('m:fwd:0>bull.0'), 'a move of one cannot go from a corner to the bull\'s eye');
}
// --- seven
{
  const s = setup(['7', '2', '3', '9', '10'], [{ zone: 'main', idx: 30 }, { zone: 'main', idx: 40 }]);
  const k = keys(s, '7');
  ok(k.includes('m:fwd:0>main.37') && k.includes('m:fwd:0>main.33|1>main.44'), 'seven moves one peg or splits between two');
  ok(k.includes('m:fwd:1>main.41|0>main.36'), 'split works in either order');
  ok(!k.some((x) => x.startsWith('m:fwd:1>main.42|')), 'first part of a split cannot stop on the fast track');
  ok(k.includes('m:fwd:0>main.35|1>main.42'), 'second part of a split can stop on the fast track');
}
{
  const s = setup(['7', '2', '3', '9', '10'], [{ zone: 'home', idx: 2 }, { zone: 'main', idx: 30 }, { zone: 'home', idx: 3 }]);
  eq(keys(s, '7'), ['m:fwd:1>main.37'], 'no split available when the other peg cannot move');
}
// --- jack
{
  const s = setup(['J', '2', '3', '9', '10'], [{ zone: 'main', idx: 30 }], [{ zone: 'main', idx: 80 }, { zone: 'bull', idx: 0 }]);
  const k = keys(s, 'J');
  ok(k.includes('m:fwd:0>main.31') && k.includes('s:0.0-1.0') && k.includes('s:0.0-1.1'), 'jack moves one or swaps, including with the bull\'s eye');
  const t = FT.applyMove(s, card(s, 'J'), 's:0.0-1.1');
  eq([t.players[0].pegs[0].zone, t.players[1].pegs[1].idx, t.turn], ['bull', 30, 0], 'swap exchanges places and plays again');
}
{
  const s = setup(['J', '2', '3', '9', '10'], [], [{ zone: 'main', idx: 80 }]);
  const t = FT.createGame({ players: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], seed: 3 });
  eq(keys(s, 'J'), ['none'], 'jack cannot swap when none of your pegs are on the track');
  t.turn = 0; t.players[1].pegs[0] = { zone: 'main', idx: 40, fast: false }; t.players[2].pegs[0] = { zone: 'main', idx: 60, fast: false };
  const j = [...t.players[0].hand, ...t.players[0].deck].find((c) => c.rank === 'J')!;
  t.players[0].deck = t.players[0].deck.filter((c) => c.id !== j.id); t.players[0].hand = [j, ...t.players[0].hand.filter((c) => c.id !== j.id)].slice(0, 5);
  ok(!FT.legalMoves(t, j.id).some((m) => m.type === 'swap'), 'jack cannot swap two opponents by default');
  t.rules.jackSwapNeedsOwnPeg = false;
  ok(FT.legalMoves(t, j.id).some((m) => m.key === 's:1.0-2.0'), 'optional rule: jack may swap two opponents');
}
// --- winning
{
  const s = setup(['2', '3', '5', '9', '10'], [{ zone: 'home', idx: 3 }, { zone: 'home', idx: 2 }, { zone: 'home', idx: 1 }, { zone: 'main', idx: E0 - 1 }]);
  const t = FT.applyMove(s, card(s, '2'), 'm:fwd:3>home.0');
  eq(t.winner, 0, 'all four home wins');
}
// --- hidden information
{
  const s = setup(['2', '3', '5', '9', '10']);
  const v = FT.viewFor(s, 0);
  ok(v.players[0].hand!.length === 5 && v.players[1].hand === null && !('deck' in v.players[0]), 'view hides other hands and all decks');
}

// --- full games between bots, checking invariants every move
function check(s: FT.GameState, label: string) {
  const seen = new Set<string>();
  s.players.forEach((pl) => {
    if (pl.deck.length + pl.hand.length + pl.discard.length !== 54) throw new Error(label + ': card count');
    const ids = new Set([...pl.deck, ...pl.hand, ...pl.discard].map((c) => c.id));
    if (ids.size !== 54) throw new Error(label + ': duplicate card');
    pl.pegs.forEach((peg, g) => {
      const k = peg.zone === 'main' || peg.zone === 'bull' ? `${peg.zone}.${peg.idx}` : `${peg.zone}.${pl.seat}.${peg.idx}`;
      if (seen.has(k)) throw new Error(label + ': two pegs on ' + k);
      seen.add(k);
      if ((peg.fast || peg.landed) && !(peg.zone === 'main' && FT.isFT(peg.idx))) throw new Error(label + ': fast flag off the fast track');
      if (peg.fast && peg.landed) throw new Error(label + ': both fast flags');
      if (peg.zone === 'pen' && peg.idx !== g) throw new Error(label + ': pen slot');
      if (peg.zone === 'home' && (peg.idx < 0 || peg.idx > 3)) throw new Error(label + ': home index');
    });
  });
}
let games = 0, totalMoves = 0, maxMoves = 0; const kinds: Record<string, number> = {};
for (let n = 2; n <= 6; n++) {
  for (let seed = 1; seed <= 12; seed++) {
    let s = FT.createGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'p' + i, bot: true })), seed: seed * 31 + n });
    const random = seed % 3 === 0; // a third of the games use random legal moves to reach odd positions
    let r = seed;
    while (s.winner === null && s.moveCount < 20000) {
      let cardId: number, move: FT.Move;
      if (random) {
        const hand = s.players[s.turn].hand;
        r = (r * 1103515245 + 12345) & 0x7fffffff;
        cardId = hand[r % hand.length].id;
        const ms = FT.legalMoves(s, cardId);
        if (!ms.length) throw new Error('no legal moves');
        r = (r * 1103515245 + 12345) & 0x7fffffff;
        move = ms[r % ms.length];
      } else ({ cardId, move } = FT.chooseBotMove(s));
      kinds[move.type] = (kinds[move.type] || 0) + 1;
      s = FT.applyMove(s, cardId, move.key);
      check(s, `n=${n} seed=${seed} move=${s.moveCount}`);
    }
    if (!random) ok(s.winner !== null, `bot game finishes (n=${n}, seed=${seed})`);
    if (!random) { games++; totalMoves += s.moveCount; maxMoves = Math.max(maxMoves, s.moveCount); }
  }
}
console.log(`bot games: ${games}, avg cards played ${Math.round(totalMoves / games)}, longest ${maxMoves}`);
console.log('move kinds seen:', JSON.stringify(kinds));
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
