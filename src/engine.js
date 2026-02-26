/**
 * Game loop orchestration for New Arcana.
 */

import { shuffle, cardName, PROTECTION_MAP, isCelestial } from './cards.js';
import {
  createInitialState, getHandSize, getEffectiveHandLimit,
  drawMinorCard, drawMajorCard, log, refillDisplay, recordEvent
} from './state.js';
import { getLegalActions } from './actions.js';
import { scoreRoundEnd, scoreGameEnd, checkCelestialWin } from './scoring.js';

const MAX_TURNS_PER_ROUND = 50;
const MAX_ROUNDS = 20;

/**
 * Set up the initial game state: shuffle, deal, place Death, fill display.
 * @param {object} state - The initial state from createInitialState
 * @param {object[]} ais - Array of AI objects, one per player
 */
export function setup(state, ais) {
  // Shuffle minor deck
  shuffle(state.minorDeck);

  // Separate Death from major deck
  const deathIndex = state.majorDeck.findIndex(c => c.number === 13);
  const deathCard = state.majorDeck.splice(deathIndex, 1)[0];

  // Shuffle remaining major deck
  shuffle(state.majorDeck);

  // Deal 2 Major Arcana to each player, keep 1
  const majorDiscards = [];
  for (let i = 0; i < state.players.length; i++) {
    const card1 = state.majorDeck.pop();
    const card2 = state.majorDeck.pop();
    if (!card1 || !card2) break;

    const keepIndex = ais[i].chooseMajorKeep([card1, card2]);
    const kept = keepIndex === 0 ? card1 : card2;
    const discarded = keepIndex === 0 ? card2 : card1;

    state.players[i].hand.push(kept);
    majorDiscards.push(discarded);
  }

  // Death placement procedure:
  // 1. Shuffle the face-up discards
  shuffle(majorDiscards);

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
  shuffle(deathGroup);
  state.majorDeck.unshift(...deathGroup);

  // Fill display (3 cards from top of major deck)
  for (let i = 0; i < 3; i++) {
    state.display[i] = drawMajorCard(state);
    // Check for Death in display
    if (state.display[i] && state.display[i].number === 13) {
      state.gameEnded = true;
      state.gameEndReason = 'death_revealed';
      log(state, 'Death revealed during setup display fill!');
      return;
    }
  }

  // Deal 5 Minor Arcana to each player (first round)
  for (let i = 0; i < state.players.length; i++) {
    for (let j = 0; j < 5; j++) {
      const card = drawMinorCard(state);
      if (card) state.players[i].hand.push(card);
    }
  }

  // Turn first minor discard card face up
  if (state.minorDeck.length > 0) {
    state.minorDiscard.push(state.minorDeck.pop());
  }

  // Set initial pot (1vp per player)
  state.pot = state.players.length;
  state.roundNumber = 1;
  state.lastPotAmount = state.players.length;

  // Dealer is index 0, first player is index 1 (left of dealer)
  state.currentPlayerIndex = (state.dealerIndex + 1) % state.players.length;

  log(state, `Game setup complete. ${state.players.length} players. Pot: ${state.pot}vp`);
}

/**
 * Play a complete game.
 * @param {object} state - Game state (after setup)
 * @param {object[]} ais - AI objects
 * @returns {object} Final state
 */
export function playGame(state, ais) {
  if (state.gameEnded) return state;

  while (!state.gameEnded && state.roundNumber <= MAX_ROUNDS) {
    playRound(state, ais);
  }

  if (!state.gameEnded) {
    state.gameEnded = true;
    state.gameEndReason = 'max_rounds';
    log(state, 'Game ended: maximum rounds reached');
  }

  // Game-end scoring
  scoreGameEnd(state);

  return state;
}

/**
 * Play a single round.
 * @param {object} state
 * @param {object[]} ais
 */
