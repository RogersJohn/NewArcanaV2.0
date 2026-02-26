import { describe, it, expect } from 'vitest';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { createInitialState } from '../src/state.js';
import { resolveRoyalAttack, checkAceBlock, resolveStrength, resolveChariot, applyTomeEffect } from '../src/effects.js';
import { RandomAI } from '../src/ai/base.js';

function mc(suit, rank) { return createMinorCard(suit, rank); }
function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(number, def.name, def.category, def.keywords);
}

/** Create a minimal test state with 2 players */
function makeTestState() {
  const state = createInitialState(2);
  // Clear decks - we'll set up manually
  state.minorDeck = [];
  state.majorDeck = [];
  state.minorDiscard = [];
  state.display = [null, null, null];
  state.players[0].hand = [];
  state.players[1].hand = [];
  state.players[0].realm = [];
  state.players[1].realm = [];
  state.players[0].tome = [];
  state.players[1].tome = [];
  state.log = [];
  return state;
}

class AlwaysBlockAI extends RandomAI {
  shouldBlockWithAce() { return true; }
  shouldBlockWithKing() { return true; }
}

class NeverBlockAI extends RandomAI {
  shouldBlockWithAce() { return false; }
  shouldBlockWithKing() { return false; }
}

describe('Royal Attacks', () => {
  it('Page destroys target and both go to Pit', () => {
    const state = makeTestState();
    const page = mc('CUPS', 'PAGE');
    const target = mc('CUPS', 5);
    state.players[0].hand = [page];
    state.players[1].realm = [target];
    const ais = [new NeverBlockAI(), new NeverBlockAI()];

    resolveRoyalAttack(state, 0, page, 1, 0, ais);

    expect(state.players[1].realm.length).toBe(0);
    expect(state.pit.length).toBe(2);
    expect(state.pit.some(c => c.id === page.id)).toBe(true);
    expect(state.pit.some(c => c.id === target.id)).toBe(true);
  });

  it('Knight steals target into hand, Knight goes to Pit', () => {
    const state = makeTestState();
    const knight = mc('SWORDS', 'KNIGHT');
    const target = mc('SWORDS', 8);
    state.players[0].hand = [knight];
    state.players[1].realm = [target];
    const ais = [new NeverBlockAI(), new NeverBlockAI()];

    resolveRoyalAttack(state, 0, knight, 1, 0, ais);

    expect(state.players[1].realm.length).toBe(0);
    expect(state.players[0].hand.some(c => c.id === target.id)).toBe(true);
    expect(state.pit.length).toBe(1);
    expect(state.pit[0].id).toBe(knight.id);
  });

  it('Queen moves target to attacker realm, Queen goes to Pit', () => {
    const state = makeTestState();
    const queen = mc('WANDS', 'QUEEN');
    const target = mc('WANDS', 10);
    state.players[0].hand = [queen];
    state.players[1].realm = [target];
    const ais = [new NeverBlockAI(), new NeverBlockAI()];

    resolveRoyalAttack(state, 0, queen, 1, 0, ais);

    expect(state.players[1].realm.length).toBe(0);
    expect(state.players[0].realm.some(c => c.id === target.id)).toBe(true);
    expect(state.pit.length).toBe(1);
    expect(state.pit[0].id).toBe(queen.id);
  });

  it('Royal attack on wild card succeeds (wild is every suit)', () => {
    const state = makeTestState();
    const page = mc('COINS', 'PAGE');
    const wildCard = major(17); // The Star as wild
    state.players[0].hand = [page];
    state.players[1].realm = [wildCard]; // Wild in realm
    const ais = [new NeverBlockAI(), new NeverBlockAI()];

    resolveRoyalAttack(state, 0, page, 1, 0, ais);

    expect(state.players[1].realm.length).toBe(0);
    expect(state.pit.length).toBe(2);
  });
});

