const VALID_CATEGORIES = ['action', 'tome', 'celestial', 'bonus-round'];
const VALID_SUITS = [null, 'WANDS', 'CUPS', 'SWORDS', 'COINS'];
const VALID_ACTIONS = [
  'MOVE_CELESTIAL_TO_TOME', 'MOVE_MAJOR_TO_REALM', 'WHEEL_OF_FORTUNE',
  'STEAL_FROM_TOME', 'TOWER_DESTROY', 'CLAIM_ROUND_END_MARKER', 'PLAGUE_TO_TOME',
];
const VALID_ONPLAY = [null, 'PROTECT_SUIT', 'DRAW_TO_LIMIT', 'TOME_CARDS_TO_HAND'];
const VALID_BONUS_TYPES = [
  'foolDuplicate', 'suitMajority', 'suitHighest', 'pairCounting',
  'hermitExclusive', 'noSuitInRealm', 'hierophant_blessing',
];

export function validateCard(card, allCards) {
  const errors = [];

  if (card.number == null || isNaN(card.number)) {
    errors.push('Card number is required and must be a number');
  }
  if (!card.name || !card.name.trim()) {
    errors.push('Card name is required');
  }
  if (!VALID_CATEGORIES.includes(card.category)) {
    errors.push(`Invalid category: ${card.category}`);
  }
  if (!VALID_SUITS.includes(card.suit)) {
    errors.push(`Invalid suit: ${card.suit}`);
  }

  // Check unique number
  const dupes = allCards.filter(c => c !== card && c.number === card.number);
  if (dupes.length > 0) {
    errors.push(`Card number ${card.number} is already used by "${dupes[0].name}"`);
  }

  // Validate effect based on category
  if (card.effect) {
    errors.push(...validateEffect(card.effect, card.category));
  } else {
    errors.push('Effect definition is required');
  }

  return errors;
}

function validateEffect(effect, category) {
  const errors = [];

  if (category === 'action') {
    if (effect.type === 'game_end_trigger') {
      if (!effect.trigger) errors.push('Game-end trigger type is required');
    } else if (effect.type === 'action') {
      if (!VALID_ACTIONS.includes(effect.action)) {
        errors.push(`Invalid action type: ${effect.action}`);
      }
    } else {
      errors.push(`Action card effect type must be "action" or "game_end_trigger"`);
    }
  }

  if (category === 'tome') {
    if (effect.type !== 'tome') {
      errors.push('Tome card effect type must be "tome"');
    }
    if (effect.onPlay && !VALID_ONPLAY.includes(effect.onPlay.action)) {
      errors.push(`Invalid onPlay action: ${effect.onPlay.action}`);
    }
  }

  if (category === 'celestial') {
    if (effect.type !== 'celestial') {
      errors.push('Celestial card effect type must be "celestial"');
    }
    if (effect.vpAtGameEnd == null || isNaN(effect.vpAtGameEnd)) {
      errors.push('Celestial VP value is required and must be a number');
    }
  }

  if (category === 'bonus-round') {
    if (effect.type !== 'bonus') {
      errors.push('Bonus-round card effect type must be "bonus"');
    }
    if (effect.bonus && !VALID_BONUS_TYPES.includes(effect.bonus.bonusType)) {
      errors.push(`Invalid bonus type: ${effect.bonus.bonusType}`);
    }
  }

  return errors;
}

export function validateConfig(config) {
  const errors = [];

  if (!config.gameRules) errors.push('gameRules section is missing');
  if (!config.buyPrices) errors.push('buyPrices section is missing');
  if (!config.scoring) errors.push('scoring section is missing');
  if (!config.majorArcana || !Array.isArray(config.majorArcana)) {
    errors.push('majorArcana array is missing');
    return errors;
  }

  for (const card of config.majorArcana) {
    const cardErrors = validateCard(card, config.majorArcana);
    if (cardErrors.length > 0) {
      errors.push(`Card "${card.name || card.number}": ${cardErrors.join('; ')}`);
    }
  }

  return errors;
}
