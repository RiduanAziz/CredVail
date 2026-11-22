import * as THREE from "three";
import { CredentialSceneMeshes } from "./CredentialGeometryBuilder";
import { LightingRig } from "./LightingRig";
import { ResourceManager } from "./ResourceManager";

export type ViewMode = "overview" | "closeup";

export class InteractionController {
  private viewMode: ViewMode = "overview";
  private currentT = 0; // 0 = Ref 01, 1 = Ref 03
  private targetT = 0;

  // Pointer & Drag state
  private isDragging = false;
  private previousPointerPos = { x: 0, y: 0 };
  private userDragRot = { x: 0, y: 0 };
  private targetUserDragRot = { x: 0, y: 0 };
  private mouseParallax = { x: 0, y: 0 };

  private clock = new THREE.Clock();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private meshes: CredentialSceneMeshes,
    private lightingRig: LightingRig,
    private domElement: HTMLElement,
    resourceManager: ResourceManager
  ) {
    this.setupEventListeners(resourceManager);
  }

  private setupEventListeners(resourceManager: ResourceManager): void {
    const onPointerDown = (e: PointerEvent) => {
      // Only drag with primary mouse button or touch
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.isDragging = true;
      this.previousPointerPos = { x: e.clientX, y: e.clientY };
      try {
        this.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Fallback
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // Mouse Parallax Calculation (Normalized -1 to +1)
      const rect = this.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.mouseParallax = {
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      };

      if (!this.isDragging) return;

      const deltaX = e.clientX - this.previousPointerPos.x;
      const deltaY = e.clientY - this.previousPointerPos.y;
      this.previousPointerPos = { x: e.clientX, y: e.clientY };

      const sensitivity = 0.005;
      this.targetUserDragRot.y += deltaX * sensitivity;
      this.targetUserDragRot.x += deltaY * sensitivity;

      // Strict clamps to prevent flipping or unnatural deformation
      const maxPitch = this.viewMode === "overview" ? 0.32 : 0.22;
      const maxYaw = this.viewMode === "overview" ? 0.65 : 0.35;
      this.targetUserDragRot.x = Math.max(-maxPitch, Math.min(maxPitch, this.targetUserDragRot.x));
      this.targetUserDragRot.y = Math.max(-maxYaw, Math.min(maxYaw, this.targetUserDragRot.y));
    };

    const onPointerUp = (e: PointerEvent) => {
      this.isDragging = false;
      try {
        this.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // Fallback
      }
    };

    const onPointerLeave = () => {
      this.mouseParallax = { x: 0, y: 0 };
    };

    this.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    this.domElement.addEventListener("pointerleave", onPointerLeave);

    resourceManager.trackDisposable({
      dispose: () => {
        this.domElement.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        this.domElement.removeEventListener("pointerleave", onPointerLeave);
      },
    });
  }

  public setMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.targetT = mode === "closeup" ? 1.0 : 0.0;
  }

  public toggleMode(): ViewMode {
    const nextMode: ViewMode = this.viewMode === "overview" ? "closeup" : "overview";
    this.setMode(nextMode);
    return nextMode;
  }

  public reset(): void {
    this.setMode("overview");
    this.targetUserDragRot = { x: 0, y: 0 };
  }

  public getMode(): ViewMode {
    return this.viewMode;
  }

  public getTransitionProgress(): number {
    return this.currentT;
  }

  public update(): void {
    const elapsedTime = this.clock.getElapsedTime();
    const lerpSpeed = 0.045;

    // 1. Smoothly interpolate transition progress between Ref 01 (0) and Ref 03 (1)
    this.currentT += (this.targetT - this.currentT) * lerpSpeed;
    const t = this.currentT;

    // 2. Smoothly damp user drag rotation
    const dragLerp = 0.08;
    this.userDragRot.x += (this.targetUserDragRot.x - this.userDragRot.x) * dragLerp;
    this.userDragRot.y += (this.targetUserDragRot.y - this.userDragRot.y) * dragLerp;

    // When not dragging, user rotation gently returns towards center (elastic spring)
    if (!this.isDragging) {
      this.targetUserDragRot.x *= 0.985;
      this.targetUserDragRot.y *= 0.985;
    }

    // 3. Gentle Breathing Float (Calm in overview, stabilized in close-up)
    const floatAmp = THREE.MathUtils.lerp(0.045, 0.015, t);
    const floatSpeed = THREE.MathUtils.lerp(0.42, 0.25, t);
    const floatY = Math.sin(elapsedTime * floatSpeed) * floatAmp;
    const idleYaw = Math.sin(elapsedTime * 0.22) * 0.02 * (1 - t * 0.7);

    // 4. Update Camera Position & LookAt
    // Ref 01: (0, 0.12, 6.7) | Ref 03: (0.38, -0.38, 2.85)
    const camTargetX = THREE.MathUtils.lerp(0, 0.38, t);
    const camTargetY = THREE.MathUtils.lerp(0.12, -0.38, t);
    const camTargetZ = THREE.MathUtils.lerp(6.7, 2.85, t);

    this.camera.position.x += (camTargetX - this.camera.position.x) * lerpSpeed;
    this.camera.position.y += (camTargetY - this.camera.position.y) * lerpSpeed;
    this.camera.position.z += (camTargetZ - this.camera.position.z) * lerpSpeed;

    const lookTargetX = THREE.MathUtils.lerp(0, 0.18, t);
    const lookTargetY = THREE.MathUtils.lerp(-0.05, -0.42, t);
    const lookTargetZ = THREE.MathUtils.lerp(0, 0.05, t);

    const currentLookAt = new THREE.Vector3(lookTargetX, lookTargetY, lookTargetZ);
    this.camera.lookAt(currentLookAt);

    // 5. Update Card Group Position & Orientation
    // Base Tilt: Ref 01 sits slightly tilted backward (-0.09 rad)
    // Ref 03 rotates into an isometric oblique angle (-0.36, 0.30, -0.05)
    const baseRotX = THREE.MathUtils.lerp(-0.09, -0.36, t);
    const baseRotY = THREE.MathUtils.lerp(0, 0.30, t);
    const baseRotZ = THREE.MathUtils.lerp(0, -0.05, t);

    // Combine base rotation + drag + parallax + idle float
    const finalRotX = baseRotX + this.userDragRot.x + this.mouseParallax.y * 0.025;
    const finalRotY = baseRotY + this.userDragRot.y + this.mouseParallax.x * 0.035 + idleYaw;
    const finalRotZ = baseRotZ;

    this.meshes.cardGroup.rotation.x = finalRotX;
    this.meshes.cardGroup.rotation.y = finalRotY;
    this.meshes.cardGroup.rotation.z = finalRotZ;

    const basePosY = THREE.MathUtils.lerp(0, -0.05, t) + floatY;
    const basePosX = THREE.MathUtils.lerp(0, 0.05, t);
    this.meshes.cardGroup.position.set(basePosX, basePosY, 0);

    // 6. Update Flanking Trust Elements (Shield & Magnifier)
    // Ref 01: Fully visible (scale 1.0)
    // Ref 03: Fades and scales down smoothly (scale 0.0) so macro inspection focuses strictly on document
    const flankingScale = THREE.MathUtils.lerp(1.0, 0.001, t);
    this.meshes.shieldGroup.scale.setScalar(flankingScale);
    this.meshes.magnifierGroup.scale.setScalar(flankingScale);

    // Plinth and Backdrop fade gently in close-up
    const envScale = THREE.MathUtils.lerp(1.0, 0.35, t);
    this.meshes.plinthGroup.scale.set(envScale, 1.0, envScale);
    this.meshes.backdropGroup.scale.setScalar(envScale);

    // 7. Update Frosted Glass Security Overlay (Ref 03)
    // In Ref 03, the frosted sheet and violet glowing edge illuminate dramatically!
    const targetGlassOpacity = THREE.MathUtils.lerp(0.25, 0.72, t);
    const targetEdgeOpacity = THREE.MathUtils.lerp(0.2, 0.95, t);

    this.meshes.frostedGlassMat.opacity += (targetGlassOpacity - this.meshes.frostedGlassMat.opacity) * lerpSpeed;
    this.meshes.frostedEdgeMat.opacity += (targetEdgeOpacity - this.meshes.frostedEdgeMat.opacity) * lerpSpeed;

    // 8. Update Lighting Rig
    this.lightingRig.update(t, lerpSpeed);
  }
}
