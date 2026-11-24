import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export class LightingRig {
  public hemiLight: THREE.HemisphereLight;
  public keyLight: THREE.DirectionalLight;
  public fillLight: THREE.DirectionalLight;
  public rimLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, resourceManager: ResourceManager, isMobile: boolean) {
    // 1. Studio Hemisphere Light
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xdbe4f0, 1.08);
    scene.add(this.hemiLight);

    // 2. Main Key Light (Top-Left, Soft Shadows)
    this.keyLight = new THREE.DirectionalLight(0xfffdf9, 1.48);
    this.keyLight.position.set(2.8, 3.8, 4.8);
    this.keyLight.castShadow = true;
    const shadowMapSize = isMobile ? 512 : 1024;
    this.keyLight.shadow.mapSize.width = shadowMapSize;
    this.keyLight.shadow.mapSize.height = shadowMapSize;
    this.keyLight.shadow.camera.near = 1.0;
    this.keyLight.shadow.camera.far = 12.0;
    this.keyLight.shadow.camera.left = -2.2;
    this.keyLight.shadow.camera.right = 2.2;
    this.keyLight.shadow.camera.top = 2.4;
    this.keyLight.shadow.camera.bottom = -2.4;
    this.keyLight.shadow.bias = -0.0005;
    scene.add(this.keyLight);

    // 3. Cool Studio Fill Light
    this.fillLight = new THREE.DirectionalLight(0xe0ecff, 0.68);
    this.fillLight.position.set(-3.8, 1.0, 3.2);
    scene.add(this.fillLight);

    // 4. Quiet Neutral Studio Rim Light (clean edge definition without artificial colored glow)
    this.rimLight = new THREE.DirectionalLight(0xf1f5f9, 0.45);
    this.rimLight.position.set(0.6, -2.0, -3.4);
    scene.add(this.rimLight);

    resourceManager.trackDisposable({
      dispose: () => {
        this.keyLight.dispose();
      },
    });
  }
}
