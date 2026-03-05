/**
 * Enumerate legal actions for the active player.
 */

import { SUITS, RANK_VALUES, cardName, canPlayToTome, isCelestial } from './cards.js';
import { getHandSize, getEffectiveHandLimit } from './state.js';
import { evaluateHand, compareHands } from './poker.js';

/**
 * Get all legal actions for a player.
 * @param {object} state - Game state
 * @param {number} playerIndex - Index of active player
 * @returns {object[]} Array of legal action objects
 */
export function getLegalActions(state, playerIndex) {
  const player = state.players[playerIndex];
  const actions = [];

  // Always can pass
  actions.push({ type: 'PASS', description: 'Pass (do nothing)' });

  // Play actions from hand
  addSetActions(state, playerIndex, actions);
  addRoyalActions(state, playerIndex, actions);
  addMajorTomeActions(state, playerIndex, actions);
  addMajorActionActions(state, playerIndex, actions);
  addWildActions(state, playerIndex, actions);

  // Buy actions
  addBuyActions(state, playerIndex, actions);

  return actions;
}

/**
 * Add actions for playing sets to realm.
 */
function addSetActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  const hand = player.hand.filter(c => c.type === 'minor');

  if (hand.length === 0) return;

  // Single card play
  for (const card of hand) {
    actions.push({
      type: 'PLAY_SET',
      cards: [card],
      description: `Play ${cardName(card)} to Realm`,
    });
  }

  // Pairs: two cards of same rank
  const byRank = groupBy(hand, c => c.numericRank);
  for (const [rank, cards] of Object.entries(byRank)) {
    if (cards.length >= 2) {
      const combos = combinations(cards, 2);
      for (const combo of combos) {
        actions.push({
          type: 'PLAY_SET',
          cards: combo,
          description: `Play pair of ${rank}s to Realm`,
        });
      }
    }
    // Three-of-a-Kind
    if (cards.length >= 3) {
      const combos = combinations(cards, 3);
      for (const combo of combos) {
        actions.push({
          type: 'PLAY_SET',
          cards: combo,
          description: `Play three ${rank}s to Realm`,
        });
      }
    }
    // Four-of-a-Kind
    if (cards.length >= 4) {
      actions.push({
        type: 'PLAY_SET',
        cards: cards.slice(0, 4),
        description: `Play four ${rank}s to Realm`,
      });
    }
  }

  // Straights (5 consecutive, mixed suits) and Straight Flushes
  if (hand.length >= 5) {
    const straights = findStraights(hand);
    for (const straight of straights) {
      const suits = new Set(straight.map(c => c.suit));
      if (suits.size === 1) {
        actions.push({
          type: 'PLAY_SET',
          cards: straight,
          description: `Play straight flush to Realm`,
        });
      } else {
        actions.push({
          type: 'PLAY_SET',
          cards: straight,
          description: `Play straight to Realm`,
        });
      }
    }

    // Flushes (5 same suit, not consecutive)
    const bySuit = groupBy(hand, c => c.suit);
    for (const [suit, cards] of Object.entries(bySuit)) {
      if (cards.length >= 5) {
        const combos = combinations(cards, 5);
        for (const combo of combos) {
          // Check it's not already a straight flush (avoid duplicates)
          const ranks = combo.map(c => c.numericRank).sort((a, b) => a - b);
          const isStraight = ranks[4] - ranks[0] === 4 && new Set(ranks).size === 5;
          if (!isStraight) {
            actions.push({
              type: 'PLAY_SET',
              cards: combo,
              description: `Play ${suit} flush to Realm`,
            });
          }
        }
      }
    }
  }

  // Cards that complete/repair existing realm sets
  addCompletionActions(state, playerIndex, actions, hand);
}

/**
 * Add actions for completing/repairing existing realm sets.
 */
function addCompletionActions(state, playerIndex, actions, hand) {
  const player = state.players[playerIndex];
  if (player.realm.length === 0) return;

  // Find what ranks are in realm
  const realmMinors = player.realm.filter(c => c.type === 'minor');
  const realmRanks = groupBy(realmMinors, c => c.numericRank);

  for (const [rank, realmCards] of Object.entries(realmRanks)) {
    const handCards = hand.filter(c => c.numericRank === Number(rank));
    if (handCards.length > 0) {
      // Can add 1 or more cards of same rank to extend the set
      for (let n = 1; n <= handCards.length; n++) {
        const combos = combinations(handCards, n);
        for (const combo of combos) {
          const total = realmCards.length + combo.length;
          if (total <= 5) { // Max 5 of a kind (with wild)
            actions.push({
              type: 'PLAY_SET',
              cards: combo,
              isCompletion: true,
              description: `Add ${n} ${rank}(s) to existing set in Realm`,
            });
          }
        }
      }
    }
  }

  // Straight completions
  addStraightCompletionActions(realmMinors, hand, actions);

  // Flush completions
  addFlushCompletionActions(realmMinors, hand, actions);
}