export function playRound(state, ais) {
  log(state, `=== Round ${state.roundNumber} ===`);
  state.turnCount = 0;

  // Deal cards (first round dealt in setup, subsequent rounds deal 6)
  if (state.roundNumber > 1) {
    dealRoundCards(state);
  }

  // Take turns until round ends or game ends
  let roundActive = true;
  while (roundActive && !state.gameEnded && state.turnCount < MAX_TURNS_PER_ROUND) {
    const pi = state.currentPlayerIndex;

    // Check round-end trigger: start of turn with 5+ cards in realm AND holding marker
    if (state.roundEndMarkerHolder === pi && state.players[pi].realm.length >= 5) {
      log(state, `${state.players[pi].name} starts turn with 5+ realm cards and marker. Round ends!`);
      roundActive = false;
      break;
    }

    playTurn(state, ais, pi);

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

  if (state.turnCount >= MAX_TURNS_PER_ROUND && !state.gameEnded) {
    log(state, 'Round ended: turn limit reached');
  }

  if (!state.gameEnded) {
    handleRoundEnd(state, ais);
  }
}

/**
 * Play a single turn for a player.
 * @param {object} state
 * @param {object[]} ais
 * @param {number} playerIndex
 */
export function playTurn(state, ais, playerIndex) {
  const player = state.players[playerIndex];
  const ai = ais[playerIndex];

  log(state, `--- ${player.name}'s turn (hand: ${player.hand.length}, realm: ${player.realm.length}) ---`);

  // Draw phase
  drawPhase(state, playerIndex);

  if (state.gameEnded) return;

  // Play/Buy phase: AI chooses one action
  const legalActions = getLegalActions(state, playerIndex);
  const action = ai.chooseAction(state, legalActions, playerIndex);

  if (action && action.type !== 'PASS') {
    executeAction(state, ais, playerIndex, action);
  }

  if (state.gameEnded) return;

  // Discard phase
  discardPhase(state, playerIndex, ai);
}

/**
 * Draw phase: draw up to hand size limit, minimum 1.
 * @param {object} state
 * @param {number} playerIndex
 */
export function drawPhase(state, playerIndex) {
  const player = state.players[playerIndex];
  const limit = getEffectiveHandLimit(player);
  const currentSize = getHandSize(player);
  const toDraw = Math.max(1, limit - currentSize);

  for (let i = 0; i < toDraw; i++) {
    const card = drawMinorCard(state);
    if (!card) {
      // No cards left even after reshuffling discard
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
 * Discard phase: discard down to hand limit.
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} ai
 */
export function discardPhase(state, playerIndex, ai) {
  const player = state.players[playerIndex];
  const limit = getEffectiveHandLimit(player);

  // First handle realm overflow (> 5 cards)
  while (player.realm.length > 5) {
    const numOver = player.realm.length - 5;
    const indices = ai.chooseRealmDiscard(state, playerIndex, numOver);
    for (const idx of indices) {
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
      const indices = ai.chooseDiscard(state, playerIndex, handDiscard);
      for (const idx of indices) {
        if (idx >= 0 && idx < player.hand.length) {
          const card = player.hand.splice(idx, 1)[0];
          state.minorDiscard.push(card);
        }
      }
    }
  }
}

/**
 * Execute a chosen action.
 * @param {object} state
 * @param {object[]} ais
 * @param {number} playerIndex
 * @param {object} action
 */
export function executeAction(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];

  switch (action.type) {
    case 'PLAY_SET':
      executePlaySet(state, ais, playerIndex, action);
      break;

    case 'PLAY_ROYAL':
      executeRoyalAttack(state, ais, playerIndex, action);
      break;

    case 'PLAY_MAJOR_TOME':
      executeMajorTome(state, ais, playerIndex, action);
      break;

    case 'PLAY_MAJOR_ACTION':
      executeMajorAction(state, ais, playerIndex, action);
      break;

    case 'PLAY_WILD':
      executeWild(state, ais, playerIndex, action);
      break;

    case 'BUY':
      executeBuy(state, ais, playerIndex, action);
      break;
  }
}

/**
 * Execute playing a set to realm.
 */
function executePlaySet(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];
  for (const card of action.cards) {
    const idx = player.hand.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      player.hand.splice(idx, 1);
      player.realm.push(card);
    }
  }
  log(state, `${player.name} plays ${action.cards.map(cardName).join(', ')} to Realm`);
}

/**
 * Execute a Royal attack.
 */
