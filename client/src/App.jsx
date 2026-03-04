import React from 'react';
import { useGameController } from './hooks/useGameController.js';
import StartScreen from './components/StartScreen.jsx';
import GameScreen from './components/GameScreen.jsx';
import GameOverScreen from './components/GameOverScreen.jsx';

export default function App() {
  const controller = useGameController();

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