/**
 * Add actions for completing straights using realm + hand cards.
 */
function addStraightCompletionActions(realm, hand, actions) {
  const realmRanks = new Set(realm.map(c => c.numericRank));
  const handByRank = groupBy(hand, c => c.numericRank);

  for (let startRank = 1; startRank <= 10; startRank++) {
    const straightRanks = [startRank, startRank + 1, startRank + 2, startRank + 3, startRank + 4];
    const inRealm = straightRanks.filter(r => realmRanks.has(r));
    const needed = straightRanks.filter(r => !realmRanks.has(r));

    if (inRealm.length === 0 || needed.length === 0 || needed.length > hand.length) continue;
    if (needed.length > 4) continue;

    const handHasAll = needed.every(r => handByRank[r] && handByRank[r].length > 0);
    if (!handHasAll) continue;

    const cardsToPlay = needed.map(r => handByRank[r][0]);
    const cardIds = new Set(cardsToPlay.map(c => c.id));
    const alreadyExists = actions.some(a =>
      a.type === 'PLAY_SET' && a.cards.length === cardsToPlay.length &&
      a.cards.every(c => cardIds.has(c.id))
    );
    if (alreadyExists) continue;

    actions.push({
      type: 'PLAY_SET',
      cards: cardsToPlay,
      isCompletion: true,
      description: `Complete straight (${startRank}-${startRank + 4}) in Realm`,
    });
  }
}

/**
 * Add actions for completing flushes using realm + hand cards.
 */
function addFlushCompletionActions(realm, hand, actions) {
  const realmBySuit = groupBy(realm, c => c.suit);
  const handBySuit = groupBy(hand, c => c.suit);

  for (const [suit, realmCards] of Object.entries(realmBySuit)) {
    const handCards = handBySuit[suit] || [];
    const totalPossible = realmCards.length + handCards.length;
    if (totalPossible < 5 || handCards.length === 0) continue;

    const needed = 5 - realmCards.length;
    if (needed <= 0 || needed > handCards.length || needed > 4) continue;

    const combos = combinations(handCards, needed);
    for (const combo of combos) {
      const cardIds = new Set(combo.map(c => c.id));
      const alreadyExists = actions.some(a =>
        a.type === 'PLAY_SET' && a.cards.length === combo.length &&
        a.cards.every(c => cardIds.has(c.id))
      );
      if (alreadyExists) continue;

      actions.push({
        type: 'PLAY_SET',
        cards: combo,
        isCompletion: true,
        description: `Complete ${suit} flush in Realm`,
      });
    }
  }
}

/**
 * Add Royal attack actions (Page, Knight, Queen).
 */
function addRoyalActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  const royals = player.hand.filter(c =>
    c.type === 'minor' && (c.rank === 'PAGE' || c.rank === 'KNIGHT' || c.rank === 'QUEEN')
  );

  for (const card of royals) {
    // Find valid targets: cards of same suit in any realm
    for (let pi = 0; pi < state.players.length; pi++) {
      // Queen can only target opponents
      if (card.rank === 'QUEEN' && pi === playerIndex) continue;

      const targetPlayer = state.players[pi];
      for (let ri = 0; ri < targetPlayer.realm.length; ri++) {
        const target = targetPlayer.realm[ri];
        // Same suit check - wild cards are every suit
        if (target.type === 'major' || target.suit === card.suit) {
          actions.push({
            type: 'PLAY_ROYAL',
            card,
            target: { playerIndex: pi, realmIndex: ri },
            description: `${card.rank} of ${card.suit} attacks ${cardName(target)} in ${targetPlayer.name}'s Realm`,
          });
        }
      }
    }
  }
}

/**
 * Add actions for playing Major Arcana to Tome.
 */
function addMajorTomeActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  const majors = player.hand.filter(c => c.type === 'major' && canPlayToTome(c));

  for (const card of majors) {
    actions.push({
      type: 'PLAY_MAJOR_TOME',
      card,
      description: `Play ${cardName(card)} to Tome`,
    });
  }
}

/**
 * Add actions for playing Major Arcana for their Action effect.
 */
function addMajorActionActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  const actionCards = player.hand.filter(c =>
    c.type === 'major' && c.category === 'action' && c.number !== 13 // Death is not played as an action
  );

  for (const card of actionCards) {
    switch (card.number) {
      case 7: // Chariot - take a face-up celestial
        addChariotTargets(state, playerIndex, card, actions);
        break;
      case 8: // Strength - move Major from any realm/tome to your realm
        addStrengthTargets(state, playerIndex, card, actions);
        break;
      case 10: // Wheel of Fortune - take 2 from major draw/display/discard
        actions.push({
          type: 'PLAY_MAJOR_ACTION',
          card,
          targets: null, // Resolved during execution
          description: `Play ${cardName(card)} - take 2 Major Arcana cards`,
        });
        break;
      case 12: // Hanged Man - take from opponent's tome
        addHangedManTargets(state, playerIndex, card, actions);
        break;
      case 16: // Tower - destroy Major in larger tomes
        addTowerTargets(state, playerIndex, card, actions);
        break;
      case 20: // Judgement - take round-end marker
        actions.push({
          type: 'PLAY_MAJOR_ACTION',
          card,
          targets: null,
          description: `Play ${cardName(card)} - claim Round-End Marker`,
        });
        break;
      case 26: // Plague - play into any player's tome
        addPlagueTargets(state, playerIndex, card, actions);
        break;
    }
  }
}

function addChariotTargets(state, playerIndex, card, actions) {
  // Celestials in display, any realm, any tome, top of major discard
  for (let pi = 0; pi < state.players.length; pi++) {
    for (let ri = 0; ri < state.players[pi].realm.length; ri++) {
      if (isCelestial(state.players[pi].realm[ri])) {
        actions.push({
          type: 'PLAY_MAJOR_ACTION', card,
          targets: { source: 'realm', playerIndex: pi, cardIndex: ri },
          description: `Chariot: take ${cardName(state.players[pi].realm[ri])} from ${state.players[pi].name}'s Realm`,
        });
      }
    }
    for (let ti = 0; ti < state.players[pi].tome.length; ti++) {
      if (isCelestial(state.players[pi].tome[ti])) {
        actions.push({
          type: 'PLAY_MAJOR_ACTION', card,
          targets: { source: 'tome', playerIndex: pi, cardIndex: ti },
          description: `Chariot: take ${cardName(state.players[pi].tome[ti])} from ${state.players[pi].name}'s Tome`,
        });
      }
    }
  }
  for (let di = 0; di < state.display.length; di++) {
    if (state.display[di] && isCelestial(state.display[di])) {
      actions.push({
        type: 'PLAY_MAJOR_ACTION', card,
        targets: { source: 'display', slotIndex: di },
        description: `Chariot: take ${cardName(state.display[di])} from Display`,
      });
    }
  }
  if (state.majorDiscard.length > 0 && isCelestial(state.majorDiscard[state.majorDiscard.length - 1])) {
    actions.push({
      type: 'PLAY_MAJOR_ACTION', card,
      targets: { source: 'majorDiscard' },
      description: `Chariot: take ${cardName(state.majorDiscard[state.majorDiscard.length - 1])} from Major Discard`,
    });
  }
}

function addStrengthTargets(state, playerIndex, card, actions) {
  for (let pi = 0; pi < state.players.length; pi++) {
    for (let ri = 0; ri < state.players[pi].realm.length; ri++) {
      if (state.players[pi].realm[ri].type === 'major') {
        actions.push({
          type: 'PLAY_MAJOR_ACTION', card,
          targets: { source: 'realm', playerIndex: pi, cardIndex: ri },
          description: `Strength: move ${cardName(state.players[pi].realm[ri])} to your Realm`,
        });
      }
    }
    for (let ti = 0; ti < state.players[pi].tome.length; ti++) {
      if (state.players[pi].tome[ti].type === 'major') {
        actions.push({
          type: 'PLAY_MAJOR_ACTION', card,
          targets: { source: 'tome', playerIndex: pi, cardIndex: ti },
          description: `Strength: move ${cardName(state.players[pi].tome[ti])} to your Realm`,
        });
      }
    }
  }
}

function addHangedManTargets(state, playerIndex, card, actions) {
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue; // opponents only
    for (let ti = 0; ti < state.players[pi].tome.length; ti++) {
      actions.push({
        type: 'PLAY_MAJOR_ACTION', card,
        targets: { playerIndex: pi, cardIndex: ti },
        description: `Hanged Man: take ${cardName(state.players[pi].tome[ti])} from ${state.players[pi].name}'s Tome`,
      });
    }
  }
}