function executeRoyalAttack(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card, target } = action;
  const defender = state.players[target.playerIndex];
  const targetCard = defender.realm[target.realmIndex];

  if (!targetCard) return;

  // Check Tome protections
  if (defender.tomeProtections.has(card.suit)) {
    // Protection blocks this attack
    log(state, `${defender.name}'s Tome protection blocks ${card.suit} attack!`);
    // Attacking card still goes to Pit
    const cardIdx = player.hand.findIndex(c => c.id === card.id);
    if (cardIdx !== -1) {
      player.hand.splice(cardIdx, 1);
      state.pit.push(card);
    }
    return;
  }

  // Check Ace blocking (any player can block)
  if (checkAceBlock(state, ais, playerIndex, action)) {
    return; // Blocked
  }

  // Check King blocking (defender only, for Royal attacks)
  if (target.playerIndex !== playerIndex) {
    const defenderAi = ais[target.playerIndex];
    if (defenderAi.shouldBlockWithKing(state, target.playerIndex, card)) {
      const kingIdx = defender.hand.findIndex(c => c.type === 'minor' && c.rank === 'KING');
      if (kingIdx !== -1) {
        // Check if someone blocks the King with an Ace
        const kingCard = defender.hand[kingIdx];
        const kingAction = { type: 'KING_BLOCK', card: kingCard, playerIndex: target.playerIndex };
        if (checkAceBlock(state, ais, target.playerIndex, kingAction)) {
          // King was blocked by Ace, original attack continues
        } else {
          // King blocks successfully
          defender.hand.splice(kingIdx, 1);
          state.pit.push(kingCard);
          const attackIdx = player.hand.findIndex(c => c.id === card.id);
          if (attackIdx !== -1) {
            player.hand.splice(attackIdx, 1);
            state.pit.push(card);
          }
          log(state, `${defender.name} blocks with King! Both go to Pit`);
          return;
        }
      }
    }
  }

  // Remove attacking card from hand
  const cardIdx = player.hand.findIndex(c => c.id === card.id);
  if (cardIdx !== -1) player.hand.splice(cardIdx, 1);

  // Resolve attack based on type
  const targetIdx = defender.realm.findIndex(c => c.id === targetCard.id);
  if (targetIdx === -1) return;

  switch (card.rank) {
    case 'PAGE':
      // Both Page and target go to Pit
      defender.realm.splice(targetIdx, 1);
      state.pit.push(card);
      state.pit.push(targetCard);
      log(state, `${player.name}'s Page destroys ${cardName(targetCard)} in ${defender.name}'s Realm`);
      break;

    case 'KNIGHT':
      // Target goes to attacker's hand, Knight goes to Pit
      defender.realm.splice(targetIdx, 1);
      player.hand.push(targetCard);
      state.pit.push(card);
      log(state, `${player.name}'s Knight steals ${cardName(targetCard)} from ${defender.name}'s Realm`);
      break;

    case 'QUEEN':
      // Target moves to attacker's realm, Queen goes to Pit
      defender.realm.splice(targetIdx, 1);
      player.realm.push(targetCard);
      state.pit.push(card);
      log(state, `${player.name}'s Queen moves ${cardName(targetCard)} to their Realm`);
      break;
  }

  // After attack, check if marker holder's realm dropped below 5
  checkMarkerPassAfterAttack(state);
}

/**
 * Execute playing a Major Arcana to Tome.
 */
function executeMajorTome(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card } = action;

  // Check Ace blocking
  if (checkAceBlock(state, ais, playerIndex, action)) {
    return;
  }

  const cardIdx = player.hand.findIndex(c => c.id === card.id);
  if (cardIdx === -1) return;
  player.hand.splice(cardIdx, 1);

  // If Tome is full (3 cards), AI must discard one
  if (player.tome.length >= 3) {
    const discardIdx = ais[playerIndex].chooseTomeDiscard(state, playerIndex);
    if (discardIdx >= 0 && discardIdx < player.tome.length) {
      const discarded = player.tome.splice(discardIdx, 1)[0];
      state.pit.push(discarded);
      // Remove protection if applicable
      if (PROTECTION_MAP[discarded.number]) {
        player.tomeProtections.delete(PROTECTION_MAP[discarded.number]);
      }
    }
  }

  player.tome.push(card);
  log(state, `${player.name} plays ${cardName(card)} to Tome`);
  recordEvent(state, 'CARD_TO_TOME', {
    cardNumber: card.number, cardName: card.name, player: playerIndex,
  });

  // Apply on-play Tome effects
  applyTomeEffect(state, ais, playerIndex, card);
}

