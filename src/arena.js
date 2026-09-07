import {
  Box3, BoxGeometry, Color, DirectionalLight, Fog,
  Group, HemisphereLight, LinearFilter, Mesh, MeshStandardMaterial,
  PlaneGeometry, PMREMGenerator, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3, WebGLCubeRenderTarget
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { assetPath } from "./assetPath.js";

// Project in metres so random block sizes don't stretch the material.
export function tileBoxUV(geometry, metres = 2) {
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i += 1) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const nz = Math.abs(n.getZ(i));
    uv.setXY(i, (nx > nz ? p.getZ(i) : p.getX(i)) / metres,
      (ny > nx && ny > nz ? p.getZ(i) : p.getY(i)) / metres);
  }
  return geometry;
}

export class Arena {
  constructor(scene, weaponScene, renderer) {
    this.scene = scene;
    this.weaponScene = weaponScene;
    this.renderer = renderer;
    this.resources = new Map();
    this.visuals = new Group();
    this.surfaces = [];
    this.concrete = new MeshStandardMaterial({ color: "#beb9a9", roughness: 0.9 });
    this.floorMaterial = new MeshStandardMaterial({ color: "#b8b5a5", roughness: 0.95 });
    this.metal = new MeshStandardMaterial({ color: "#596866", roughness: 0.68, metalness: 0.65 });
    this.trim = new MeshStandardMaterial({ color: "#353b3b", roughness: 0.7, metalness: 0.55 });
    this.paint = new MeshStandardMaterial({ color: "#c9aa64", roughness: 0.8 });
    scene.background = new Color("#b1bbc0");
    scene.fog = new Fog("#b1bbc0", 38, 110);
    scene.add(new HemisphereLight("#d5e3ed", "#726754", 1.3));
    weaponScene.add(new HemisphereLight("#e1e9ee", "#82735b", 1.7));
    const sun = new DirectionalLight("#ffe2b3", 3.1);
    sun.position.set(-18, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 85 });
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const key = new DirectionalLight("#ffe3bd", 2.2);
    key.position.copy(sun.position).normalize().multiplyScalar(3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 6 });
    key.shadow.normalBias = 0.001;
    key.shadow.bias = -0.0001;
    weaponScene.add(key);

    const floor = new Mesh(new PlaneGeometry(160, 160), this.floorMaterial);
    const uv = floor.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.surface = "concrete";
    scene.add(floor);
    this.surfaces.push(floor);
    scene.add(this.visuals);
    this.buildPerimeter();
  }

  box(size, position, material, parent = this.scene) {
    const mesh = new Mesh(tileBoxUV(new BoxGeometry(...size)), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildPerimeter() {
    for (const [size, pos] of [
      [[48, 4, 1.2], [0, 2, -24]], [[48, 4, 1.2], [0, 2, 24]],
      [[1.2, 4, 48], [-24, 2, 0]], [[1.2, 4, 48], [24, 2, 0]]
    ]) {
      const wall = this.box(size, pos, this.concrete);
      wall.userData.surface = "concrete";
      this.surfaces.push(wall);
    }
    for (let x = -24; x <= 24; x += 8) {
      this.box([0.38, 5.5, 0.48], [x, 2.75, -23.3], this.trim);
      this.box([7.7, 0.18, 0.5], [x + 4, 4.02, -24], this.trim);
    }
    // Buildings are outside the playable bounds; they add depth without new blockers.
    for (const side of [-1, 1]) {
      this.box([10, 12, 46], [side * 32, 6, -5], this.metal);
      this.box([11, 0.4, 48], [side * 32, 12, -5], this.trim);
      for (let z = -23; z < 20; z += 6) {
        this.box([0.18, 1.6, 3.7], [side * 26.9, 9.2, z], this.trim);
        this.box([0.2, 0.08, 3.7], [side * 26.75, 9.2, z], this.paint);
      }
      for (const z of [-20, -8, 4, 16]) this.box([0.25, 7.5, 0.25], [side * 23.2, 3.75, z], this.trim);
      const strip = this.box([0.09, 0.008, 40], [side * 21.7, 0.01, 0], this.paint);
      strip.castShadow = false;
    }
    for (let x = -18; x <= 18; x += 6) {
      const line = this.box([3.6, 0.008, 0.08], [x, 0.012, 17], this.paint);
      line.castShadow = false;
    }
  }

  async resource(path, loader) {
    if (!this.resources.has(path)) {
      this.resources.set(path, loader.loadAsync(assetPath(path)).catch((error) => {
        this.resources.delete(path);
        throw error;
      }));
    }
    return this.resources.get(path);
  }

  async loadAssets() {
    if (this.loaded) return;
    const textureLoader = new TextureLoader();
    const groups = [
      ["concrete_floor_02", this.floorMaterial],
      ["concrete_wall_004", this.concrete],
      ["corrugated_iron", this.metal]
    ];
    await Promise.all(groups.map(async ([name, material]) => {
      const [color, normal, arm] = await Promise.all(["color", "normal", "arm"].map((map) =>
        this.resource(`textures/${name}/${map}.jpg`, textureLoader)));
      for (const texture of [color, normal, arm]) {
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
      color.colorSpace = SRGBColorSpace;
      Object.assign(material, { map: color, normalMap: normal, roughnessMap: arm, aoMap: arm, metalnessMap: arm, needsUpdate: true });
      material.normalScale.setScalar(name === "corrugated_iron" ? 0.65 : 0.7);
    }));
    const [crate, barrel, hdr, background] = await Promise.all([
      this.resource("models/environment/wooden_crate_01/model.gltf", new GLTFLoader()),
      this.resource("models/environment/Barrel_02/model.gltf", new GLTFLoader()),
      this.resource("textures/industrial_sunset_02.hdr", new RGBELoader()),
      this.resource("textures/industrial_sunset_02-background.jpg", textureLoader)
    ]);
    const pmrem = new PMREMGenerator(this.renderer);
    this.environment = pmrem.fromEquirectangular(hdr);
    this.scene.environment = this.weaponScene.environment = this.environment.texture;
    // Keep the lighting HDR separate from the sharp, already tone-mapped background.
    background.colorSpace = SRGBColorSpace;
    background.generateMipmaps = false;
    background.minFilter = LinearFilter;
    // Cap cube faces at 2K (96 MiB), avoiding Three's automatic 4K faces (384 MiB).
    this.background = new WebGLCubeRenderTarget(Math.min(2048, this.renderer.capabilities.maxCubemapSize), { depthBuffer: false });
    this.background.fromEquirectangularTexture(this.renderer, background);
    this.scene.background = this.background.texture;
    this.scene.backgroundIntensity = 1;
    this.scene.backgroundBlurriness = 0;
    background.dispose();
    this.resources.delete("textures/industrial_sunset_02-background.jpg");
    this.scene.environmentIntensity = 0.5;
    this.weaponScene.environmentIntensity = 0.8;
    hdr.dispose();
    pmrem.dispose();
    for (const [template, z] of [[crate.scene, 18], [barrel.scene, 14], [crate.scene, -18], [barrel.scene, -14]]) {
      for (const side of [-1, 1]) {
        const prop = template.clone(true);
        const box = new Box3().setFromObject(prop);
        const size = box.getSize(new Vector3());
        prop.scale.multiplyScalar(0.65 / Math.max(size.x, size.z));
        box.setFromObject(prop);
        const center = box.getCenter(new Vector3());
        prop.position.set(side * 22.95 - center.x, -box.min.y, z - center.z);
        prop.traverse((node) => { if (node.isMesh) { node.castShadow = node.receiveShadow = true; node.userData.surface = "concrete"; } });
        this.scene.add(prop);
        this.surfaces.push(prop);
      }
    }
    this.loaded = true;
  }

  refreshObstacles(obstacles) {
    this.visuals.traverse((node) => { if (node.isMesh) node.geometry.dispose(); });
    this.visuals.clear();
    obstacles.forEach((obstacle, index) => {
      const { width: w, height: h, depth: d } = obstacle.geometry.parameters;
      const group = new Group();
      group.position.copy(obstacle.position);
      this.visuals.add(group);
      const metal = index % 2 === 0;
      obstacle.userData.surface = metal ? "metal" : "concrete";
      const shell = new Mesh(tileBoxUV(new RoundedBoxGeometry(w, h, d, 1, 0.035)), metal ? this.metal : this.concrete);
      shell.castShadow = shell.receiveShadow = true;
      group.add(shell);
      for (const x of [-1, 1]) {
        for (const z of [-1, 1]) this.box([0.12, h, 0.12], [x * (w / 2 - 0.07), 0, z * (d / 2 - 0.07)], this.trim, group);
      }
      for (const y of [-h / 2 + 0.09, h / 2 - 0.09]) this.box([w, 0.16, d], [0, y, 0], this.trim, group);
      if (metal) {
        for (const x of [-w * 0.22, w * 0.22]) this.box([0.035, h * 0.82, 0.04], [x, 0, d / 2 - 0.018], this.paint, group);
      } else {
        for (const z of [-1, 1]) this.box([w - 0.2, 0.12, 0.012], [0, -h / 2 + 0.65, z * (d / 2 - 0.004)], this.paint, group);
      }
    });
  }
}
