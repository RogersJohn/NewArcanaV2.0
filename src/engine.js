/**
 * Game loop orchestration for New Arcana.
 * Generator versions yield at decision points; sync wrappers drive them with AIs.
 */

import { shuffle, cardName } from './cards.js';
import {
  createInitialState, getHandSize, getEffectiveHandLimit,
  drawMinorCard, drawMajorCard, log, recordEvent
} from './state.js';
import { getLegalActions } from './actions.js';
import { scoreRoundEndGen, scoreGameEnd, checkCelestialWin, resolveWithAI, driveWithAIs } from './scoring.js';
import { recordDecision, DECISION_TYPES } from './history.js';
import { isDeathCard } from './effect-resolver.js';
import {
  checkAceBlockGen, checkMarkerPassAfterAttack, checkDeathInDisplay,
  executePlaySet, executeRoyalAttackGen, executeMajorTomeGen,
  executeMajorActionGen, executeWildGen, executeBuy,
  applyTomeEffectGen, resolveChariotGen, resolveStrength,
  resolveWheelOfFortuneGen, resolveHangedManGen, resolveTowerGen,
  resolveJudgement, resolvePlagueGen,
} from './resolve-actions.js';

// Defaults used when config is not available (e.g. in tests without full state)
const DEFAULT_MAX_TURNS_PER_ROUND = 50;
const DEFAULT_MAX_ROUNDS = 20;

// ============================================================
// Generator versions of all decision-containing functions
// ============================================================

/**
 * Set up the initial game state (generator version).
 * Yields MAJOR_KEEP for each player.
 * @param {object} state - The initial state from createInitialState
 * @yields {{ type: string, playerIndex: number, cards: object[], state: object }}
 */
export function* setupGen(state) {
  // Shuffle minor deck
  shuffle(state.minorDeck, state.rng);

  // Separate Death from major deck
  const deathIndex = state.majorDeck.findIndex(c => isDeathCard(state, c));
  const deathCard = state.majorDeck.splice(deathIndex, 1)[0];

  // Shuffle remaining major deck
  shuffle(state.majorDeck, state.rng);

  // Deal 2 Major Arcana to each player, keep 1
  const majorDiscards = [];
  for (let i = 0; i < state.players.length; i++) {
    const card1 = state.majorDeck.pop();
    const card2 = state.majorDeck.pop();
    if (!card1 || !card2) break;

    const keepIndex = yield {
      type: DECISION_TYPES.MAJOR_KEEP,
      playerIndex: i,
      cards: [card1, card2],
      state,
    };
    recordDecision(state, DECISION_TYPES.MAJOR_KEEP, i, keepIndex);
    const kept = keepIndex === 0 ? card1 : card2;
    const discarded = keepIndex === 0 ? card2 : card1;

    state.players[i].hand.push(kept);
    majorDiscards.push(discarded);
  }

  // Death placement procedure:
  // 1. Shuffle the face-up discards
  shuffle(majorDiscards, state.rng);

  // 2. Deal them face-down until 2 remain
  const bottomCards = [];
  while (majorDiscards.length > 2) {
    bottomCards.push(majorDiscards.pop());
  }

  // 3. Place dealt cards at bottom of major pile
  // Current majorDeck has remaining undealt cards (top = end of array)
  // Bottom = beginning of array
  state.majorDeck.unshift(...bottomCards);

  // 4. Shuffle Death with the 2 remaining cards, place at very bottom
  const deathGroup = [...majorDiscards, deathCard];
  shuffle(deathGroup, state.rng);
  state.majorDeck.unshift(...deathGroup);

  // Fill display (3 cards from top of major deck)
  for (let i = 0; i < 3; i++) {
    state.display[i] = drawMajorCard(state);
    if (state.display[i]) {
      recordEvent(state, 'CARD_DISPLAYED', {
        cardNumber: state.display[i].number, cardName: cardName(state.display[i]),
      });
    }
    // Check for Death in display
    if (state.display[i] && isDeathCard(state, state.display[i])) {
      state.gameEnded = true;
      state.gameEndReason = 'death_revealed';
      log(state, 'Death revealed during setup display fill!');
      return;
    }
  }

  // Deal Minor Arcana to each player (first round)
  const initialDeal = state.config?.gameRules?.initialDealCount ?? 5;
  for (let i = 0; i < state.players.length; i++) {
    for (let j = 0; j < initialDeal; j++) {
      const card = drawMinorCard(state);
      if (card) state.players[i].hand.push(card);
    }
  }

  // Turn first minor discard card face up
  if (state.minorDeck.length > 0) {
    state.minorDiscard.push(state.minorDeck.pop());
  }

  // Set initial pot (absolute value or potInitialPerPlayer * numPlayers)
  const absolutePot = state.config?.scoring?.potInitialAbsolute;
  if (absolutePot != null && absolutePot >= 0) {
    state.pot = absolutePot;
  } else {
    const potPerPlayer = state.config?.scoring?.potInitialPerPlayer ?? 1;
    state.pot = (state.players.length - 1) * potPerPlayer;
  }
  state.roundNumber = 1;
  state.lastPotAmount = state.pot;

  // Dealer is index 0, first player is index 1 (left of dealer)
  state.currentPlayerIndex = (state.dealerIndex + 1) % state.players.length;

  log(state, `Game setup complete. ${state.players.length} players. Pot: ${state.pot}vp`);
}

