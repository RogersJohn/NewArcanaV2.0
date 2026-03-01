# Rule Violations Found in Game Traces

Two single games were run with verbose logging. The following rule violations were identified by tracing each logged action against the rules in RULES.md and CARDS.md.

---

## VIOLATION 1: Draw Phase Draws Wrong Number of Cards

**Evidence (Game 1):**
```
--- Aggressor-2's turn (hand: 6, realm: 0) ---
Aggressor-2 drew 1 cards
```

Aggressor-2 starts with hand=6, realm=0. Handsize = 6+0 = 6. Limit = 6. Since handsize equals the limit, they should draw exactly 1. This is correct.

```
--- Builder-1's turn (hand: 6, realm: 0) ---
Builder-1 drew 1 cards
```
Same — correct.

But later:
```
--- Aggressor-2's turn (hand: 5, realm: 0) ---
Aggressor-2 drew 1 cards
```
Hand=5, realm=0. Handsize=5. Should draw up to 6, so draw 1. Correct.

```
--- Aggressor-2's turn (hand: 4, realm: 1) ---
Aggressor-2 drew 1 cards
```
Hand=4, realm=1. Handsize=5. Should draw 1 to reach 6. Correct.

```
--- Aggressor-2's turn (hand: 5, realm: 0) ---
Aggressor-2 drew 1 cards
```
Hand=5, realm=0. Handsize=5. Draw 1. Correct.

**Game 2, Round 2:**
```
--- Celestial-3's turn (hand: 7, realm: 0) ---
Celestial-3 drew 1 cards
```
Hand=7, realm=0. Handsize=7. Limit=6 (no Devil yet). Should draw exactly 1 (minimum). Correct.

```
--- Aggressor-2's turn (hand: 11, realm: 0) ---
Aggressor-2 drew 1 cards
```
Hand=11, realm=0. Handsize=11. WAY over limit. Should draw 1 (minimum). The draw is correct, but **WHY does Aggressor have 11 cards in hand?** This points to a discard phase failure (see Violation 3).

**Verdict: Draw phase logic itself is correct. But downstream issues with discard phase cause illegal hand sizes.**

---

## VIOLATION 2: Invalid Sets Played to Realm

**Evidence (Game 2, Round 1):**
```
Celestial-3 plays 4 of CUPS, 5 of CUPS, 6 of COINS, 7 of SWORDS, 8 of COINS to Realm
```

This is 5 cards: 4♣ 5♣ 6⬡ 7⚔ 8⬡. The ranks are 4,5,6,7,8 — consecutive. But the suits are CUPS, CUPS, COINS, SWORDS, COINS. This is a Straight (consecutive, mixed suits). That's a valid set. OK.

**But wait** — Celestial-3 had hand=6, realm=0 before drawing. After drawing 1 card, hand=7. Playing 5 cards leaves hand=2 and realm=5. Handsize = 2+5 = 7 > 6. The discard phase should fire to bring total to 6. Let me check if it does... no log line shows Celestial discarding. **Possible discard phase issue.**

Actually — looking at the log, the next line is:
```
Celestial-3 takes the Round-End Marker (5 cards in Realm)
```
No discard logged. But handsize is 2+5=7, which is over 6. The discard phase should have discarded 1 card from hand. This is a **discard phase bug** — it's not firing when it should.

Wait, let me re-read the code:

```js
// In discardPhase:
const totalSize = getHandSize(player);
if (totalSize > limit) {
  const numToDiscard = totalSize - limit;
  const handDiscard = Math.min(numToDiscard, player.hand.length);
```

So totalSize=7, limit=6, numToDiscard=1. Should discard 1 from hand. But there's no log for it. Two possibilities: (a) the discard happens but isn't logged, or (b) the discard isn't happening. Need to check.

Actually, re-reading the log more carefully, the next turn shows:
```
--- Builder-1's turn (hand: 4, realm: 2) ---
```
and later:
```
--- Celestial-3's turn (hand: 3, realm: 2) ---
```
Celestial went from hand=2+realm=5=7 to hand=3+realm=2=5. Wait — realm went from 5 to 2? Something happened between those turns. Looking... there are intervening turns where Aggressor's Knight stole a card. But realm going from 5 to 2 means 3 cards were removed. Only one attack is logged between those points. This doesn't add up.

