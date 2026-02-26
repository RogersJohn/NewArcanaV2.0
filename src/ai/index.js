/**
 * AI Registry: factory and assignment for AI personas.
 */

import { RandomAI } from './base.js';
import { BuilderAI } from './builder.js';
import { AggressorAI } from './aggressive.js';
import { CelestialAI } from './celestial.js';
import { ControllerAI } from './controller.js';
import { OpportunistAI } from './opportunist.js';
import { PassiveAI } from './passive.js';

const AI_CLASSES = {
  'random': RandomAI,
  'builder': BuilderAI,
  'aggressor': AggressorAI,
  'celestial': CelestialAI,
  'controller': ControllerAI,
  'opportunist': OpportunistAI,
  'passive': PassiveAI,
};

const AI_NAMES = Object.keys(AI_CLASSES);

/**
 * Get an AI instance by name.
 * @param {string} name
 * @returns {object} AI instance
 */
export function getAI(name) {
  const AIClass = AI_CLASSES[name.toLowerCase()];
  if (!AIClass) throw new Error(`Unknown AI: ${name}`);
  return new AIClass();
}

/**
 * Get a random AI instance.
 * @returns {object}
 */
export function getRandomAI() {
  return new RandomAI();
}

/**
 * Get all AI names.
 * @returns {string[]}
 */
export function getAllAINames() {
  return [...AI_NAMES];
}

/**
 * Create a pool of diverse AIs for a game.
 * Cycles through AI types so each gets roughly equal representation.
 * @param {number} numPlayers
 * @returns {object[]}
 */
export function createAIPool(numPlayers) {
  const nonRandom = AI_NAMES.filter(n => n !== 'random' && n !== 'passive');
  const ais = [];
  for (let i = 0; i < numPlayers; i++) {
    const aiName = nonRandom[i % nonRandom.length];
    ais.push(getAI(aiName));
  }
  return ais;
}

/**
 * Create AIs based on assignment type.
 * @param {number} numPlayers
 * @param {string} assignment - 'diverse', 'random', or 'all-<name>'
 * @returns {object[]}
 */
export function createAIs(numPlayers, assignment = 'diverse') {
  if (assignment === 'diverse') {
    return createAIPool(numPlayers);
  }
  if (assignment === 'random') {
    // Random selection for each seat
    return Array.from({ length: numPlayers }, () => {
      const name = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
      return getAI(name);
    });
  }
  if (assignment.startsWith('all-')) {
    const aiName = assignment.slice(4);
    return Array.from({ length: numPlayers }, () => getAI(aiName));
  }
  // Default to diverse
  return createAIPool(numPlayers);
}

export { RandomAI, BuilderAI, AggressorAI, CelestialAI, ControllerAI, OpportunistAI, PassiveAI };