/**
 * Play a complete game (generator version).
 * @param {object} state - Game state (after setup)
 * @yields decision requests
 * @returns {object} Final state
 */
export function* playGameGen(state) {
  if (state.gameEnded) return state;

  const maxRounds = state.config?.gameRules?.maxRounds ?? DEFAULT_MAX_ROUNDS;
  while (!state.gameEnded && state.roundNumber <= maxRounds) {
    yield* playRoundGen(state);
  }

  if (!state.gameEnded) {
    state.gameEnded = true;
    state.gameEndReason = 'max_rounds';
    log(state, 'Game ended: maximum rounds reached');
  }

  // Final round scoring — award pot and evaluate Tome bonuses
  // (handleRoundEnd is not called when Death ends the game mid-round,
  // so the last round's pot and bonuses would otherwise be skipped)
  yield* scoreRoundEndGen(state);

  // Game-end scoring
  scoreGameEnd(state);

  // Final state dump for debugging
  log(state, `=== GAME ENDED: ${state.gameEndReason} (Round ${state.roundNumber}, Turn ${state.turnCount}) ===`);
  for (let pi = 0; pi < state.players.length; pi++) {
    const p = state.players[pi];
    const realmDesc = p.realm.length > 0 ? p.realm.map(c => cardName(c)).join(', ') : 'empty';
    const tomeDesc = p.tome.length > 0 ? p.tome.map(c => cardName(c)).join(', ') : 'empty';
    const handDesc = p.hand.length > 0 ? `${p.hand.length} cards` : 'empty';
    log(state, `[FINAL] ${p.name}: ${p.vp}vp | Realm: [${realmDesc}] | Tome: [${tomeDesc}] | Hand: ${handDesc}`);
  }
  log(state, `[FINAL] Pot: ${state.pot}vp | Minor deck: ${state.minorDeck.length} | Major deck: ${state.majorDeck.length} | Pit: ${state.pit.length}`);

  return state;
}

/**
 * Play a single round (generator version).
 * @param {object} state
 * @yields decision requests
 */
function* playRoundGen(state) {
  log(state, `=== Round ${state.roundNumber} ===`);
  state.turnCount = 0;

  // Deal cards (first round dealt in setup, subsequent rounds deal 6)
  if (state.roundNumber > 1) {
    dealRoundCards(state);
  }

  // Take turns until round ends or game ends
  const maxTurns = state.config?.gameRules?.maxTurnsPerRound ?? DEFAULT_MAX_TURNS_PER_ROUND;
  let roundActive = true;
  while (roundActive && !state.gameEnded && state.turnCount < maxTurns) {
    const pi = state.currentPlayerIndex;

    // Check round-end trigger: start of turn with 5+ cards in realm AND holding marker
    if (state.roundEndMarkerHolder === pi && state.players[pi].realm.length >= 5) {
      log(state, `${state.players[pi].name} starts turn with 5+ realm cards and marker. Round ends!`);
      roundActive = false;
      break;
    }

    yield* playTurnGen(state, pi);

    if (state.gameEnded) break;

    // Check Judgement-triggered round end
    if (state.judgementTriggered) {
      state.judgementTriggered = false;
      roundActive = false;
      break;
    }

    // Check turn-end: if player has 5 cards in realm, take/check marker
    checkRoundEndMarker(state, pi);

    // Advance to next player
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    state.turnCount++;
  }

  if (state.turnCount >= maxTurns && !state.gameEnded) {
    log(state, 'Round ended: turn limit reached');
  }

  if (!state.gameEnded) {
    yield* handleRoundEndGen(state);
  }
}

/**
 * Play a single turn for a player (generator version).
 * @param {object} state
 * @param {number} playerIndex
 * @yields decision requests
 */
