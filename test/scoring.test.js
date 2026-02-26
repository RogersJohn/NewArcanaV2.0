import { describe, it, expect } from 'vitest';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { createInitialState } from '../src/state.js';
import { scoreRoundEnd, scoreGameEnd, checkCelestialWin, resolveBonus, resolveFool } from '../src/scoring.js';
import { RandomAI } from '../src/ai/base.js';

function mc(suit, rank) { return createMinorCard(suit, rank); }
function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(number, def.name, def.category, def.keywords);
}

function makeTestState(numPlayers = 4) {
  const state = createInitialState(numPlayers);
  state.minorDeck = [];
  state.majorDeck = [];
  state.minorDiscard = [];
  state.display = [null, null, null];
  state.pot = 10;
  state.roundEndMarkerHolder = 0;
  for (const p of state.players) {
    p.hand = [];
    p.realm = [];
    p.tome = [];
  }
  return state;
}

class TestMagicianAI extends RandomAI {
  constructor(suit) { super(); this.magSuit = suit; }
  chooseMagicianSuit() { return this.magSuit; }
}

describe('Pot Award', () => {
  it('awards pot to player with best poker hand', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = 0;

    // Player 0: pair of 5s
    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    // Player 1: three 3s (beats pair)
    state.players[1].realm = [mc('WANDS', 3), mc('CUPS', 3), mc('SWORDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    expect(state.players[1].vp).toBeGreaterThan(0);
    expect(state.pot).toBe(0);
  });

  it('does not award pot if no one has round-end marker', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = -1;

    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    state.players[1].realm = [mc('WANDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    expect(state.pot).toBe(10); // Not awarded
  });

  it('pot not awarded when all realms empty', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = 0;

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Pot stays (nobody has cards)
    expect(state.pot).toBe(10);
  });
});

describe('Bonus Cards', () => {
  it('High Priestess: 1vp for most Wands (wilds not counted, ties OK)', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1; // Don't award pot

    const priestess = major(2);
    state.players[0].tome = [priestess];
    state.players[0].realm = [mc('WANDS', 3), mc('WANDS', 7)];
    state.players[1].realm = [mc('WANDS', 5)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, priestess, ais);
    expect(bonus).toBe(1);
  });

  it('High Priestess: ties still score', () => {
    const state = makeTestState(2);
    const priestess = major(2);
    state.players[0].tome = [priestess];
    state.players[0].realm = [mc('WANDS', 3)];
    state.players[1].realm = [mc('WANDS', 5)]; // Same count

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, priestess, ais);
    expect(bonus).toBe(1); // Ties OK
  });

  it('Empress: 1vp for most Cups', () => {
    const state = makeTestState(2);
    const empress = major(3);
    state.players[0].tome = [empress];
    state.players[0].realm = [mc('CUPS', 10), mc('CUPS', 'KING')];
    state.players[1].realm = [mc('CUPS', 2)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, empress, ais);
    expect(bonus).toBe(1);
  });

  it('Emperor: 1vp for most Coins', () => {
    const state = makeTestState(2);
    const emperor = major(4);
    state.players[0].tome = [emperor];
    state.players[0].realm = [mc('COINS', 8)];
    state.players[1].realm = [mc('COINS', 3), mc('COINS', 5)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, emperor, ais);
    expect(bonus).toBe(0); // Player 1 has more
  });

  it('Justice: 1vp for most Swords', () => {
    const state = makeTestState(2);
    const justice = major(11);
    state.players[0].tome = [justice];
    state.players[0].realm = [mc('SWORDS', 9), mc('SWORDS', 2)];
    state.players[1].realm = [mc('WANDS', 5)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, justice, ais);
    expect(bonus).toBe(1);
  });

  it('Magician: 1vp if strictly MORE of named suit (no ties)', () => {
    const state = makeTestState(2);
    const magician = major(1);
    state.players[0].tome = [magician];
    state.players[0].realm = [mc('CUPS', 5), mc('CUPS', 8)];
    state.players[1].realm = [mc('CUPS', 3), mc('CUPS', 9)]; // Same count

    const ais = [new TestMagicianAI('CUPS'), new RandomAI()];
    const bonus = resolveBonus(state, 0, magician, ais);
    expect(bonus).toBe(0); // Tied, Magician needs strictly MORE
  });

  it('Lovers: 1vp per pair', () => {
    const state = makeTestState(2);
    const lovers = major(6);
    state.players[0].tome = [lovers];
    state.players[0].realm = [
      mc('WANDS', 5), mc('CUPS', 5),
      mc('SWORDS', 9), mc('COINS', 9),
      mc('WANDS', 3)
    ];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, lovers, ais);
    expect(bonus).toBe(2); // Two pairs
  });

  it('Hermit: 1vp if only card in Tome', () => {
    const state = makeTestState(2);
    const hermit = major(9);
    state.players[0].tome = [hermit];
    state.players[0].realm = [mc('WANDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, hermit, ais);
    expect(bonus).toBe(1);
  });

  it('Hermit: 0vp if other cards in Tome', () => {
    const state = makeTestState(2);
    const hermit = major(9);
    const fool = major(0);
    state.players[0].tome = [hermit, fool];
    state.players[0].realm = [mc('WANDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, hermit, ais);
    expect(bonus).toBe(0);
  });

  it('Temperance bonus: 1vp if no Cups in realm', () => {
    const state = makeTestState(2);
    const temperance = major(14);
    state.players[0].tome = [temperance];
    state.players[0].realm = [mc('WANDS', 5), mc('SWORDS', 8)]; // No cups

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, temperance, ais);
    expect(bonus).toBe(1);
  });

  it('Temperance bonus: 0vp if Cups in realm', () => {
    const state = makeTestState(2);
    const temperance = major(14);
    state.players[0].tome = [temperance];
    state.players[0].realm = [mc('CUPS', 5), mc('SWORDS', 8)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, temperance, ais);
    expect(bonus).toBe(0);
  });
});

describe('Hierophant', () => {
  it('failed bonuses score 1vp when Hierophant is in Tome', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1;

    const hierophant = major(5);
    const emperor = major(4); // Coins bonus - will fail
    state.players[0].tome = [hierophant, emperor];
    state.players[0].realm = [mc('WANDS', 3)]; // No coins in realm
    state.players[1].realm = [mc('COINS', 5), mc('COINS', 8)]; // Player 1 has more coins

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Emperor failed, but Hierophant gives 1vp for the failure
    expect(state.players[0].vp).toBe(1);
  });

  it('Hierophant blesses bonus cards even when realm is empty', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1;

    const hierophant = major(5);
    const magician = major(1);
    state.players[0].tome = [hierophant, magician];
    state.players[0].realm = []; // Empty realm

    const ais = [new TestMagicianAI('CUPS'), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Magician failed (no realm), but Hierophant gives 1vp
    expect(state.players[0].vp).toBe(1);
  });

  it('Without Hierophant, bonus cards score 0 with empty realm', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1;

    const magician = major(1);
    state.players[0].tome = [magician];
    state.players[0].realm = []; // Empty realm, no Hierophant

    const ais = [new TestMagicianAI('CUPS'), new RandomAI()];
    scoreRoundEnd(state, ais);

    expect(state.players[0].vp).toBe(0);
  });
});

