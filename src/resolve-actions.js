/**
 * Action resolution generators and helpers for New Arcana.
 * Extracted from engine.js to keep that file focused on the game loop.
 */

import { cardName, PROTECTION_MAP as DEFAULT_PROTECTION_MAP } from './cards.js';
import { drawMajorCard, log, refillDisplay, recordEvent } from './state.js';
import { recordDecision, DECISION_TYPES } from './history.js';
import { isDeathCard, isPlagueCard, getActionHandler, resolveTomeOnPlayGen } from './effect-resolver.js';

/** Get the protection suit for a card number, using config if available. */
function getProtection(state, cardNumber) {
  return state.config?.protectionMap?.[cardNumber] ?? DEFAULT_PROTECTION_MAP[cardNumber];
}

// ── Ace/King blocking ──

/**
 * Check if any player wants to block with an Ace (generator version).
 * Recursive via yield* for Ace-blocks-Ace chains.
 * Returns true if blocked.
 */
export function* checkAceBlockGen(state, actorIndex, action) {
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === actorIndex) continue;
    const playerHand = state.players[pi].hand;
    const aceIdx = playerHand.findIndex(c =>
      (c.type === 'minor' && c.rank === 'ACE') ||
      (c.type === 'major' && c.keywords?.includes('jester'))
    );
    if (aceIdx === -1) continue;

    const aceBlockChoice = yield {
      type: DECISION_TYPES.ACE_BLOCK,
      playerIndex: pi,
      action,
      state,
    };
    recordDecision(state, DECISION_TYPES.ACE_BLOCK, pi, aceBlockChoice);
    if (aceBlockChoice) {
      const ace = playerHand.splice(aceIdx, 1)[0];
      log(state, `${state.players[pi].name} blocks [${action.description || action.type}] with ${cardName(ace)}!`);

      // Check if someone blocks the Ace with another Ace
      const aceAction = { type: 'ACE_BLOCK', card: ace, playerIndex: pi, originalAction: action };
      if (yield* checkAceBlockGen(state, pi, aceAction)) {
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
      if (action.card && action.card.type === 'major') {
        recordEvent(state, 'ACE_BLOCKED', {
          cardNumber: action.card.number,
          cardName: cardName(action.card),
        });
      }
      return true;
    }
  }
  return false;
}

// ── Marker pass ──

/**
 * After an attack removes cards, check if marker holder still has 5.
 */
