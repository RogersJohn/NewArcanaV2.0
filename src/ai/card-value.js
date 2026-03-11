/**
 * Config-aware card valuation utility.
 * Reads card effect config and estimates strategic value based on
 * board state, bonus potential, celestial count, and context.
 */

import { isCelestial } from '../cards.js';
import { getCardEffect } from '../effect-resolver.js';

/**
 * Estimate the strategic value of a Major Arcana card.
 * @param {object} state - Game state (with config)
 * @param {number} playerIndex - Player evaluating the card
 * @param {object} card - The card to evaluate
 * @param {string} context - 'tome'|'buy'|'discard'|'wild'|'keep'
 * @returns {number} Estimated value (higher = more valuable)
 */
export function estimateCardValue(state, playerIndex, card, context) {
  if (!card || card.type !== 'major') return 0;

  const effect = getCardEffect(state, card);
  if (!effect) return 5;

  const player = state.players[playerIndex];
  let value = 0;

  switch (effect.type) {
    case 'bonus':
      value = scoreBonusValue(effect.bonus, player, state, playerIndex);
      break;
    case 'action':
      value = scoreActionValue(effect, player, state, playerIndex);
      break;
    case 'celestial':
      value = scoreCelestialValue(effect, player, state, playerIndex);
      break;
    case 'tome':
      value = scoreTomeValue(effect, card, player, state, playerIndex);
      break;
    case 'game_end_trigger':
      value = 0; // Death — never desirable to hold
      break;
    default:
      value = 5;
  }

  // Apply context modifiers
  switch (context) {
    case 'tome':
      // Full value for playing to tome
      break;
    case 'buy': {
      value *= 0.7; // Discount — costs payment cards

      // Wild card floor: every Major Arcana can be played as a wild.
      // Don't let the buy value drop below the card's wild utility.
      const wildFloor = estimateWildValue(state, playerIndex);
      value = Math.max(value, wildFloor * 0.7);
      break;
    }
    case 'discard':
      // Inverted: high value = keep, return as-is (caller uses for retention)
      break;
    case 'wild':
      // Only realm utility matters, ignore bonus/tome potential
      value = 5;
      break;
    case 'keep':
      // Setup: slightly discounted (future potential)
      value *= 0.85;
      break;
    default:
      break;
  }

  return value;
}

function scoreBonusValue(bonus, player, state, playerIndex) {
  if (!bonus) return 5;

  switch (bonus.bonusType) {
    case 'foolDuplicate':
      // Value depends on opponents having bonus cards
      return 12;

    case 'suitMajority': {
      const vp = bonus.vp || 1;
      return vp * 15;
    }

    case 'suitHighest': {
      const vp = bonus.vp || 1;
      const suit = bonus.suit;
      const myCount = countSuitInRealm(player, suit);
      const likelihood = myCount >= 2 ? 0.7 : myCount >= 1 ? 0.4 : 0.15;
      return vp * 15 * likelihood;
    }

    case 'pairCounting': {
      const vpPerPair = bonus.vpPerPair || 1;
      const pairCount = countPairsInRealm(player);
      const expected = Math.max(pairCount, 0.5); // At least some expected value
      return vpPerPair * expected * 12;
    }

    case 'hermitExclusive': {
      const vp = bonus.vp || 1;
      const tomeSize = player.tome.length;
      // Only good if tome is empty or has 1 card
      const likelihood = tomeSize <= 1 ? 0.6 : 0.1;
      return vp * 10 * likelihood;
    }

    case 'noSuitInRealm': {
      const vp = bonus.vp || 1;
      const suit = bonus.suit;
      const myCount = countSuitInRealm(player, suit);
      const likelihood = myCount === 0 ? 0.8 : 0.2;
      return vp * 12 * likelihood;
    }

    case 'hierophant_blessing':
      // Value increases with more bonus cards in tome
      return 15 + player.tome.filter(c => c.keywords?.includes('bonus')).length * 5;

    default:
      return 8;
  }
}

