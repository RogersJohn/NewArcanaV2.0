/**
 * Create a UI-friendly snapshot of the mutable game state.
 * Copies only fields relevant to rendering — avoids passing
 * full deck arrays or RNG internals to React.
 */
export function createSnapshot(state) {
  if (!state) return null;

  return {
    players: state.players.map(p => ({
      name: p.name,
      vp: p.vp,
      hand: [...p.hand],
      realm: [...p.realm],
      tome: [...p.tome],
      vault: [...p.vault],
      hasRoundEndMarker: p.hasRoundEndMarker,
      tomeProtections: new Set(p.tomeProtections),
    })),
    display: [...state.display],
    pot: state.pot,
    roundNumber: state.roundNumber,
    currentPlayerIndex: state.currentPlayerIndex,
    dealerIndex: state.dealerIndex,
    gameEnded: state.gameEnded,
    gameEndReason: state.gameEndReason,
    roundEndMarkerHolder: state.roundEndMarkerHolder,
    turnCount: state.turnCount,
    log: [...state.log],
    // Counts only — not full arrays
    minorDeckCount: state.minorDeck.length,
    minorDiscardCount: state.minorDiscard.length,
    majorDeckCount: state.majorDeck.length,
    majorDiscardCount: state.majorDiscard.length,
    pitCount: state.pit.length,
    // Top of minor discard for display (buy target)
    minorDiscardTop: state.minorDiscard.length > 0
      ? state.minorDiscard[state.minorDiscard.length - 1]
      : null,
  };
}
