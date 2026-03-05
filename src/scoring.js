/**
 * Round-end and game-end scoring for New Arcana.
 * Generator versions yield at decision points; sync wrappers drive them with AIs.
 */

import { evaluateHand, compareHands } from './poker.js';
import { isCelestial, cardName, SUITS } from './cards.js';
import { log, recordEvent } from './state.js';
import { recordDecision, DECISION_TYPES } from './history.js';

/**
 * Score the end of a round (generator version).
 * Yields at MAGICIAN_SUIT decision points (via resolveBonus → resolveMagician).
 * @param {object} state
 * @param {object[]} ais - Only used by sync wrapper; generators yield instead
 * @yields {{ type: string, playerIndex: number, state: object }}
 */
export function* scoreRoundEndGen(state) {
  // Guard against double-scoring the same round (e.g. handleRoundEnd scores it,
  // then ageDisplay triggers Death/Celestial win, and playGame calls us again)
  if (state.lastScoredRound === state.roundNumber) return;
  state.lastScoredRound = state.roundNumber;

  // Award pot to player with best poker hand
  // Pot is awarded when a round-end marker holder triggered the round end,
  // OR when the game has ended (Death, Celestial win, etc.) so the final pot isn't lost
  if (state.roundEndMarkerHolder !== -1 || state.gameEnded) {
    awardPot(state);
  }

  // Evaluate bonus cards for all players
  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];
    const hasHierophant = player.tome.some(c => c.type === 'major' && c.number === 5);
    const hasRealmCards = player.realm.length > 0;

    for (const tomeCard of player.tome) {
      if (tomeCard.type !== 'major') continue;
      if (!isBonusCard(tomeCard)) continue;
      if (tomeCard.number === 5) continue; // Hierophant itself is not a bonus
      if (tomeCard.number === 9) continue; // Hermit handled separately below

      if (hasRealmCards) {
        // Normal bonus evaluation
        const bonus = yield* resolveBonusGen(state, pi, tomeCard);
        if (bonus > 0) {
          player.vp += bonus;
          log(state, `${player.name} earns ${bonus}vp from ${cardName(tomeCard)}`);
          recordEvent(state, 'BONUS_SCORED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name,
            player: pi, vp: bonus, hierophant: false,
          });
        } else if (hasHierophant) {
          // Hierophant blesses failed bonus
          player.vp += 1;
          log(state, `${player.name} earns 1vp from Hierophant (failed ${cardName(tomeCard)})`);
          recordEvent(state, 'BONUS_SCORED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name,
            player: pi, vp: 1, hierophant: true,
          });
        } else {
          recordEvent(state, 'BONUS_FAILED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name, player: pi,
          });
        }
      } else {
        // No realm cards — bonuses don't fire
        if (hasHierophant) {
          // Hierophant makes them score 1vp anyway
          player.vp += 1;
          log(state, `${player.name} earns 1vp from Hierophant (no realm, ${cardName(tomeCard)})`);
          recordEvent(state, 'BONUS_SCORED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name,
            player: pi, vp: 1, hierophant: true,
          });
        } else {
          recordEvent(state, 'BONUS_FAILED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name, player: pi,
          });
        }
      }
    }

    // Hermit bonus: 1vp if Hermit is the only card in Tome (separate check)
    if (hasRealmCards) {
      const hermit = player.tome.find(c => c.type === 'major' && c.number === 9);
      const hermitCfg = state.config?.bonusCards?.[9];
      const hermitVp = hermitCfg?.vp ?? 1;
      if (hermit && player.tome.length === 1) {
        player.vp += hermitVp;
        log(state, `${player.name} earns ${hermitVp}vp from Hermit (only card in Tome)`);
        recordEvent(state, 'BONUS_SCORED', {
          cardNumber: 9, cardName: 'The Hermit', player: pi, vp: hermitVp, hierophant: false,
        });
      }
    }
  }

  // Reset marker
  state.roundEndMarkerHolder = -1;
  for (const p of state.players) {
    p.hasRoundEndMarker = false;
  }
}

/**
 * Score the end of a round (sync wrapper — unchanged API).
 * @param {object} state
 * @param {object[]} ais
 */
export function scoreRoundEnd(state, ais) {
  driveWithAIs(scoreRoundEndGen(state), ais);
}

/**
 * Award the pot to the player with the best poker hand.
 */