function addTowerTargets(state, playerIndex, card, actions) {
  const myTomeSize = state.players[playerIndex].tome.length;
  const targets = [];
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    if (state.players[pi].tome.length > myTomeSize) {
      // Must target a Major Arcana in their tome
      for (let ti = 0; ti < state.players[pi].tome.length; ti++) {
        targets.push({ playerIndex: pi, cardIndex: ti });
      }
    }
  }
  if (targets.length > 0) {
    actions.push({
      type: 'PLAY_MAJOR_ACTION', card,
      targets, // Tower hits all larger tomes
      description: `Tower: destroy Major Arcana in larger Tomes`,
    });
  }
}

function addPlagueTargets(state, playerIndex, card, actions) {
  for (let pi = 0; pi < state.players.length; pi++) {
    actions.push({
      type: 'PLAY_MAJOR_ACTION', card,
      targets: { playerIndex: pi },
      description: `Plague: play into ${state.players[pi].name}'s Tome`,
    });
  }
}

/**
 * Add actions for playing a Major Arcana as wild card to Realm.
 * Wild + minors must form a legal set at time of play.
 * Legal sets: single, pair, three-of-a-kind, four-of-a-kind,
 * five-of-a-kind, straight (5 cards), flush (5 cards), straight flush (5 cards).
 */
function addWildActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  // Can only play wild if no Major Arcana already in realm
  const hasWildInRealm = player.realm.some(c => c.type === 'major');
  if (hasWildInRealm) return;

  const majors = player.hand.filter(c => c.type === 'major');
  const minors = player.hand.filter(c => c.type === 'minor');

  for (const card of majors) {
    // Wild alone (single card) — always legal
    actions.push({
      type: 'PLAY_WILD',
      card,
      withCards: [],
      description: `Play ${cardName(card)} as wild card to Realm`,
    });

    if (minors.length === 0) continue;

    const validCombos = [];

    // Wild + 1 minor = pair (wild declared as same rank, different suit). Always legal.
    for (const m of minors) {
      validCombos.push({ combo: [m], desc: 'pair' });
    }

    // Wild + 2 minors = three-of-a-kind (all same rank)
    const byRank = groupBy(minors, c => c.numericRank);
    for (const [rank, cards] of Object.entries(byRank)) {
      if (cards.length >= 2) {
        const combos2 = combinations(cards, 2);
        for (const combo of combos2) {
          validCombos.push({ combo, desc: `three ${rank}s` });
        }
      }
    }

    // Wild + 3 minors = four-of-a-kind (all same rank)
    for (const [rank, cards] of Object.entries(byRank)) {
      if (cards.length >= 3) {
        const combos3 = combinations(cards, 3);
        for (const combo of combos3) {
          validCombos.push({ combo, desc: `four ${rank}s` });
        }
      }
    }

    // Wild + 4 minors — five-of-a-kind, flush, straight, or straight flush
    if (minors.length >= 4) {
      const combos4 = combinations(minors, 4);
      for (const combo of combos4) {
        if (isLegal5CardWildSet(combo)) {
          validCombos.push({ combo, desc: 'five-card set' });
        }
      }
    }

    // Score all valid combos and keep the top 3
    const scored = validCombos.map(({ combo, desc }) => {
      const testRealm = [...player.realm, ...combo, { type: 'major' }];
      const score = evaluateHand(testRealm);
      return { combo, desc, score };
    });
    scored.sort((a, b) => compareHands(b.score, a.score));

    // Deduplicate by card IDs
    const seen = new Set();
    const top = [];
    for (const entry of scored) {
      const key = entry.combo.map(c => c.id).sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        top.push(entry);
      }
      if (top.length >= 3) break;
    }

    for (const { combo } of top) {
      actions.push({
        type: 'PLAY_WILD',
        card,
        withCards: combo,
        description: `Play ${cardName(card)} as wild with ${combo.map(cardName).join(', ')}`,
      });
    }
  }
}

/**
 * Check if 4 minor cards + a wild can form a legal 5-card set.
 * Legal 5-card sets: five-of-a-kind, flush, straight, straight flush.
 */