/**
 * Apply on-play effects for Tome cards.
 */
function applyTomeEffect(state, ais, playerIndex, card) {
  const player = state.players[playerIndex];

  switch (card.number) {
    case 9: // Hermit: choose cards from tome to take into hand
      // For AI, we let them take all non-Hermit tome cards (simplified)
      const tomeCopy = [...player.tome];
      for (const tc of tomeCopy) {
        if (tc.id !== card.id) {
          const idx = player.tome.findIndex(c => c.id === tc.id);
          if (idx !== -1) {
            player.tome.splice(idx, 1);
            player.hand.push(tc);
            // Remove protection
            if (PROTECTION_MAP[tc.number]) {
              player.tomeProtections.delete(PROTECTION_MAP[tc.number]);
            }
          }
        }
      }
      log(state, `${player.name} takes Tome cards into hand via Hermit`);
      break;

    case 15: // Devil: draw up to 7
      {
        const limit = 7;
        const currentSize = getHandSize(player);
        const toDraw = Math.max(0, limit - currentSize);
        for (let i = 0; i < toDraw; i++) {
          const drawn = drawMinorCard(state);
          if (drawn) player.hand.push(drawn);
          else break;
        }
        log(state, `${player.name} draws up to 7 via Devil`);
      }
      break;

    case 14: // Temperance: protect CUPS
    case 22: // Faith: protect SWORDS
    case 23: // Hope: protect WANDS
    case 25: // Prudence: protect COINS
      {
        const suit = PROTECTION_MAP[card.number];
        if (suit) {
          player.tomeProtections.add(suit);
          log(state, `${player.name}'s ${suit} cards are now protected`);
        }
      }
      break;
  }
}

/**
 * Execute a Major Arcana action card.
 */
function executeMajorAction(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card, targets } = action;

  // Check Ace blocking
  if (checkAceBlock(state, ais, playerIndex, action)) {
    return;
  }

  const cardIdx = player.hand.findIndex(c => c.id === card.id);
  if (cardIdx === -1) return;
  player.hand.splice(cardIdx, 1);
  state.pit.push(card);
  recordEvent(state, 'CARD_ACTION_PLAYED', {
    cardNumber: card.number, cardName: card.name, player: playerIndex,
  });

  switch (card.number) {
    case 7: // Chariot
      resolveChariot(state, ais, playerIndex, targets);
      break;
    case 8: // Strength
      resolveStrength(state, ais, playerIndex, targets);
      break;
    case 10: // Wheel of Fortune
      resolveWheelOfFortune(state, ais, playerIndex);
      break;
    case 12: // Hanged Man
      resolveHangedMan(state, ais, playerIndex, targets);
      break;
    case 16: // Tower
      resolveTower(state, ais, playerIndex, targets);
      break;
    case 20: // Judgement
      resolveJudgement(state, ais, playerIndex);
      break;
    case 26: // Plague
      resolvePlague(state, ais, playerIndex, targets);
      break;
  }
}

function resolveChariot(state, ais, playerIndex, targets) {
  const player = state.players[playerIndex];
  let celestial = null;

  if (targets.source === 'realm') {
    celestial = state.players[targets.playerIndex].realm.splice(targets.cardIndex, 1)[0];
    checkMarkerPassAfterAttack(state);
  } else if (targets.source === 'tome') {
    celestial = state.players[targets.playerIndex].tome.splice(targets.cardIndex, 1)[0];
    if (PROTECTION_MAP[celestial.number]) {
      state.players[targets.playerIndex].tomeProtections.delete(PROTECTION_MAP[celestial.number]);
    }
  } else if (targets.source === 'display') {
    celestial = state.display[targets.slotIndex];
    state.display[targets.slotIndex] = null;
    refillDisplay(state, targets.slotIndex);
    checkDeathInDisplay(state);
  } else if (targets.source === 'majorDiscard') {
    celestial = state.majorDiscard.pop();
  }

  if (celestial) {
    player.tome.push(celestial);
    if (player.tome.length > 3) {
      const discardIdx = ais[playerIndex].chooseTomeDiscard(state, playerIndex);
      const discarded = player.tome.splice(discardIdx, 1)[0];
      state.pit.push(discarded);
    }
    log(state, `${player.name} takes ${cardName(celestial)} via Chariot`);
  }
}

