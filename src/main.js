import { Game } from './core/Game.js';
import { GameState } from './core/GameState.js';

const game = new Game(document.getElementById('app'));
game.init();
// handles for the console and for stepped-frame checks
window.__game = game;
window.__gs = GameState;
