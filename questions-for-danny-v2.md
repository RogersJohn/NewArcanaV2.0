# Questions for Danny — Rules Inconsistencies & Ambiguities

Based on a detailed cross-reference of RULES.md, CARDS.md, and the simulation engine after several months of development. These are genuine ambiguities that affect game balance and simulation accuracy. Organised by priority.

---

## Critical — Affects Simulation Correctness

### 1. The Fool — Whose Perspective?

CARDS.md says The Fool duplicates "an opponent's Tome Bonus card" and "the requirements of the target card are also duplicated."

The engine currently evaluates the duplicated bonus **from the opponent's perspective** — it checks whether the *opponent* meets their own bonus requirements, and gives the Fool's owner the same VP if so.

But "duplicate" could mean: evaluate the bonus as if the Fool's owner had that card — checking whether *they* meet the requirements against *their own* Realm.

**Example:** Opponent has Justice (most Swords) and 3 Swords in their Realm. You have The Fool and 0 Swords. Does The Fool score?

- Current engine: **Yes** (opponent meets their own requirement, Fool copies the result)
- Alternative reading: **No** (you don't have the most Swords, so you don't meet the duplicated requirement)

**Which is correct?**

### 2. Judgement — "Round ends immediately" vs Round-End Marker

CARDS.md says Judgement: "Take possession of the Round-End Marker. Round ends immediately and is scored."

But RULES.md says the round-end marker means "if you start your turn with the marker, Round-End is declared." These are contradictory:

- **Immediately:** The round ends as soon as Judgement is played, during the current player's turn. No other players get another turn.
- **Marker-based:** The player takes the marker, and the round ends at the *start of their next turn*, giving all other players one more turn.

**The engine implements "immediately" — the round ends as soon as Judgement resolves. Is that correct, or should other players get one more turn?**

This matters a lot for balance. Immediate end is much more powerful because opponents can't react.

### 3. The Lovers — Wild Card Interaction

CARDS.md says: "Wild cards always produce the strongest hand, so you cannot downgrade to Two-Pair."

The engine handles this by checking the poker evaluation of the full Realm:
- If the hand evaluates to "One Pair" → 1 VP
- If the hand evaluates to "Two Pair" → 2 VP
- If the hand evaluates to anything stronger (trips, straight, etc.) → 0 VP

But a wild card will *never* produce Two-Pair, because a wild always makes the strongest possible hand (which would be Three-of-a-Kind or better if you have a pair + wild). So with a wild in your Realm, The Lovers **can never score more than 1 VP** (and only if the optimal hand happens to be One Pair, which is unlikely with a wild).

**Is this intended? It makes The Lovers actively anti-synergistic with wild cards, which might be a feature or a bug.**

### 4. Death — "Drawn or Revealed" Covers Which Events?

RULES.md says the game ends when "the Death card is drawn or revealed." CARDS.md says "when revealed (purchased, drawn to Display, or revealed during aging)."

What about:
- **Wheel of Fortune** draws from the Major deck — if Death is drawn this way, does the game end instantly mid-action?
- **Chariot** takes from the Display — if this causes a Display refill that reveals Death, does the game end?
- Death drawn during **setup** (dealt to a player as one of their 2 Major Arcana choices)?

**The engine ends the game whenever Death appears in the Display (including after refills), and when Death is purchased. Wheel of Fortune drawing Death is not currently handled — Death just goes into the player's hand. Is that correct?**

---

## Important — Affects Game Balance

### 5. Temperance/Faith/Hope/Prudence Protection — Scope

CARDS.md says Temperance: "Cups cards may not be moved from your Realm (Royal attacks on Cups in your Realm fail)."

Does protection also block:
- **Strength** moving a protected-suit card from your Realm? (Currently: no, Strength is not a Royal attack)
- **The Tower** destroying a card from your Tome? (Currently: Tower targets Tomes, not Realms, so protection is irrelevant — but worth confirming)
- A **Queen** moving a protected-suit card? Queens move to the *attacker's* Realm, which is a form of "moving from your Realm." (Currently: yes, Queens are Royal attacks and are blocked)

**Confirm: protection ONLY blocks Royal attacks (Page/Knight/Queen) on cards of the protected suit, and nothing else?**

### 6. Strength — Can You Target Your Own Realm/Tome?

CARDS.md says: "Move any player's face-up Major Arcana from any Realm or Tome (including your own) into YOUR Realm as a wild card."

The engine allows self-targeting. But this creates an odd interaction: you can use Strength to move your own Tome card to your Realm as a wild, which is essentially a free way to convert a Tome card into a Realm wild.

**Is self-targeting with Strength intentional?**

### 7. Pot Award When All Realms Are Empty

RULES.md says: "In the unusual case that all Realms are empty, the Pot is not awarded."

But what about partial emptiness? If only one player has Realm cards, they automatically win the pot. This can happen when Death is purchased early.

**Is "best poker hand wins pot" evaluated even if only one player has cards? (Currently: yes, one card beats no cards.)**

### 8. Celestial Win — "End of Any Round" vs Mid-Round

CARDS.md says celestial win triggers "at the end of any round." RULES.md says "a player ends a round with 3 or more Celestial cards."

