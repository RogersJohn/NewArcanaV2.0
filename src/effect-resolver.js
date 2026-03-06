/**
 * Data-driven effect resolver for Major Arcana cards.
 * Dispatches to handler functions based on effect definitions in config,
 * replacing hardcoded card number switch statements.
 */

import { drawMinorCard, getHandSize, log } from './state.js';

/**
 * Look up the effect definition for a card from config.
 * Falls back to the card's own effect field if present.
 */
export function getCardEffect(state, card) {
  if (!card) return null;
  const majorDefs = state.config?.majorArcana;
  if (majorDefs) {
    const def = majorDefs.find(m => m.number === card.number);
    if (def?.effect) return def.effect;
  }
  return card.effect || null;
}

/**
 * Check if a card has the Death game-end trigger.
 */
export function isDeathCard(state, card) {
  if (!card || card.type !== 'major') return false;
  const effect = getCardEffect(state, card);
  return effect?.type === 'game_end_trigger' && effect?.trigger === 'death_revealed';
}

/**
 * Check if a card is a Plague (action: PLAGUE_TO_TOME).
 */
export function isPlagueCard(state, card) {
  if (!card || card.type !== 'major') return false;
  const effect = getCardEffect(state, card);
  return effect?.type === 'action' && effect?.action === 'PLAGUE_TO_TOME';
}

/**
 * Check if a card has the Hierophant blessing effect.
 */
export function isHierophantCard(state, card) {
  if (!card || card.type !== 'major') return false;
  const effect = getCardEffect(state, card);
  return effect?.bonus?.bonusType === 'hierophant_blessing';
}

/**
 * Check if a card is a Hermit (tome card with hermitExclusive bonus).
 */
export function isHermitCard(state, card) {
  if (!card || card.type !== 'major') return false;
  const effect = getCardEffect(state, card);
  return effect?.bonus?.bonusType === 'hermitExclusive';
}

/**
 * Action dispatch map: action string -> handler function name.
 * The actual handler functions live in engine.js (generators) and effects.js (sync).
 */
const ACTION_DISPATCH = {
  MOVE_CELESTIAL_TO_TOME: 'resolveChariot',
  MOVE_MAJOR_TO_REALM: 'resolveStrength',
  WHEEL_OF_FORTUNE: 'resolveWheelOfFortune',
  STEAL_FROM_TOME: 'resolveHangedMan',
  TOWER_DESTROY: 'resolveTower',
  CLAIM_ROUND_END_MARKER: 'resolveJudgement',
  PLAGUE_TO_TOME: 'resolvePlague',
};

/**
 * Get the handler name for an action card.
 * Returns the function name string that engine.js should call.
 */
export function getActionHandler(state, card) {
  const effect = getCardEffect(state, card);
  if (!effect || effect.type !== 'action') return null;
  return ACTION_DISPATCH[effect.action] || null;
}

/**
 * Tome on-play dispatch map: action string -> handler function name.
 */
const TOME_ONPLAY_DISPATCH = {
  TOME_CARDS_TO_HAND: 'hermitOnPlay',
  DRAW_TO_LIMIT: 'devilOnPlay',
  PROTECT_SUIT: 'protectionOnPlay',
};

/**
 * Get the on-play handler name for a tome card.
 */
export function getTomeOnPlayHandler(state, card) {
  const effect = getCardEffect(state, card);
  if (!effect?.onPlay) return null;
  return TOME_ONPLAY_DISPATCH[effect.onPlay.action] || null;
}

/**
 * Get the on-play effect definition (for passing params like suit, limit).
 */
export function getTomeOnPlayEffect(state, card) {
  const effect = getCardEffect(state, card);
  return effect?.onPlay || null;
}

/**
 * Resolve a tome on-play effect based on config data.
 * This replaces the switch(card.number) in applyTomeEffectGen.
 */
export function* resolveTomeOnPlayGen(state, playerIndex, card) {
  const effect = getCardEffect(state, card);
  if (!effect?.onPlay) return;

  const player = state.players[playerIndex];
  const onPlay = effect.onPlay;

  switch (onPlay.action) {
    case 'TOME_CARDS_TO_HAND': {
      const tomeCopy = [...player.tome];
      for (const tc of tomeCopy) {
        if (tc.id !== card.id) {
          const idx = player.tome.findIndex(c => c.id === tc.id);
          if (idx !== -1) {
            player.tome.splice(idx, 1);
            player.hand.push(tc);
            const protSuit = getProtectionSuit(state, tc.number);
            if (protSuit) {
              player.tomeProtections.delete(protSuit);
            }
          }
        }
      }
      log(state, `${player.name} takes Tome cards into hand via Hermit`);
      break;
    }
    case 'DRAW_TO_LIMIT': {
      const limit = onPlay.limit ?? state.config?.gameRules?.devilHandSizeLimit ?? 7;
      const currentSize = getHandSize(player);
      const toDraw = Math.max(0, limit - currentSize);
      for (let i = 0; i < toDraw; i++) {
        const drawn = drawMinorCard(state);
        if (drawn) player.hand.push(drawn);
        else break;
      }
      log(state, `${player.name} draws up to ${limit} via Devil`);
      break;
    }
    case 'PROTECT_SUIT': {
      const suit = onPlay.suit || getProtectionSuit(state, card.number);
      if (suit) {
        player.tomeProtections.add(suit);
        log(state, `${player.name}'s ${suit} cards are now protected`);
      }
      break;
    }
  }
}

/**
 * Get the protection suit for a card number from config.
 */
function getProtectionSuit(state, cardNumber) {
  return state.config?.protectionMap?.[cardNumber] ?? null;
}

/**
 * Derive the protection map from card effect data.
 * Any card with onPlay.action === 'PROTECT_SUIT' registers in the map.
 */
export function deriveProtectionMap(config) {
  const map = {};
  if (config?.majorArcana) {
    for (const def of config.majorArcana) {
      if (def.effect?.onPlay?.action === 'PROTECT_SUIT' && def.effect.onPlay.suit) {
        map[def.number] = def.effect.onPlay.suit;
      }
    }
  }
  return map;
}
