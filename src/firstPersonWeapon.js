import { AnimationClip, AnimationMixer, CylinderGeometry, Group, LoopOnce, LoopRepeat, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetPath } from "./assetPath.js";

const CLIPS = { idle: "Pistol_IDLE", walk: "Pistol_WALK", fire: "Pistol_FIRE", reload: "Pistol_RELOAD" };

export class FirstPersonWeapon {
  constructor(camera) {
    this.camera = camera;
    this.root = new Group();
    // Screen framing against the CS2 POV reference; no bone or grip overrides.
    this.basePosition = new Vector3(-0.05, 0.055, 0);
    this.root.position.copy(this.basePosition);
    this.view = new Group();
    this.view.scale.setScalar(0.25);
    this.root.add(this.view);
    this.muzzleFlash = new Mesh(new CylinderGeometry(0.3, 0.8, 3, 6), new MeshBasicMaterial({ color: "#ffd788", transparent: true }));
    this.muzzleFlash.rotation.x = Math.PI / 2;
    this.reset();
  }

  loadAssets() {
    if (!this.loading) {
      this.loading = new GLTFLoader().loadAsync(assetPath("models/weapons/animated-pistol/scene.gltf"))
        .then((gltf) => this.assembleWeapon(gltf))
        .catch((error) => { this.loading = null; throw error; });
    }
    return this.loading;
  }

  assembleWeapon(gltf) {
    this.model = gltf.scene;
    this.mixer = new AnimationMixer(this.model);
    this.actions = {};
    for (const [name, clipName] of Object.entries(CLIPS)) {
      let clip = gltf.animations.find((entry) => entry.name === clipName);
      if (!clip) throw new Error(`Missing authored animation: ${clipName}`);
      if (name === "fire") {
        // CS2 P250/Glock reference: one impulse, then a short, non-oscillating return.
        // Reuse the artist's rest/peak poses; the original 1.15s settling tail is omitted.
        clip = new AnimationClip("Pistol_FIRE_CRISP", 0.22, clip.tracks.map((track) => {
          const source = track.createInterpolant();
          if (track.name.startsWith("culasse_025.")) {
            return new track.constructor(track.name, [0, 0.02, 0.065, 0.22],
              [0, 0.06, 0.20, 0].flatMap((time) => Array.from(source.evaluate(time))));
          }
          const poses = new track.constructor(track.name, [0, 1],
            [0, 0.25].flatMap((time) => Array.from(source.evaluate(time)))).createInterpolant();
          return new track.constructor(track.name, [0, 0.045, 0.09, 0.14, 0.185, 0.22],
            [0, 1, 0.5, 0.16, 0.03, 0].flatMap((weight) => Array.from(poses.evaluate(weight))));
        }));
      }
      this.actions[name] = this.mixer.clipAction(clip);
    }
    this.arms = this.model.getObjectByName("Object_7");
    this.pistol = this.model.getObjectByName("Object_13");
    this.magazine = this.model.getObjectByName("chargeur_023");
    this.slide = this.model.getObjectByName("culasse_025");
    this.gunBone = this.model.getObjectByName("Pistol_Bone_022");
    if (!this.arms || !this.pistol || !this.magazine || !this.slide || !this.gunBone) throw new Error("Incomplete authored pistol rig");
    this.model.traverse((node) => {
      if (node.isMesh) { node.frustumCulled = false; node.castShadow = node.receiveShadow = true; }
    });
    this.actions.idle.play();
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
    // Locate the exported muzzle on the posed mesh, then bind the flash to its gun bone.
    const vertex = new Vector3();
    const muzzle = new Vector3();
    let furthest = -Infinity;
    for (let i = 0; i < this.pistol.geometry.attributes.position.count; i += 1) {
      this.pistol.getVertexPosition(i, vertex).applyMatrix4(this.pistol.matrixWorld);
      if (vertex.z > furthest) { furthest = vertex.z; muzzle.copy(vertex); }
    }
    muzzle.x = this.gunBone.getWorldPosition(new Vector3()).x;
    this.muzzleFlash.position.copy(this.gunBone.worldToLocal(muzzle));
    this.gunBone.add(this.muzzleFlash);

    // Exact camera transform from the creator's scene.tscn (see attribution).
    const authorCamera = new PerspectiveCamera(50, 16 / 9, 0.01, 100);
    authorCamera.position.set(0.028, 2.237, -1.033);
    authorCamera.rotation.y = Math.PI;
    authorCamera.updateMatrixWorld(true);
    const authorView = new Group();
    authorView.applyMatrix4(authorCamera.matrixWorldInverse);
    authorView.add(this.model);
    this.view.add(authorView);
    this.camera.add(this.root);
    this.reset();
  }

  playAction(name, restart = false) {
    if (!this.actions || (this.actionName === name && !restart)) return;
    const previous = this.activeAction;
    const action = this.actions[name];
    const repeating = name === "idle" || name === "walk";
    action.reset().setLoop(repeating ? LoopRepeat : LoopOnce, repeating ? Infinity : 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(name === "reload" ? action.getClip().duration / this.reloadDuration : 1);
    action.setEffectiveWeight(1).play();
    if (name === "fire") {
      // An entry crossfade softens the shot and leaks the previous recovery into rapid fire.
      for (const other of Object.values(this.actions)) if (other !== action) other.stop();
    } else if (previous && previous !== action) {
      previous.fadeOut(0.06);
      action.fadeIn(0.06);
    }
    this.activeAction = action;
    this.actionName = name;
  }

  reset() {
    this.flash = this.fireTimer = this.reloadTimer = 0;
    this.reloadDuration = 1.4;
    this.isReloading = false;
    this.muzzleFlash.visible = false;
    this.mixer?.stopAllAction();
    this.activeAction = null;
    this.actionName = null;
    this.playAction("idle");
    this.update(0, 0);
  }

  triggerFire() {
    if (this.isReloading || !this.actions) return;
    this.fireTimer = this.actions.fire.getClip().duration;
    this.flash = 1;
    this.playAction("fire", true);
  }

  triggerReload(duration = 1.4) {
    this.isReloading = true;
    this.reloadDuration = Math.max(duration, 0.01);
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.playAction("reload");
  }

  update(deltaSeconds, movementAmount = 0) {
    this.root.position.copy(this.basePosition);
    // Keep the authored view centered on narrow screens without changing hand geometry.
    this.root.position.x -= 0.10 * Math.max(0, 1 - this.camera.aspect / 1.2);
    this.flash = MathUtils.damp(this.flash, 0, 40, deltaSeconds);
    this.fireTimer = Math.max(0, this.fireTimer - deltaSeconds);
    this.mixer?.update(deltaSeconds);
    if (this.isReloading) {
      this.reloadTimer = Math.min(this.reloadTimer + deltaSeconds, this.reloadDuration);
      if (this.reloadTimer >= this.reloadDuration) this.isReloading = false;
    }
    if (!this.isReloading && this.fireTimer === 0) this.playAction(movementAmount > 0.1 ? "walk" : "idle");
    this.muzzleFlash.visible = this.flash > 0.08;
    this.muzzleFlash.material.opacity = this.flash;
    this.muzzleFlash.scale.setScalar(0.6 + this.flash * 0.4);
  }
}