Can a player win by celestial during the round, e.g., by using Chariot to steal a third Celestial mid-turn? Or does the check only happen at round-end?

**The engine checks at round-end only. Is that correct?**

### 9. Hermit — "Choose Any Cards" 

CARDS.md says: "On play: choose any cards in your Tome to take into your hand."

The engine moves **all** other Tome cards to hand. But "choose any" implies the player picks which ones — they might want to leave some.

**Should the Hermit's owner choose which Tome cards to take, or does the Hermit take all of them?**

### 10. Buying — Major Arcana in Payment

RULES.md says: "In some rare cases, some players may even want to spend a Royal card or a Major Arcana as part of a purchase. This is allowed, and in these cases, the value paid is equal to the number printed at the top of the Major Arcana card."

**The engine currently only allows Minor Arcana as payment. Should Major Arcana cards from hand be allowed as payment? If so, this is a missing feature.**

---

## Clarifications Needed — Edge Cases

### 11. Display Aging Direction

RULES.md says: "the card in slot 3 is placed face up on the Major Arcana Discard pile, the other 2 cards are each moved one place to the right, and a new card is turned up from the draw pile and placed in the leftmost slot."

But the Buy Phase describes prices as: Draw pile = 6, Display slots = 7, 8, 9, Discard = 10. "Cards from the Display cost 9, 8 and 7 respectively" — with slot descriptions of "leftmost position of the Display."

**Please confirm: the leftmost (cheapest, cost 7) slot is where new cards enter, and the rightmost (most expensive, cost 9) slot is where old cards age off? So cards get more expensive as they sit in the display longer?**

### 12. Ace Blocking a Wild Within a Set

CARDS.md says: "If an Ace blocks a wild card being played as part of a set into a Realm, the Minor Arcana cards in that set MUST still be played."

**Does this mean the Minor cards are played to the Realm even though the wild was blocked? So you could play 4 Cups + a Wild, the Wild gets Ace-blocked, and the 4 Cups still go to your Realm?**

The engine implements this. Just confirming.

### 13. Tome Card Displacement — Who Chooses?

RULES.md says when playing a 4th card to a Tome with 3 cards: "simply choose one of the original 3 cards and discard it into the Pit."

For **Plague** targeting an opponent's Tome: "Play into ANY player's Tome. If Tome is full, remove a card of your choice to Pit."

**Who chooses the displaced card when Plague fills an opponent's Tome — the Plague player or the Tome owner?** CARDS.md says "a card of your choice" which implies the Plague player chooses (the attacker). **The engine lets the Plague player choose. Correct?**

### 14. Tower — Which Card Is Destroyed?

CARDS.md says Tower: "Target a Major Arcana card in EVERY Tome that has MORE cards than yours. Discard those targeted cards to Pit."

**Does the Tower player choose which card in each qualifying Tome, or is it always the "top" card (last added)?** The engine removes the last card in each Tome. 

### 15. Bonus Evaluation Order

RULES.md says: "starting with the winning player, each player assesses any bonus cards."

**Does evaluation order matter? If Player A's Magician bonus depends on suit counts, and Player B's realm was just modified by round-end scoring (e.g., some Vault interaction), the order could affect results.**

Currently the engine evaluates all players' bonuses in player-index order, not starting from the pot winner. Does this matter?

### 16. Charity Variant — Scope

The Charity variant lets players who scored zero points carry one card into the next round. 

**Is this planned for the simulation? It could meaningfully affect balance since it gives losing players a small comeback mechanism. Currently not implemented.**

---

## Variants Not Currently Implemented

The following variants from RULES.md are not in the engine. Confirming which Danny wants simulated:

1. **Ace High variant** — Ace valued above King
2. **Two-Player variant** — Reduced deck, modified hand rankings  
3. **Extended Arcana variant** — Random subset of cards 0-26 for 2-5 player games
4. **Vault variant** — Winning Realm becomes Vault, persists between rounds, VP bonus at game end
5. **Charity variant** — Losing players carry one card into next round

**The Vault variant is partially implemented** (game-end scoring checks Vault, Celestial detection includes Vault), but the Vault itself is never populated during gameplay — no code moves a winning Realm into a Vault. Should this be fully implemented?

---

## Potential Balance Concerns from Simulation Data

These aren't rules questions, but observations from running 1000+ games that Danny might want to address:

- **CollectorAI wins 0.6% of games.** This suggests the "collect Major Arcana" strategy is fundamentally non-viable, or the AI is poorly implemented. Either way, it means the simulation data for cards that CollectorAI favors is polluted.

- **Position 3 (last to act) wins 27.4% vs Position 0 at 22.1%.** This is a 5+ percentage point gap. Is there a first-player compensation mechanism intended?

- **The Fool scores only 14-22% of the time** — the lowest of any bonus card. It requires an opponent to both have a bonus card AND meet that card's requirements, which is a double condition. Is this intentionally weak, or should the VP be higher to compensate?

- **Celestial wins occur in only 2-3% of games.** Is this the intended frequency, or should Celestials be more accessible?

- **The Empress has the lowest bonus hit rate** among the suit-counting cards (20% vs 30-39% for the others). CUPS may be inherently harder to accumulate. Intentional?
