/**
 * Card effect resolution for New Arcana.
 * Handles Royal attacks, Ace/King blocking, Major Arcana actions, Tome effects.
 */

import { cardName, PROTECTION_MAP, isCelestial } from './cards.js';
import { drawMinorCard, drawMajorCard, refillDisplay, getHandSize, log } from './state.js';

/**
 * Resolve a Royal attack (Page/Knight/Queen).
 * @param {object} state
 * @param {number} attackerIndex
 * @param {object} card - The Royal card being played
 * @param {number} targetPlayerIndex
 * @param {number} targetRealmIndex
 * @param {object[]} ais
 * @returns {boolean} True if attack succeeded
 */
export function resolveRoyalAttack(state, attackerIndex, card, targetPlayerIndex, targetRealmIndex, ais) {
  const attacker = state.players[attackerIndex];
  const defender = state.players[targetPlayerIndex];
  const targetCard = defender.realm[targetRealmIndex];

  if (!targetCard) return false;

  // Check Tome protections
  if (defender.tomeProtections.has(card.suit)) {
    log(state, `${defender.name}'s Tome protection blocks ${card.suit} attack!`);
    const cardIdx = attacker.hand.findIndex(c => c.id === card.id);
    if (cardIdx !== -1) {
      attacker.hand.splice(cardIdx, 1);
      state.pit.push(card);
    }
    return false;
  }

  // Check Ace blocking
  const aceBlockResult = checkAceBlock(state, ais, attackerIndex, {
    type: 'PLAY_ROYAL', card, target: { playerIndex: targetPlayerIndex, realmIndex: targetRealmIndex }
  });
  if (aceBlockResult) {
    return false;
  }

  // Check King blocking (defender only)
  if (targetPlayerIndex !== attackerIndex) {
    if (shouldBlockWithKing(state, ais, targetPlayerIndex, card)) {
      const kingIdx = defender.hand.findIndex(c => c.type === 'minor' && c.rank === 'KING');
      if (kingIdx !== -1) {
        const kingCard = defender.hand[kingIdx];
        // Check Ace block on King
        const kingAction = { type: 'KING_BLOCK', card: kingCard, playerIndex: targetPlayerIndex };
        if (checkAceBlock(state, ais, targetPlayerIndex, kingAction)) {
          // King was ace-blocked, attack continues
        } else {
          defender.hand.splice(kingIdx, 1);
          state.pit.push(kingCard);
          const attackIdx = attacker.hand.findIndex(c => c.id === card.id);
          if (attackIdx !== -1) {
            attacker.hand.splice(attackIdx, 1);
            state.pit.push(card);
          }
          log(state, `${defender.name} blocks [${cardName(card)} attack on ${cardName(targetCard)}] with King! Both go to Pit`);
          return false;
        }
      }
    }
  }

  // Remove attacking card from hand
  const cardIdx = attacker.hand.findIndex(c => c.id === card.id);
  if (cardIdx !== -1) attacker.hand.splice(cardIdx, 1);

  // Find target again (index may have shifted)
  const targetIdx = defender.realm.findIndex(c => c.id === targetCard.id);
  if (targetIdx === -1) return false;

  switch (card.rank) {
    case 'PAGE':
      defender.realm.splice(targetIdx, 1);
      state.pit.push(card);
      state.pit.push(targetCard);
      log(state, `${attacker.name}'s Page destroys ${cardName(targetCard)} in ${defender.name}'s Realm`);
      break;
    case 'KNIGHT':
      defender.realm.splice(targetIdx, 1);
      attacker.hand.push(targetCard);
      state.pit.push(card);
      log(state, `${attacker.name}'s Knight steals ${cardName(targetCard)} from ${defender.name}'s Realm`);
      break;
    case 'QUEEN':
      defender.realm.splice(targetIdx, 1);
      attacker.realm.push(targetCard);
      state.pit.push(card);
      log(state, `${attacker.name}'s Queen moves ${cardName(targetCard)} to their Realm`);
      break;
  }

  return true;
}

/**
 * Check if any player wants to block with an Ace. Handles Ace chains.
 * @param {object} state
 * @param {object[]} ais
 * @param {number} actorIndex - Who is performing the action
 * @param {object} action - The action being performed
 * @returns {boolean} True if blocked
 */
