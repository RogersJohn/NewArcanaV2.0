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
import { TacticianAI } from './tactician.js';
import { CollectorAI } from './collector.js';
import { shuffle } from '../cards.js';

const AI_CLASSES = {
  'random': RandomAI,
  'builder': BuilderAI,
  'aggressor': AggressorAI,
  'celestial': CelestialAI,
  'controller': ControllerAI,
  'opportunist': OpportunistAI,
  'passive': PassiveAI,
  'tactician': TacticianAI,
  'collector': CollectorAI,
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
 * @param {object} [rng] - Optional SeededRNG for deterministic assignment
 * @returns {object[]}
 */
export function createAIPool(numPlayers, rng) {
  const nonRandom = AI_NAMES.filter(n => n !== 'random' && n !== 'passive');
  // Shuffle available AIs so different combinations play each game
  const shuffledNames = shuffle([...nonRandom], rng);
  const ais = [];
  for (let i = 0; i < numPlayers; i++) {
    const aiName = shuffledNames[i % shuffledNames.length];
    ais.push(getAI(aiName));
  }
  shuffle(ais, rng); // Also randomize seat order
  return ais;
}

/**
 * Create AIs based on assignment type.
 * @param {number} numPlayers
 * @param {string} assignment - 'diverse', 'random', or 'all-<name>'
 * @param {object} [rng] - Optional SeededRNG for deterministic assignment
 * @returns {object[]}
 */
export function createAIs(numPlayers, assignment = 'diverse', rng) {
  if (assignment === 'diverse') {
    return createAIPool(numPlayers, rng);
  }
  if (assignment === 'random') {
    // Random selection for each seat
    return Array.from({ length: numPlayers }, () => {
      if (rng) {
        const name = AI_NAMES[rng.nextInt(AI_NAMES.length)];
        return getAI(name);
      }
      const name = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
      return getAI(name);
    });
  }
  if (assignment.startsWith('all-')) {
    const aiName = assignment.slice(4);
    return Array.from({ length: numPlayers }, () => getAI(aiName));
  }
  // Default to diverse
  return createAIPool(numPlayers, rng);
}

export { RandomAI, BuilderAI, AggressorAI, CelestialAI, ControllerAI, OpportunistAI, PassiveAI, TacticianAI, CollectorAI };