function resolveStrength(state, ais, playerIndex, targets) {
  const player = state.players[playerIndex];
  let majorCard = null;

  if (targets.source === 'realm') {
    majorCard = state.players[targets.playerIndex].realm.splice(targets.cardIndex, 1)[0];
    checkMarkerPassAfterAttack(state);
  } else if (targets.source === 'tome') {
    majorCard = state.players[targets.playerIndex].tome.splice(targets.cardIndex, 1)[0];
    if (PROTECTION_MAP[majorCard.number]) {
      state.players[targets.playerIndex].tomeProtections.delete(PROTECTION_MAP[majorCard.number]);
    }
  }

  if (majorCard) {
    player.realm.push(majorCard);
    log(state, `${player.name} moves ${cardName(majorCard)} to Realm as wild via Strength`);
  }
}

function resolveWheelOfFortune(state, ais, playerIndex) {
  const player = state.players[playerIndex];
  const ai = ais[playerIndex];

  const sources = ai.chooseWheelSources(state, playerIndex);
  const drawn = [];

  for (const src of sources) {
    let card = null;
    if (src.source === 'draw') {
      card = drawMajorCard(state);
    } else if (src.source === 'display') {
      card = state.display[src.slotIndex];
      state.display[src.slotIndex] = null;
      refillDisplay(state, src.slotIndex);
      checkDeathInDisplay(state);
    } else if (src.source === 'discard') {
      card = state.majorDiscard.pop();
    }
    if (card) drawn.push(card);
  }

  if (drawn.length === 0) return;

  if (drawn.length === 1) {
    player.hand.push(drawn[0]);
  } else {
    const keepIdx = ai.chooseWheelKeep(drawn);
    player.hand.push(drawn[keepIdx]);
    state.pit.push(drawn[1 - keepIdx]);
  }

  log(state, `${player.name} uses Wheel of Fortune`);
}

function resolveHangedMan(state, ais, playerIndex, targets) {
  const player = state.players[playerIndex];
  const source = state.players[targets.playerIndex];
  const card = source.tome.splice(targets.cardIndex, 1)[0];

  if (!card) return;

  if (PROTECTION_MAP[card.number]) {
    source.tomeProtections.delete(PROTECTION_MAP[card.number]);
  }

  if (player.tome.length >= 3) {
    const discardIdx = ais[playerIndex].chooseTomeDiscard(state, playerIndex);
    const discarded = player.tome.splice(discardIdx, 1)[0];
    state.pit.push(discarded);
    if (PROTECTION_MAP[discarded.number]) {
      player.tomeProtections.delete(PROTECTION_MAP[discarded.number]);
    }
  }

  player.tome.push(card);
  if (PROTECTION_MAP[card.number]) {
    player.tomeProtections.add(PROTECTION_MAP[card.number]);
  }

  log(state, `${player.name} takes ${cardName(card)} from ${source.name}'s Tome via Hanged Man`);
}

function resolveTower(state, ais, playerIndex, targets) {
  const myTomeSize = state.players[playerIndex].tome.length;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    if (state.players[pi].tome.length > myTomeSize) {
      // Destroy a major in their tome (pick last one as default)
      if (state.players[pi].tome.length > 0) {
        // Find a valid target
        const tomeIdx = state.players[pi].tome.length - 1;
        const card = state.players[pi].tome.splice(tomeIdx, 1)[0];
        if (PROTECTION_MAP[card.number]) {
          state.players[pi].tomeProtections.delete(PROTECTION_MAP[card.number]);
        }
        state.pit.push(card);
        log(state, `Tower destroys ${cardName(card)} in ${state.players[pi].name}'s Tome`);
      }
    }
  }
}

function resolveJudgement(state, ais, playerIndex) {
  state.roundEndMarkerHolder = playerIndex;
  state.players[playerIndex].hasRoundEndMarker = true;
  log(state, `${state.players[playerIndex].name} claims Round-End Marker via Judgement`);
  // Round ends immediately - this will be handled by the round loop
  // by setting a flag
  state.judgementTriggered = true;
}