describe('King Blocking', () => {
  it('King blocks Royal attack, both go to Pit', () => {
    const state = makeTestState();
    const page = mc('CUPS', 'PAGE');
    const target = mc('CUPS', 7);
    const king = mc('SWORDS', 'KING'); // King of any suit blocks
    state.players[0].hand = [page];
    state.players[1].realm = [target];
    state.players[1].hand = [king];
    const ais = [new NeverBlockAI(), new AlwaysBlockAI()];

    resolveRoyalAttack(state, 0, page, 1, 0, ais);

    // Target should still be in realm (attack was blocked)
    expect(state.players[1].realm.length).toBe(1);
    // Both King and Page go to Pit
    expect(state.pit.length).toBe(2);
    expect(state.pit.some(c => c.id === king.id)).toBe(true);
    expect(state.pit.some(c => c.id === page.id)).toBe(true);
  });
});

describe('Ace Blocking', () => {
  it('Ace blocks a Royal attack, both Ace and attack card go to Pit', () => {
    const state = makeTestState();
    const page = mc('CUPS', 'PAGE');
    const target = mc('CUPS', 3);
    const ace = mc('WANDS', 'ACE');
    state.players[0].hand = [page];
    state.players[1].realm = [target];
    state.players[1].hand = [ace];
    const ais = [new NeverBlockAI(), new AlwaysBlockAI()];

    resolveRoyalAttack(state, 0, page, 1, 0, ais);

    expect(state.players[1].realm.length).toBe(1); // Target survives
    expect(state.pit.some(c => c.id === ace.id)).toBe(true);
    expect(state.pit.some(c => c.id === page.id)).toBe(true);
  });

  it('Ace blocks a Major Arcana action', () => {
    const state = makeTestState();
    const chariot = major(7); // The Chariot
    const celestial = major(17); // The Star
    const ace = mc('COINS', 'ACE');
    state.players[0].hand = [chariot];
    state.players[1].tome = [celestial];
    state.players[1].hand = [ace];

    const ais = [new NeverBlockAI(), new AlwaysBlockAI()];

    const blocked = checkAceBlock(state, ais, 0, {
      type: 'PLAY_MAJOR_ACTION',
      card: chariot,
    });

    expect(blocked).toBe(true);
    expect(state.pit.some(c => c.id === ace.id)).toBe(true);
  });

  it('Ace chain: Ace2 blocks Ace1, original action completes', () => {
    // Player 0 does an action
    // Player 1 tries to Ace block
    // Player 0 Ace-blocks the Ace (chain)
    // Original action should proceed
    const state = createInitialState(3);
    state.minorDeck = [];
    state.majorDeck = [];
    state.players[0].hand = [];
    state.players[1].hand = [];
    state.players[2].hand = [];
    state.players[0].realm = [];
    state.players[1].realm = [];
    state.players[2].realm = [];

    const ace1 = mc('CUPS', 'ACE');
    const ace2 = mc('SWORDS', 'ACE');
    state.players[1].hand = [ace1]; // Player 1 will try to block
    state.players[2].hand = [ace2]; // Player 2 will block the block

    // Custom AIs: player 1 always blocks, player 2 always blocks
    const ais = [new NeverBlockAI(), new AlwaysBlockAI(), new AlwaysBlockAI()];

    const blocked = checkAceBlock(state, ais, 0, { type: 'TEST_ACTION' });

    // Player 1's Ace was blocked by Player 2's Ace -> original action proceeds
    expect(blocked).toBe(false);
    // Both Aces should be in Pit
    expect(state.pit.some(c => c.id === ace1.id)).toBe(true);
    expect(state.pit.some(c => c.id === ace2.id)).toBe(true);
  });
});

