const MINOR_ACTION_TEXT = {
  ACE: 'Block: Play any time to block a Royal action, Major Arcana play, or another Ace.',
  PAGE: 'Attack: Destroy a same-suit card in any Realm. Both go to Pit.',
  KNIGHT: 'Attack: Steal a same-suit card from any Realm to your hand. Knight goes to Pit.',
  QUEEN: 'Attack: Move a same-suit card from an opponent\'s Realm to yours. Queen goes to Pit.',
  KING: 'Defend: Block a Royal attack on your Realm. Both cards go to Pit.',
};

const MAJOR_TOOLTIP_TEXT = {
  0: 'Bonus -- Round End: Duplicate an opponent\'s Tome bonus card.',
  1: 'Bonus -- Round End: 1vp if you have MORE of a named suit than any opponent. Wild counts. No ties.',
  2: 'Bonus -- Round End: 1vp for most Wands in Realm. Ties OK. Wild not counted.',
  3: 'Bonus -- Round End: 1vp for most Cups in Realm. Ties OK. Wild not counted.',
  4: 'Bonus -- Round End: 1vp for most Coins in Realm. Ties OK. Wild not counted.',
  5: 'Tome: Failed bonus cards in your Tome score 1vp instead of 0.',
  6: 'Bonus -- Round End: 1vp per Pair in Realm. 2vp for Two-Pair.',
  7: 'Action: Take any face-up Celestial into your Tome. Blocked by Ace.',
  8: 'Action: Move any Major Arcana from a Realm or Tome into your Realm as wild. Blocked by Ace.',
  9: 'Tome: On play, take all other Tome cards into hand. Bonus: 1vp if only card in Tome.',
  10: 'Action: Draw 2 Major Arcana from any source. Keep 1, Pit the other. Blocked by Ace.',
  11: 'Bonus -- Round End: 1vp for most Swords in Realm. Ties OK. Wild not counted.',
  12: 'Action: Take a card from an opponent\'s Tome into yours. Blocked by Ace.',
  13: 'Game End: Immediately ends the game when revealed or purchased.',
  14: 'Tome: Protects Cups from Royal attacks. Bonus: 1vp if no Cups in Realm.',
  15: 'Tome: Hand size limit becomes 7. On play, draw up to 7.',
  16: 'Action: Destroy a Major Arcana in every Tome larger than yours. Blocked by Ace.',
  17: 'Celestial: 3+ Celestials at round end = you win. Game end: 2vp each.',
  18: 'Celestial: 3+ Celestials at round end = you win. Game end: 2vp each.',
  19: 'Celestial: 3+ Celestials at round end = you win. Game end: 2vp each.',
  20: 'Action: Take the Round-End Marker. Round ends immediately. Blocked by Ace.',
  21: 'Celestial: 3+ Celestials at round end = you win. Game end: 2vp each.',
  22: 'Tome: Protects Swords from Royal attacks. Bonus: 1vp if no Swords in Realm.',
  23: 'Tome: Protects Wands from Royal attacks. Bonus: 1vp if no Wands in Realm.',
  24: 'Celestial: 3+ Celestials at round end = you win. Game end: 2vp each.',
  25: 'Tome: Protects Coins from Royal attacks. Bonus: 1vp if no Coins in Realm.',
  26: 'Action: Play into any player\'s Tome. Game end: -3vp if still in Tome.',
};

export function getMinorTooltip(card) {
  const name = `${formatRankName(card.rank)} of ${card.suit}`;
  const value = `Value: ${card.purchaseValue}`;
  const action = MINOR_ACTION_TEXT[card.rank] || '';
  return action ? `${name}\n${value}\n${action}` : `${name}\n${value}`;
}

export function getMajorTooltip(card) {
  const header = `${card.number} -- ${card.name}`;
  const effect = MAJOR_TOOLTIP_TEXT[card.number] || '';
  const wild = 'Can be played as Wild to Realm (if no other Major Arcana present).';
  return effect ? `${header}\n${effect}\n${wild}` : `${header}\n${wild}`;
}

export function getCardTooltip(card) {
  if (!card) return '';
  if (card.type === 'minor') return getMinorTooltip(card);
  if (card.type === 'major') return getMajorTooltip(card);
  return '';
}

function formatRankName(rank) {
  if (typeof rank === 'string') {
    return rank.charAt(0) + rank.slice(1).toLowerCase();
  }
  return String(rank);
}