function resolvePlague(state, ais, playerIndex, targets) {
  const target = state.players[targets.playerIndex];

  if (target.tome.length >= 3) {
    // Need to remove one card from target's tome
    const discardIdx = ais[playerIndex].chooseTomeDiscard(state, targets.playerIndex);
    const discarded = target.tome.splice(Math.min(discardIdx, target.tome.length - 1), 1)[0];
    if (PROTECTION_MAP[discarded.number]) {
      target.tomeProtections.delete(PROTECTION_MAP[discarded.number]);
    }
    state.pit.push(discarded);
  }

  // Plague goes to their tome (create a plague card representation)
  // The original Plague action card already went to Pit, so we need to
  // represent it in the tome differently. Actually, re-reading: Plague says
  // "Play into ANY player's Tome" - so the Plague itself goes to the Tome.
  // Let me fix: Plague should NOT go to Pit, it goes to the target's Tome.

  // Actually the card was already moved to pit in executeMajorAction.
  // Let me retrieve it from pit
  const plagueIdx = state.pit.findIndex(c => c.type === 'major' && c.number === 26);
  if (plagueIdx !== -1) {
    const plague = state.pit.splice(plagueIdx, 1)[0];
    target.tome.push(plague);
    log(state, `Plague played into ${target.name}'s Tome`);
  }
}

/**
 * Execute playing a wild card to Realm.
 */
function executeWild(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card, withCards } = action;

  // Check Ace blocking (blocks the wild card only)
  if (checkAceBlock(state, ais, playerIndex, action)) {
    // Wild card and blocking Ace go to Pit
    // But Minor Arcana cards in the set still go to Realm
    for (const mc of withCards) {
      const idx = player.hand.findIndex(c => c.id === mc.id);
      if (idx !== -1) {
        player.hand.splice(idx, 1);
        player.realm.push(mc);
      }
    }
    return;
  }

  // Remove all cards from hand, add to realm
  const wildIdx = player.hand.findIndex(c => c.id === card.id);
  if (wildIdx !== -1) {
    player.hand.splice(wildIdx, 1);
    player.realm.push(card);
  }

  for (const mc of withCards) {
    const idx = player.hand.findIndex(c => c.id === mc.id);
    if (idx !== -1) {
      player.hand.splice(idx, 1);
      player.realm.push(mc);
    }
  }

  log(state, `${player.name} plays ${cardName(card)} as wild to Realm`);
  recordEvent(state, 'CARD_WILD_PLAYED', {
    cardNumber: card.number, cardName: card.name,
    player: playerIndex, companionCount: withCards.length,
  });
}

/**
 * Execute buying a Major Arcana card.
 */
function executeBuy(state, ais, playerIndex, action) {
  const player = state.players[playerIndex];
  const { source, payment } = action;

  // Discard payment to Minor discard pile (not Pit!)
  for (const card of payment) {
    const idx = player.hand.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      player.hand.splice(idx, 1);
      state.minorDiscard.push(card);
    }
  }

  // Take the card
  let bought = null;
  if (source === 'draw') {
    bought = drawMajorCard(state);
  } else if (source.startsWith('display')) {
    const slot = parseInt(source.slice(-1));
    bought = state.display[slot];
    state.display[slot] = null;
    refillDisplay(state, slot);
    checkDeathInDisplay(state);
  } else if (source === 'discard') {
    bought = state.majorDiscard.pop();
  }

  if (bought) {
    // Check for Death
    if (bought.number === 13) {
      state.gameEnded = true;
      state.gameEndReason = 'death_purchased';
      log(state, `${player.name} purchased Death! Game ends!`);
      return;
    }
    player.hand.push(bought);
    log(state, `${player.name} buys ${cardName(bought)} from ${source}`);
    recordEvent(state, 'CARD_PURCHASED', {
      cardNumber: bought.number, cardName: bought.name,
      player: playerIndex, source,
      paymentValue: payment.reduce((s, c) => s + (c.purchaseValue || 0), 0),
    });
  }
}

/**
 * Check if any player wants to block with an Ace.
 * Returns true if blocked.
 */
