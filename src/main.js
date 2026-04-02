import "./style.scss";
import { Game } from "./game.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("App root was not found.");
}

const game = new Game(root);
game.mount();