function isLegal5CardWildSet(minors) {
  const ranks = minors.map(c => c.numericRank);
  const suits = minors.map(c => c.suit);
  const uniqueRanks = [...new Set(ranks)];
  const uniqueSuits = [...new Set(suits)];

  // Five-of-a-kind: all 4 minors same rank, wild makes 5th
  if (uniqueRanks.length === 1) return true;

  // Flush: all 4 minors same suit, wild declared as same suit + any rank
  if (uniqueSuits.length === 1) return true;

  // Straight: 4 unique ranks where wild fills exactly one gap to make 5 consecutive
  if (uniqueRanks.length === 4) {
    const sorted = uniqueRanks.slice().sort((a, b) => a - b);
    const span = sorted[3] - sorted[0];

    // Perfect case: span of 3, wild extends at either end (e.g. 3,4,5,6 + wild=2 or 7)
    if (span === 3) return true;

    // Gap case: span of 4 with one gap the wild fills (e.g. 3,4,6,7 + wild=5)
    if (span === 4) {
      let gaps = 0;
      for (let r = sorted[0]; r <= sorted[3]; r++) {
        if (!uniqueRanks.includes(r)) gaps++;
      }
      if (gaps === 1) return true;
    }
  }

  return false;
}

/**
 * Add buy actions.
 */
function addBuyActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  const hand = player.hand;

  if (hand.length === 0) return;

  const buyPrices = state.config?.buyPrices ?? { draw: 6, display0: 7, display1: 8, display2: 9, discard: 10 };
  const maxCards = state.config?.maxPaymentCards ?? 3;

  const sources = [];
  if (state.majorDeck.length > 0) {
    sources.push({ source: 'draw', price: buyPrices.draw ?? 6 });
  }
  for (let i = 0; i < 3; i++) {
    if (state.display[i]) {
      sources.push({ source: `display${i}`, price: buyPrices[`display${i}`] ?? (7 + i) });
    }
  }
  if (state.majorDiscard.length > 0) {
    sources.push({ source: 'discard', price: buyPrices.discard ?? 10 });
  }

  for (const { source, price } of sources) {
    // Find all payment combinations (up to maxCards from hand) that meet the price
    const payments = findPayments(hand, price, maxCards);
    // Only keep the 3 cheapest payments (by total value)
    payments.sort((a, b) =>
      a.reduce((s, c) => s + c.purchaseValue, 0) - b.reduce((s, c) => s + c.purchaseValue, 0)
    );
    const topPayments = payments.slice(0, 3);
    for (const payment of topPayments) {
      actions.push({
        type: 'BUY',
        source,
        payment,
        description: `Buy from ${source} (cost ${price}) paying with ${payment.map(cardName).join(', ')}`,
      });
    }
  }
}

/**
 * Find all valid payment combinations (1-maxCards cards) that total >= price.
 * @param {number} [maxPayCards=3] - Maximum number of cards per payment
 */
function findPayments(hand, price, maxPayCards) {
  const results = [];
  const maxCards = Math.min(maxPayCards ?? 3, hand.length);

  for (let n = 1; n <= maxCards; n++) {
    const combos = combinations(hand, n);
    for (const combo of combos) {
      const total = combo.reduce((sum, c) => sum + c.purchaseValue, 0);
      if (total >= price) {
        results.push(combo);
      }
    }
  }

  return results;
}

/**
 * Generate all k-combinations of an array.
 */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  if (k === arr.length) return [arr.slice()];

  const result = [];

  function helper(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }

  helper(0, []);
  return result;
}

/**
 * Group array elements by a key function.
 */
function groupBy(arr, keyFn) {
  const groups = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

/**
 * Find all possible 5-card straights in a hand.
 */
function findStraights(hand) {
  const results = [];
  const sorted = [...hand].sort((a, b) => a.numericRank - b.numericRank);

  // Group by rank, pick one card per rank
  const byRank = {};
  for (const card of sorted) {
    if (!byRank[card.numericRank]) byRank[card.numericRank] = [];
    byRank[card.numericRank].push(card);
  }

  const uniqueRanks = Object.keys(byRank).map(Number).sort((a, b) => a - b);

  // Find runs of 5 consecutive ranks
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i + 4] - uniqueRanks[i] === 4) {
      // Found consecutive ranks, pick one card from each rank
      const straightRanks = uniqueRanks.slice(i, i + 5);
      // Generate all combinations (one card per rank)
      const options = straightRanks.map(r => byRank[r]);
      const straights = cartesianProduct(options);
      for (const s of straights) {
        results.push(s);
      }
    }
  }

  return results;
}

/**
 * Cartesian product of arrays.
 */
function cartesianProduct(arrays) {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  const result = [];
  for (const item of first) {
    for (const restCombo of restProduct) {
      result.push([item, ...restCombo]);
    }
  }
  return result;
}
