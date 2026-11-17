import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.init();
window.__game = game;
import('./core/GameState.js').then((m) => { window.__gs = m.GameState; });
