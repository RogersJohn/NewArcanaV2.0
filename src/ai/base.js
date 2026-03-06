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
   * @param {object} state
   * @param {number} playerIndex
   * @param {object} action - The action being taken
   * @returns {boolean}
   */
  shouldBlockWithAce(state, playerIndex, action) {
    // Random: 20% chance to block
    const hasAce = state.players[playerIndex].hand.some(
      c => c.type === 'minor' && c.rank === 'ACE'
    );
    return hasAce && state.rng.next() < 0.2;
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
    return hasKing && state.rng.next() < 0.3;
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
}
