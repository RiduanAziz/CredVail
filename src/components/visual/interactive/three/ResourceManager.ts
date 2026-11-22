import * as THREE from "three";

export interface DisposableResource {
  dispose: () => void;
}

export class ResourceManager {
  private geometries: Set<THREE.BufferGeometry> = new Set();
  private materials: Set<THREE.Material> = new Set();
  private textures: Set<THREE.Texture> = new Set();
  private disposables: Set<DisposableResource> = new Set();

  public trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  public trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  public trackTexture<T extends THREE.Texture>(texture: T): T {
    this.textures.add(texture);
    return texture;
  }

  public trackDisposable<T extends DisposableResource>(disposable: T): T {
    this.disposables.add(disposable);
    return disposable;
  }

  public disposeAll(): void {
    for (const geo of this.geometries) {
      geo.dispose();
    }
    this.geometries.clear();

    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials.clear();

    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.clear();

    for (const disp of this.disposables) {
      try {
        disp.dispose();
      } catch {
        // Safe disposal
      }
    }
    this.disposables.clear();
  }
}
