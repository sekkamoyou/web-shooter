import {
  BoxGeometry,
  Clock,
  Color,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  Vector2,
  WebGLRenderer
} from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { Player } from "./player.js";
import { TargetManager } from "./targets.js";
import { UI } from "./ui.js";
import { FirstPersonWeapon } from "./firstPersonWeapon.js";
import { Weapon } from "./weapon.js";
import { randomBetween } from "./random.js";
import { AudioManager } from "./audioManager.js";
import { Arena } from "./arena.js";

const TARGET_COUNT = 6;
const OBSTACLE_COUNT = 6;

export class Game {
  constructor(root) {
    this.root = root;
    this.scene = new Scene();
    this.scene.background = new Color("#87b6d8");
    this.scene.fog = new Fog("#87b6d8", 18, 82);
    this.weaponScene = new Scene();

    this.camera = new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.weaponCamera = new PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.01,
      10
    );
    this.weaponCamera.rotation.order = "YXZ";

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.autoClear = false;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.clock = new Clock();
    this.raycaster = new Raycaster();
    this.screenCenter = new Vector2(0, 0);
    this.playerViewDirection = new Vector3(0, 0, -1);
    this.arenaHalfSize = 22;
    this.timeLimit = 60;
    this.state = "menu";
    this.awaitingLock = false;
    this.assetsReady = false;
    this.assetPromise = null;
    this.isMobile = this.detectMobile();
    this.mobileLookSensitivity = 0.004;
    this.mobilePortraitPaused = false;
    this.mobileStartQueued = false;
    this.mobileFireHeld = false;
    this.movePointerId = null;
    this.lookPointerId = null;
    this.stickRadius = 44;
    this.lastLookPoint = {
      x: 0,
      y: 0
    };

    this.ui = new UI(root);
    this.controls = new PointerLockControls(this.camera, document.body);
    this.player = new Player(this.camera, this.arenaHalfSize);
    this.weapon = new Weapon();
    this.firstPersonWeapon = new FirstPersonWeapon(this.weaponCamera);
    this.audio = new AudioManager();
    this.obstacles = [];
    this.obstacleGroup = new Group();
    this.obstacleMaterial = null;
    this.targetManager = new TargetManager(
      this.scene,
      this.arenaHalfSize,
      TARGET_COUNT
    );

