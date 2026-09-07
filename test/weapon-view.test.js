import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AnimationMixer, LoopOnce, PerspectiveCamera, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { FirstPersonWeapon } from "../src/firstPersonWeapon.js";

async function actualWeapon() {
  const dir = new URL("../public/models/weapons/animated-pistol/", import.meta.url);
  const gltf = JSON.parse(readFileSync(new URL("scene.gltf", dir)));
  gltf.buffers.forEach((buffer) => { buffer.uri = `data:application/octet-stream;base64,${readFileSync(new URL(buffer.uri, dir)).toString("base64")}`; });
  gltf.materials = gltf.materials.map(() => ({}));
  const original = globalThis.ProgressEvent;
  globalThis.ProgressEvent = class { constructor(type, data) { this.type = type; Object.assign(this, data); } };
  let asset;
  try { asset = await new GLTFLoader().parseAsync(JSON.stringify(gltf), ""); }
  finally { if (original === undefined) delete globalThis.ProgressEvent; else globalThis.ProgressEvent = original; }
  const reference = clone(asset.scene);
  const camera = new PerspectiveCamera(50, 16 / 9, 0.01, 10);
  const weapon = new FirstPersonWeapon(camera);
  weapon.assembleWeapon(asset);
  return { camera, weapon, reference, clips: asset.animations };
}

function assertAuthoredBones(model, reference) {
  reference.traverse((bone) => {
    if (!bone.isBone) return;
    const actual = model.getObjectByName(bone.name);
    assert(actual.position.distanceTo(bone.position) < 0.00001, `${bone.name} position follows author clip`);
    assert(actual.quaternion.clone().normalize().angleTo(bone.quaternion.clone().normalize()) < 0.00001, `${bone.name} rotation follows author clip`);
  });
}

test("idle and reload preserve the original artist's complete hand/weapon animation", async () => {
  const { weapon, reference, clips } = await actualWeapon();
  const mixer = new AnimationMixer(reference);
  mixer.clipAction(clips.find((clip) => clip.name === "Pistol_IDLE")).play();
  mixer.update(0);
  assertAuthoredBones(weapon.model, reference);
  for (const progress of [0.1, 0.28, 0.5, 0.75, 0.98]) {
    weapon.reset(); weapon.triggerReload(1.4); weapon.update(progress * 1.4, 0);
    mixer.stopAllAction();
    const clip = clips.find((entry) => entry.name === "Pistol_RELOAD");
    const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1).play();
    action.clampWhenFinished = true;
    mixer.update(progress * clip.duration);
    assertAuthoredBones(weapon.model, reference);
  }
});

test("POV framing survives camera motion; pause, rapid fire, reload and reset preserve timing", async () => {
  const { camera, weapon } = await actualWeapon();
  const muzzle = new Vector3();
  let originalProjection;
  for (const yaw of [0, 1.2, -2.4]) {
    camera.position.set(30, 4, -20); camera.rotation.set(0.2, yaw, 0);
    camera.updateMatrixWorld(true);
    weapon.reset(); weapon.root.updateWorldMatrix(true, true);
    weapon.muzzleFlash.getWorldPosition(muzzle).project(camera);
    assert(muzzle.x > 0.05 && muzzle.x < 0.55 && muzzle.y > -0.5 && muzzle.y < 0.05, "muzzle stays in reference POV region");
    if (!originalProjection) originalProjection = muzzle.clone();
    assert(muzzle.distanceTo(originalProjection) < 0.00001);
  }
  weapon.triggerFire(); weapon.update(0.06, 0);
  const firstRecoil = weapon.slide.position.clone();
  weapon.triggerFire(); weapon.update(0.06, 0);
  assert(weapon.slide.position.distanceTo(firstRecoil) < 0.00001, "rapid shots restart authored recoil");
  weapon.triggerReload(1.4); weapon.update(0.7, 0);
  const hand = weapon.model.getObjectByName("Hand_L_030");
  const pose = hand.quaternion.clone();
  const magazine = weapon.magazine.position.clone();
  weapon.update(0, 0);
  assert.deepEqual(weapon.magazine.position.toArray(), magazine.toArray());
  assert(hand.quaternion.equals(pose));
  weapon.update(0.7, 0);
  assert.equal(weapon.isReloading, false);
  assert.equal(weapon.actionName, "idle");
  weapon.reset();
  assert.equal(weapon.muzzleFlash.visible, false);
  assert.equal(weapon.actions.idle.time, 0);
});

test("recoil has one early peak, settles without a tail, and keeps the slide cycle and grip", async () => {
  const { weapon, reference, clips } = await actualWeapon();
  const mixer = new AnimationMixer(reference);
  const source = mixer.clipAction(clips.find(clip => clip.name === "Pistol_FIRE"));
  source.setLoop(LoopOnce, 1); source.clampWhenFinished = true;
  source.play(); mixer.update(0.25);
  weapon.triggerFire(); weapon.update(0.045);
  // All bones except the independently cycling slide reach the artist's same peak pose.
  reference.traverse(bone => {
    if (!bone.isBone || bone.name === "culasse_025") return;
    const actual = weapon.model.getObjectByName(bone.name);
    assert(actual.position.distanceTo(bone.position) < 0.00001, bone.name);
    assert(actual.quaternion.clone().normalize().angleTo(bone.quaternion.clone().normalize()) < 0.00001, bone.name);
  });
  weapon.reset(); weapon.model.updateMatrixWorld(true);
  const restRotation = weapon.gunBone.getWorldQuaternion(weapon.gunBone.quaternion.clone());
  const slideRest = weapon.slide.position.clone();
  for (const fps of [30, 60, 120]) {
    weapon.reset(); weapon.triggerFire();
    let previous = Infinity;
    for (let frame = 1; frame <= fps; frame++) {
      weapon.update(1 / fps); weapon.model.updateMatrixWorld(true);
      const angle = weapon.gunBone.getWorldQuaternion(weapon.gunBone.quaternion.clone()).angleTo(restRotation);
      if (frame / fps >= 0.07 && frame / fps <= 0.22) { assert(angle <= previous + 0.00001, `recovery never rebounds: ${fps}fps ${frame/fps}s ${angle} > ${previous}`); previous = angle; }
      if (frame / fps >= 0.24) assert(angle < 0.015, "only small authored idle motion remains");
    }
    assert.equal(weapon.actionName, "idle");
  }
  weapon.reset(); weapon.triggerFire(); weapon.update(0.02);
  assert(weapon.slide.position.distanceTo(slideRest) > 0.1, "slide visibly retracts during impulse");
  weapon.update(0.05);
  assert(weapon.slide.position.distanceTo(slideRest) < 0.00001, "slide closes before arm recovery ends");
});