export function checkMarkerPassAfterAttack(state) {
  if (state.roundEndMarkerHolder === -1) return;

  const holder = state.players[state.roundEndMarkerHolder];
  if (holder.realm.length < 5) {
    holder.hasRoundEndMarker = false;
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

// ── Death check ──

/**
 * Check if Death has been revealed in the display.
 */
export function checkDeathInDisplay(state) {
  for (let i = 0; i < 3; i++) {
    if (state.display[i] && isDeathCard(state, state.display[i])) {
      state.gameEnded = true;
      state.gameEndReason = 'death_revealed';
      log(state, 'Death revealed in display! Game ends!');
      return true;
    }
  }
  return false;
}

// ── Play set ──

/**
 * Execute playing a set to realm. (No decision points.)
 */
export function executePlaySet(state, playerIndex, action) {
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

// ── Royal attack ──

/**
 * Execute a Royal attack (generator version).
 * Yields ACE_BLOCK and KING_BLOCK decisions.
 */
export function* executeRoyalAttackGen(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card, target } = action;
  const defender = state.players[target.playerIndex];
  const targetCard = defender.realm[target.realmIndex];

  if (!targetCard) return;

  // Check Tome protections
  if (defender.tomeProtections.has(card.suit)) {
    log(state, `${defender.name}'s Tome protection blocks ${card.suit} attack!`);
    const cardIdx = player.hand.findIndex(c => c.id === card.id);
    if (cardIdx !== -1) {
      player.hand.splice(cardIdx, 1);
      state.pit.push(card);
    }
    return;
  }

  // Check Ace blocking
  if (yield* checkAceBlockGen(state, playerIndex, action)) {
    return;
  }

  // Check King blocking (defender only)
  if (target.playerIndex !== playerIndex) {
    const kingBlockChoice = yield {
      type: DECISION_TYPES.KING_BLOCK,
      playerIndex: target.playerIndex,
      attackCard: card,
      state,
    };
    recordDecision(state, DECISION_TYPES.KING_BLOCK, target.playerIndex, kingBlockChoice);
    if (kingBlockChoice) {
      const kingIdx = defender.hand.findIndex(c => c.type === 'minor' && c.rank === 'KING');
      if (kingIdx !== -1) {
        const kingCard = defender.hand[kingIdx];
        const kingAction = { type: 'KING_BLOCK', card: kingCard, playerIndex: target.playerIndex };
        if (yield* checkAceBlockGen(state, target.playerIndex, kingAction)) {
          // King was blocked by Ace, attack continues
        } else {
          defender.hand.splice(kingIdx, 1);
          state.pit.push(kingCard);
          const attackIdx = player.hand.findIndex(c => c.id === card.id);
          if (attackIdx !== -1) {
            player.hand.splice(attackIdx, 1);
            state.pit.push(card);
          }
          log(state, `${defender.name} blocks [${cardName(card)} attack on ${cardName(targetCard)}] with King! Both go to Pit`);
          recordEvent(state, 'ROYAL_KING_BLOCKED', {
            suit: card.suit, rank: card.rank,
          });
          return;
        }
      }
    }
  }

  // Remove attacking card from hand
  const cardIdx = player.hand.findIndex(c => c.id === card.id);
  if (cardIdx !== -1) player.hand.splice(cardIdx, 1);

  // Resolve attack
  const targetIdx = defender.realm.findIndex(c => c.id === targetCard.id);
  if (targetIdx === -1) return;

  switch (card.rank) {
    case 'PAGE':
      defender.realm.splice(targetIdx, 1);
      state.pit.push(card);
      state.pit.push(targetCard);
      log(state, `${player.name}'s Page destroys ${cardName(targetCard)} in ${defender.name}'s Realm`);
      break;
    case 'KNIGHT':
      defender.realm.splice(targetIdx, 1);
      player.hand.push(targetCard);
      state.pit.push(card);
      log(state, `${player.name}'s Knight steals ${cardName(targetCard)} from ${defender.name}'s Realm`);
      break;
    case 'QUEEN':
      defender.realm.splice(targetIdx, 1);
      player.realm.push(targetCard);
      state.pit.push(card);
      log(state, `${player.name}'s Queen moves ${cardName(targetCard)} to their Realm`);
      break;
  }

  checkMarkerPassAfterAttack(state);
}

// ── Major Arcana to Tome ──

/**
 * Execute playing a Major Arcana to Tome (generator version).
 * Yields ACE_BLOCK and TOME_DISCARD decisions.
 */
export function* executeMajorTomeGen(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card } = action;

  if (yield* checkAceBlockGen(state, playerIndex, action)) {
    return;
  }

  const cardIdx = player.hand.findIndex(c => c.id === card.id);
  if (cardIdx === -1) return;
  player.hand.splice(cardIdx, 1);

  if (player.tome.length >= 3) {
    const discardIdx = yield {
      type: DECISION_TYPES.TOME_DISCARD,
      playerIndex,
      state,
    };
    recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
    if (discardIdx >= 0 && discardIdx < player.tome.length) {
      const discarded = player.tome.splice(discardIdx, 1)[0];
      state.pit.push(discarded);
      if (getProtection(state, discarded.number)) {
        player.tomeProtections.delete(getProtection(state, discarded.number));
      }
    }
  }

  player.tome.push(card);
  log(state, `${player.name} plays ${cardName(card)} to Tome`);
  recordEvent(state, 'CARD_TO_TOME', {
    cardNumber: card.number, cardName: cardName(card), player: playerIndex,
  });

  yield* applyTomeEffectGen(state, playerIndex, card);
}

// ── Tome effects ──

/**
 * Apply on-play effects for Tome cards (generator version).
 */
export function* applyTomeEffectGen(state, playerIndex, card) {
  yield* resolveTomeOnPlayGen(state, playerIndex, card);
}

// ── Major Arcana action ──

/**
 * Execute a Major Arcana action card (generator version).
 * Yields ACE_BLOCK and delegates to resolve* generators.
 */
export function* executeMajorActionGen(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card, targets } = action;

  if (yield* checkAceBlockGen(state, playerIndex, action)) {
    return;
  }

  const cardIdx = player.hand.findIndex(c => c.id === card.id);
  if (cardIdx === -1) return;
  player.hand.splice(cardIdx, 1);

  const handler = getActionHandler(state, card);
  if (handler !== 'resolvePlague') {
    state.pit.push(card);
  }
  recordEvent(state, 'CARD_ACTION_PLAYED', {
    cardNumber: card.number, cardName: cardName(card), player: playerIndex,
  });

  switch (handler) {
    case 'resolveChariot':
      yield* resolveChariotGen(state, playerIndex, targets);
      break;
    case 'resolveStrength':
      resolveStrength(state, playerIndex, targets);
      break;
    case 'resolveWheelOfFortune':
      yield* resolveWheelOfFortuneGen(state, playerIndex);
      break;
    case 'resolveHangedMan':
      yield* resolveHangedManGen(state, playerIndex, targets);
      break;
    case 'resolveTower':
      yield* resolveTowerGen(state, playerIndex, targets);
      break;
    case 'resolveJudgement':
      resolveJudgement(state, playerIndex);
      break;
    case 'resolvePlague':
      yield* resolvePlagueGen(state, playerIndex, targets, card);
      break;
  }
}