function* playTurnGen(state, playerIndex) {
  const player = state.players[playerIndex];

  log(state, `--- ${player.name}'s turn (hand: ${player.hand.length}, realm: ${player.realm.length}, tome: ${player.tome.length}, vp: ${player.vp}) ---`);

  // Draw phase
  yield* drawPhaseGen(state, playerIndex);

  if (state.gameEnded) return;

  // Play/Buy phase: yield ACTION decision
  const legalActions = getLegalActions(state, playerIndex);
  const action = yield {
    type: DECISION_TYPES.ACTION,
    playerIndex,
    legalActions,
    state,
  };
  const actionIndex = legalActions.indexOf(action);
  recordDecision(state, DECISION_TYPES.ACTION, playerIndex, actionIndex);

  if (action) {
    log(state, `[DEBUG] ${player.name} chose: ${action.type}${action.description ? ' — ' + action.description : ''}`);
  }

  if (action && action.type !== 'PASS') {
    yield* executeActionGen(state, playerIndex, action);
  }

  if (state.gameEnded) return;

  // Discard phase
  yield* discardPhaseGen(state, playerIndex);
}

/**
 * Draw phase (generator version): draw up to hand size limit, minimum 1.
 * Yields DRAW_SOURCE decisions when the discard pile is non-empty.
 * @param {object} state
 * @param {number} playerIndex
 * @yields {{ type: string, playerIndex: number, state: object, topDiscardCard: object }}
 */
export function* drawPhaseGen(state, playerIndex) {
  const player = state.players[playerIndex];
  const limit = getEffectiveHandLimit(player, state.config);
  const currentSize = getHandSize(player);
  const toDraw = Math.max(1, limit - currentSize);

  for (let i = 0; i < toDraw; i++) {
    let card;
    if (state.minorDiscard.length > 0) {
      const topDiscardCard = state.minorDiscard[state.minorDiscard.length - 1];
      const source = yield {
        type: DECISION_TYPES.DRAW_SOURCE,
        playerIndex,
        state,
        topDiscardCard,
        drawNumber: i + 1,
        totalDraws: toDraw,
      };
      recordDecision(state, DECISION_TYPES.DRAW_SOURCE, playerIndex, source);
      if (source === 'discard') {
        card = state.minorDiscard.pop();
      } else {
        card = drawMinorCard(state);
      }
    } else {
      card = drawMinorCard(state);
    }
    if (!card) {
      state.gameEnded = true;
      state.gameEndReason = 'deck_exhaustion';
      log(state, 'Game ended: not enough Minor Arcana cards to draw');
      return;
    }
    player.hand.push(card);
  }

  log(state, `${player.name} drew ${toDraw} cards`);
}

/**
 * Draw phase (sync wrapper — backward compatible).
 * When called without ais, auto-draws from deck (legacy behavior).
 * @param {object} state
 * @param {number} playerIndex
 * @param {object[]} [ais]
 */
export function drawPhase(state, playerIndex, ais) {
  if (ais) {
    driveWithAIs(drawPhaseGen(state, playerIndex), ais);
  } else {
    // Legacy: auto-draw from deck without AI decisions
    const gen = drawPhaseGen(state, playerIndex);
    let result = gen.next();
    while (!result.done) {
      result = gen.next('deck');
    }
  }
}

/**
 * Discard phase (generator version): discard down to hand limit.
 * @param {object} state
 * @param {number} playerIndex
 * @yields REALM_DISCARD, DISCARD decisions
 */
function* discardPhaseGen(state, playerIndex) {
  const player = state.players[playerIndex];
  const limit = getEffectiveHandLimit(player, state.config);

  // First handle realm overflow (> 5 cards)
  while (player.realm.length > 5) {
    const numOver = player.realm.length - 5;
    const indices = yield {
      type: DECISION_TYPES.REALM_DISCARD,
      playerIndex,
      numToDiscard: numOver,
      state,
    };
    recordDecision(state, DECISION_TYPES.REALM_DISCARD, playerIndex, indices);
    const sortedRealmIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedRealmIndices) {
      if (idx >= 0 && idx < player.realm.length) {
        const card = player.realm.splice(idx, 1)[0];
        state.minorDiscard.push(card);
        log(state, `${player.name} discards ${cardName(card)} from Realm`);
      }
    }
    break; // Only one round of discard
  }

  // Then handle hand overflow
  const totalSize = getHandSize(player);
  if (totalSize > limit) {
    const numToDiscard = totalSize - limit;
    const handDiscard = Math.min(numToDiscard, player.hand.length);
    if (handDiscard > 0) {
      const indices = yield {
        type: DECISION_TYPES.DISCARD,
        playerIndex,
        numToDiscard: handDiscard,
        state,
      };
      recordDecision(state, DECISION_TYPES.DISCARD, playerIndex, indices);
      const sortedHandIndices = [...indices].sort((a, b) => b - a);
      for (const idx of sortedHandIndices) {
        if (idx >= 0 && idx < player.hand.length) {
          const card = player.hand.splice(idx, 1)[0];
          state.minorDiscard.push(card);
          log(state, `${player.name} discards ${cardName(card)} from hand`);
        }
      }
    }
  }
}

