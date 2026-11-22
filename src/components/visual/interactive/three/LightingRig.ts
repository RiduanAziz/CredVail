import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export class LightingRig {
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private violetRakeLight: THREE.PointLight;
  private rimLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, resourceManager: ResourceManager) {
    // 1. Studio Ambient
    this.ambientLight = new THREE.AmbientLight(0xFFFFFF, 1.25);
    scene.add(this.ambientLight);

    // 2. Main Key Light (Top-Left)
    this.keyLight = new THREE.DirectionalLight(0xFFFFFF, 1.85);
    this.keyLight.position.set(2.5, 4.0, 4.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    scene.add(this.keyLight);

    // 3. Soft Fill Light (Bottom-Right)
    this.fillLight = new THREE.DirectionalLight(0xE0F2FE, 0.75);
    this.fillLight.position.set(-2.5, -2.0, 3.0);
    scene.add(this.fillLight);

    // 4. Violet/Purple Raking Light for Close-Up Stratification (Ref 03)
    this.violetRakeLight = new THREE.PointLight(0x8B5CF6, 0.3, 10);
    this.violetRakeLight.position.set(1.4, 1.8, 2.2);
    scene.add(this.violetRakeLight);

    // 5. Back Rim Light for Bevel Definition
    this.rimLight = new THREE.DirectionalLight(0x93C5FD, 0.6);
    this.rimLight.position.set(0, 3.0, -3.5);
    scene.add(this.rimLight);

    resourceManager.trackDisposable({
      dispose: () => {
        this.keyLight.dispose();
      },
    });
  }

  public update(t: number, lerpFactor = 0.05): void {
    // Clamped progress t: 0.0 = Ref 01 (Daylight Studio), 1.0 = Ref 03 (Macro Dark Raking)
    const clampedT = Math.max(0, Math.min(1, t));

    // Target intensities
    const targetAmbient = THREE.MathUtils.lerp(1.25, 0.45, clampedT);
    const targetKey = THREE.MathUtils.lerp(1.85, 2.6, clampedT);
    const targetFill = THREE.MathUtils.lerp(0.75, 0.85, clampedT);
    const targetViolet = THREE.MathUtils.lerp(0.3, 2.4, clampedT);
    const targetRim = THREE.MathUtils.lerp(0.6, 1.2, clampedT);

    this.ambientLight.intensity += (targetAmbient - this.ambientLight.intensity) * lerpFactor;
    this.keyLight.intensity += (targetKey - this.keyLight.intensity) * lerpFactor;
    this.fillLight.intensity += (targetFill - this.fillLight.intensity) * lerpFactor;
    this.violetRakeLight.intensity += (targetViolet - this.violetRakeLight.intensity) * lerpFactor;
    this.rimLight.intensity += (targetRim - this.rimLight.intensity) * lerpFactor;

    // Shift Key Light position slightly to create dramatic raking shadows in close-up
    const targetKeyX = THREE.MathUtils.lerp(2.5, 1.6, clampedT);
    const targetKeyY = THREE.MathUtils.lerp(4.0, 3.2, clampedT);
    const targetKeyZ = THREE.MathUtils.lerp(4.5, 3.0, clampedT);

    this.keyLight.position.x += (targetKeyX - this.keyLight.position.x) * lerpFactor;
    this.keyLight.position.y += (targetKeyY - this.keyLight.position.y) * lerpFactor;
    this.keyLight.position.z += (targetKeyZ - this.keyLight.position.z) * lerpFactor;
  }
}