function awardPot(state) {
  let bestPi = -1;
  let bestEval = null;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (state.players[pi].realm.length === 0) continue;
    const eval_ = evaluateHand(state.players[pi].realm);
    if (!bestEval || compareHands(eval_, bestEval) > 0) {
      bestEval = eval_;
      bestPi = pi;
    }
  }

  if (bestPi !== -1 && state.pot > 0) {
    state.players[bestPi].vp += state.pot;
    log(state, `${state.players[bestPi].name} wins pot of ${state.pot}vp with ${bestEval.type}`);
    recordEvent(state, 'POT_AWARDED', {
      player: bestPi, amount: state.pot, handType: bestEval.type,
    });
    state.pot = 0;
  } else if (state.pot > 0) {
    log(state, 'No player has cards in Realm. Pot not awarded.');
  }
}

/**
 * Check if a card is a round-end bonus card.
 */
function isBonusCard(card) {
  if (card.type !== 'major') return false;
  return card.category === 'bonus-round' ||
    (card.keywords && card.keywords.includes('bonus'));
}

/**
 * Resolve a single bonus card's VP (generator version).
 * Yields at MAGICIAN_SUIT decision point.
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} card
 * @yields {{ type: string, playerIndex: number, state: object }}
 * @returns {number} VP earned
 */
export function* resolveBonusGen(state, playerIndex, card) {
  const player = state.players[playerIndex];
  const bonusCfg = state.config?.bonusCards?.[card.number];

  // Fool and Hierophant have special logic, not config-driven
  if (card.number === 0) return yield* resolveFoolGen(state, playerIndex);
  if (card.number === 5) return 0; // Hierophant itself is not a bonus

  // If we have a config entry, use config-driven resolution
  if (bonusCfg) {
    switch (bonusCfg.bonusType) {
      case 'suitMajority':
        return yield* resolveMagicianGen(state, playerIndex);
      case 'suitHighest':
        return resolveSuitBonus(state, playerIndex, bonusCfg.suit, bonusCfg.countWilds ?? false, bonusCfg.allowTie ?? true, bonusCfg.vp ?? 1);
      case 'pairCounting':
        return resolveLovers(state, playerIndex, bonusCfg.vpPerPair ?? 1);
      case 'hermitExclusive':
        return player.tome.length === 1 && player.tome[0].number === 9 ? (bonusCfg.vp ?? 1) : 0;
      case 'noSuitInRealm':
        return resolveNoneOfSuitBonus(state, playerIndex, bonusCfg.suit, bonusCfg.vp ?? 1);
      default:
        return 0;
    }
  }

  // Fallback for cards without config entries (hardcoded defaults)
  switch (card.number) {
    case 1: return yield* resolveMagicianGen(state, playerIndex);
    case 2: return resolveSuitBonus(state, playerIndex, 'WANDS', false, true);
    case 3: return resolveSuitBonus(state, playerIndex, 'CUPS', false, true);
    case 4: return resolveSuitBonus(state, playerIndex, 'COINS', false, true);
    case 6: return resolveLovers(state, playerIndex);
    case 9: return player.tome.length === 1 && player.tome[0].number === 9 ? 1 : 0;
    case 11: return resolveSuitBonus(state, playerIndex, 'SWORDS', false, true);
    case 14: return resolveNoneOfSuitBonus(state, playerIndex, 'CUPS');
    case 22: return resolveNoneOfSuitBonus(state, playerIndex, 'SWORDS');
    case 23: return resolveNoneOfSuitBonus(state, playerIndex, 'WANDS');
    case 25: return resolveNoneOfSuitBonus(state, playerIndex, 'COINS');
    default: return 0;
  }
}

/**
 * Resolve a single bonus card's VP (sync wrapper — unchanged API).
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} card
 * @param {object[]} ais
 * @returns {number} VP earned
 */
export function resolveBonus(state, playerIndex, card, ais) {
  return driveWithAIs(resolveBonusGen(state, playerIndex, card), ais);
}

/**
 * The Fool: duplicate the best opponent bonus (generator version).
 */
function* resolveFoolGen(state, playerIndex) {
  let bestBonus = 0;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    if (state.players[pi].realm.length === 0) continue;

    for (const card of state.players[pi].tome) {
      if (!isBonusCard(card)) continue;
      // Evaluate this bonus as if the Fool's owner had it
      // But use the OPPONENT'S state for evaluation (requirements are duplicated)
      const bonusVp = yield* resolveBonusGen(state, pi, card);
      if (bonusVp > bestBonus) {
        bestBonus = bonusVp;
      }
    }
  }

  return bestBonus;
}

