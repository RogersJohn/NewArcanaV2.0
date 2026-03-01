/**
 * Game state management for New Arcana.
 */

import { createMinorDeck, createMajorDeck } from './cards.js';
import { createRNG } from './rng.js';

/**
 * Create the initial game state.
 * @param {number} numPlayers - Number of players (2-6)
 * @param {boolean} extended - Use extended Major Arcana (6-player set)
 * @param {number|string} [seed] - Optional seed for deterministic RNG
 * @returns {object} Initial game state
 */
export function createInitialState(numPlayers, extended = false, seed) {
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      name: `Player ${i + 1}`,
      hand: [],
      realm: [],
      tome: [],
      vault: [],
      vp: 0,
      hasRoundEndMarker: false,
      tomeProtections: new Set(),
    });
  }

  const rng = createRNG(seed);

  return {
    players,
    rng,
    seed: rng.seed,
    minorDeck: createMinorDeck(),
    minorDiscard: [],
    pit: [],
    majorDeck: createMajorDeck(extended),
    majorDiscard: [],
    display: [null, null, null],
    pot: 0,
    roundNumber: 0,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    gameEnded: false,
    gameEndReason: null,
    roundEndMarkerHolder: -1,
    lastScoredRound: -1,
    turnCount: 0,
    config: {
      extended,
      numPlayers,
      handSizeLimit: 6,
    },
    log: [],
    events: [],
    history: [],
  };
}

/**
 * Record a structured event for analytics.
 * @param {object} state
 * @param {string} type - Event type (e.g. 'CARD_PURCHASED')
 * @param {object} data - Event payload
 */
export function recordEvent(state, type, data) {
  state.events.push({ type, round: state.roundNumber, ...data });
}

/**
 * Deep clone a game state for AI lookahead.
 * @param {object} state - Game state to clone
 * @returns {object} Deep copy
 */
export function cloneState(state) {
  const { rng, history, ...rest } = state;
  const clone = JSON.parse(JSON.stringify(rest, setReplacer));
  // Restore Sets that JSON doesn't handle
  for (const player of clone.players) {
    player.tomeProtections = new Set(player.tomeProtections);
  }
  // Share RNG reference — clones shouldn't diverge the RNG independently
  clone.rng = rng;
  // Share history reference — clones used for lookahead shouldn't bloat with duplicate history
  clone.history = history;
  return clone;
}

/**
 * Get effective hand size (cards in hand + cards in realm).
 * @param {object} player
 * @returns {number}
 */
export function getHandSize(player) {
  return player.hand.length + player.realm.length;
}

/**
 * Get effective hand size limit (6, or 7 if Devil in tome).
 * @param {object} player
 * @returns {number}
 */
export function getEffectiveHandLimit(player) {
  const hasDevil = player.tome.some(c => c.type === 'major' && c.number === 15);
  return hasDevil ? 7 : 6;
}

/**
 * Draw a card from the minor deck, reshuffling discard if needed.
 * The Pit is NEVER recycled.
 * @param {object} state
 * @returns {object|null} Drawn card, or null if truly empty
 */
export function drawMinorCard(state) {
  if (state.minorDeck.length === 0) {
    if (state.minorDiscard.length === 0) return null;
    // Shuffle discard into deck (Pit stays separate)
    state.minorDeck = state.minorDiscard.splice(0);
    state.rng.shuffle(state.minorDeck);
  }
  return state.minorDeck.length > 0 ? state.minorDeck.pop() : null;
}

/**
 * Draw a card from the major deck.
 * @param {object} state
 * @returns {object|null} Drawn card, or null if empty
 */
export function drawMajorCard(state) {
  return state.majorDeck.length > 0 ? state.majorDeck.pop() : null;
}

/**
 * Add a message to the game log.
 * @param {object} state
 * @param {string} message
 */
export function log(state, message) {
  state.log.push(message);
}

/**
 * Refill display from the major deck after a card is taken.
 * Slide existing cards right, add new card to slot 0.
 * @param {object} state
 * @param {number} takenSlot - The slot that was emptied (0, 1, or 2)
 */
export function refillDisplay(state, takenSlot) {
  // Slide cards right to fill the gap
  for (let i = takenSlot; i > 0; i--) {
    state.display[i] = state.display[i - 1];
  }
  // Refill leftmost slot
  state.display[0] = drawMajorCard(state);
  if (state.display[0]) {
    recordEvent(state, 'CARD_DISPLAYED', {
      cardNumber: state.display[0].number, cardName: state.display[0].name,
    });
  }
}

/**
 * Serialize Sets for JSON (used when cloning with JSON).
 * We store Set contents as arrays in JSON.
 */
function setReplacer(key, value) {
  if (value instanceof Set) {
    return [...value];
  }
  return value;
}
