#!/usr/bin/env node
/**
 * AI Coverage Diagnostic — Per-AI breakdown of Judgement/Wheel usage.
 *
 * Wraps each AI's chooseAction to track:
 * - How many turns each card (10, 20) was available as PLAY_MAJOR_ACTION
 * - How many times it was chosen as ACTION vs WILD vs something else
 * - Break down by AI type
 * Also wraps shouldBlockWithAce to track block decisions for cards 10 and 20.
 *
 * Usage:
 *   node scripts/ai-coverage-diagnostic.js [--games N]
 */

import { createInitialState } from '../src/state.js';
import { setup, playGame } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { writeFileSync, mkdirSync } from 'fs';

const GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') || '200');
const TRACKED_CARDS = [10, 20]; // Wheel of Fortune, Judgement
const TRACKED_CARD_NAMES = { 10: 'Wheel of Fortune', 20: 'Judgement' };
const ALL_ACTION_CARDS = [7, 8, 10, 12, 16, 20, 26];
const ACTION_CARD_NAMES = {
  7: 'The Chariot', 8: 'Strength', 10: 'Wheel of Fortune',
  12: 'The Hanged Man', 16: 'The Tower', 20: 'Judgement', 26: 'Plague'
};

// Per-AI tracking
const aiStats = {};

function ensureAI(aiType) {
  if (!aiStats[aiType]) {
    aiStats[aiType] = {
      totalTurns: 0,
      cardStats: {},
    };
    for (const num of ALL_ACTION_CARDS) {
      aiStats[aiType].cardStats[num] = {
        name: ACTION_CARD_NAMES[num],
        availableAsAction: 0,
        chosenAsAction: 0,
        chosenAsWild: 0,
        chosenAsTome: 0,
        notChosen: 0,
        blockedByAce: 0,
        blockedOthersAce: 0, // blocked another player's play of this card
      };
    }
  }
}

console.log(`Running ${GAMES} games (4 players, diverse AI) with action card tracking...`);
const startTime = Date.now();

let errors = 0;
let completedGames = 0;

for (let g = 0; g < GAMES; g++) {
  try {
    const state = createInitialState(4, false);
    const ais = createAIs(4, 'diverse');

    for (let pi = 0; pi < 4; pi++) {
      state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
    }

    // Wrap each AI's chooseAction
    for (let pi = 0; pi < 4; pi++) {
      const ai = ais[pi];
      const aiType = ai.name;
      ensureAI(aiType);

      const originalChooseAction = ai.chooseAction.bind(ai);
      ai.chooseAction = function(st, legalActions, playerIdx) {
        aiStats[aiType].totalTurns++;

        // Check which action cards are available
        for (const num of ALL_ACTION_CARDS) {
          const isAvailableAction = legalActions.some(a =>
            a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === num
          );
          if (isAvailableAction) {
            aiStats[aiType].cardStats[num].availableAsAction++;
          }
        }

        const chosen = originalChooseAction(st, legalActions, playerIdx);

        // Track what was chosen
        if (chosen && chosen.type === 'PLAY_MAJOR_ACTION' && chosen.card) {
          const num = chosen.card.number;
          if (aiStats[aiType].cardStats[num]) {
            aiStats[aiType].cardStats[num].chosenAsAction++;
          }
        } else if (chosen && chosen.type === 'PLAY_WILD' && chosen.card) {
          const num = chosen.card.number;
          if (aiStats[aiType].cardStats[num]) {
            aiStats[aiType].cardStats[num].chosenAsWild++;
          }
        } else if (chosen && chosen.type === 'PLAY_MAJOR_TOME' && chosen.card) {
          const num = chosen.card.number;
          if (aiStats[aiType].cardStats[num]) {
            aiStats[aiType].cardStats[num].chosenAsTome++;
          }
        }

        // Track "not chosen" for cards that were available but not picked
        for (const num of ALL_ACTION_CARDS) {
          const wasAvailable = legalActions.some(a =>
            a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === num
          );
          if (wasAvailable && (!chosen || chosen.type !== 'PLAY_MAJOR_ACTION' || chosen.card?.number !== num)) {
            aiStats[aiType].cardStats[num].notChosen++;
          }
        }

        return chosen;
      };

      // Wrap shouldBlockWithAce
      const originalBlock = ai.shouldBlockWithAce.bind(ai);
      ai.shouldBlockWithAce = function(st, playerIdx, action) {
        const result = originalBlock(st, playerIdx, action);
        if (result && action.type === 'PLAY_MAJOR_ACTION' && action.card) {
          const num = action.card.number;
          if (aiStats[aiType].cardStats[num]) {
            aiStats[aiType].cardStats[num].blockedOthersAce++;
          }
        }
        return result;
      };
    }

    setup(state, ais);
    playGame(state, ais);
    completedGames++;
  } catch (e) {
    errors++;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`Completed ${completedGames} games in ${elapsed}s (${errors} errors)\n`);

// Format results
const output = {
  config: { games: GAMES, players: 4, aiAssignment: 'diverse', completedGames, errors },
  trackedCards: TRACKED_CARD_NAMES,
  allActionCards: ACTION_CARD_NAMES,
  aiBreakdown: {},
};

for (const [aiType, data] of Object.entries(aiStats)) {
  output.aiBreakdown[aiType] = {
    totalTurns: data.totalTurns,
    cardUsage: {},
  };

  for (const [numStr, stats] of Object.entries(data.cardStats)) {
    const num = parseInt(numStr);
    const playRate = stats.availableAsAction > 0
      ? (stats.chosenAsAction / stats.availableAsAction * 100).toFixed(1)
      : '0.0';

    output.aiBreakdown[aiType].cardUsage[num] = {
      name: stats.name,
      availableAsAction: stats.availableAsAction,
      chosenAsAction: stats.chosenAsAction,
      chosenAsWild: stats.chosenAsWild,
      chosenAsTome: stats.chosenAsTome,
      notChosen: stats.notChosen,
      playRatePercent: parseFloat(playRate),
      blockedOthersAce: stats.blockedOthersAce,
    };
  }
}

// Console summary
console.log('='.repeat(80));
console.log('  AI COVERAGE DIAGNOSTIC — Action Card Usage by AI Type');
console.log('='.repeat(80));
console.log(`  ${completedGames} games | 4 players | diverse AI\n`);

for (const [aiType, data] of Object.entries(output.aiBreakdown)) {
  console.log(`\n  ${aiType.toUpperCase()} (${data.totalTurns} turns)`);
  console.log('  ' + '-'.repeat(74));
  console.log('  Card                     Available  Action  Wild  Tome  Skip   PlayRate');
  for (const [num, usage] of Object.entries(data.cardUsage)) {
    const name = `[${num}] ${usage.name}`.padEnd(26);
    console.log(`  ${name} ${String(usage.availableAsAction).padStart(9)}  ${String(usage.chosenAsAction).padStart(6)}  ${String(usage.chosenAsWild).padStart(4)}  ${String(usage.chosenAsTome).padStart(4)}  ${String(usage.notChosen).padStart(4)}   ${String(usage.playRatePercent).padStart(5)}%`);
  }
}

// Save JSON
try {
  mkdirSync('results', { recursive: true });
  writeFileSync('results/ai-coverage-diagnostic.json', JSON.stringify(output, null, 2));
  console.log('\nResults saved to results/ai-coverage-diagnostic.json');
} catch (e) {
  console.error(`Failed to save JSON: ${e.message}`);
}
