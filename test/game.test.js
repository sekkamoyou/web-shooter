import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector3 } from "three";
import { TargetManager } from "../src/targets.js";
import { Weapon } from "../src/weapon.js";
import { Player } from "../src/player.js";
import { Game } from "../src/game.js";
import { tileBoxUV } from "../src/arena.js";

function targetScene() {
  const scene = new Scene();
  const manager = new TargetManager(scene, 22, 6);
  manager.reset(new Vector3(0, 1.7, 14), new Vector3(0, 0, -1));
  manager.targets.forEach((target, i) => target.group.position.set(i * 3, 0, -8));
  scene.updateMatrixWorld(true);
  return { scene, manager };
}

test("visual additions never expand target hitboxes; cover blocks hits without points", () => {
  const { scene, manager } = targetScene();
  const ray = new Raycaster(new Vector3(0, 1.1, 0), new Vector3(0, 0, -1));
  const decoration = new Mesh(new BoxGeometry(10, 10, 1), new MeshBasicMaterial());
  manager.targets[0].group.add(decoration);
  scene.updateMatrixWorld(true);
  const outside = new Raycaster(new Vector3(-2, 1.1, 0), new Vector3(0, 0, -1));
  assert.equal(manager.handleShot(outside), null);
  const cover = new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial({ visible: false }));
  cover.position.set(0, 2, -4);
  cover.userData.surface = "metal";
  scene.add(cover);
  manager.setObstacles([cover]);
  scene.updateMatrixWorld(true);
  const blocked = manager.handleShot(ray);
  assert.equal(blocked.points, 0);
  assert.equal(blocked.surface, "metal");
  assert.equal(manager.targets.length, 6);
  manager.setObstacles([]);
  const material = manager.targetMaterial;
  let disposed = false;
  material.addEventListener("dispose", () => { disposed = true; });
  assert.equal(manager.handleShot(ray).points, 100);
  assert.equal(manager.targets.length, 5);
  assert.equal(disposed, false);
  manager.update(0.35, new Vector3(0, 1.7, 14), new Vector3(0, 0, -1), true);
  assert.equal(manager.targets.length, 6);
});

test("30 rounds, cooldown and manual/automatic reload retain original rules", () => {
  const weapon = new Weapon();
  assert.equal(weapon.requestReload(), false);
  for (let i = 0; i < 30; i += 1) {
    const shot = weapon.shoot();
    assert.equal(shot.fired, true);
    assert.equal(shot.autoReloaded, i === 29);
    assert.equal(weapon.shoot().fired, false);
    if (i < 29) weapon.update(0.12);
  }
  assert.equal(weapon.ammo, 0);
  assert.equal(weapon.requestReload(), false);
  weapon.update(1.39);
  assert.equal(weapon.canShoot(), false);
  weapon.update(0.02);
  assert.equal(weapon.ammo, 30);
  weapon.shoot(); weapon.update(0.12);
  assert.equal(weapon.requestReload(), true);
  weapon.update(1.4);
  assert.equal(weapon.ammo, 30);
});

test("player collider remains independent of scenery and jump/arena limits hold", () => {
  const player = new Player(new PerspectiveCamera(), 22);
  const cover = new Mesh(new BoxGeometry(4, 6, 4));
  cover.position.set(0, 3, 0);
  player.setObstacles([cover]);
  assert.equal(player.isBlocked(2.4, 0), true);
  assert.equal(player.isBlocked(2.5, 0), false);
  player.reset();
  player.tryMoveTo(100, 100);
  assert.equal(player.camera.position.x, 22);
  assert.equal(player.camera.position.z, 22);
  assert.equal(player.jump(), true);
  assert.equal(player.jump(), false);
  for (let i = 0; i < 100; i += 1) player.update(0.02);
  assert.equal(player.isOnGround(), true);
  assert.equal(player.camera.position.y, 1.7);
});

test("metre-based material UVs keep scale across random obstacle sizes", () => {
  for (const width of [2.8, 5.6]) {
    const geometry = tileBoxUV(new BoxGeometry(width, 4, 3), 2);
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) {
      assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)));
      if (geometry.attributes.normal.getZ(i) === 1) assert.equal(uv.getX(i), positions.getX(i) / 2);
    }
  }
});

test("visual loading shares in-flight work, fails recoverably, retries before enabling start", async () => {
  const game = Object.create(Game.prototype);
  const states = [];
  let loads = 0;
  let release;
  game.arena = { surfaces: [], loadAssets: () => { loads += 1; return new Promise((resolve) => { release = resolve; }); } };
  game.firstPersonWeapon = { loadAssets: async () => {} };
  game.targetManager = {};
  game.ui = { setAssetState: (state) => states.push(state) };
  const a = game.prepareAssets();
  const b = game.prepareAssets();
  assert.equal(loads, 1);
  release();
  await Promise.all([a, b]);
  assert.equal(game.assetsReady, true);
  assert.equal(states.at(-1), "ready");
  const oldError = console.error;
  try {
    console.error = () => {};
    game.assetsReady = false;
    game.arena.loadAssets = async () => { throw new Error("offline"); };
    assert.equal(await game.prepareAssets(), false);
    assert.equal(states.at(-1), "error");
    assert.equal(game.assetsReady, false);
    game.arena.loadAssets = async () => {};
    assert.equal(await game.prepareAssets(), true);
  } finally { console.error = oldError; }
});

test("hybrid desktops keep mouse controls; coarse or touch-only devices use mobile", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { value: { maxTouchPoints: 5 }, configurable: true });
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(Game.prototype.detectMobile(), false);
    globalThis.window.matchMedia = (query) => ({ matches: query === "(pointer: coarse)" });
    assert.equal(Game.prototype.detectMobile(), true);
    globalThis.window.matchMedia = (query) => ({ matches: query === "(hover: none)" });
    assert.equal(Game.prototype.detectMobile(), true);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("failed loading waits for remaining work before enabling retry", async () => {
  const game = Object.create(Game.prototype);
  const states = [];
  let finish;
  game.arena = { loadAssets: () => new Promise((resolve) => { finish = resolve; }) };
  game.firstPersonWeapon = { loadAssets: async () => { throw new Error("missing weapon"); } };
  game.ui = { setAssetState: (state) => states.push(state) };
  const oldError = console.error;
  try {
    console.error = () => {};
    const pending = game.prepareAssets();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(states.at(-1), "loading");
    assert.ok(game.assetPromise);
    finish();
    assert.equal(await pending, false);
    assert.equal(states.at(-1), "error");
    assert.equal(game.assetPromise, null);
  } finally { console.error = oldError; }
});

test("a pending resume never advances paused audio before pointer lock succeeds", async () => {
  const game = Object.create(Game.prototype);
  let unlocked = false;
  let requested = false;
  game.state = "paused";
  game.assetsReady = true;
  game.isMobile = false;
  game.audio = { unlock() { unlocked = true; }, ensureBuffers: async () => {} };
  game.controls = { lock() { requested = true; } };
  await game.handleStart();
  assert.equal(requested, true);
  assert.equal(unlocked, false);
  assert.equal(game.state, "paused");
});
