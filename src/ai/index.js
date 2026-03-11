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
import { ScoringAI } from './scoring.js';
import { MctsAI } from './mcts.js';
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
  'scoring': ScoringAI,
  'mcts': MctsAI,
};

const AI_NAMES = Object.keys(AI_CLASSES);

/**
 * Get an AI instance by name.
 * @param {string} name
 * @returns {object} AI instance
 */
export function getAI(name, options = {}) {
  const AIClass = AI_CLASSES[name.toLowerCase()];
  if (!AIClass) throw new Error(`Unknown AI: ${name}`);
  return new AIClass(options);
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
export function createAIPool(numPlayers, rng, options = {}) {
  const nonRandom = AI_NAMES.filter(n => n !== 'random' && n !== 'mcts');
  // Shuffle available AIs so different combinations play each game
  const shuffledNames = shuffle([...nonRandom], rng);
  const ais = [];
  for (let i = 0; i < numPlayers; i++) {
    const aiName = shuffledNames[i % shuffledNames.length];
    ais.push(getAI(aiName, options));
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
export function createAIs(numPlayers, assignment = 'diverse', rng, options = {}) {
  if (assignment === 'diverse') {
    return createAIPool(numPlayers, rng, options);
  }
  if (assignment === 'random') {
    // Random selection for each seat
    return Array.from({ length: numPlayers }, (_, i) => {
      if (rng) {
        const name = AI_NAMES[rng.nextInt(AI_NAMES.length)];
        return getAI(name, options);
      }
      // Deterministic fallback when no rng available
      const name = AI_NAMES[i % AI_NAMES.length];
      return getAI(name, options);
    });
  }
  if (assignment.startsWith('all-')) {
    const aiName = assignment.slice(4);
    return Array.from({ length: numPlayers }, () => getAI(aiName, options));
  }
  // Default to diverse
  return createAIPool(numPlayers, rng, options);
}

export { RandomAI, BuilderAI, AggressorAI, CelestialAI, ControllerAI, OpportunistAI, PassiveAI, TacticianAI, CollectorAI, ScoringAI, MctsAI };