// ── Chariot ──

/**
 * Resolve Chariot (generator version). Yields TOME_DISCARD.
 */
export function* resolveChariotGen(state, playerIndex, targets) {
  const player = state.players[playerIndex];
  let celestial = null;

  if (targets.source === 'realm') {
    celestial = state.players[targets.playerIndex].realm.splice(targets.cardIndex, 1)[0];
    checkMarkerPassAfterAttack(state);
  } else if (targets.source === 'tome') {
    celestial = state.players[targets.playerIndex].tome.splice(targets.cardIndex, 1)[0];
    if (getProtection(state, celestial.number)) {
      state.players[targets.playerIndex].tomeProtections.delete(getProtection(state, celestial.number));
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
    const destination = state.config?.gameRules?.chariotDestination ?? 'tome';
    if (destination === 'hand') {
      player.hand.push(celestial);
      log(state, `${player.name} takes ${cardName(celestial)} into hand via Chariot`);
    } else {
      if (player.tome.length >= 3) {
        const discardIdx = yield {
          type: DECISION_TYPES.TOME_DISCARD,
          playerIndex,
          state,
        };
        recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
        if (discardIdx >= 0 && discardIdx < player.tome.length) {
          const discarded = player.tome.splice(discardIdx, 1)[0];
          state.pit.push(discarded);
          if (getProtection(state, discarded.number)) {
            player.tomeProtections.delete(getProtection(state, discarded.number));
          }
        }
      }
      player.tome.push(celestial);
      log(state, `${player.name} takes ${cardName(celestial)} via Chariot`);
    }
  }
}

// ── Strength ──

/**
 * Resolve Strength. (No decision points.)
 */
export function resolveStrength(state, playerIndex, targets) {
  const player = state.players[playerIndex];
  let majorCard = null;

  if (targets.source === 'realm') {
    majorCard = state.players[targets.playerIndex].realm.splice(targets.cardIndex, 1)[0];
    checkMarkerPassAfterAttack(state);
  } else if (targets.source === 'tome') {
    majorCard = state.players[targets.playerIndex].tome.splice(targets.cardIndex, 1)[0];
    if (getProtection(state, majorCard.number)) {
      state.players[targets.playerIndex].tomeProtections.delete(getProtection(state, majorCard.number));
    }
  }

  if (majorCard) {
    player.realm.push(majorCard);
    log(state, `${player.name} moves ${cardName(majorCard)} to Realm as wild via Strength`);
  }
}

// ── Wheel of Fortune ──

/**
 * Resolve Wheel of Fortune (generator version). Yields WHEEL_SOURCES and WHEEL_KEEP.
 */
export function* resolveWheelOfFortuneGen(state, playerIndex) {
  const player = state.players[playerIndex];

  const sources = yield {
    type: DECISION_TYPES.WHEEL_SOURCES,
    playerIndex,
    state,
  };
  recordDecision(state, DECISION_TYPES.WHEEL_SOURCES, playerIndex, sources);
  const drawn = [];

  for (const src of sources) {
    let card = null;
    if (src.source === 'draw') {
      card = drawMajorCard(state);
      if (card && isDeathCard(state, card)) {
        state.gameEnded = true;
        state.gameEndReason = 'death_revealed';
        log(state, `Death drawn from Major deck via Wheel of Fortune! Game ends!`);
        return;
      }
    } else if (src.source === 'display') {
      card = state.display[src.slotIndex];
      state.display[src.slotIndex] = null;
      refillDisplay(state, src.slotIndex);
      checkDeathInDisplay(state);
      if (state.gameEnded) return;
    } else if (src.source === 'discard') {
      card = state.majorDiscard.pop();
      if (card && isDeathCard(state, card)) {
        state.gameEnded = true;
        state.gameEndReason = 'death_revealed';
        log(state, `Death drawn from Major discard via Wheel of Fortune! Game ends!`);
        return;
      }
    }
    if (card) drawn.push(card);
  }

  if (drawn.length === 0) return;

  if (drawn.length === 1) {
    player.hand.push(drawn[0]);
  } else {
    const keepIdx = yield {
      type: DECISION_TYPES.WHEEL_KEEP,
      playerIndex,
      cards: drawn,
      state,
    };
    recordDecision(state, DECISION_TYPES.WHEEL_KEEP, playerIndex, keepIdx);
    player.hand.push(drawn[keepIdx]);
    state.pit.push(drawn[1 - keepIdx]);
  }

  log(state, `${player.name} uses Wheel of Fortune`);
}

// ── Hanged Man ──

/**
 * Resolve Hanged Man (generator version). Yields TOME_DISCARD.
 */
export function* resolveHangedManGen(state, playerIndex, targets) {
  const player = state.players[playerIndex];
  const source = state.players[targets.playerIndex];
  const card = source.tome.splice(targets.cardIndex, 1)[0];

  if (!card) return;

  if (getProtection(state, card.number)) {
    source.tomeProtections.delete(getProtection(state, card.number));
  }

  if (player.tome.length >= 3) {
    const discardIdx = yield {
      type: DECISION_TYPES.TOME_DISCARD,
      playerIndex,
      state,
    };
    recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
    const discarded = player.tome.splice(discardIdx, 1)[0];
    state.pit.push(discarded);
    if (getProtection(state, discarded.number)) {
      player.tomeProtections.delete(getProtection(state, discarded.number));
    }
  }

  player.tome.push(card);
  if (getProtection(state, card.number)) {
    player.tomeProtections.add(getProtection(state, card.number));
  }

  log(state, `${player.name} takes ${cardName(card)} from ${source.name}'s Tome via Hanged Man`);
}

// ── Tower ──

/**
 * Resolve Tower (generator version). Yields TOWER_CHOOSE.
 */
export function* resolveTowerGen(state, playerIndex, _targets) {
  const myTomeSize = state.players[playerIndex].tome.length;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const targetsAll = state.config?.gameRules?.towerTargetsAll ?? false;
    const isTarget = targetsAll
      ? state.players[pi].tome.length > 0
      : state.players[pi].tome.length > myTomeSize && state.players[pi].tome.length > 0;
    if (isTarget) {
      const tomeIdx = yield {
        type: DECISION_TYPES.TOWER_CHOOSE,
        playerIndex,
        targetPlayerIndex: pi,
        state,
      };
      recordDecision(state, DECISION_TYPES.TOWER_CHOOSE, playerIndex, tomeIdx);

      const safeIdx = Math.max(0, Math.min(tomeIdx, state.players[pi].tome.length - 1));
      const card = state.players[pi].tome.splice(safeIdx, 1)[0];
      if (getProtection(state, card.number)) {
        state.players[pi].tomeProtections.delete(getProtection(state, card.number));
      }
      state.pit.push(card);
      log(state, `Tower destroys ${cardName(card)} in ${state.players[pi].name}'s Tome`);
    }
  }
}

