# Questions for Danny — New Arcana Rules Clarifications

**From**: John (via Claude, architect/tech lead)
**Date**: 2026-03-05
**Context**: During automated testing of the game engine and manual playtesting of the browser client, we've found several places where the rules are ambiguous, silent on edge cases, or where CARDS.md and RULES.md could be read in conflicting ways. We need your rulings on these to make sure the engine matches your intent.

---

## 1. Are hands gathered between rounds? (CRITICAL)

Round End step 5 says: *"Gather up all Realm cards, the Minor Arcana draw pile, discard pile and the Pit, and shuffle well."* Step 7 says: *"Now deal 6 cards to each player from this deck."*

**Hands are not mentioned in the gather step.** The engine currently does NOT gather hands, so players carry their remaining hand cards into the next round and then receive 6 more on top. This means players routinely start Round 2 with 10-13 cards in hand — dramatically more than the intended limit of 6.

We believe hands should be gathered too. Supporting evidence: the Charity variant (p.15) says players who scored no points may *"carry one card from their hand into the next round"* — which only makes sense as a special exception if hands are normally gathered.

**Question**: Should players' hands be gathered along with everything else at step 5, so everyone starts each new round with exactly 6 fresh cards? Or do players intentionally keep their hands?

---

## 2. Play OR Buy — truly mutually exclusive?

The Turn Structure says: *"2. Buy or Play (both are optional)"*

The Buy Phase opens with: *"Instead of playing cards you may wish to purchase one Major Arcana card."*

The word "instead" and the "or" both suggest Buy and Play are mutually exclusive — you do one or the other, not both.

**Question**: Can a player both play a set/action AND buy a Major Arcana in the same turn? Or is it strictly one or the other? (The engine currently enforces one action per turn — play or buy or pass.)

---

## 3. What happens when two players tie for best Realm at round end?

Round End step 2 says the player with the highest ranking poker combination wins the pot. But there is no rule for what happens when two players have the same hand rank (e.g., both have a pair of 7s with the same kicker situation).