export function checkAceBlock(state, ais, actorIndex, action) {
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === actorIndex) continue;
    const playerHand = state.players[pi].hand;
    const aceIdx = playerHand.findIndex(c => c.type === 'minor' && c.rank === 'ACE');
    if (aceIdx === -1) continue;

    if (ais[pi].shouldBlockWithAce(state, pi, action)) {
      const ace = playerHand.splice(aceIdx, 1)[0];
      log(state, `${state.players[pi].name} blocks [${action.description || action.type}] with ${cardName(ace)}!`);

      // Check Ace chain
      const aceAction = { type: 'ACE_BLOCK', card: ace, playerIndex: pi, originalAction: action };
      if (checkAceBlock(state, ais, pi, aceAction)) {
        // The blocking Ace was itself blocked -> original action proceeds
        state.pit.push(ace);
        return false;
      }

      // Block succeeded - attacking card goes to Pit
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
 * Ask defender AI if they want to block with a King.
 * @param {object} state
 * @param {object[]} ais
 * @param {number} defenderIndex
 * @param {object} attackCard
 * @returns {boolean}
 */
export function shouldBlockWithKing(state, ais, defenderIndex, attackCard) {
  const defender = state.players[defenderIndex];
  const hasKing = defender.hand.some(c => c.type === 'minor' && c.rank === 'KING');
  if (!hasKing) return false;
  return ais[defenderIndex].shouldBlockWithKing(state, defenderIndex, attackCard);
}

/**
 * Resolve a Major Arcana action card.
 * @param {object} state
 * @param {number} playerIndex
 * @param {object} card
 * @param {object} targets
 * @param {object[]} ais
 */
export function resolveMajorAction(state, playerIndex, card, targets, ais) {
  switch (card.number) {
    case 7: return resolveChariot(state, ais, playerIndex, targets);
    case 8: return resolveStrength(state, ais, playerIndex, targets);
    case 10: return resolveWheelOfFortune(state, ais, playerIndex);
    case 12: return resolveHangedMan(state, ais, playerIndex, targets);
    case 16: return resolveTower(state, ais, playerIndex, targets);
    case 20: return resolveJudgement(state, ais, playerIndex);
    case 26: return resolvePlague(state, ais, playerIndex, targets);
  }
}

/**
 * Chariot: Move a face-up Celestial into your Tome.
 */
export function resolveChariot(state, ais, playerIndex, targets) {
  const player = state.players[playerIndex];
  let celestial = null;

  if (targets.source === 'realm') {
    celestial = state.players[targets.playerIndex].realm.splice(targets.cardIndex, 1)[0];
  } else if (targets.source === 'tome') {
    celestial = state.players[targets.playerIndex].tome.splice(targets.cardIndex, 1)[0];
    if (PROTECTION_MAP[celestial?.number]) {
      state.players[targets.playerIndex].tomeProtections.delete(PROTECTION_MAP[celestial.number]);
    }
  } else if (targets.source === 'display') {
    celestial = state.display[targets.slotIndex];
    state.display[targets.slotIndex] = null;
    refillDisplay(state, targets.slotIndex);
  } else if (targets.source === 'majorDiscard') {
    celestial = state.majorDiscard.pop();
  }

  if (celestial) {
    if (player.tome.length >= 3) {
      const discardIdx = ais[playerIndex].chooseTomeDiscard(state, playerIndex);
      const discarded = player.tome.splice(Math.min(discardIdx, player.tome.length - 1), 1)[0];
      state.pit.push(discarded);
      if (PROTECTION_MAP[discarded?.number]) {
        player.tomeProtections.delete(PROTECTION_MAP[discarded.number]);
      }
    }
    player.tome.push(celestial);
    log(state, `${player.name} takes ${cardName(celestial)} via Chariot`);
  }
}

/**
 * Strength: Move a face-up Major Arcana from any Realm/Tome to YOUR Realm as wild.
 */
export function resolveStrength(state, ais, playerIndex, targets) {
  const player = state.players[playerIndex];
  let majorCard = null;

  if (targets.source === 'realm') {
    majorCard = state.players[targets.playerIndex].realm.splice(targets.cardIndex, 1)[0];
  } else if (targets.source === 'tome') {
    majorCard = state.players[targets.playerIndex].tome.splice(targets.cardIndex, 1)[0];
    if (PROTECTION_MAP[majorCard?.number]) {
      state.players[targets.playerIndex].tomeProtections.delete(PROTECTION_MAP[majorCard.number]);
    }
  }

  if (majorCard) {
    player.realm.push(majorCard);
    log(state, `${player.name} moves ${cardName(majorCard)} to Realm as wild via Strength`);
  }
}

/**
 * Wheel of Fortune: Take 2 from Major draw/display/discard, keep 1, pit 1.
 */
export function resolveWheelOfFortune(state, ais, playerIndex) {
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
      if (card) {
        state.display[src.slotIndex] = null;
        refillDisplay(state, src.slotIndex);
      }
    } else if (src.source === 'discard') {
      card = state.majorDiscard.pop();
    }
    if (card) drawn.push(card);
  }

  if (drawn.length === 0) return;
  if (drawn.length === 1) {
    player.hand.push(drawn[0]);
  } else {
    const keepIdx = ai.chooseWheelKeep(drawn, state);
    player.hand.push(drawn[keepIdx]);
    state.pit.push(drawn[1 - keepIdx]);
  }
  log(state, `${player.name} uses Wheel of Fortune`);
}

/**
 * Hanged Man: Take one card from opponent's Tome into yours.
 */