// ── Judgement ──

/**
 * Resolve Judgement. (No decision points.)
 */
export function resolveJudgement(state, playerIndex) {
  state.roundEndMarkerHolder = playerIndex;
  state.players[playerIndex].hasRoundEndMarker = true;
  log(state, `${state.players[playerIndex].name} claims Round-End Marker via Judgement`);
  state.judgementTriggered = true;
}

// ── Plague ──

/**
 * Resolve Plague (generator version). Yields TOME_DISCARD.
 */
export function* resolvePlagueGen(state, playerIndex, targets, plagueCard) {
  const target = state.players[targets.playerIndex];

  if (target.tome.length >= 3) {
    const discardIdx = yield {
      type: DECISION_TYPES.TOME_DISCARD,
      playerIndex,
      targetPlayerIndex: targets.playerIndex,
      state,
    };
    recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
    if (discardIdx >= 0 && discardIdx < target.tome.length) {
      const discarded = target.tome.splice(discardIdx, 1)[0];
      if (getProtection(state, discarded.number)) {
        target.tomeProtections.delete(getProtection(state, discarded.number));
      }
      state.pit.push(discarded);
    }
  }

  target.tome.push(plagueCard);
  log(state, `Plague played into ${target.name}'s Tome`);
}

// ── Wild card ──