/**
 * Execute a chosen action (generator version).
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} action
 * @yields decision requests
 */
function* executeActionGen(state, playerIndex, action) {
  switch (action.type) {
    case 'PLAY_SET':
      executePlaySet(state, playerIndex, action);
      break;

    case 'PLAY_ROYAL':
      yield* executeRoyalAttackGen(state, playerIndex, action);
      break;

    case 'PLAY_MAJOR_TOME':
      yield* executeMajorTomeGen(state, playerIndex, action);
      break;

    case 'PLAY_MAJOR_ACTION':
      yield* executeMajorActionGen(state, playerIndex, action);
      break;

    case 'PLAY_WILD':
      yield* executeWildGen(state, playerIndex, action);
      break;

    case 'BUY':
      executeBuy(state, playerIndex, action);
      break;
  }
}

/**
 * Check round-end marker at turn end.
 */
function checkRoundEndMarker(state, playerIndex) {
  const player = state.players[playerIndex];
  if (player.realm.length >= 5) {
    if (state.roundEndMarkerHolder === -1) {
      state.roundEndMarkerHolder = playerIndex;
      player.hasRoundEndMarker = true;
      log(state, `${player.name} takes the Round-End Marker (5 cards in Realm)`);
    }
  }
}

/**
 * Handle round end (generator version): score, age display, reset.
 * Yields through scoreRoundEndGen for MAGICIAN_SUIT decisions.
 * @param {object} state
 * @yields decision requests
 */
function* handleRoundEndGen(state) {
  log(state, `--- Round ${state.roundNumber} End ---`);

  // Snapshot VP before scoring for Charity variant
  const vpBefore = state.players.map(p => p.vp);

  // Score round
  yield* scoreRoundEndGen(state);

  // Track which players scored 0 VP this round (for Charity)
  const charityEligible = state.players.map((p, i) => p.vp === vpBefore[i]);

  // Check celestial win
  const celestialWinner = checkCelestialWin(state);
  if (celestialWinner !== -1) {
    state.gameEnded = true;
    state.gameEndReason = 'celestial_win';
    state.celestialWinner = celestialWinner;
    log(state, `${state.players[celestialWinner].name} wins by Celestial victory!`);
    return;
  }

  // Age display: slot 2 -> major discard, slide right, new card to slot 0
  ageDisplay(state);
  if (state.gameEnded) return;

  // Charity: players who scored 0 may keep one hand card
  const charityEnabled = state.config?.gameRules?.charityEnabled ?? false;
  if (charityEnabled) {
    for (let pi = 0; pi < state.players.length; pi++) {
      if (charityEligible[pi] && state.players[pi].hand.length > 0) {
        const cardIdx = yield {
          type: DECISION_TYPES.CHARITY_CHOOSE,
          playerIndex: pi,
          state,
        };
        recordDecision(state, DECISION_TYPES.CHARITY_CHOOSE, pi, cardIdx);
        if (cardIdx >= 0 && cardIdx < state.players[pi].hand.length) {
          state._charityKept = state._charityKept || {};
          state._charityKept[pi] = state.players[pi].hand[cardIdx];
        }
      }
    }
  }

  // Reset for next round
  resetForNextRound(state);
}

/**
 * Age the Major Arcana display.
 * (No decision points — stays synchronous.)
 */
function ageDisplay(state) {
  // Slot 2 -> major discard
  if (state.display[2]) {
    recordEvent(state, 'CARD_AGED_OFF', {
      cardNumber: state.display[2].number, cardName: cardName(state.display[2]),
    });
    state.majorDiscard.push(state.display[2]);
  }

  // Slide right
  state.display[2] = state.display[1];
  state.display[1] = state.display[0];

  // New card to slot 0
  state.display[0] = drawMajorCard(state);
  if (state.display[0]) {
    recordEvent(state, 'CARD_DISPLAYED', {
      cardNumber: state.display[0].number, cardName: cardName(state.display[0]),
    });
  }

  // Check for Death in any display slot
  checkDeathInDisplay(state);
}

/**
 * Reset state for next round.
 * (No decision points — stays synchronous.)
 */
