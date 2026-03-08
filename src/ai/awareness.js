/**
 * Shared awareness utilities for AI decision-making.
 */

import { isCelestial } from '../cards.js';
import { getCardEffect } from '../effect-resolver.js';

/**
 * Check if any opponent is close to a Celestial win.
 * @param {object} state
 * @param {number} playerIndex - The AI making the decision
 * @returns {{threatening: boolean, threatPlayer: number, celestialCount: number}}
 */
export function checkCelestialThreat(state, playerIndex) {
  let maxCelestials = 0;
  let threatPlayer = -1;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const p = state.players[pi];
    const celestials = [...p.tome, ...p.realm, ...p.vault].filter(c => isCelestial(c));
    if (celestials.length > maxCelestials) {
      maxCelestials = celestials.length;
      threatPlayer = pi;
    }
  }

  return {
    threatening: maxCelestials >= 2,
    threatPlayer,
    celestialCount: maxCelestials,
  };
}

/**
 * Find actions that disrupt Celestial accumulation.
 * @param {object} state
 * @param {number} playerIndex
 * @param {object[]} legalActions
 * @param {number} threatPlayer
 * @returns {object|null} Best disruption action, or null
 */
export function findCelestialDisruption(state, playerIndex, legalActions, threatPlayer) {
  // Helper to get action effect type
  function getActionType(card) {
    const eff = getCardEffect(state, card);
    return eff?.action || null;
  }

  // Priority 1: Steal from Tome targeting a Celestial in threat player's Tome
  const stealActions = legalActions.filter(a => {
    if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
    if (getActionType(a.card) !== 'STEAL_FROM_TOME') return false;
    return a.targets?.playerIndex === threatPlayer &&
      state.players[threatPlayer].tome[a.targets.cardIndex] &&
      isCelestial(state.players[threatPlayer].tome[a.targets.cardIndex]);
  });
  if (stealActions.length > 0) return stealActions[0];

  // Priority 2: Tower (destroys cards in larger Tomes)
  const towerActions = legalActions.filter(a =>
    a.type === 'PLAY_MAJOR_ACTION' && a.card && getActionType(a.card) === 'TOWER_DESTROY'
  );
  if (towerActions.length > 0) return towerActions[0];

  // Priority 3: Move Major to Realm targeting threat player
  const strengthActions = legalActions.filter(a =>
    a.type === 'PLAY_MAJOR_ACTION' && a.card &&
    getActionType(a.card) === 'MOVE_MAJOR_TO_REALM' &&
    a.targets?.playerIndex === threatPlayer
  );
  if (strengthActions.length > 0) return strengthActions[0];

  // Priority 4: Royal attack on Celestial in threat player's Realm
  const royalAttacks = legalActions.filter(a =>
    a.type === 'PLAY_ROYAL' &&
    a.target?.playerIndex === threatPlayer
  );
  for (const attack of royalAttacks) {
    const targetCard = state.players[threatPlayer].realm[attack.target.realmIndex];
    if (targetCard && targetCard.type === 'major') return attack;
  }

  // Priority 5: Chariot to steal a Celestial for ourselves
  const chariotActions = legalActions.filter(a =>
    a.type === 'PLAY_MAJOR_ACTION' && a.card && getActionType(a.card) === 'MOVE_CELESTIAL_TO_TOME'
  );
  if (chariotActions.length > 0) return chariotActions[0];

  return null;
}
