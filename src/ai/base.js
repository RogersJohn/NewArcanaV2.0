/**
 * Base AI interface and RandomAI implementation.
 */

/**
 * RandomAI: Makes all choices randomly from legal options.
 */
export class RandomAI {
  constructor() {
    this.name = 'Random';
  }

  /**
   * Choose an action from legal actions.
   * @param {object} state
   * @param {object[]} legalActions
   * @param {number} playerIndex
   * @returns {object} Chosen action
   */
  chooseAction(state, legalActions, playerIndex) {
    return legalActions[state.rng.nextInt(legalActions.length)];
  }

  /**
   * Choose which cards to discard from hand.
   * @param {object} state
   * @param {number} playerIndex
   * @param {number} numToDiscard
   * @returns {number[]} Indices of cards in hand to discard
   */
  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const indices = Array.from({ length: hand.length }, (_, i) => i);
    // Shuffle and pick first numToDiscard
    state.rng.shuffle(indices);
    return indices.slice(0, numToDiscard).sort((a, b) => b - a);
  }

  /**
   * Decide whether to block with an Ace.
   * Uses threat vs retention analysis for informed decisions.
   * @param {object} state
   * @param {number} playerIndex
   * @param {object} action - The action being taken
   * @returns {boolean}
   */
  shouldBlockWithAce(state, playerIndex, action) {
    const hasBlocker = state.players[playerIndex].hand.some(
      c => (c.type === 'minor' && c.rank === 'ACE') ||
           (c.type === 'major' && c.keywords?.includes('jester'))
    );
    if (!hasBlocker) return false;

    // Compute threat value inline (avoid circular import of awareness.js)
    const threatValue = _computeThreatValue(state, playerIndex, action);

    // Compute ace retention value: how valuable is keeping this blocker?
    const blockerCount = state.players[playerIndex].hand.filter(
      c => (c.type === 'minor' && c.rank === 'ACE') ||
           (c.type === 'major' && c.keywords?.includes('jester'))
    ).length;
    const retentionValue = blockerCount <= 1 ? 50 : blockerCount === 2 ? 30 : 15;

    return threatValue > retentionValue;
  }

  /**
   * Decide whether to block with a King.
   * @param {object} state
   * @param {number} playerIndex
   * @param {object} attackCard
   * @returns {boolean}
   */
  shouldBlockWithKing(state, playerIndex, attackCard) {
    const hasKing = state.players[playerIndex].hand.some(
      c => c.type === 'minor' && c.rank === 'KING'
    );
    if (!hasKing) return false;

    const realmSize = state.players[playerIndex].realm.length;
    // Block if we have a meaningful realm to protect
    if (realmSize >= 3) return true;
    // Block Queen attacks (they steal to opponent's realm — worst case)
    if (attackCard?.rank === 'QUEEN' && realmSize >= 2) return true;
    // Small realm — usually not worth spending a King
    return false;
  }

  /**
   * Choose which tome card to discard when tome is full.
   * @param {object} state
   * @param {number} playerIndex
   * @returns {number} Index in tome to discard
   */
  chooseTomeDiscard(state, playerIndex) {
    const tome = state.players[playerIndex].tome;
    return state.rng.nextInt(tome.length);
  }

  /**
   * Choose which Major Arcana card to keep during setup.
   * @param {object[]} majorCards - 2 cards to choose from
   * @param {object} state - Game state (for RNG access)
   * @returns {number} Index of card to keep (0 or 1)
   */
  chooseMajorKeep(majorCards, state) {
    return state.rng.nextInt(majorCards.length);
  }

  /**
   * Choose which realm cards to discard when realm > 5.
   * @param {object} state
   * @param {number} playerIndex
   * @param {number} numToDiscard
   * @returns {number[]} Indices in realm to discard
   */
  chooseRealmDiscard(state, playerIndex, numToDiscard) {
    const realm = state.players[playerIndex].realm;
    const indices = Array.from({ length: realm.length }, (_, i) => i);
    state.rng.shuffle(indices);
    return indices.slice(0, numToDiscard).sort((a, b) => b - a);
  }

  /**
   * Choose Wheel of Fortune sources (2 cards from draw/display/discard).
   * @param {object} state
   * @param {number} playerIndex
   * @returns {object[]} Array of 2 source descriptors
   */
  chooseWheelSources(state, playerIndex) {
    const sources = [];
    if (state.majorDeck.length > 0) sources.push({ source: 'draw' });
    for (let i = 0; i < 3; i++) {
      if (state.display[i]) sources.push({ source: 'display', slotIndex: i });
    }
    if (state.majorDiscard.length > 0) sources.push({ source: 'discard' });

    // Pick up to 2 random sources
    const picked = [];
    const available = [...sources];
    for (let i = 0; i < Math.min(2, available.length); i++) {
      const idx = state.rng.nextInt(available.length);
      picked.push(available.splice(idx, 1)[0]);
    }
    return picked;
  }

  /**
   * Choose which of 2 Wheel of Fortune cards to keep.
   * @param {object[]} cards - The 2 drawn cards
   * @param {object} state - Game state (for RNG access)
   * @returns {number} Index to keep (0 or 1)
   */
  chooseWheelKeep(cards, state) {
    return state.rng.nextInt(cards.length);
  }

  /**
   * Choose Magician suit for bonus.
   * @param {object} state
   * @param {number} playerIndex
   * @returns {string} Suit name
   */
  chooseMagicianSuit(state, playerIndex) {
    const suits = ['WANDS', 'CUPS', 'SWORDS', 'COINS'];
    return suits[state.rng.nextInt(suits.length)];
  }

  /**
   * Choose Fool target (opponent's bonus card to duplicate).
   * @param {object} state
   * @param {number} playerIndex
   * @param {object[]} options - Available bonus cards to copy
   * @returns {number} Index of option to copy, or -1 for none
   */
  chooseFoolTarget(state, playerIndex, options) {
    if (options.length === 0) return -1;
    return state.rng.nextInt(options.length);
  }

  /**
   * Choose which Tome cards to take via Hermit.
   * @param {object} state
   * @param {number} playerIndex
   * @param {number[]} eligibleIndices - Tome indices that can be taken
   * @returns {number[]} Indices to take (subset of eligibleIndices)
   */
  chooseHermitCards(state, playerIndex, eligibleIndices) {
    // Default: take all eligible cards
    return [...eligibleIndices];
  }

  /**
   * Choose which card to destroy in opponent's Tome via Tower.
   * @param {object} state
   * @param {number} playerIndex - Tower player
   * @param {number} targetPlayerIndex - Opponent whose Tome is targeted
   * @returns {number} Index into target's Tome
   */
  chooseTowerTarget(state, playerIndex, targetPlayerIndex) {
    // Default: destroy last card
    return state.players[targetPlayerIndex].tome.length - 1;
  }

  /**
   * Choose a card from hand to keep via Charity (scored 0 this round).
   * @param {object} state
   * @param {number} playerIndex
   * @returns {number} Index into hand, or -1 to keep nothing
   */
  chooseCharityCard(state, playerIndex) {
    const hand = state.players[playerIndex].hand;
    if (hand.length === 0) return -1;
    return state.rng.nextInt(hand.length);
  }

  /**
   * Choose draw source: 'deck' or 'discard'.
   * Smart default: takes from discard when the card matches hand/realm ranks,
   * helps a flush, or is a high-value card.
   * @param {object} state
   * @param {number} playerIndex
   * @param {object} topDiscardCard - The visible top card of the discard pile
   * @returns {string} 'deck' or 'discard'
   */
  chooseDrawSource(state, playerIndex, topDiscardCard) {
    if (!topDiscardCard || topDiscardCard.type !== 'minor') return 'deck';

    const player = state.players[playerIndex];
    const hand = player.hand;
    const realm = player.realm;

    // Matches a rank in hand → pair potential
    if (hand.some(c => c.type === 'minor' && c.numericRank === topDiscardCard.numericRank)) {
      return 'discard';
    }

    // Matches a rank in realm → set completion potential
    if (realm.some(c => c.type === 'minor' && c.numericRank === topDiscardCard.numericRank)) {
      return 'discard';
    }

    // Flush potential: same suit as 2+ minor cards in realm
    const suitCount = realm.filter(c =>
      c.type === 'minor' && c.suit === topDiscardCard.suit
    ).length;
    if (suitCount >= 2) return 'discard';

    // High-value card (useful for buying Major Arcana)
    if (topDiscardCard.numericRank >= 12) return 'discard';

    return 'deck';
  }

  /**
   * Learn from a completed game's outcome. Called after each game in learning mode.
   * Override in subclasses to implement weight adaptation.
   *
   * @param {object} gameResult - The result from extractGameResult()
   * @param {number} myIndex - This AI's player index in the completed game
   * @param {object} state - The final game state (has log, events, history, players)
   */
  learn(gameResult, myIndex, state) {
    // No-op for RandomAI and MCTS — they don't use personality weights
  }
}

