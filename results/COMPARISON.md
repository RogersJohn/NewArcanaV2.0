# Simulation Comparison Report

100 games per configuration, 4 players each. All runs completed with 0 errors.

## Summary Table

| Configuration | Avg Rounds | Avg Winner VP | Celestial Wins | Most Purchased Card |
|---------------|-----------|---------------|----------------|---------------------|
| **Diverse (4p)** | 6.5 | 20.16 | 7.0% | The Star (17) — 68 |
| **All-Builder** | 5.6 | 16.00 | 0.0% | The Tower (16) — 50 |
| **All-Aggressor** | 1.3 | 1.62 | 0.0% | The Lovers (6) — 74 |
| **All-Celestial** | 3.5 | 11.15 | 3.0% | The World (21) — 69 |
| **All-Controller** | 9.8 | 38.72 | 0.0% | Temperance (14) — 42 |
| **All-Opportunist** | 12.1 | 45.02 | 3.0% | The Moon (18) — 39 |
| **Random Mix** | 5.3 | 16.66 | 7.0% | The Star (17) — 65 |

## Anomaly Flags

### CRITICAL: All-Aggressor — Games ending in 1 round

- **Avg game length: 1.3 rounds** (median 1). 80% of games end with Death revealed in round 1.
- **Avg VP: 0.48** across all players, winner VP median is **0**. Most winners win with 0 VP (tiebreak).
- **Position 0 wins 63%** of games. Massive first-player advantage because Aggressors attack instead of building, nobody reaches 5 realm cards, and Death surfaces quickly from display aging.
- **0 wild card plays** across all 100 games. Aggressors never play cards to realm as wilds.
- **Root cause**: Aggressor AI prioritizes attacks and buying over realm building. With 4 Aggressors attacking each other, nobody accumulates VP. Games end almost immediately from Death.

### WARNING: All-Opportunist — Winner VP over 30

- **Avg winner VP: 45.02**, far above the 30 threshold.
- **Avg game length: 12.1 rounds** (median 12). Games go very long because Opportunists are balanced — they build effectively but also disrupt.
- **1.72 wild plays per game** for The World (21) alone. Opportunists use wild cards heavily (1,904 total wild plays across 100 games).
- Very few cards purchased (0 purchases for action cards like Chariot, Tower, Hanged Man). Opportunists value wild play and realm building over buying action cards.

### WARNING: All-Controller — Winner VP over 30

- **Avg winner VP: 38.72** (median 41), above the 30 threshold.
- **Avg game length: 9.8 rounds** (median 11). Long games because Controllers are defensive — they protect their realms and don't attack.
- **The Devil (15) in 31% of winning tomes** — Controllers prioritize Devil for the hand-size-7 advantage.
- **The Fool bonus rate: 70.6%** — unusually high. In long games with consistent hands, the Fool's "copy best opponent bonus" fires reliably.
- **0 wild card plays**. Controllers never play Majors as wilds (they avoid vulnerability).

### NOTE: All-Builder — No Tome usage

- **0 cards in winning tomes** across all 100 games. Builders never play Major Arcana to Tome — they only buy them and use some as wilds (135 total wild plays).
- **63% of games end via Death purchased** (not revealed). Builders buy from the draw pile aggressively, hitting Death.
- Avg winner VP: 16.00, reasonable for a pure hand-building strategy.

### NOTE: All-Celestial — Low Celestial win rate

- **Only 3% Celestial wins** despite all 4 players pursuing Celestials. When everyone competes for the same 4 Celestial cards, nobody accumulates 3.
- **Chariot used 0.95 times per game** — constant stealing of Celestials between players.
- Avg game length: 3.5 rounds. Shorter games because the rush for Celestials means less realm building.

## Cross-Configuration Patterns

### Game Length Drives VP
| Avg Rounds | Avg Winner VP | Config |
|-----------|---------------|--------|
| 1.3 | 1.62 | All-Aggressor |
| 3.5 | 11.15 | All-Celestial |
| 5.3 | 16.66 | Random Mix |
| 5.6 | 16.00 | All-Builder |
| 6.5 | 20.16 | Diverse |
| 9.8 | 38.72 | All-Controller |
| 12.1 | 45.02 | All-Opportunist |

Strong linear correlation: ~3.5 VP per additional round.

### Most Purchased Cards Reflect Strategy
- **Aggressor**: Buys everything indiscriminately (highest total purchases per card, 50-74 each)
- **Builder**: Buys action cards most (Tower, Wheel, Strength) — likely for payment value not usage
- **Celestial**: Buys Celestials + protection cards
- **Controller**: Buys protection (Temperance 42, Devil 38, Tower 29)
- **Opportunist**: Barely buys anything (0-39 per card) — prefers wild plays over purchases

### Wild Card Usage
| Config | Total Wild Plays | Strategy |
|--------|-----------------|----------|
| All-Aggressor | 0 | Never builds realm with wilds |
| All-Celestial | 0 | Plays Majors to Tome only |
| All-Controller | 0 | Avoids wild vulnerability |
| All-Builder | 135 | Moderate — supplements hands |
| Diverse | ~2,100 est. | Mixed strategies |
| Random Mix | 335 | Mixed strategies |
| All-Opportunist | 1,904 | Extremely heavy wild usage |

### Position Advantage
| Config | Pos 0 | Pos 1 | Pos 2 | Pos 3 | Balanced? |
|--------|-------|-------|-------|-------|-----------|
| Diverse | 13% | 29% | 31% | 27% | Slightly off |
| All-Aggressor | **63%** | 12% | 12% | 13% | **Severely broken** |
| All-Celestial | 19% | 19% | 26% | 36% | Slightly off |
| All-Controller | 32% | 24% | 24% | 20% | Minor |
| All-Opportunist | 30% | 29% | 21% | 20% | Minor |
| Random Mix | 24% | 24% | 29% | 23% | Good |

All-Aggressor has a critical position imbalance. In 1-round games, the first player to act has an outsized advantage.