function checkAceBlock(state, ais, actorIndex, action) {
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === actorIndex) continue;
    const playerHand = state.players[pi].hand;
    const aceIdx = playerHand.findIndex(c => c.type === 'minor' && c.rank === 'ACE');
    if (aceIdx === -1) continue;

    if (ais[pi].shouldBlockWithAce(state, pi, action)) {
      const ace = playerHand.splice(aceIdx, 1)[0];
      log(state, `${state.players[pi].name} blocks with ${cardName(ace)}!`);

      // Check if someone blocks the Ace with another Ace
      const aceAction = { type: 'ACE_BLOCK', card: ace, playerIndex: pi, originalAction: action };
      if (checkAceBlock(state, ais, pi, aceAction)) {
        // The blocking Ace was itself blocked, so original action proceeds
        // But the first Ace still goes to Pit
        state.pit.push(ace);
        return false;
      }

      // If the action involves a card from hand (Royal, Wild, Major), it goes to Pit
      if (action.card) {
        const cardIdx = state.players[actorIndex].hand.findIndex(c => c.id === action.card.id);
        if (cardIdx !== -1) {
          const blocked = state.players[actorIndex].hand.splice(cardIdx, 1)[0];
          state.pit.push(blocked);
        }
      }
      state.pit.push(ace);
      return true;
    }
  }
  return false;
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
 * After an attack removes cards, check if marker holder still has 5.
 */
function checkMarkerPassAfterAttack(state) {
  if (state.roundEndMarkerHolder === -1) return;

  const holder = state.players[state.roundEndMarkerHolder];
  if (holder.realm.length < 5) {
    holder.hasRoundEndMarker = false;
    // Pass to next player clockwise with 5 cards
    const start = state.roundEndMarkerHolder;
    state.roundEndMarkerHolder = -1;

    for (let i = 1; i < state.players.length; i++) {
      const pi = (start + i) % state.players.length;
      if (state.players[pi].realm.length >= 5) {
        state.roundEndMarkerHolder = pi;
        state.players[pi].hasRoundEndMarker = true;
        log(state, `Round-End Marker passes to ${state.players[pi].name}`);
        return;
      }
    }

    log(state, 'Round-End Marker returned to center');
  }
}

/**
 * Handle round end: score, age display, reset for next round.
 * @param {object} state
 * @param {object[]} ais
 */
export function handleRoundEnd(state, ais) {
  // Import scoring dynamically to avoid circular deps - for now inline basic scoring
  log(state, `--- Round ${state.roundNumber} End ---`);

  // Score round
  scoreRoundEnd(state, ais);

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

  // Reset for next round
  resetForNextRound(state);
}


/**
 * Age the Major Arcana display.
 */
function ageDisplay(state) {
  // Slot 2 -> major discard
  if (state.display[2]) {
    state.majorDiscard.push(state.display[2]);
  }

  // Slide right
  state.display[2] = state.display[1];
  state.display[1] = state.display[0];

  // New card to slot 0
  state.display[0] = drawMajorCard(state);

  // Check for Death in any display slot
  checkDeathInDisplay(state);
}

/**
 * Check if Death appeared in the display.
 */
function checkDeathInDisplay(state) {
  for (let i = 0; i < 3; i++) {
    if (state.display[i] && state.display[i].number === 13) {
      state.gameEnded = true;
      state.gameEndReason = 'death_revealed';
      log(state, 'Death revealed in display! Game ends!');
      return;
    }
  }
}

/**
 * Reset state for next round.
 */
function resetForNextRound(state) {
  // Gather realm cards, minor deck, discard, pit -> shuffle for new deck
  for (const p of state.players) {
    for (const card of p.realm) {
      state.minorDiscard.push(card);
    }
    p.realm = [];
    // Tome persists
  }

  // Combine pit + discard + remaining deck
  state.minorDeck.push(...state.minorDiscard);
  state.minorDiscard = [];
  state.minorDeck.push(...state.pit);
  // Actually wait - Pit cards DO get shuffled back between rounds
  // Re-reading rules: "Gather up all Realm cards, the Minor Arcana draw pile,
  // discard pile and the Pit, and shuffle well"
  state.pit = [];

  shuffle(state.minorDeck);

  // Next round pot: last pot amount + 1
  const addToPot = (state.lastPotAmount || state.config.numPlayers) + 1;
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
 */
function dealRoundCards(state) {
  for (let i = 0; i < state.players.length; i++) {
    for (let j = 0; j < 6; j++) {
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

