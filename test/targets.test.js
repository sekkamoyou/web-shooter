import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { TargetManager } from "../src/targets.js";

test("fallback targets stay in the arena when facing outward at its edge", () => {
  const manager = new TargetManager({ add() {}, remove() {} }, 22, 6);
  const random = Math.random;
  Math.random = () => 0.5;

  try {
    manager.reset(new Vector3(22, 0, 0), new Vector3(1, 0, 0));
  } finally {
    Math.random = random;
  }

  assert.equal(manager.targets.length, 6);
  manager.targets.forEach((target) => {
    assert.equal(manager.isWithinArena(target.hiddenPosition), true);
    assert.equal(manager.isWithinArena(target.basePosition), true);
  });
});