function resetForNextRound(state) {
  const charityKept = state._charityKept || {};

  // Gather realm cards, minor deck, discard, pit -> shuffle for new deck
  for (let pi = 0; pi < state.players.length; pi++) {
    const p = state.players[pi];
    // Gather realm cards
    for (const card of p.realm) {
      state.minorDiscard.push(card);
    }
    p.realm = [];

    // Charity: keep the chosen card, gather the rest
    const kept = charityKept[pi] || null;
    for (const card of p.hand) {
      if (kept && card.id === kept.id) continue; // Keep this one
      state.minorDiscard.push(card);
    }
    p.hand = kept ? [kept] : [];
    if (kept) {
      log(state, `${p.name} keeps a card via Charity (scored 0 this round)`);
    }

    // Tome persists
  }
  delete state._charityKept;

  // Combine pit + discard + remaining deck
  state.minorDeck.push(...state.minorDiscard);
  state.minorDiscard = [];
  state.minorDeck.push(...state.pit);
  // Actually wait - Pit cards DO get shuffled back between rounds
  // Re-reading rules: "Gather up all Realm cards, the Minor Arcana draw pile,
  // discard pile and the Pit, and shuffle well"
  state.pit = [];

  shuffle(state.minorDeck, state.rng);

  // Next round pot: last pot amount + potGrowth
  const potGrowth = state.config?.scoring?.potGrowth ?? 1;
  const addToPot = (state.lastPotAmount || state.config.numPlayers) + potGrowth;
  state.pot += addToPot;
  state.lastPotAmount = addToPot;

  // Advance dealer
  state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
  state.currentPlayerIndex = (state.dealerIndex + 1) % state.players.length;

  state.roundNumber++;

  log(state, `Pot for round ${state.roundNumber}: ${state.pot}vp`);
}

/**
 * Deal cards for a new round (6 per player for round 2+).
 * (No decision points — stays synchronous.)
 */
function dealRoundCards(state) {
  const roundDeal = state.config?.gameRules?.roundDealCount ?? 6;
  for (let i = 0; i < state.players.length; i++) {
    for (let j = 0; j < roundDeal; j++) {
      const card = drawMinorCard(state);
      if (!card) {
        state.gameEnded = true;
        state.gameEndReason = 'deck_exhaustion';
        log(state, 'Game ended: not enough cards to deal');
        return;
      }
      state.players[i].hand.push(card);
    }
  }
}

// ============================================================
// Sync wrappers (backward compatible — unchanged signatures)
// ============================================================

/**
 * Set up the initial game state (sync wrapper).
 * @param {object} state - The initial state from createInitialState
 * @param {object[]} ais - Array of AI objects, one per player
 */
export function setup(state, ais) {
  driveWithAIs(setupGen(state), ais);
}

/**
 * Play a complete game (sync wrapper).
 * @param {object} state - Game state (after setup)
 * @param {object[]} ais - AI objects
 * @returns {object} Final state
 */
export function playGame(state, ais) {
  return driveWithAIs(playGameGen(state), ais);
}

/**
 * Play a single round (sync wrapper).
 * @param {object} state
 * @param {object[]} ais
 */
export function playRound(state, ais) {
  driveWithAIs(playRoundGen(state), ais);
}

/**
 * Play a single turn for a player (sync wrapper).
 * @param {object} state
 * @param {object[]} ais
 * @param {number} playerIndex
 */
export function playTurn(state, ais, playerIndex) {
  driveWithAIs(playTurnGen(state, playerIndex), ais);
}

/**
 * Discard phase (sync wrapper).
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} ai
 */
export function discardPhase(state, playerIndex, ai) {
  // Create a single-element ais array at the right index for driveWithAIs
  const ais = [];
  ais[playerIndex] = ai;
  driveWithAIs(discardPhaseGen(state, playerIndex), ais);
}

/**
 * Execute a chosen action (sync wrapper).
 * @param {object} state
 * @param {object[]} ais
 * @param {number} playerIndex
 * @param {object} action
 */
export function executeAction(state, ais, playerIndex, action) {
  driveWithAIs(executeActionGen(state, playerIndex, action), ais);
}

/**
 * Handle round end (sync wrapper).
 * @param {object} state
 * @param {object[]} ais
 */
export function handleRoundEnd(state, ais) {
  driveWithAIs(handleRoundEndGen(state), ais);
}

// Exported for tests (formerly in effects.js)
export {
  checkAceBlockGen, executeRoyalAttackGen, resolveChariotGen,
  resolveStrength, applyTomeEffectGen,
  resolveWheelOfFortuneGen, resolveHangedManGen, resolveTowerGen,
  resolveJudgement, resolvePlagueGen,
};
