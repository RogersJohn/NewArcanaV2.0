import React from 'react';
import GameHeader from './GameHeader.jsx';
import GameLog from './GameLog.jsx';
import OpponentSummary from './OpponentSummary.jsx';
import MajorDisplay from './MajorDisplay.jsx';
import ActionPanel from './ActionPanel.jsx';
import PlayerRealm from './PlayerRealm.jsx';
import PlayerTome from './PlayerTome.jsx';
import PlayerHand from './PlayerHand.jsx';
import RoundTransition from './RoundTransition.jsx';
import AIThinkingIndicator from './AIThinkingIndicator.jsx';

export default function GameScreen({ controller }) {
  const {
    gameState,
    decision,
    isAIThinking,
    submitDecision,
    aiDelay,
    setAiDelay,
    fastForward,
    toggleFastForward,
    roundTransition,
    dismissRoundTransition,
  } = controller;

  if (!gameState) return <div className="loading">Loading...</div>;

  const humanPlayer = gameState.players[0];
  const opponents = gameState.players.slice(1).map((p, i) => ({ ...p, index: i + 1 }));

  return (
    <div className="game-screen">
      <div className="game-main">
        <GameHeader
          roundNumber={gameState.roundNumber}
          pot={gameState.pot}
          minorDeckCount={gameState.minorDeckCount}
          majorDeckCount={gameState.majorDeckCount}
          pitCount={gameState.pitCount}
          aiDelay={aiDelay}
          setAiDelay={setAiDelay}
          fastForward={fastForward}
          toggleFastForward={toggleFastForward}
        />

        <div className="opponent-row">
          {opponents.map(opp => (
            <OpponentSummary key={opp.index} player={opp} />
          ))}
        </div>

        <div className="middle-row">
          <MajorDisplay display={gameState.display} majorDeckCount={gameState.majorDeckCount} />

          <div className="action-area">
            {isAIThinking && decision ? (
              <AIThinkingIndicator decision={decision} players={gameState.players} />
            ) : decision && !isAIThinking ? (
              <ActionPanel
                decision={decision}
                gameState={gameState}
                onSubmit={submitDecision}
              />
            ) : null}
          </div>
        </div>

        <div className="player-area">
          <PlayerRealm cards={humanPlayer.realm} />
          <PlayerTome cards={humanPlayer.tome} />
          <div className="player-info">
            <div className="player-vp">{humanPlayer.vp} VP</div>
            {humanPlayer.hasRoundEndMarker && (
              <div className="round-marker">Round End Marker</div>
            )}
          </div>
        </div>

        <PlayerHand
          cards={humanPlayer.hand}
          decision={!isAIThinking ? decision : null}
          onSubmit={submitDecision}
        />
      </div>

      <GameLog entries={gameState.log} />

      {roundTransition && (
        <RoundTransition
          transition={roundTransition}
          onDismiss={dismissRoundTransition}
        />
      )}
    </div>
  );
}
