/**
 * Round-end and game-end scoring for New Arcana.
 */

import { evaluateHand, compareHands } from './poker.js';
import { isCelestial, cardName, SUITS } from './cards.js';
import { log } from './state.js';

/**
 * Score the end of a round.
 * @param {object} state
 * @param {object[]} ais
 */
export function scoreRoundEnd(state, ais) {
  // Award pot to player with best poker hand
  if (state.roundEndMarkerHolder !== -1) {
    awardPot(state);
  }

  // Evaluate bonus cards for all players
  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];
    if (player.realm.length === 0) continue; // Bonuses require at least 1 realm card

    let hasHierophant = player.tome.some(c => c.type === 'major' && c.number === 5);

    for (const tomeCard of player.tome) {
      if (tomeCard.type !== 'major') continue;
      const bonus = resolveBonus(state, pi, tomeCard, ais);
      if (bonus > 0) {
        player.vp += bonus;
        log(state, `${player.name} earns ${bonus}vp from ${cardName(tomeCard)}`);
      } else if (hasHierophant && isBonusCard(tomeCard) && tomeCard.number !== 5) {
        // Hierophant: failed bonuses score 1vp
        player.vp += 1;
        log(state, `${player.name} earns 1vp from Hierophant (failed ${cardName(tomeCard)})`);
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
 * Resolve a single bonus card's VP.
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} card
 * @param {object[]} ais
 * @returns {number} VP earned
 */
export function resolveBonus(state, playerIndex, card, ais) {
  const player = state.players[playerIndex];

  switch (card.number) {
    case 0: // The Fool - duplicate an opponent's bonus
      return resolveFool(state, playerIndex, ais);

    case 1: // Magician - 1vp if you have MORE of a named suit than ANY other player
      return resolveMagician(state, playerIndex, ais);

    case 2: // High Priestess - 1vp for highest WANDS (wilds NOT counted, ties OK)
      return resolveSuitBonus(state, playerIndex, 'WANDS', false, true);

    case 3: // Empress - 1vp for highest CUPS
      return resolveSuitBonus(state, playerIndex, 'CUPS', false, true);

    case 4: // Emperor - 1vp for highest COINS
      return resolveSuitBonus(state, playerIndex, 'COINS', false, true);

    case 6: // Lovers - 1vp per pair in realm
      return resolveLovers(state, playerIndex);

    case 9: // Hermit bonus - 1vp if Hermit is only card in Tome
      return player.tome.length === 1 && player.tome[0].number === 9 ? 1 : 0;

    case 11: // Justice - 1vp for highest SWORDS
      return resolveSuitBonus(state, playerIndex, 'SWORDS', false, true);

    case 14: // Temperance bonus - 1vp if no CUPS in realm (wilds NOT counted)
      return resolveNoneOfSuitBonus(state, playerIndex, 'CUPS');

    case 22: // Faith bonus - 1vp if no SWORDS in realm
      return resolveNoneOfSuitBonus(state, playerIndex, 'SWORDS');

    case 23: // Hope bonus - 1vp if no WANDS in realm
      return resolveNoneOfSuitBonus(state, playerIndex, 'WANDS');

    case 25: // Prudence bonus - 1vp if no COINS in realm
      return resolveNoneOfSuitBonus(state, playerIndex, 'COINS');

    default:
      return 0;
  }
}

/**
 * The Fool: duplicate the best opponent bonus.
 */
export function resolveFool(state, playerIndex, ais) {
  let bestBonus = 0;
  const options = [];

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    if (state.players[pi].realm.length === 0) continue;

    for (const card of state.players[pi].tome) {
      if (!isBonusCard(card)) continue;
      // Evaluate this bonus as if the Fool's owner had it
      // But use the OPPONENT'S state for evaluation (requirements are duplicated)
      const bonusVp = resolveBonus(state, pi, card, ais);
      if (bonusVp > bestBonus) {
        bestBonus = bonusVp;
      }
    }
  }

  return bestBonus;
}

/**
 * Magician: 1vp if you have MORE cards of your named suit than ANY other player.
 * Wild cards ARE counted. NOT scored on tie.
 */
function resolveMagician(state, playerIndex, ais) {
  const ai = ais[playerIndex];
  const suit = ai.chooseMagicianSuit(state, playerIndex);

  const myCount = countSuitInRealm(state.players[playerIndex], suit, true); // count wilds

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const otherCount = countSuitInRealm(state.players[pi], suit, true);
    if (otherCount >= myCount) return 0; // Must have strictly MORE
  }

  return myCount > 0 ? 1 : 0;
}

/**
 * Suit bonus: 1vp for having the highest count of a suit.
 * @param {boolean} countWilds - Whether to count wild cards
 * @param {boolean} allowTie - Whether ties still score
 */
function resolveSuitBonus(state, playerIndex, suit, countWilds, allowTie) {
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
  return 1;
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
 * Lovers: 1vp per pair. 2vp for two pair. NOT for three/four/five of a kind.
 */
function resolveLovers(state, playerIndex) {
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
    if (eval_.type === 'One Pair') return 1;
    if (eval_.type === 'Two Pair') return 2;
    return 0;
  }

  return pairCount;
}

/**
 * Protection card bonus: 1vp if no cards of that suit in realm (wilds not counted).
 */
function resolveNoneOfSuitBonus(state, playerIndex, suit) {
  const player = state.players[playerIndex];
  const hasMinorOfSuit = player.realm.some(c => c.type === 'minor' && c.suit === suit);
  return hasMinorOfSuit ? 0 : 1;
}

/**
 * Score game end bonuses.
 * @param {object} state
 */
export function scoreGameEnd(state) {
  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];

    // Celestials: 2vp each (in Tome, Realm, or Vault)
    const allCards = [...player.tome, ...player.realm, ...player.vault];
    for (const card of allCards) {
      if (isCelestial(card)) {
        player.vp += 2;
        log(state, `${player.name} earns 2vp for ${cardName(card)} (Celestial)`);
      }
    }

    // Plague: -3vp if in Tome
    for (const card of player.tome) {
      if (card.type === 'major' && card.number === 26) {
        player.vp -= 3;
        log(state, `${player.name} loses 3vp from Plague in Tome`);
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
  for (let pi = 0; pi < state.players.length; pi++) {
    const p = state.players[pi];
    const celestials = [...p.tome, ...p.realm, ...p.vault].filter(c => isCelestial(c));
    if (celestials.length >= 3) return pi;
  }
  return -1;
}