/**
 * Compute how threatening an action is (simplified, no external imports).
 * Inlined version of aceBlockValue from awareness.js.
 */
function _computeThreatValue(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const potRatio = Math.max(0.2, Math.min(2.0, (state.pot || 0) / Math.max(state.players.length, 1)));

  // Royal attack targeting our realm
  if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
    const realmSize = player.realm.length;
    let score = realmSize * 12;
    if (action.card?.rank === 'QUEEN') score += 15;
    else if (action.card?.rank === 'KNIGHT') score += 8;
    return Math.min(100, score * potRatio);
  }

  // Wild card play that gives opponent 4+ realm
  if (action.type === 'PLAY_WILD') {
    const actorPi = action.playerIndex;
    const actorRealm = (actorPi != null && state.players[actorPi]?.realm) || [];
    const newSize = actorRealm.length + 1 + (action.withCards?.length || 0);
    if (newSize >= 5) return 50 * potRatio;
    if (newSize >= 4) return 30 * potRatio;
    return 10;
  }

  // Celestial to Tome
  if (action.type === 'PLAY_MAJOR_TOME') {
    if (action.card?.keywords?.includes('celestial')) {
      const actorPi = action.playerIndex;
      if (actorPi != null && state.players[actorPi]) {
        const celestials = [...state.players[actorPi].tome, ...state.players[actorPi].realm]
          .filter(c => c.keywords?.includes('celestial')).length;
        if (celestials >= 2) return 95;
        if (celestials >= 1) return 55;
      }
      return 25;
    }
    return 10;
  }

  // Major Arcana action
  if (action.type === 'PLAY_MAJOR_ACTION') {
    if (action.description?.includes('Judgement') || action.description?.includes('Round-End')) {
      return 40 * potRatio;
    }
    return 15;
  }

  return 5;
}