**Question**: If two or more Realms tie for best poker hand, is the pot split? Does it carry over? Is there a tiebreaker (e.g., player closest to the dealer's left)?

---

## 4. Can you Ace-block your own action?

The rules say Aces may be played *"at any time during a round, even out of turn"* and that *"a player with an Ace can affect a conflict between two other players."*

But the rules never explicitly say you CANNOT block your own play. In a real game, a player might want to block their own Tome play if, upon reflection, they realise it was a mistake, or to deny an opponent's Ace-block opportunity.

**Question**: Can the player who is performing an action also Ace-block their own action? (The engine currently excludes the acting player from Ace blocking.)

---

## 5. Who chooses the Tome discard when Plague fills an opponent's Tome?

Plague says: *"Play into ANY player's Tome. If Tome is full, remove a card of your choice to Pit."*

The phrase *"your choice"* is ambiguous. Does "your" refer to the Plague player (the attacker), or the player whose Tome is full (the target)?

**Question**: When Plague targets a player with a full Tome, who chooses which existing Tome card is discarded — the attacker or the target? (The engine currently has the attacker choose, but due to a bug it was actually looking at the wrong player's Tome regardless.)

---

## 6. Can Plague target yourself?

CARDS.md says Plague can be played into *"ANY player's Tome."* The word "any" includes yourself. There could be a strategic reason to do this — for instance, to displace a weak Tome card with Plague (which you'd then try to remove later), or as a deliberate sacrifice.

**Question**: Can you play Plague into your own Tome? (The engine currently allows this.)

---

## 7. Page and Knight can target your own Realm — is this intentional?

RULES.md says the Page *"may attack a card of the same suit in any Realm"* and the Knight *"may attack a card of the same suit in any Realm."* The Queen is explicitly restricted to *"an opponent's Realm."*

The Page and Knight both say "any Realm" without the opponent restriction. This means you can Page-destroy your own realm card or Knight-steal your own realm card into your hand.

**Question**: Is self-targeting intentional for Page and Knight? There are strategic reasons it might be (e.g., using a Knight to rescue a card from your realm back to hand to prevent an opponent stealing it with a Queen), but wanted to confirm this was a design choice and not an oversight given the Queen's restriction.

---

## 8. Wheel of Fortune — can you take two cards from the same source?

CARDS.md says: *"Take two cards from Major Arcana Draw pile, Discard pile, or Display (any combination)."*

"Any combination" could mean two from the draw pile, or one from draw and one from display, etc.

**Question**: Can you take both cards from the same source (e.g., two from the draw pile)? And for the Display, can you take from two different display slots? (The engine currently allows any combination including same source.)

---

## 9. When an Ace blocks a Wild card with accompanying Minor Arcana, do the minors still go to Realm?

RULES.md says: *"If the wild card is blocked it is placed in the Pit along with the Ace that blocked it. Any Minor Arcana cards being played with the wild card when it is blocked are still placed in your Realm."*

CARDS.md (Ace section, point 3) says Aces can block *"A Major Arcana card being played into a Realm or Tome"*.

The rules are clear that the Wild goes to Pit but Minors continue to Realm. But this creates an odd situation: you might play a Wild + 4 Minors intending a flush, the Wild gets blocked, and now 4 off-suit Minors land in your Realm as junk.

**Question**: This is implemented as written, but wanted to confirm — is the intent that the player is committed to the Minor cards once announced, even if the Wild is blocked? Or should the player get a chance to retract the Minors?

---

## 10. Celestial win — at the end of "any round" or also mid-round?

The Overview says: *"if you possess any three of the powerful Celestial cards at the end of any round, you are granted immediate victory."*

CARDS.md says: *"3+ Celestials in Vault/Realm/Tome = YOU WIN"* (under Round End).

**Question**: Can a Celestial win only be checked at round-end scoring? Or if someone acquires their 3rd Celestial mid-round (e.g., via Chariot or Hanged Man on their turn), do they win immediately? (The engine currently only checks at round-end.)

---

## 11. Strength: can it target your own Tome/Realm?

CARDS.md says: *"Move any player's face-up Major Arcana from any Realm or Tome (including your own) into YOUR Realm as a wild card."*

This is clear — you can target yourself. But the implication is that you could use Strength to move a Major Arcana from your own Tome to your own Realm as a wild card, effectively converting a Tome card into a Realm wild. This loses the Tome benefits but gains Realm presence.

**Question**: Just confirming this interaction is intended, since it means a player could voluntarily strip their own Tome to get a wild card.

---

## 12. Display refill and Death — exact timing

When a card is taken from the Display (via Buy or Chariot), the Display refills by sliding cards right and drawing a new card to slot 1. If Death is drawn to the Display during this refill, the game ends immediately.

**Question**: If Death appears during a mid-turn refill (e.g., someone buys from Display slot 2), does the current player's turn end immediately? Or do they complete their action first and then the game ends? (The engine currently ends the game immediately upon Death appearing, before the buy action fully resolves.)

---

## 13. Pot calculation for subsequent rounds

Round End step 6 says: *"Place into the pot a number of victory points from the supply equal to the last round's points plus 1."*

With 4 players: Round 1 pot = 4 (1 per player). For Round 2, is "last round's points" 4 (the initial pot), meaning Round 2 adds 5? Then Round 3 adds 6?

Or is "last round's points" the amount ADDED last time? In that case: Round 1 we added 4, so Round 2 we add 5. Round 2 we added 5, so Round 3 we add 6.

Both interpretations give the same arithmetic for the first few rounds, but they diverge if a pot carries over without being won (the unclaimed pot remains, and the new pot amount is added on top).

**Question**: Is the pot growth sequence 4, 5, 6, 7... (adding 1 more each round regardless of carry-over), or is it based on the total pot from last round? If the pot carries over because nobody had 5 cards in realm, does the next round add based on the carried total or just the last increment?

---

## 14. Hierophant: does it trigger on Game End bonuses too?

CARDS.md says: *"Bonus cards in your Tome score 1vp when NOT eligible to score. During round end, if a Round-End Bonus card in your Tome fails its requirements (including having 0 realm cards), it scores 1vp anyway. Does NOT trigger between rounds."*

The final sentence says it doesn't trigger "between rounds" — but what about at Game End? Game-End scoring includes both round-end bonuses (step 2) and game-end bonuses (step 3). Does the Hierophant apply its consolation 1vp to failed bonuses during Game-End scoring?

**Question**: At final game-end scoring, does the Hierophant still give 1vp for failed round-end bonuses? What about failed game-end bonuses (e.g., Celestial cards worth 2vp each — if you have 0 Celestials and the Hierophant, do you get 1vp)?

---

## 15. Judgement: what if no one has cards in Realm?

CARDS.md says: *"Take possession of the Round-End Marker. Round ends immediately and is scored. If no cards in any Realm, pot carries over."*

**Question**: If Judgement is played and no player has any cards in their Realm, the pot carries over. But do bonus cards still trigger? The general rule says "bonus cards only trigger if you have at least 1 card in your Realm" — so presumably no bonuses fire either. Just confirming: Judgement with all empty Realms means zero scoring of any kind, and the pot simply grows for the next round?

---

## 16. Minor Arcana in Tome — is this possible?

The Discard Phase says: *"Note that cards are discarded to the Minor Discard Pile even if discarding a Major Arcana card."* This implies Major Arcana can end up in unexpected places.

The rules generally discuss Tomes as holding Major Arcana, but no rule explicitly prohibits Minor Arcana from being in a Tome. If a future card effect moved a Minor to a Tome, the rules would be silent on how to handle it.

**Question**: Is it safe to assume that Tomes can ONLY contain Major Arcana? No current mechanism puts a Minor in a Tome, but should we enforce this as an invariant in the engine?

---

*End of questions. These are ordered roughly by impact on the engine — the hand-gathering question (#1) is by far the most critical as it affects every simulation result produced so far.*