/**
 * The Fool: duplicate the best opponent bonus (sync wrapper — unchanged API).
 */
export function resolveFool(state, playerIndex, ais) {
  return driveWithAIs(resolveFoolGen(state, playerIndex), ais);
}

/**
 * Magician: 1vp if you have MORE cards of your named suit than ANY other player.
 * Wild cards ARE counted. NOT scored on tie. (generator version)
 */
function* resolveMagicianGen(state, playerIndex) {
  const suit = yield {
    type: DECISION_TYPES.MAGICIAN_SUIT,
    playerIndex,
    state,
  };
  recordDecision(state, DECISION_TYPES.MAGICIAN_SUIT, playerIndex, suit);

  const bonusCfg = state.config?.bonusCards?.[1];
  const vp = bonusCfg?.vp ?? 1;
  const countWilds = bonusCfg?.countWilds ?? true;
  const myCount = countSuitInRealm(state.players[playerIndex], suit, countWilds);

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const otherCount = countSuitInRealm(state.players[pi], suit, countWilds);
    if (otherCount >= myCount) return 0; // Must have strictly MORE
  }

  return myCount > 0 ? vp : 0;
}

/**
 * Suit bonus: vp for having the highest count of a suit.
 * @param {boolean} countWilds - Whether to count wild cards
 * @param {boolean} allowTie - Whether ties still score
 * @param {number} [vp=1] - VP to award
 */
function resolveSuitBonus(state, playerIndex, suit, countWilds, allowTie, vp) {
  const award = vp ?? 1;
  const myCount = countSuitInRealm(state.players[playerIndex], suit, countWilds);
  if (myCount === 0) return 0;

  let highest = myCount;
  let tied = false;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const otherCount = countSuitInRealm(state.players[pi], suit, countWilds);
    if (otherCount > highest) return 0;
    if (otherCount === highest) tied = true;
  }

  if (tied && !allowTie) return 0;
  return award;
}

/**
 * Count cards of a specific suit in a player's realm.
 */
function countSuitInRealm(player, suit, countWilds) {
  let count = 0;
  for (const card of player.realm) {
    if (card.type === 'minor' && card.suit === suit) count++;
    else if (card.type === 'major' && countWilds) count++; // Wild is every suit
  }
  return count;
}

/**
 * Lovers: vpPerPair per pair. NOT for three/four/five of a kind.
 * @param {number} [vpPerPair=1] - VP per pair
 */
function resolveLovers(state, playerIndex, vpPerPair) {
  const pairVp = vpPerPair ?? 1;
  const player = state.players[playerIndex];
  const minors = player.realm.filter(c => c.type === 'minor');
  const rankCounts = {};
  for (const c of minors) {
    rankCounts[c.numericRank] = (rankCounts[c.numericRank] || 0) + 1;
  }

  // Count exact pairs (not trips/quads)
  let pairCount = 0;
  for (const count of Object.values(rankCounts)) {
    if (count === 2) pairCount++;
  }

  // Wild cards: if there's a wild, the hand evaluation already gives best hand
  // But for Lovers we specifically count pairs, ignoring wild optimization
  // "Wild cards always produce the strongest hand, so you cannot downgrade to Two-Pair"
  if (player.realm.some(c => c.type === 'major')) {
    // With a wild, the hand would be evaluated as the strongest possible
    // Can't "downgrade" to count pairs. Evaluate naturally.
    const eval_ = evaluateHand(player.realm);
    if (eval_.type === 'One Pair') return pairVp;
    if (eval_.type === 'Two Pair') return pairVp * 2;
    return 0;
  }

  return pairCount * pairVp;
}

/**
 * Protection card bonus: vp if no cards of that suit in realm (wilds not counted).
 * @param {number} [vp=1] - VP to award
 */
function resolveNoneOfSuitBonus(state, playerIndex, suit, vp) {
  const award = vp ?? 1;
  const player = state.players[playerIndex];
  const hasMinorOfSuit = player.realm.some(c => c.type === 'minor' && c.suit === suit);
  return hasMinorOfSuit ? 0 : award;
}

/**
 * Score game end bonuses.
 * @param {object} state
 */