    this.score = 0;
    this.timeLeft = this.timeLimit;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
    this.handleStart = this.handleStart.bind(this);
    this.handleMobileStickPointerDown =
      this.handleMobileStickPointerDown.bind(this);
    this.handleMobileStickPointerMove =
      this.handleMobileStickPointerMove.bind(this);
    this.handleMobileStickPointerUp =
      this.handleMobileStickPointerUp.bind(this);
    this.handleMobileLookPointerDown =
      this.handleMobileLookPointerDown.bind(this);
    this.handleMobileLookPointerMove =
      this.handleMobileLookPointerMove.bind(this);
    this.handleMobileLookPointerUp =
      this.handleMobileLookPointerUp.bind(this);
    this.handleMobileFirePointerDown =
      this.handleMobileFirePointerDown.bind(this);
    this.handleMobileFirePointerUp = this.handleMobileFirePointerUp.bind(this);
    this.handleMobileJump = this.handleMobileJump.bind(this);
    this.handleMobileReload = this.handleMobileReload.bind(this);
    this.animate = this.animate.bind(this);
  }

  mount() {
    this.syncDeviceMode();
    this.root.prepend(this.renderer.domElement);
    this.setupWorld();
    this.bindEvents();
    this.resetRound();
    this.ui.showStart(this.isMobile);
    this.syncMobilePresentation();
    this.animate();
    this.prepareAssets();
  }

  setupWorld() {
    this.player.reset();
    this.scene.add(this.controls.object);
    this.weaponScene.add(this.weaponCamera);

    this.arena = new Arena(this.scene, this.weaponScene, this.renderer);
    this.obstacleMaterial = new MeshBasicMaterial({ visible: false });
    this.scene.add(this.obstacleGroup);
  }

  async prepareAssets() {
    if (this.assetPromise) return this.assetPromise;
    this.ui.setAssetState("loading");
    this.assetPromise = Promise.allSettled([
      this.arena.loadAssets(), this.firstPersonWeapon.loadAssets()
    ]).then((results) => {
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
      this.assetsReady = true;
      this.targetManager.surfaces = this.arena.surfaces;
      this.ui.setAssetState("ready");
      return true;
    }).catch((error) => {
      console.error("Unable to prepare visual assets", error);
      this.ui.setAssetState("error");
      return false;
    }).finally(() => { this.assetPromise = null; });
    return this.assetPromise;
  }

  createRandomObstacles(material) {
    const obstacles = [];
    const playerStart = new Vector3(0, 0, 14);
    const margin = 4;
    const minHeight = this.targetManager.getTargetHeight() + 0.6;
    const maxHeight = minHeight + 3.4;

    for (let attempt = 0; obstacles.length < OBSTACLE_COUNT && attempt < 120; attempt += 1) {
      const size = {
        x: randomBetween(2.8, 5.6),
        y: randomBetween(minHeight, maxHeight),
        z: randomBetween(2.8, 5.6)
      };
      const halfX = size.x * 0.5;
      const halfZ = size.z * 0.5;
      const position = new Vector3(
        randomBetween(-this.arenaHalfSize + margin + halfX, this.arenaHalfSize - margin - halfX),
        size.y * 0.5,
        randomBetween(-this.arenaHalfSize + margin + halfZ, this.arenaHalfSize - margin - halfZ)
      );

      if (!this.isObstaclePlacementClear(position, size, playerStart, obstacles)) {
        continue;
      }

      const obstacle = new Mesh(new BoxGeometry(size.x, size.y, size.z), material);
      obstacle.position.copy(position);
      obstacle.castShadow = true;
      obstacle.receiveShadow = true;
      obstacles.push(obstacle);
    }

    return obstacles;
  }

  refreshObstacles() {
    if (!this.obstacleMaterial) {
      return;
    }

    this.disposeObstacles();
    this.obstacleGroup.clear();
    this.obstacles = this.createRandomObstacles(this.obstacleMaterial);
    this.obstacles.forEach((obstacle) => {
      this.obstacleGroup.add(obstacle);
    });
    this.arena.refreshObstacles(this.obstacles);
    this.player.setObstacles(this.obstacles);
    this.targetManager.setObstacles(this.obstacles);
  }

  disposeObstacles() {
    this.obstacles.forEach((obstacle) => {
      obstacle.geometry.dispose();
    });
  }

  isObstaclePlacementClear(position, size, playerStart, obstacles) {
    const playerClearance = 8.5;
    const obstacleGap = 3.5;
    const dxToPlayer = Math.max(Math.abs(position.x - playerStart.x) - size.x * 0.5, 0);
    const dzToPlayer = Math.max(Math.abs(position.z - playerStart.z) - size.z * 0.5, 0);

    if (Math.hypot(dxToPlayer, dzToPlayer) < playerClearance) {
      return false;
    }

    return !obstacles.some((obstacle) => {
      const otherSize = obstacle.geometry.parameters;
      const xGap =
        Math.abs(position.x - obstacle.position.x) -
        (size.x + otherSize.width) * 0.5;
      const zGap =
        Math.abs(position.z - obstacle.position.z) -
        (size.z + otherSize.depth) * 0.5;

      return xGap < obstacleGap && zGap < obstacleGap;
    });
  }

  bindEvents() {
    this.ui.bindStart(this.handleStart);
    this.ui.bindLocaleChange();

    this.controls.addEventListener("lock", () => {
      if (this.isMobile) {
        return;
      }

      if (this.awaitingLock || this.state === "paused") {
        this.awaitingLock = false;
        this.state = "running";
        this.clock.getDelta();
        this.ui.hideScreen();
        this.ui.setRunning(true);
        this.audio.resume();
      }
    });

    this.controls.addEventListener("unlock", () => {
      if (this.isMobile) {
        return;
      }

      this.player.clearInput();

      if (this.state === "running") {
        this.audio.pause();
        this.state = "paused";
        this.ui.setRunning(false);
        this.ui.showPause();
      }
    });

    document.addEventListener("pointerlockerror", () => {
      this.awaitingLock = false;
      this.ui.showPointerLockError();
    });
    window.addEventListener("blur", () => this.pauseForInterruption());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pauseForInterruption();
    });
    window.addEventListener("resize", this.handleResize);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
    window.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    this.ui.stickZone?.addEventListener(
      "pointerdown",
      this.handleMobileStickPointerDown
    );
    this.ui.stickZone?.addEventListener(
      "pointermove",
      this.handleMobileStickPointerMove
    );
    this.ui.stickZone?.addEventListener(
      "pointerup",
      this.handleMobileStickPointerUp
    );
    this.ui.stickZone?.addEventListener(
      "pointercancel",
      this.handleMobileStickPointerUp
    );

    this.ui.lookZone?.addEventListener(
      "pointerdown",
      this.handleMobileLookPointerDown
    );
    this.ui.lookZone?.addEventListener(
      "pointermove",
      this.handleMobileLookPointerMove
    );
    this.ui.lookZone?.addEventListener(
      "pointerup",
      this.handleMobileLookPointerUp
    );
    this.ui.lookZone?.addEventListener(
      "pointercancel",
      this.handleMobileLookPointerUp
    );

    this.ui.fireButton?.addEventListener(
      "pointerdown",
      this.handleMobileFirePointerDown
    );
    this.ui.fireButton?.addEventListener(
      "pointerup",
      this.handleMobileFirePointerUp
    );
    this.ui.fireButton?.addEventListener(
      "pointercancel",
      this.handleMobileFirePointerUp
    );
    this.ui.jumpButton?.addEventListener("pointerdown", this.handleMobileJump);
    this.ui.reloadButton?.addEventListener("pointerdown", this.handleMobileReload);
  }

  resetRound() {
    this.score = 0;
    this.timeLeft = this.timeLimit;
    this.state = "menu";
    this.ui.setRunning(false);
    this.mobileFireHeld = false;
    this.mobilePortraitPaused = false;
    this.mobileStartQueued = false;
    this.releaseMobilePointers();
    this.audio.reset();
    this.weapon.reset();
    this.firstPersonWeapon.reset();
    this.player.reset();
    this.refreshObstacles();
    this.targetManager.reset(
      this.player.getPosition(),
      this.getPlayerViewDirection()
    );
    this.updateHud();
  }

  handleResize() {
    const previousIsMobile = this.isMobile;
    this.isMobile = this.detectMobile();
    this.syncDeviceMode();
    if (previousIsMobile !== this.isMobile) this.pauseForInterruption();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = window.innerWidth / window.innerHeight;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (this.state === "menu" && previousIsMobile !== this.isMobile) {
      this.ui.showStart(this.isMobile);
    }

    this.handleOrientationState();
  }

  handleFullscreenChange() {
    if (!this.isMobile || document.fullscreenElement) {
      return;
    }

    if (this.state === "running") {
      this.mobilePortraitPaused = false;
      this.audio.pause();
      this.state = "paused";
      this.ui.setRunning(false);
      this.player.clearInput();
      this.releaseMobilePointers();
      this.ui.showFullscreenResume();
    }

    this.mobileFireHeld = false;
    this.ui.setMobileControlsVisible(false);
  }

  handlePointerDown(event) {
    if (this.isMobile) {
      return;
    }

    if (event.button !== 0 || this.state !== "running" || !this.controls.isLocked) {
      return;
    }

    this.audio.unlock();
    this.fireShot();
  }

  handleKeyDown(event) {
    if (event.code === "Space") {
      event.preventDefault();

      if (this.state === "running") {
        this.player.jump();
      }
    }

    this.player.setKey(event.code, true);

    if (event.code === "KeyR" && this.state === "running") {
      const reloadingStarted = this.weapon.requestReload();

      if (reloadingStarted) {
        this.audio.playReload(this.weapon.reloadDuration);
        this.firstPersonWeapon.triggerReload(this.weapon.reloadDuration);
        this.updateHud();
      }
    }
  }

  handleKeyUp(event) {
    this.player.setKey(event.code, false);
  }

  async handleStart() {
    if (this.state === "running" || this.awaitingLock) return;
    if (!this.assetsReady) {
      await this.prepareAssets();
      return;
    }
    // A paused reload resumes only after the game actually resumes.
    // Keep fullscreen/pointer lock in the click's user-activation window.
    if (this.state !== "paused") this.audio.unlock();
    else void this.audio.ensureBuffers();

    if (this.state === "ended" || this.state === "menu") {
      this.resetRound();
    }

    if (this.isMobile) {
      await this.tryEnterFullscreen();
      await this.tryLockLandscape();

      if (!this.isLandscape()) {
        this.mobileStartQueued = true;
        this.handleOrientationState();
        return;
      }

      this.startMobileRound();
      return;
    }

    this.awaitingLock = true;
    this.controls.lock();
  }

  handleMobileStickPointerDown(event) {
    if (!this.canUseMobileControls()) {
      return;
    }

    event.preventDefault();
    if (this.movePointerId !== null) return;
    this.movePointerId = event.pointerId;
    this.ui.stickZone?.setPointerCapture(event.pointerId);
    this.updateStickFromEvent(event);
  }

  handleMobileStickPointerMove(event) {
    if (event.pointerId !== this.movePointerId) {
      return;
    }

    event.preventDefault();
    this.updateStickFromEvent(event);
  }

  handleMobileStickPointerUp(event) {
    if (event.pointerId !== this.movePointerId) {
      return;
    }

    event.preventDefault();
    this.movePointerId = null;
    this.player.setJoystick(0, 0);
    this.ui.resetStick();
  }

  handleMobileLookPointerDown(event) {
    if (!this.canUseMobileControls()) {
      return;
    }

    if (this.lookPointerId !== null) {
      return;
    }

    event.preventDefault();
    this.lookPointerId = event.pointerId;
    this.lastLookPoint.x = event.clientX;
    this.lastLookPoint.y = event.clientY;
    this.ui.lookZone?.setPointerCapture(event.pointerId);
  }

  handleMobileLookPointerMove(event) {
    if (event.pointerId !== this.lookPointerId || !this.canUseMobileControls()) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - this.lastLookPoint.x;
    const deltaY = event.clientY - this.lastLookPoint.y;
    this.lastLookPoint.x = event.clientX;
    this.lastLookPoint.y = event.clientY;

    this.camera.rotation.y -= deltaX * this.mobileLookSensitivity;
    this.camera.rotation.x -= deltaY * this.mobileLookSensitivity;
    this.camera.rotation.x = Math.max(
      -Math.PI / 2 + 0.08,
      Math.min(Math.PI / 2 - 0.08, this.camera.rotation.x)
    );
  }

  handleMobileLookPointerUp(event) {
    if (event.pointerId !== this.lookPointerId) {
      return;
    }

    event.preventDefault();
    this.lookPointerId = null;
  }

  handleMobileFirePointerDown(event) {
    if (!this.canUseMobileControls()) {
      return;
    }

    event.preventDefault();
    this.audio.unlock();
    this.ui.fireButton?.setPointerCapture(event.pointerId);
    this.mobileFireHeld = true;
    this.fireShot();
  }

  handleMobileFirePointerUp(event) {
    event.preventDefault();
    this.mobileFireHeld = false;
  }

  handleMobileReload(event) {
    if (!this.canUseMobileControls()) {
      return;
    }

    event.preventDefault();
    if (this.weapon.requestReload()) {
      this.audio.playReload(this.weapon.reloadDuration);
      this.firstPersonWeapon.triggerReload(this.weapon.reloadDuration);
      this.updateHud();
    }
  }

  handleMobileJump(event) {
    if (!this.canUseMobileControls()) {
      return;
    }

    event.preventDefault();
    this.player.jump();
  }

  updateHud() {
    this.ui.updateHud({
      score: this.score,
      timeLeft: this.timeLeft,
      ammo: this.weapon.ammo,
      maxAmmo: this.weapon.maxAmmo,
      isReloading: this.weapon.isReloading,
      isMobile: this.isMobile
    });
  }

  endRound() {
    this.state = "ended";
    this.player.clearInput();
    this.player.setJoystick(0, 0);
    this.mobileFireHeld = false;
    this.audio.reset();
    this.ui.setMobileControlsVisible(false);
    if (this.controls.isLocked) {
      this.controls.unlock();
    }
    this.ui.setRunning(false);
    this.ui.showEnd(this.score);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const deltaSeconds = Math.min(this.clock.getDelta(), 0.05);
    const playerViewDirection = this.getPlayerViewDirection();

    if (this.state === "running") {
      const wasGrounded = this.player.isOnGround();
      this.player.update(deltaSeconds);

      if (!wasGrounded && this.player.isOnGround()) {
        this.audio.playLanding();
      }

      this.audio.updateMovement(
        deltaSeconds,
        this.player.getMovementAmount(),
        this.player.isOnGround()
      );

      if (this.isMobile && this.mobileFireHeld) {
        this.fireShot();
      }

      const reloadFinished = this.weapon.update(deltaSeconds);
      if (reloadFinished) {
        this.updateHud();
      }

      this.targetManager.update(
        deltaSeconds,
        this.player.getPosition(),
        playerViewDirection,
        true
      );
      this.timeLeft = Math.max(0, this.timeLeft - deltaSeconds);

      if (this.timeLeft === 0) {
        this.endRound();
      }

      if (this.state === "running") this.updateHud();
    } else {
      this.targetManager.update(
        this.state === "paused" ? 0 : deltaSeconds,
        this.player.getPosition(),
        playerViewDirection,
        false
      );
    }

    this.firstPersonWeapon.update(
      this.state === "running" ? deltaSeconds : 0,
      this.state === "running" ? this.player.getMovementAmount() : 0
    );

    this.weaponCamera.quaternion.copy(this.camera.quaternion);
    this.weaponCamera.position.set(0, 0, 0);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
  }

  fireShot() {
    const shot = this.weapon.shoot();

    if (!shot.fired) {
      return false;
    }

    this.audio.playShot();
    this.firstPersonWeapon.triggerFire();

    if (shot.autoReloaded) {
      this.audio.playReload(this.weapon.reloadDuration);
      this.firstPersonWeapon.triggerReload(this.weapon.reloadDuration);
    }

    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    const hit = this.targetManager.handleShot(this.raycaster);

    if (hit) {
      if (hit.points > 0) {
        this.audio.playHit();
        this.ui.flashHit();
        this.score += hit.points;
      } else {
        const localPoint = this.camera.worldToLocal(hit.point.clone());
        const pan = localPoint.x / Math.max(1, Math.abs(localPoint.z));
        this.audio.playImpact(hit.surface, Math.max(-1, Math.min(1, pan)));
      }
    }

    this.updateHud();
    return true;
  }

  detectMobile() {
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches)
    );
  }

  syncDeviceMode() {
    this.root.classList.toggle("app--mobile", this.isMobile);
  }

  isLandscape() {
    return window.innerWidth > window.innerHeight;
  }

  canUseMobileControls() {
    return this.isMobile && this.state === "running" && this.isLandscape();
  }

  getPlayerViewDirection() {
    this.camera.getWorldDirection(this.playerViewDirection);
    this.playerViewDirection.y = 0;

    if (this.playerViewDirection.lengthSq() === 0) {
      this.playerViewDirection.set(0, 0, -1);
    } else {
      this.playerViewDirection.normalize();
    }

    return this.playerViewDirection;
  }

  startMobileRound() {
    this.mobileStartQueued = false;
    this.mobilePortraitPaused = false;
    this.state = "running";
    this.clock.getDelta();
    this.audio.resume();
    this.ui.setRunning(true);
    this.ui.hideScreen();
    this.syncMobilePresentation();
  }

  syncMobilePresentation() {
    const showMobileControls =
      this.isMobile && this.state === "running" && this.isLandscape();
    this.ui.setMobileControlsVisible(showMobileControls);

    if (!this.isMobile || this.isLandscape()) {
      this.ui.hideOrientationLock();
    } else {
      this.ui.showOrientationLock();
    }
  }

  handleOrientationState() {
    if (!this.isMobile) {
      return;
    }

    if (this.isLandscape()) {
      this.ui.hideOrientationLock();

      if (this.mobileStartQueued) {
        this.startMobileRound();
        return;
      }

      if (this.mobilePortraitPaused && this.state === "paused") {
        this.mobilePortraitPaused = false;
        this.state = "running";
        this.clock.getDelta();
        this.audio.resume();
        this.ui.setRunning(true);
        this.ui.hideScreen();
      }

      this.syncMobilePresentation();
      return;
    }

    this.ui.showOrientationLock();
    this.ui.setMobileControlsVisible(false);
    this.mobileFireHeld = false;

    if (this.state === "running") {
      this.mobilePortraitPaused = true;
      this.audio.pause();
      this.state = "paused";
      this.ui.setRunning(false);
      this.player.clearInput();
      this.releaseMobilePointers();
    }
  }

  pauseForInterruption() {
    this.player.clearInput();
    this.releaseMobilePointers();
    this.mobileFireHeld = false;
    if (this.state !== "running") return;
    this.state = "paused";
    this.audio.pause();
    this.ui.setRunning(false);
    this.ui.setMobileControlsVisible(false);
    this.ui.showPause();
    if (this.controls.isLocked) this.controls.unlock();
  }

  updateStickFromEvent(event) {
    const zone = this.ui.stickZone;

    if (!zone) {
      return;
    }

    const rect = zone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.min(this.stickRadius, Math.hypot(deltaX, deltaY) || 0);
    const angle = Math.atan2(deltaY, deltaX);
    const knobX = Math.cos(angle) * distance;
    const knobY = Math.sin(angle) * distance;

    this.ui.updateStick(knobX, knobY);
    this.player.setJoystick(knobX / this.stickRadius, knobY / this.stickRadius);
  }

  releaseMobilePointers() {
    this.movePointerId = null;
    this.lookPointerId = null;
    this.player.setJoystick(0, 0);
    this.ui.resetStick();
  }

  async tryLockLandscape() {
    if (!this.isMobile || !screen.orientation?.lock) {
      return;
    }

    try {
      await screen.orientation.lock("landscape");
    } catch {
      // Some mobile browsers only allow orientation lock in fullscreen or don't support it.
    }
  }

  async tryEnterFullscreen() {
    if (!this.isMobile || document.fullscreenElement) {
      return;
    }

    const target = this.root;
    const requestFullscreen =
      target.requestFullscreen?.bind(target) ||
      target.webkitRequestFullscreen?.bind(target);

    if (!requestFullscreen) {
      return;
    }

    try {
      await requestFullscreen({ navigationUI: "hide" });
    } catch {
      try {
        await requestFullscreen();
      } catch {
        // Some mobile browsers do not support fullscreen for arbitrary elements.
      }
    }
  }
}