Oh wait — that's a different round. The round ended because the marker fired. After round end, realms are cleared and new cards dealt. That explains the reset.

Let me look more carefully at the discard within a round. **The log doesn't show discard actions for most turns.** Either discards are silent, or they're not happening.

Looking at the code — discards are logged:
```js
log(state, `${player.name} discards ${cardName(card)} from hand`);
```
But only if `handDiscard > 0`. So if the total is exactly at the limit, nothing is logged. If it's over, something should be logged. The fact that there's no log when Celestial has 7 cards (2 hand + 5 realm) is suspicious.

**ACTUALLY** — I just re-read the code more carefully:

```js
function discardPhase(state, playerIndex, ai) {
  const player = state.players[playerIndex];
  const limit = getEffectiveHandLimit(player);

  // First handle realm overflow (> 5 cards)
  while (player.realm.length > 5) { ... }

  // Then handle hand overflow
  const totalSize = getHandSize(player);
  if (totalSize > limit) {
    const numToDiscard = totalSize - limit;
    const handDiscard = Math.min(numToDiscard, player.hand.length);
    if (handDiscard > 0) {
      const indices = ai.chooseDiscard(state, playerIndex, handDiscard);
```

There's the bug. `chooseDiscard` returns indices sorted descending (from many AI implementations), but the code then does:
```js
for (const idx of indices) {
  if (idx >= 0 && idx < player.hand.length) {
```

If the AI returns indices that become invalid after earlier splices (because splicing shifts array indices), cards won't be removed. But the indices are sorted descending specifically to avoid this... Let me check the actual discard execution code:

Looking at engine.js lines 270-280, the truncated section. I can't see the full discard logic. Let me check.

**Verdict: Likely discard phase bug where cards aren't being removed, leading to ballooning hand sizes. This needs investigation.**

---

## VIOLATION 3: Aggressor Has 11 Cards in Hand

**Evidence (Game 2, Round 2):**
```
--- Aggressor-2's turn (hand: 11, realm: 0) ---
Aggressor-2 drew 1 cards
```

11 cards in hand with 0 in realm = handsize 11. The max should be 6 (or 7 with Devil). Aggressor doesn't have Devil. This is a clear rule violation. The discard phase after Aggressor's previous turns didn't bring the hand down to 6.

**Verdict: CRITICAL BUG. Discard phase is not enforcing hand size limits.**

---

## VIOLATION 4: Playing 5 Cards That Don't Form a Valid Set

**Evidence (Game 2, Round 2):**
```
Builder-1 plays 7 of WANDS, 9 of WANDS, KNIGHT of WANDS, 8 of WANDS, ACE of WANDS to Realm
```

Cards: 7♠, 9♠, Knight(12)♠, 8♠, Ace(1)♠. All WANDS. Ranks: 1, 7, 8, 9, 12. 
- Not consecutive (1,7,8,9,12 has gaps), so not a Straight or Straight Flush
- All same suit (WANDS), so this IS a Flush

Actually, this is a valid Flush — 5 cards of the same suit that are not consecutive. So this is legal, assuming Flush detection works. But wait — Fix #2 says Flush detection is MISSING. So how did this play happen?

Looking at the action generation... Singles, Pairs, Straights are generated. Flushes ARE NOT generated. So this play should be impossible under the current code.

Unless... the AI played these as 5 individual singles across multiple turns? No — the log shows all 5 in one action. 

Let me check if there's some other code path that allows this. Looking at `addSetActions` — it generates singles, pairs, trips, quads, straights, and straight flushes. No flushes. But the action says "plays" all 5 at once.

**Wait** — could the AI be playing them as a wild card action with companions? No, these are all minor cards with no Major.

Actually, I think I need to look at this differently. The `addSetActions` does find straights. Let me recheck: 7, 8, 9, 12 — no. 1, 7, 8, 9, 12 — no. These are NOT consecutive. And they're all the same suit so findStraights would find them IF they were consecutive, and label them as Straight Flush. They're not consecutive, so findStraights wouldn't find them.

So how were they played? The only remaining possibility: they were each played as individual singles across separate turns, and the log is displaying them together. But the log format shows "plays X, Y, Z to Realm" as one action.

**Or** — looking at the code — maybe there's a bug where the action generation IS creating flush-like actions through some path I'm not seeing. Need to verify by adding a log of the action type when it's executed.

