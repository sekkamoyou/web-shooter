import { MathUtils, Vector3 } from "three";

const FORWARD = new Vector3();
const RIGHT = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);

export class Player {
  constructor(camera, arenaHalfSize) {
    this.camera = camera;
    this.arenaHalfSize = arenaHalfSize;
    this.height = 1.7;
    this.moveSpeed = 10;
    this.joystick = {
      x: 0,
      y: 0
    };
    this.keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false
    };
  }

  reset() {
    this.camera.position.set(0, this.height, 14);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(0, 0, 0);
    this.clearInput();
    this.setJoystick(0, 0);
  }

  clearInput() {
    Object.keys(this.keys).forEach((code) => {
      this.keys[code] = false;
    });
  }

  setKey(code, pressed) {
    if (code in this.keys) {
      this.keys[code] = pressed;
    }
  }

  setJoystick(x, y) {
    this.joystick.x = MathUtils.clamp(x, -1, 1);
    this.joystick.y = MathUtils.clamp(y, -1, 1);
  }

  update(deltaSeconds) {
    const keyboardX = Number(this.keys.KeyD) - Number(this.keys.KeyA);
    const keyboardZ = Number(this.keys.KeyW) - Number(this.keys.KeyS);
    const moveX = MathUtils.clamp(keyboardX + this.joystick.x, -1, 1);
    const moveZ = MathUtils.clamp(keyboardZ - this.joystick.y, -1, 1);

    if (moveX !== 0 || moveZ !== 0) {
      const magnitude = Math.hypot(moveX, moveZ) || 1;
      const step = (this.moveSpeed * deltaSeconds) / magnitude;
      this.camera.getWorldDirection(FORWARD);
      FORWARD.y = 0;
      FORWARD.normalize();
      RIGHT.crossVectors(FORWARD, WORLD_UP).normalize();
      this.camera.position.addScaledVector(FORWARD, moveZ * step);
      this.camera.position.addScaledVector(RIGHT, moveX * step);
    }

    this.camera.position.x = MathUtils.clamp(
      this.camera.position.x,
      -this.arenaHalfSize,
      this.arenaHalfSize
    );
    this.camera.position.z = MathUtils.clamp(
      this.camera.position.z,
      -this.arenaHalfSize,
      this.arenaHalfSize
    );
    this.camera.position.y = this.height;
  }

  getPosition() {
    return this.camera.position;
  }
}
