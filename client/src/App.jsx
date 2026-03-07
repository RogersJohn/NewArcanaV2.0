import React, { useEffect } from 'react';
import { useGameController } from './hooks/useGameController.js';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import GameOverScreen from './components/GameOverScreen.jsx';

export default function App() {
  const controller = useGameController();

  useEffect(() => {
    document.title = controller.phase === 'playing'
      ? 'New Arcana \u2014 Playing'
      : 'New Arcana';
  }, [controller.phase]);

  switch (controller.phase) {
    case 'start':
      return <StartScreen onStart={controller.startGame} />;
    case 'playing':
      return <GameScreen controller={controller} />;
    case 'gameover':
      return <GameOverScreen
        gameState={controller.gameState}
        onPlayAgain={controller.resetGame}
      />;
    default:
      return <div>Unknown phase: {controller.phase}</div>;
  }
}