**Verdict: Either Flush detection IS present through some code path I'm not tracing, or there's a bug allowing invalid multi-card plays.**

---

## VIOLATION 5: Celestial-3 Plays a Non-Set of 5 Cards

**Evidence (Game 2, Round 5):**
```
Celestial-3 plays 6 of SWORDS, 7 of CUPS, 8 of CUPS, 9 of COINS, 10 of WANDS to Realm
```

Ranks: 6, 7, 8, 9, 10 — consecutive. Suits: SWORDS, CUPS, CUPS, COINS, WANDS — mixed. This IS a valid Straight (5 consecutive, mixed suits). Legal.

**Verdict: This one is actually correct.**

---

## VIOLATION 6: Buying After Death Is Revealed

**Evidence (Game 2, Round 5):**
```
Death revealed in display! Game ends!
Aggressor-2 buys The Hermit (9) from display0
```

Death was revealed during display aging/refill. The game should end IMMEDIATELY. No further actions should occur. But Aggressor-2 then buys a card. This is a rule violation — Death means immediate game end.

Looking at the code: `checkDeathInDisplay` sets `state.gameEnded = true`. But the buy action logged AFTER seems to be from a different code path. This might be a logging order issue rather than an actual action after game end, but it needs investigation.

**Verdict: Possible game-end timing bug. Actions may execute after Death is revealed.**

---

## VIOLATION 7: Round-End Scoring With No Pot Award When Marker Exists

Need to verify: when the round-end marker holder triggers round end, does the pot always get awarded? Looking at game 1:

```
Builder-1 starts turn with 5+ realm cards and marker. Round ends!
--- Round 1 End ---
Controller-4 wins pot of 4vp with Two Pair
```

Builder-1 has the marker and 5+ cards, so round ends. But Controller-4 wins the pot, not Builder-1. That's correct — the pot goes to the BEST hand, not the marker holder. Builder-1 triggered the end, but Controller-4 had a better hand.

**Verdict: Correct behavior.**

---

## VIOLATION 8: Ace Blocking Without Clear Target

**Evidence (Game 1):**
```
--- Celestial-3's turn (hand: 6, realm: 0) ---
Celestial-3 drew 1 cards
Aggressor-2 blocks with ACE of COINS!
```

What did Aggressor-2 block? The log doesn't say what Celestial-3 was trying to do. The Ace block fires, but the action being blocked is invisible. This is a logging gap, not necessarily a rule violation, but it makes it impossible to verify that the Ace is blocking something legal.

Aces can block: Royal actions, Major Arcana actions from hand, Major Arcana being played to Realm/Tome, or another Ace. If Celestial-3 was just drawing a card or playing minors to realm, the Ace block would be invalid.

**Verdict: Logging gap. Cannot verify Ace blocking correctness from the logs.**

---

## VIOLATION 9: Hand Sizes Don't Add Up Between Turns

**Evidence (Game 2, Round 5):**
```
--- Aggressor-2's turn (hand: 12, realm: 0) ---
Aggressor-2 drew 1 cards
Aggressor-2 moves Temperance (14) to Realm as wild via Strength
```