function scoreActionValue(effect, player, state, playerIndex) {
  switch (effect.action) {
    case 'MOVE_CELESTIAL_TO_TOME': {
      // Chariot: high if celestials are visible
      const visibleCelestials = [
        ...state.display.filter(c => c && isCelestial(c)),
        ...state.players.flatMap((p, i) =>
          i !== playerIndex ? [...p.tome, ...p.realm].filter(c => isCelestial(c)) : []
        ),
      ].length;
      const myCelestials = countCelestials(player);
      // Massive value if we already have 2 (third = win)
      if (myCelestials >= 2 && visibleCelestials > 0) return 200;
      return 25 + visibleCelestials * 8 + myCelestials * 15;
    }

    case 'MOVE_MAJOR_TO_REALM':
      return 15;

    case 'WHEEL_OF_FORTUNE':
      return 20;

    case 'STEAL_FROM_TOME': {
      // Hanged Man: value based on opponents' tome quality
      const bestOpponentTome = Math.max(0,
        ...state.players.filter((_, i) => i !== playerIndex).map(p => p.tome.length)
      );
      return 15 + bestOpponentTome * 5;
    }

    case 'TOWER_DESTROY': {
      const myTomeSize = player.tome.length;
      const affectedOpponents = state.players.filter((p, i) =>
        i !== playerIndex && p.tome.length > myTomeSize
      ).length;
      return 10 + affectedOpponents * 10;
    }

    case 'CLAIM_ROUND_END_MARKER':
      return player.realm.length >= 3 ? 25 : 12;

    case 'PLAGUE_TO_TOME': {
      const vpPenalty = Math.abs(effect.vpPenalty || state.config?.scoring?.plagueVp || 3);
      return vpPenalty * 5;
    }

    default:
      return 10;
  }
}

function scoreCelestialValue(effect, player, state, playerIndex) {
  const vpAtEnd = effect.vpAtGameEnd || state.config?.scoring?.celestialVp || 2;
  const myCelestials = countCelestials(player);
  const base = vpAtEnd * 5;

  // Third celestial = instant win
  if (myCelestials >= 2) return base + 500;
  // Second celestial = very high
  if (myCelestials >= 1) return base + 50;
  return base + 15;
}

function scoreTomeValue(effect, card, player, state, playerIndex) {
  let value = 10;

  // On-play effects
  if (effect.onPlay) {
    switch (effect.onPlay.action) {
      case 'PROTECT_SUIT': {
        const suit = effect.onPlay.suit;
        const myCount = countSuitInRealm(player, suit);
        value += myCount * 6;
        break;
      }
      case 'DRAW_TO_LIMIT':
        value += 20; // Card advantage is always good
        break;
      case 'TOME_CARDS_TO_HAND':
        value += player.tome.length * 3;
        break;
    }
  }

  // Bonus component
  if (effect.bonus) {
    value += scoreBonusValue(effect.bonus, player, state, playerIndex) * 0.5;
  }

  // Celestial component
  if (isCelestial(card)) {
    value += scoreCelestialValue(effect, player, state, playerIndex);
  }

  return value;
}

/**
 * Estimate the value of playing any Major Arcana as a wild card.
 * Based on game state: more valuable when realm is small (need to fill it)
 * or close to 5 (triggers round-end marker).
 */
function estimateWildValue(state, playerIndex) {
  const player = state.players[playerIndex];
  const realmSize = player.realm.length;

  // Wild is most valuable when it can reach realm=5 (trigger round-end)
  if (realmSize === 4) return 18; // Completing realm
  if (realmSize === 3) return 12; // Getting close
  if (realmSize <= 2) return 8;   // Early game — still useful for realm building
  return 6; // realm already 5+ (rare), less useful
}

// --- Helpers ---

function countSuitInRealm(player, suit) {
  return player.realm.filter(c => c.type === 'minor' && c.suit === suit).length;
}

function countPairsInRealm(player) {
  const counts = {};
  for (const c of player.realm) {
    if (c.type === 'minor') {
      counts[c.numericRank] = (counts[c.numericRank] || 0) + 1;
    }
  }
  let pairs = 0;
  for (const count of Object.values(counts)) {
    pairs += Math.floor(count / 2);
  }
  return pairs;
}

function countCelestials(player) {
  return [...player.tome, ...player.realm, ...player.vault].filter(c => isCelestial(c)).length;
}
