export class Weapon {
  constructor() {
    this.maxAmmo = 30;
    this.reloadDuration = 1.4;
    this.shotCooldownDuration = 0.12;
    this.reset();
  }

  reset() {
    this.ammo = this.maxAmmo;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.shotCooldown = 0;
  }

  update(deltaSeconds) {
    if (this.shotCooldown > 0) {
      this.shotCooldown = Math.max(0, this.shotCooldown - deltaSeconds);
    }

    if (!this.isReloading) {
      return false;
    }

    this.reloadTimer = Math.max(0, this.reloadTimer - deltaSeconds);

    if (this.reloadTimer === 0) {
      this.isReloading = false;
      this.ammo = this.maxAmmo;
      return true;
    }

    return false;
  }

  canShoot() {
    return !this.isReloading && this.shotCooldown === 0 && this.ammo > 0;
  }

  shoot() {
    if (!this.canShoot()) {
      return {
        fired: false,
        autoReloaded: false
      };
    }

    this.ammo -= 1;
    this.shotCooldown = this.shotCooldownDuration;

    if (this.ammo === 0) {
      this.startReload();
      return {
        fired: true,
        autoReloaded: true
      };
    }

    return {
      fired: true,
      autoReloaded: false
    };
  }

  requestReload() {
    if (this.isReloading || this.ammo === this.maxAmmo) {
      return false;
    }

    this.startReload();
    return true;
  }

  startReload() {
    this.isReloading = true;
    this.reloadTimer = this.reloadDuration;
  }
}