export function scoreGameEnd(state) {
  const celestialVp = state.config?.scoring?.celestialVp ?? 2;
  const plagueVp = state.config?.scoring?.plagueVp ?? -3;

  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];

    // Celestials: celestialVp each (in Tome, Realm, or Vault)
    const allCards = [...player.tome, ...player.realm, ...player.vault];
    for (const card of allCards) {
      if (isCelestial(card)) {
        player.vp += celestialVp;
        log(state, `${player.name} earns ${celestialVp}vp for ${cardName(card)} (Celestial)`);
      }
    }

    // Plague: plagueVp if in Tome
    for (const card of player.tome) {
      if (card.type === 'major' && card.number === 26) {
        player.vp += plagueVp;
        log(state, `${player.name} loses ${Math.abs(plagueVp)}vp from Plague in Tome`);
      }
    }

    // Vault bonus: best vault hand = vp equal to player count
    if (player.vault.length > 0) {
      // Find player with best vault
      let bestVaultPi = -1;
      let bestVaultEval = null;
      for (let vpi = 0; vpi < state.players.length; vpi++) {
        if (state.players[vpi].vault.length === 0) continue;
        const eval_ = evaluateHand(state.players[vpi].vault);
        if (!bestVaultEval || compareHands(eval_, bestVaultEval) > 0) {
          bestVaultEval = eval_;
          bestVaultPi = vpi;
        }
      }
      if (bestVaultPi === pi) {
        player.vp += state.players.length;
        log(state, `${player.name} earns ${state.players.length}vp for best Vault`);
      }
    }
  }
}

/**
 * Check if any player has 3+ Celestials for immediate win.
 * @param {object} state
 * @returns {number} Player index or -1
 */
export function checkCelestialWin(state) {
  const winCount = state.config?.scoring?.celestialWinCount ?? 3;
  for (let pi = 0; pi < state.players.length; pi++) {
    const p = state.players[pi];
    const celestials = [...p.tome, ...p.realm, ...p.vault].filter(c => isCelestial(c));
    if (celestials.length >= winCount) return pi;
  }
  return -1;
}

// ============================================================
// Shared utilities for driving generators with AIs
// ============================================================

/**
 * Map a decision request to the corresponding AI method call.
 * @param {object} ai - AI instance
 * @param {object} request - Yielded decision request
 * @returns {*} The AI's choice value
 */
export function resolveWithAI(ai, request) {
  switch (request.type) {
    case DECISION_TYPES.MAJOR_KEEP:
      return ai.chooseMajorKeep(request.cards, request.state);
    case DECISION_TYPES.ACTION:
      return ai.chooseAction(request.state, request.legalActions, request.playerIndex);
    case DECISION_TYPES.ACE_BLOCK:
      return ai.shouldBlockWithAce(request.state, request.playerIndex, request.action);
    case DECISION_TYPES.KING_BLOCK:
      return ai.shouldBlockWithKing(request.state, request.playerIndex, request.attackCard);
    case DECISION_TYPES.DISCARD:
      return ai.chooseDiscard(request.state, request.playerIndex, request.numToDiscard);
    case DECISION_TYPES.REALM_DISCARD:
      return ai.chooseRealmDiscard(request.state, request.playerIndex, request.numToDiscard);
    case DECISION_TYPES.TOME_DISCARD: {
      const tomeOwner = request.targetPlayerIndex ?? request.playerIndex;
      return ai.chooseTomeDiscard(request.state, tomeOwner);
    }
    case DECISION_TYPES.WHEEL_SOURCES:
      return ai.chooseWheelSources(request.state, request.playerIndex);
    case DECISION_TYPES.WHEEL_KEEP:
      return ai.chooseWheelKeep(request.cards, request.state);
    case DECISION_TYPES.MAGICIAN_SUIT:
      return ai.chooseMagicianSuit(request.state, request.playerIndex);
    default:
      throw new Error(`Unknown decision type: ${request.type}`);
  }
}

/**
 * Drive a generator to completion using AI objects for all decisions.
 * @param {Generator} gen - Game generator
 * @param {object[]} ais - Array of AI objects
 * @returns {*} The generator's return value
 */
export function driveWithAIs(gen, ais) {
  let result = gen.next();
  while (!result.done) {
    const request = result.value;
    const choice = resolveWithAI(ais[request.playerIndex], request);
    result = gen.next(choice);
  }
  return result.value;
}
