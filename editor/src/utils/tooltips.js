/** Tooltip text constants for the card editor. */

export const CARD_FIELDS = {
  number: 'Unique ID for this card. Determines purchase cost from the display (higher number = more expensive). Cannot overlap with another card\'s number.',
  name: 'Display name shown to players during the game.',
  category: 'Determines how this card is used:\n\u2022 Action \u2014 played from hand for an immediate effect, then goes to the Pit\n\u2022 Tome \u2014 placed in your Tome for ongoing/round-end benefits\n\u2022 Celestial \u2014 placed in Tome, worth VP at game end, 3 = instant win\n\u2022 Bonus-round \u2014 placed in Tome, scores VP at the end of each round',
  suit: 'If set, this card is associated with a suit. Affects bonus evaluation for cards like High Priestess (Wands), Empress (Cups), etc. Most cards have no suit.',
  keywords: 'Tags that affect game logic. \'bonus\' means the card has a round-end scoring effect. \'tome\' means it can be played to Tome. \'action\' means it has an active play effect. \'game-end\' means revealing this card ends the game. \'celestial\' marks celestial win-condition cards.',
};

export const ACTION_EFFECTS = {
  MOVE_CELESTIAL_TO_TOME: 'Take a face-up Celestial from any Realm, Tome, Display, or Major discard pile and place it in your Tome. (The Chariot)',
  MOVE_MAJOR_TO_REALM: 'Take a face-up Major Arcana from any Realm or Tome and place it in your Realm as a wild card. (Strength)',
  WHEEL_OF_FORTUNE: 'Draw 2 cards from Major sources (deck, display, discard), keep 1, pit the other. (Wheel of Fortune)',
  STEAL_FROM_TOME: 'Take one card from an opponent\'s Tome and place it in your Tome. (The Hanged Man)',
  TOWER_DESTROY: 'Destroy the top card in every opponent\'s Tome that has MORE cards than yours. (The Tower)',
  CLAIM_ROUND_END_MARKER: 'Immediately take the round-end marker. The round ends at the start of your next turn. (Judgement)',
  PLAGUE_TO_TOME: 'Place this card into any player\'s Tome. It inflicts a VP penalty at game end. (Plague)',
  gameEndTrigger: 'When this card is revealed in the display, the game ends immediately. (Death)',
};

export const TOME_ONPLAY = {
  PROTECT_SUIT: 'While in your Tome, protects all cards of the chosen suit in your Realm from Royal attacks (Page/Knight/Queen). (Temperance, Faith, Hope, Prudence)',
  DRAW_TO_LIMIT: 'When played to Tome, draw minor cards until your total hand+realm size reaches the limit. Also raises your discard-phase hand limit to this value while in your Tome. (The Devil)',
  TOME_CARDS_TO_HAND: 'When played to Tome, take all OTHER cards currently in your Tome into your hand. Only this card remains. (The Hermit)',
  protectedSuit: 'The suit this card protects from Royal attacks while in your Tome.',
  drawLimit: 'The hand+realm size target when this card is played to Tome.',
};

export const BONUS = {
  bonusType: 'The scoring rule this bonus card uses at round end.',
  foolDuplicate: 'Copy an opponent\'s Tome bonus card and evaluate it as if it were yours. Only duplicates round-end bonuses. (The Fool)',
  suitMajority: 'Score VP if you have MORE cards of a named suit in your Realm than any other player. The player chooses which suit at round end. (The Magician)',
  suitHighest: 'Score VP if you have the highest count of the specified suit among all players. Tied counts may or may not score depending on the \'Allow tie\' setting.',
  pairCounting: 'Score VP for each pair of cards with matching rank in your Realm. (The Lovers)',
  hermitExclusive: 'Score VP only if this is the ONLY card in your Tome. (The Hermit)',
  noSuitInRealm: 'Score VP if you have ZERO cards of the specified suit in your Realm. (Temperance/Faith/Hope/Prudence bonuses)',
  hierophant_blessing: 'Not a scoring bonus itself. When this card is in your Tome, any OTHER bonus card that fails to score gives 1 VP instead of 0. (The Hierophant)',
  vp: 'Victory points awarded when this bonus is scored.',
  vpPerPair: 'Victory points awarded for each matching-rank pair found in the player\'s Realm.',
  suit: 'The suit this bonus evaluates. Only cards of this suit in the Realm count.',
  requiresStrictAdvantage: 'If checked, the player must have STRICTLY MORE than all opponents. Ties score 0.',
  countWilds: 'If checked, wild cards (Major Arcana in Realm) count as the evaluated suit.',
  allowTie: 'If checked, a tied count still scores. If unchecked, must have strictly more than all opponents.',
  requiresChoice: 'If checked, the player chooses which suit to evaluate at round end (Magician).',
};

export const CELESTIAL = {
  vpAtGameEnd: 'Victory points this card is worth when it\'s in your Tome/Realm at the end of the game.',
  winConditionGroup: 'Cards in the same group count toward the instant-win condition. Default: \'celestial\'. Collecting 3 cards of the same group wins the game immediately.',
};

export const GAME_RULES = {
  handSizeLimit: 'Maximum number of cards (hand + realm) before the discard phase triggers. Default: 6.',
  devilHandSizeLimit: 'Maximum hand+realm size for a player with a DRAW_TO_LIMIT card in their Tome. Default: 7.',
  tomeCapacity: 'Maximum number of cards allowed in a player\'s Tome. When exceeded, one must be discarded. Default: 3.',
  realmTrigger: 'When a player has this many cards in their Realm at the end of their turn, they take the round-end marker. Default: 5.',
  displaySlots: 'Number of face-up Major Arcana cards in the display. Default: 3.',
  maxTurnsPerRound: 'Safety limit to prevent infinite loops. Default: 50.',
  maxRounds: 'Safety limit. Default: 20.',
  initialDealCount: 'Minor cards dealt to each player at game start. Default: 5.',
  roundDealCount: 'Target hand+realm size when drawing at the start of each round. Players draw up to this number (minimum 1). Default: 6.',
};

export const BUY_PRICES = {
  draw: 'Minimum purchase value of minor cards in hand needed to buy the top card from the draw pile. Default: 6.',
  display0: 'Minimum purchase value needed to buy from display slot 1 (newest, cheapest). Default: 7.',
  display1: 'Minimum purchase value needed to buy from display slot 2. Default: 8.',
  display2: 'Minimum purchase value needed to buy from display slot 3 (oldest, most expensive). Default: 9.',
  discard: 'Minimum purchase value needed to buy from the discard pile. Default: 10.',
};

export const SCORING = {
  celestialVp: 'VP awarded per Celestial card in Tome/Realm at game end. Default: 2.',
  plagueVp: 'VP penalty per Plague card in Tome at game end. Should be negative. Default: -3.',
  celestialWinCount: 'Number of Celestial cards needed to trigger an instant win. Default: 3.',
  potInitialPerPlayer: 'VP added to the pot at game start per player. Default: 1.',
  potGrowth: 'VP added to the pot at the start of each new round. Default: 1.',
  maxPaymentCards: 'Maximum number of minor cards that can be used as payment in a single buy action. Default: 3.',
};