After drawing: hand=13. After Strength (plays from hand, Temperance moves to realm): hand=12, realm=1? No — Strength says "Move any player's face-up Major Arcana from any Realm or Tome into YOUR Realm." So the Strength card itself goes to Pit, and the target (Temperance from someone's Tome) goes to Aggressor's Realm. That means Aggressor used Strength from hand (hand goes from 13 to 12), Temperance comes from some opponent's Tome to Aggressor's Realm (realm goes from 0 to 1). Handsize = 12+1 = 13.

After discard phase, handsize should be 6. Next turn:
```
--- Aggressor-2's turn (hand: 5, realm: 1) ---
Aggressor-2 drew 1 cards
```

Hand went from 12 to 5 — that's discarding 7 cards. With realm=1, total was 13, discarded 7 to reach 6 total (5+1). That's correct.

But how did hand get to 12 in the first place? Tracking backwards, at the start of Round 5 Aggressor should have 6 cards from the deal. Where did the extra 6 come from?

Looking at Round 4: Aggressor's hand isn't tracked between Round 4 end and Round 5 start. Between rounds, Realms are cleared and 6 new cards are dealt. If Aggressor had cards in hand at end of Round 4 that weren't discarded (because discard only fires during a turn, not between rounds), those would carry over plus the 6 new cards.

**Checking the rules:** "Gather up all Realm cards, the Minor Arcana draw pile, discard pile and the Pit, and shuffle well." It says Realm cards are gathered. It does NOT say hand cards are gathered. Players keep their hand cards between rounds?

Re-reading setup rules: "deal 6 cards to each player from this deck" for subsequent rounds. It doesn't say "discard your hand first." So yes — **players keep their existing hand cards and receive 6 MORE**.

But that means if you had 5 cards in hand at end of round, you'd start next round with 11. Then draw phase would draw 1 (minimum, since 11 > 6). Then discard phase would discard 6 to get back to 6 total. You'd burn through your hand over time.

This is actually how the rules work. The "Aggressor has 11 cards" is not a bug — it's correct if the player had 5 in hand at end of round and received 6 more.

**WAIT.** Re-read the rules more carefully. After round end: "Gather up all Realm cards, the Minor Arcana draw pile, discard pile and the Pit, and shuffle well with the deal passing to the left." Then: "Now deal 6 cards to each player from this deck."

The key question: are hand cards gathered up? The rules only mention "Realm cards." This means hand cards persist. So having 11+ cards at round start is rules-legal.

But then the Discard Phase should trim it down immediately. And looking at Round 5, Aggressor's hand does go from 12 to 5 after their first turn. So the discard IS working... sometimes.

**Revised Verdict: Hand accumulation between rounds is rules-legal. But earlier instances of 11 cards mid-round (Violation 3) still need explaining — was that also round-boundary accumulation?**

Yes, looking at Game 2 Round 2: Aggressor enters with hand=11. This is plausible if at end of Round 1 Aggressor had 5 in hand (didn't play much), then received 6 more = 11. And the draw phase draws 1 more = 12. Then they should discard down to 6. Looking at the log... after Aggressor's first Round 2 turn (drew 1, attacked with Page), next appearance:

```
--- Aggressor-2's turn (hand: 4, realm: 2) ---
```

11 → drew 1 → 12 → played Page attack → 11 → discard to 6... but showing hand=4 realm=2 = total 6. Wait, that's a DIFFERENT turn later. Need to trace more carefully. The log interleaves all players.

**This is getting complex. The fundamental question is: does the discard phase reliably fire and reduce to the limit?**

---

## VIOLATION 10: Display Refill Direction May Be Wrong

**Rules say:** "slide any cards left-to-right into the empty spaces, as indicated by the arrows, then refill the Display by turning the topmost card from the draw pile face-up into the first display slot."

The code in `refillDisplay`:
```js
export function refillDisplay(state, takenSlot) {
  for (let i = takenSlot; i > 0; i--) {
    state.display[i] = state.display[i - 1];
  }
  state.display[0] = drawMajorCard(state);
}
```

If slot 1 is taken: display[1] = display[0], display[0] = new card. That shifts left cards rightward. This is correct — cards slide right, new card fills leftmost.

If slot 0 is taken: no shift happens (loop doesn't execute), display[0] = new card. Correct — just refill the leftmost.

If slot 2 is taken: display[2] = display[1], display[1] = display[0], display[0] = new card. All shift right. Correct.

**Verdict: Refill logic is correct.**

---

## Summary of Confirmed/Suspected Issues

| # | Issue | Severity | Confirmed? |
|---|-------|----------|------------|
| 1 | Draw phase draws correct count | N/A | Confirmed correct |
| 2 | Invalid 5-card set played (possible Flush?) | High | Needs code investigation |
| 3 | Hand sizes >6 mid-round | Medium | Likely rules-legal (round boundary) |
| 4 | Action after Death revealed | High | Needs code investigation |
| 5 | Ace blocks logged without showing what's blocked | Medium | Logging gap |
| 6 | Discard phase may not fire consistently | High | Needs code investigation |
| 7 | Display refill | N/A | Confirmed correct |
| 8 | Pot awarded to best hand, not marker holder | N/A | Confirmed correct |

**The three items needing code-level investigation are: (a) how 5 cards of the same suit get played as one action without Flush detection, (b) whether actions continue after Death is revealed, and (c) whether the discard phase reliably enforces hand limits.**