describe('Celestial Win', () => {
  it('detects 3 celestials in Tome/Realm/Vault', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(18)]; // Star, Moon
    state.players[0].realm = [major(19)]; // Sun

    const winner = checkCelestialWin(state);
    expect(winner).toBe(0);
  });

  it('returns -1 with fewer than 3 celestials', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(18)];

    const winner = checkCelestialWin(state);
    expect(winner).toBe(-1);
  });

  it('counts celestials across Tome, Realm, and Vault', () => {
    const state = makeTestState(2);
    state.players[1].tome = [major(17)];
    state.players[1].realm = [major(18)];
    state.players[1].vault = [major(21)]; // The World

    const winner = checkCelestialWin(state);
    expect(winner).toBe(1);
  });
});

describe('Game End Scoring', () => {
  it('Celestials earn 2vp each', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(18)];

    scoreGameEnd(state);

    expect(state.players[0].vp).toBe(4); // 2 celestials * 2vp
  });

  it('Plague costs -3vp', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(26)]; // Plague

    scoreGameEnd(state);

    expect(state.players[0].vp).toBe(-3);
  });

  it('Celestials and Plague stack correctly', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(26)]; // Star + Plague

    scoreGameEnd(state);

    expect(state.players[0].vp).toBe(-1); // 2 - 3 = -1
  });
});

describe('Fool Duplication', () => {
  it('duplicates best opponent bonus', () => {
    const state = makeTestState(2);
    const fool = major(0);
    state.players[0].tome = [fool];
    state.players[0].realm = [mc('SWORDS', 5), mc('SWORDS', 8)];

    // Opponent has Justice (Swords bonus) and meets it
    const justice = major(11);
    state.players[1].tome = [justice];
    state.players[1].realm = [mc('SWORDS', 3), mc('SWORDS', 9), mc('SWORDS', 'KING')];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveFool(state, 0, ais);
    // Fool duplicates the opponent's Justice bonus evaluation
    // Opponent has 3 swords (most), so bonus = 1
    expect(bonus).toBe(1);
  });
});