export function resolveHangedMan(state, ais, playerIndex, targets) {
  const player = state.players[playerIndex];
  const source = state.players[targets.playerIndex];
  const card = source.tome.splice(targets.cardIndex, 1)[0];
  if (!card) return;

  if (PROTECTION_MAP[card.number]) {
    source.tomeProtections.delete(PROTECTION_MAP[card.number]);
  }

  if (player.tome.length >= 3) {
    const discardIdx = ais[playerIndex].chooseTomeDiscard(state, playerIndex);
    const discarded = player.tome.splice(Math.min(discardIdx, player.tome.length - 1), 1)[0];
    state.pit.push(discarded);
    if (PROTECTION_MAP[discarded?.number]) {
      player.tomeProtections.delete(PROTECTION_MAP[discarded.number]);
    }
  }

  player.tome.push(card);
  if (PROTECTION_MAP[card.number]) {
    player.tomeProtections.add(PROTECTION_MAP[card.number]);
  }
  log(state, `${player.name} takes ${cardName(card)} from ${source.name}'s Tome via Hanged Man`);
}

/**
 * Tower: Destroy a Major Arcana in every Tome with MORE cards than yours.
 */
export function resolveTower(state, ais, playerIndex, targets) {
  const myTomeSize = state.players[playerIndex].tome.length;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    if (state.players[pi].tome.length > myTomeSize && state.players[pi].tome.length > 0) {
      const tomeIdx = state.players[pi].tome.length - 1;
      const card = state.players[pi].tome.splice(tomeIdx, 1)[0];
      if (PROTECTION_MAP[card?.number]) {
        state.players[pi].tomeProtections.delete(PROTECTION_MAP[card.number]);
      }
      state.pit.push(card);
      log(state, `Tower destroys ${cardName(card)} in ${state.players[pi].name}'s Tome`);
    }
  }
}

/**
 * Judgement: Take the Round-End Marker. Round ends immediately.
 */
export function resolveJudgement(state, ais, playerIndex) {
  // Clear previous marker holder
  for (const p of state.players) p.hasRoundEndMarker = false;
  state.roundEndMarkerHolder = playerIndex;
  state.players[playerIndex].hasRoundEndMarker = true;
  state.judgementTriggered = true;
  log(state, `${state.players[playerIndex].name} claims Round-End Marker via Judgement`);
}

/**
 * Plague: Play into any player's Tome. -3vp at game end.
 */
export function resolvePlague(state, ais, playerIndex, targets) {
  const target = state.players[targets.playerIndex];

  if (target.tome.length >= 3) {
    const discardIdx = ais[playerIndex].chooseTomeDiscard(state, targets.playerIndex);
    const discarded = target.tome.splice(Math.min(discardIdx, target.tome.length - 1), 1)[0];
    if (PROTECTION_MAP[discarded?.number]) {
      target.tomeProtections.delete(PROTECTION_MAP[discarded.number]);
    }
    state.pit.push(discarded);
  }

  // Retrieve Plague from Pit (it was placed there by executeMajorAction)
  const plagueIdx = state.pit.findIndex(c => c.type === 'major' && c.number === 26);
  if (plagueIdx !== -1) {
    const plague = state.pit.splice(plagueIdx, 1)[0];
    target.tome.push(plague);
    log(state, `Plague played into ${target.name}'s Tome`);
  }
}

/**
 * Apply on-play effects for Tome cards.
 * @param {object} state
 * @param {object[]} ais
 * @param {number} playerIndex
 * @param {object} card
 */
export function applyTomeEffect(state, ais, playerIndex, card) {
  const player = state.players[playerIndex];

  switch (card.number) {
    case 9: { // Hermit: take tome cards into hand
      const tomeCopy = player.tome.filter(c => c.id !== card.id);
      for (const tc of tomeCopy) {
        const idx = player.tome.findIndex(c => c.id === tc.id);
        if (idx !== -1) {
          player.tome.splice(idx, 1);
          player.hand.push(tc);
          if (PROTECTION_MAP[tc.number]) {
            player.tomeProtections.delete(PROTECTION_MAP[tc.number]);
          }
        }
      }
      log(state, `${player.name} takes Tome cards into hand via Hermit`);
      break;
    }
    case 15: { // Devil: draw up to 7
      const limit = 7;
      const currentSize = getHandSize(player);
      const toDraw = Math.max(0, limit - currentSize);
      for (let i = 0; i < toDraw; i++) {
        const drawn = drawMinorCard(state);
        if (drawn) player.hand.push(drawn);
        else break;
      }
      log(state, `${player.name} draws up to 7 via Devil`);
      break;
    }
    case 14: // Temperance
    case 22: // Faith
    case 23: // Hope
    case 25: { // Prudence
      const suit = PROTECTION_MAP[card.number];
      if (suit) {
        player.tomeProtections.add(suit);
        log(state, `${player.name}'s ${suit} cards are now protected`);
      }
      break;
    }
  }
}

/**
 * Check if Death has been revealed in the display.
 * @param {object} state
 * @returns {boolean}
 */
export function checkDeathRevealed(state) {
  for (let i = 0; i < 3; i++) {
    if (state.display[i] && state.display[i].number === 13) {
      state.gameEnded = true;
      state.gameEndReason = 'death_revealed';
      log(state, 'Death revealed in display! Game ends!');
      return true;
    }
  }
  return false;
}