describe('Tome Protections', () => {
  it('Temperance protects Cups in Realm from Royal attacks', () => {
    const state = makeTestState();
    const page = mc('CUPS', 'PAGE');
    const cupsCard = mc('CUPS', 9);
    const temperance = major(14);

    state.players[0].hand = [page];
    state.players[1].realm = [cupsCard];
    state.players[1].tome = [temperance];
    state.players[1].tomeProtections = new Set(['CUPS']);
    const ais = [new NeverBlockAI(), new NeverBlockAI()];

    resolveRoyalAttack(state, 0, page, 1, 0, ais);

    // Attack fails, target survives
    expect(state.players[1].realm.length).toBe(1);
    expect(state.players[1].realm[0].id).toBe(cupsCard.id);
    // Attacking card still goes to Pit
    expect(state.pit.some(c => c.id === page.id)).toBe(true);
  });

  it('Temperance does not protect non-Cups suits', () => {
    const state = makeTestState();
    const page = mc('SWORDS', 'PAGE');
    const swordsCard = mc('SWORDS', 4);

    state.players[0].hand = [page];
    state.players[1].realm = [swordsCard];
    state.players[1].tomeProtections = new Set(['CUPS']); // Only cups protected
    const ais = [new NeverBlockAI(), new NeverBlockAI()];

    resolveRoyalAttack(state, 0, page, 1, 0, ais);

    // Attack succeeds
    expect(state.players[1].realm.length).toBe(0);
  });
});

describe('Strength', () => {
  it('moves Major Arcana from opponent Realm to your Realm as wild', () => {
    const state = makeTestState();
    const wildInRealm = major(18); // The Moon
    state.players[1].realm = [wildInRealm];

    resolveStrength(state, [new NeverBlockAI(), new NeverBlockAI()], 0, {
      source: 'realm', playerIndex: 1, cardIndex: 0
    });

    expect(state.players[1].realm.length).toBe(0);
    expect(state.players[0].realm.length).toBe(1);
    expect(state.players[0].realm[0].id).toBe(wildInRealm.id);
  });

  it('moves Major Arcana from Tome to your Realm', () => {
    const state = makeTestState();
    const tomeCard = major(5); // Hierophant
    state.players[1].tome = [tomeCard];

    resolveStrength(state, [new NeverBlockAI(), new NeverBlockAI()], 0, {
      source: 'tome', playerIndex: 1, cardIndex: 0
    });

    expect(state.players[1].tome.length).toBe(0);
    expect(state.players[0].realm.length).toBe(1);
  });
});

describe('Chariot', () => {
  it('steals Celestial from opponent Tome', () => {
    const state = makeTestState();
    const star = major(17); // The Star - Celestial
    state.players[1].tome = [star];

    resolveChariot(state, [new NeverBlockAI(), new NeverBlockAI()], 0, {
      source: 'tome', playerIndex: 1, cardIndex: 0
    });

    expect(state.players[1].tome.length).toBe(0);
    expect(state.players[0].tome.length).toBe(1);
    expect(state.players[0].tome[0].id).toBe(star.id);
  });
});

describe('Tome Effects', () => {
  it('Devil draws up to 7 on play', () => {
    const state = makeTestState();
    const devil = major(15);
    state.players[0].tome = [devil];
    state.players[0].hand = [mc('CUPS', 3), mc('CUPS', 4)]; // 2 in hand
    state.players[0].realm = [mc('WANDS', 5)]; // 1 in realm = total 3
    // Fill minor deck for drawing
    for (let i = 0; i < 10; i++) {
      state.minorDeck.push(mc('COINS', 2));
    }

    applyTomeEffect(state, [new NeverBlockAI(), new NeverBlockAI()], 0, devil);

    // Should draw 7 - 3 = 4 cards
    const totalSize = state.players[0].hand.length + state.players[0].realm.length;
    expect(totalSize).toBe(7);
  });

  it('Temperance adds CUPS protection on play', () => {
    const state = makeTestState();
    const temperance = major(14);
    state.players[0].tome = [temperance];

    applyTomeEffect(state, [new NeverBlockAI(), new NeverBlockAI()], 0, temperance);

    expect(state.players[0].tomeProtections.has('CUPS')).toBe(true);
  });
});
