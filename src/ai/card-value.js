/**
 * Config-aware card valuation utility.
 * Reads card effect config and estimates strategic value based on
 * board state, bonus potential, celestial count, and context.
 */

import { isCelestial } from '../cards.js';
import { getCardEffect } from '../effect-resolver.js';
import { estimateRemainingRounds, getHandRanking } from './awareness.js';

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
    case 'jester':
      value = 18; // Valuable as both a blocking card and a wild
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

  const remainingRounds = estimateRemainingRounds(state);

  // Compute per-round probability and VP, then multiply by remaining rounds
  let probPerRound = 0;
  let vpPerTrigger = 1;

  switch (bonus.bonusType) {
    case 'foolDuplicate': {
      // Check if opponents have bonus cards in their tomes
      const opponentBonuses = state.players
        .filter((_, i) => i !== playerIndex)
        .reduce((sum, p) => sum + p.tome.filter(c => c.keywords?.includes('bonus')).length, 0);
      probPerRound = opponentBonuses >= 2 ? 0.7 : opponentBonuses >= 1 ? 0.5 : 0.15;
      vpPerTrigger = bonus.vp || 1;
      break;
    }

    case 'suitMajority': {
      vpPerTrigger = bonus.vp || 1;
      // Magician: need strictly MORE of named suit than any opponent — harder
      const suit = bonus.suit;
      const myCount = countSuitInRealm(player, suit);
      probPerRound = myCount >= 3 ? 0.6 : myCount >= 2 ? 0.35 : myCount >= 1 ? 0.15 : 0.05;
      break;
    }

    case 'suitHighest': {
      vpPerTrigger = bonus.vp || 1;
      const suit = bonus.suit;
      const myCount = countSuitInRealm(player, suit);
      // Allows ties — easier to trigger
      probPerRound = myCount >= 3 ? 0.8 : myCount >= 2 ? 0.6 : myCount >= 1 ? 0.35 : 0.1;
      break;
    }

    case 'pairCounting': {
      vpPerTrigger = bonus.vpPerPair || 1;
      const pairCount = countPairsInRealm(player);
      // Expected pairs scales with realm size
      const expectedPairs = Math.max(pairCount, 0.5);
      return vpPerTrigger * expectedPairs * remainingRounds * 2.5;
    }

    case 'hermitExclusive': {
      vpPerTrigger = bonus.vp || 1;
      const tomeSize = player.tome.length;
      // Only triggers if Hermit is alone in Tome
      probPerRound = tomeSize <= 1 ? 0.6 : 0.05;
      break;
    }

    case 'noSuitInRealm': {
      vpPerTrigger = bonus.vp || 1;
      const suit = bonus.suit;
      const myCount = countSuitInRealm(player, suit);
      probPerRound = myCount === 0 ? 0.75 : 0.15;
      break;
    }

    case 'hierophant_blessing': {
      // Value scales with bonus cards in tome × remaining rounds
      const bonusCount = player.tome.filter(c => c.keywords?.includes('bonus')).length;
      return (10 + bonusCount * 5) * Math.min(remainingRounds, 5) * 0.6;
    }

    default:
      return 8;
  }

  // Cumulative expected VP = probability × VP × remaining rounds
  const cumulativeVP = probPerRound * vpPerTrigger * remainingRounds;

  // Opportunity cost: using as wild could win the pot instead
  const potValue = state.pot || 0;
  const opportunityCost = potValue * 0.15; // rough estimate of pot-win probability

  return Math.max(3, cumulativeVP * 5 - opportunityCost);
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

    case 'CLAIM_ROUND_END_MARKER': {
      const ranking = getHandRanking(state, playerIndex);
      if (ranking.winning && player.realm.length >= 4) return 40; // Winning with strong realm — end it
      if (ranking.winning && player.realm.length >= 3) return 30; // Winning — good time to end
      if (player.realm.length >= 5) return 20; // Full realm but not winning — still want to end eventually
      if (ranking.winning) return 15; // Winning with small realm — risky but possible
      return 3; // Losing — don't end the round, you're giving the pot away
    }

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
  const remaining = estimateRemainingRounds(state);

  // Wild is most valuable when it can reach realm=5 (trigger round-end)
  let base;
  if (realmSize === 4) base = 18; // Completing realm
  else if (realmSize === 3) base = 12; // Getting close
  else if (realmSize <= 2) base = 8;   // Early game
  else base = 6; // realm already 5+

  // Late game: wild is more valuable (no time for Tome effects)
  if (remaining <= 2) base *= 1.3;
  return base;
}

/**
 * Estimate the minimum expected VP from playing a bonus card to tome.
 * This is the "floor" — if the card's strategic value somehow computes lower
 * than this, the floor takes over. Prevents the AI from undervaluing
 * obvious recurring-VP plays.
 *
 * @param {object} effect - Card effect from getCardEffect
 * @param {object} player - Player state
 * @param {object} state - Game state
 * @param {number} playerIndex
 * @param {number} remainingRounds
 * @returns {number} Minimum expected value
 */
export function estimateBonusFloor(effect, player, state, playerIndex, remainingRounds) {
  if (!effect) return 0;

  const bonus = effect.bonus || (effect.type === 'tome' ? effect.bonus : null);
  if (!bonus) return 0;

  let vpPerRound = 0;
  let triggerProb = 0.5; // Conservative default

  switch (bonus.bonusType) {
    case 'suitHighest':
      vpPerRound = bonus.vp || 1;
      triggerProb = 0.5;  // Allows ties, reasonably likely
      break;
    case 'suitMajority':
      vpPerRound = bonus.vp || 1;
      triggerProb = 0.3;  // Strict advantage required
      break;
    case 'pairCounting':
      vpPerRound = (bonus.vpPerPair || 1) * 0.8; // ~0.8 pairs per round average
      triggerProb = 0.7;  // Pairs are common
      break;
    case 'hermitExclusive':
      vpPerRound = bonus.vp || 1;
      triggerProb = player.tome.length <= 1 ? 0.8 : 0.2;
      break;
    case 'noSuitInRealm':
      vpPerRound = bonus.vp || 1;
      triggerProb = 0.6;  // 3/4 chance you avoid one suit
      break;
    case 'foolDuplicate':
      vpPerRound = bonus.vp || 1;
      triggerProb = 0.3;
      break;
    default:
      return 0;
  }

  // Minimum expected cumulative VP over remaining game
  // Use a conservative multiplier (not the full 5× from scoreBonusValue)
  const expectedVP = vpPerRound * triggerProb * remainingRounds;
  return expectedVP * 2.5; // Scale to match scoring units
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