/**
 * Execute playing a wild card to Realm (generator version).
 * Yields ACE_BLOCK decisions.
 */
export function* executeWildGen(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const { card, withCards } = action;

  if (yield* checkAceBlockGen(state, playerIndex, action)) {
    for (const mc of withCards) {
      const idx = player.hand.findIndex(c => c.id === mc.id);
      if (idx !== -1) {
        player.hand.splice(idx, 1);
        player.realm.push(mc);
      }
    }
    return;
  }

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
    cardNumber: card.number, cardName: cardName(card),
    player: playerIndex, companionCount: withCards.length,
  });
}

// ── Buy ──

/**
 * Execute buying a Major Arcana card. (No decision points.)
 */
export function executeBuy(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const { source, payment } = action;

  for (const card of payment) {
    const idx = player.hand.findIndex(c => c.id === card.id);
    if (idx !== -1) {
      player.hand.splice(idx, 1);
      state.minorDiscard.push(card);
    }
  }

  let bought = null;
  if (source === 'draw') {
    bought = drawMajorCard(state);
  } else if (source.startsWith('display')) {
    const slot = parseInt(source.slice(-1));
    bought = state.display[slot];
    state.display[slot] = null;
    if (bought) {
      if (isDeathCard(state, bought)) {
        state.gameEnded = true;
        state.gameEndReason = 'death_purchased';
        log(state, `${player.name} purchased Death! Game ends!`);
        return;
      }
      player.hand.push(bought);
      log(state, `${player.name} buys ${cardName(bought)} from ${source}`);
      recordEvent(state, 'CARD_PURCHASED', {
        cardNumber: bought.number, cardName: cardName(bought),
        player: playerIndex, source,
        paymentValue: payment.reduce((s, c) => s + (c.purchaseValue || 0), 0),
      });
    }
    refillDisplay(state, slot);
    checkDeathInDisplay(state);
  } else if (source === 'discard') {
    bought = state.majorDiscard.pop();
  }

  if (bought && !source.startsWith('display')) {
    if (isDeathCard(state, bought)) {
      state.gameEnded = true;
      state.gameEndReason = 'death_purchased';
      log(state, `${player.name} purchased Death! Game ends!`);
      return;
    }
    player.hand.push(bought);
    log(state, `${player.name} buys ${cardName(bought)} from ${source}`);
    recordEvent(state, 'CARD_PURCHASED', {
      cardNumber: bought.number, cardName: cardName(bought),
      player: playerIndex, source,
      paymentValue: payment.reduce((s, c) => s + (c.purchaseValue || 0), 0),
    });
  }
}
