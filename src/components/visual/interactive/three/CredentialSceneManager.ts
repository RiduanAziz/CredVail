import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";
import { CredentialTextureGenerator } from "./CredentialTextureGenerator";
import {
  CredentialGeometryBuilder,
  BuiltCredentialScene,
} from "./CredentialGeometryBuilder";
import { LightingRig } from "./LightingRig";
import {
  InteractionController,
  PresetId,
  ViewPreset,
  VIEW_PRESETS,
} from "./InteractionController";

export interface SceneManagerCallbacks {
  onPresetChange: (preset: ViewPreset) => void;
  onContextLost: () => void;
  onContextRestored: () => void;
}

export class CredentialSceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private resourceManager: ResourceManager;
  private lightingRig: LightingRig;
  private builtScene: BuiltCredentialScene;
  private interactionController: InteractionController;

  private rafId: number | null = null;
  private lastFrameTime = 0;
  private elapsed = 0;

  private currentHoverTiltX = 0;
  private currentHoverTiltY = 0;
  private currentElevationZ = 0;
  private currentElevationY = 0;
  private currentScale = 1.0;

  private isVisible = true;
  private isTabVisible = true;
  private isContextLost = false;
  private reducedMotion = false;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private boundHandlers: Record<string, EventListener> = {};

  constructor(
    private viewportEl: HTMLElement,
    private canvasWrapEl: HTMLElement,
    private callbacks: SceneManagerCallbacks,
    initialReducedMotion = false
  ) {
    this.resourceManager = new ResourceManager();
    this.reducedMotion = initialReducedMotion;

    try {
      const rect = viewportEl.getBoundingClientRect();
      const width = Math.max(rect.width, 280);
      const height = Math.max(rect.height, 320);
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

      // 1. Scene & Camera Setup
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 30);

      // 2. High-Precision Renderer
      const pixelRatioCap = Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        isMobile ? 1.5 : 2.0
      );

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(pixelRatioCap);
      this.renderer.setSize(width, height, false);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.canvasWrapEl.innerHTML = "";
      this.canvasWrapEl.appendChild(this.renderer.domElement);

      this.resourceManager.trackDisposable({
        dispose: () => {
          this.renderer.dispose();
          if (this.canvasWrapEl.contains(this.renderer.domElement)) {
            this.canvasWrapEl.removeChild(this.renderer.domElement);
          }
        },
      });

      // 3. Balanced Three-Point Architectural Studio Lighting
      this.lightingRig = new LightingRig(this.scene, this.resourceManager, isMobile);

      // 4. Procedural Archival Textures
      const maxAniso = Math.min(
        this.renderer.capabilities.getMaxAnisotropy(),
        isMobile ? 4 : 8
      );
      const frontTex = CredentialTextureGenerator.createFrontTexture(
        isMobile,
        this.resourceManager
      );
      const reverseTex = CredentialTextureGenerator.createReverseTexture(
        isMobile,
        this.resourceManager
      );
      const bumpTex = CredentialTextureGenerator.createPaperBumpTexture(
        512,
        this.resourceManager
      );
      frontTex.anisotropy = maxAniso;
      reverseTex.anisotropy = maxAniso;

      // 5. Geometry Construction (Chassis, plates, 3D rosette seal, contact shadow)
      this.builtScene = CredentialGeometryBuilder.buildCredentialObject(
        frontTex,
        reverseTex,
        bumpTex,
        this.resourceManager
      );
      this.scene.add(this.builtScene.credentialGroup);
      this.scene.add(this.builtScene.shadowDisc);

      // 6. Interaction Controller (Movement threshold, pointer drag, raycast clicks)
      this.interactionController = new InteractionController(
        this.renderer.domElement,
        this.viewportEl,
        this.camera,
        this.builtScene.hitZones,
        (preset) => this.callbacks.onPresetChange(preset),
        () => {
          if (this.reducedMotion) this.renderSingleFrame();
        },
        this.resourceManager,
        this.builtScene.credentialGroup
      );

      // Set initial camera position
      this.camera.position.copy(this.getResponsiveCameraPos(VIEW_PRESETS.full));
      this.interactionController.currentCamPos.copy(this.camera.position);

      // 7. Observers & Context Loss Handlers
      this.setupObservers();
    } catch (err) {
      // Rollback cleanup on constructor failure
      this.dispose();
      throw err;
    }
  }

  public getResponsiveCameraPos(preset: ViewPreset): THREE.Vector3 {
    const rect = this.viewportEl.getBoundingClientRect();
    const aspect = rect.width / Math.max(rect.height, 1);
    const out = preset.cameraPos.clone();

    // Pull back camera slightly on narrow mobile viewports to prevent clipping
    if (aspect < 0.92) {
      const pullback = (0.92 - aspect) * (preset.id === "full" ? 2.15 : 1.05);
      out.z += pullback;
    }
    return out;
  }

  private setupObservers(): void {
    // 1. Container-Aware ResizeObserver
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.renderer || !this.camera) return;
      const rect = this.viewportEl.getBoundingClientRect();
      const w = Math.max(rect.width, 280);
      const h = Math.max(rect.height, 320);
      const isMobile = window.innerWidth < 768;

      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2.0)
      );
      this.renderer.setSize(w, h, false);

      if (this.reducedMotion) {
        const preset = VIEW_PRESETS[this.interactionController.getActivePreset()];
        this.interactionController.snapToPreset(this.getResponsiveCameraPos(preset));
        this.renderSingleFrame();
      }
    });
    this.resizeObserver.observe(this.viewportEl);

    // 2. IntersectionObserver (Pauses loop when stage leaves viewport)
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          this.isVisible = entry.isIntersecting;
          this.syncRenderLoop();
        }
      },
      { threshold: 0.02 }
    );
    this.intersectionObserver.observe(this.viewportEl);

    // 3. Page Visibility Observer (Pauses loop when tab is hidden)
    this.boundHandlers.visibility = () => {
      this.isTabVisible = document.visibilityState === "visible";
      this.syncRenderLoop();
    };
    document.addEventListener("visibilitychange", this.boundHandlers.visibility);

    // 4. WebGL Context Loss & Restoration
    const canvas = this.renderer.domElement;
    this.boundHandlers.contextLost = ((e: Event) => {
      e.preventDefault();
      this.isContextLost = true;
      this.stopLoop();
      this.callbacks.onContextLost();
    }) as EventListener;

    this.boundHandlers.contextRestored = (() => {
      this.isContextLost = false;
      this.callbacks.onContextRestored();
      this.syncRenderLoop();
    }) as EventListener;

    canvas.addEventListener("webglcontextlost", this.boundHandlers.contextLost);
    canvas.addEventListener(
      "webglcontextrestored",
      this.boundHandlers.contextRestored
    );

    this.resourceManager.trackDisposable({
      dispose: () => {
        if (this.resizeObserver) {
          this.resizeObserver.disconnect();
          this.resizeObserver = null;
        }
        if (this.intersectionObserver) {
          this.intersectionObserver.disconnect();
          this.intersectionObserver = null;
        }
        document.removeEventListener(
          "visibilitychange",
          this.boundHandlers.visibility
        );
        canvas.removeEventListener(
          "webglcontextlost",
          this.boundHandlers.contextLost
        );
        canvas.removeEventListener(
          "webglcontextrestored",
          this.boundHandlers.contextRestored
        );
      },
    });
  }

  public setPreset(presetId: PresetId): void {
    this.interactionController.setPreset(presetId);
    if (this.reducedMotion) {
      const preset = VIEW_PRESETS[presetId];
      this.interactionController.snapToPreset(this.getResponsiveCameraPos(preset));
      this.renderSingleFrame();
    }
  }

  public resetAll(): void {
    this.interactionController.resetAll();
    if (this.reducedMotion) {
      this.interactionController.snapToPreset(
        this.getResponsiveCameraPos(VIEW_PRESETS.full)
      );
      this.renderSingleFrame();
    }
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.stopLoop();
      const preset = VIEW_PRESETS[this.interactionController.getActivePreset()];
      this.interactionController.snapToPreset(this.getResponsiveCameraPos(preset));
      this.renderSingleFrame();
    } else {
      this.syncRenderLoop();
    }
  }

  public syncRenderLoop(): void {
    const shouldRun =
      this.isVisible &&
      this.isTabVisible &&
      !this.reducedMotion &&
      !this.isContextLost;

    if (shouldRun) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  public startLoop(): void {
    if (this.rafId !== null) return; // Idempotent check
    this.lastFrameTime = performance.now();

    const tick = (now: number) => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = now;
      this.step(dt);
      this.renderer.render(this.scene, this.camera);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private step(dt: number): void {
    this.elapsed += dt;
    const activePresetId = this.interactionController.getActivePreset();
    const preset = VIEW_PRESETS[activePresetId];
    const targetCamPos = this.getResponsiveCameraPos(preset);

    // Critically damped delta-time interpolation (frame-rate independent)
    const camAlpha = 1 - Math.exp(-5.4 * dt);
    const rotAlpha = 1 - Math.exp(-6.2 * dt);
    const hoverAlpha = 1 - Math.exp(-7.8 * dt);

    this.currentHoverTiltX +=
      (this.interactionController.targetHoverTiltX - this.currentHoverTiltX) * hoverAlpha;
    this.currentHoverTiltY +=
      (this.interactionController.targetHoverTiltY - this.currentHoverTiltY) * hoverAlpha;
    this.currentElevationZ +=
      (this.interactionController.targetElevationZ - this.currentElevationZ) * hoverAlpha;
    this.currentElevationY +=
      (this.interactionController.targetElevationY - this.currentElevationY) * hoverAlpha;
    this.currentScale +=
      (this.interactionController.targetScale - this.currentScale) * hoverAlpha;

    this.interactionController.currentCamPos.lerp(targetCamPos, camAlpha);
    this.interactionController.currentCamTarget.lerp(preset.cameraTarget, camAlpha);

    this.interactionController.currentCardRot.x +=
      (preset.cardRot.x - this.interactionController.currentCardRot.x) * rotAlpha;
    this.interactionController.currentCardRot.y +=
      (preset.cardRot.y - this.interactionController.currentCardRot.y) * rotAlpha;

    this.interactionController.currentUserRot.x +=
      (this.interactionController.targetUserRot.x -
        this.interactionController.currentUserRot.x) *
      rotAlpha;
    this.interactionController.currentUserRot.y +=
      (this.interactionController.targetUserRot.y -
        this.interactionController.currentUserRot.y) *
      rotAlpha;

    // Calm, grounded stance (no continuous floating bob or breathing wobble)
    const floatY = 0;

    // Apply calm position: grounded elevation + subtle responsive hover lift
    this.builtScene.credentialGroup.position.y = this.currentElevationY;
    this.builtScene.credentialGroup.position.z = this.currentElevationZ;
    this.builtScene.credentialGroup.scale.set(1, 1, 1);

    // Apply rotation: resting angle + user drag + crisp responsive hover tilt
    this.builtScene.credentialGroup.rotation.x =
      this.interactionController.currentCardRot.x +
      this.interactionController.currentUserRot.x +
      this.currentHoverTiltX;

    this.builtScene.credentialGroup.rotation.y =
      this.interactionController.currentCardRot.y +
      this.interactionController.currentUserRot.y +
      this.currentHoverTiltY;

    // Stable, realistic architectural ground contact shadow
    this.builtScene.shadowDisc.scale.set(1.0, 1.0, 1);
    (this.builtScene.shadowDisc.material as THREE.MeshBasicMaterial).opacity = 0.38;

    this.camera.position.copy(this.interactionController.currentCamPos);
    this.camera.lookAt(this.interactionController.currentCamTarget);
  }

  public renderSingleFrame(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.builtScene.credentialGroup.position.y = 0;
    this.builtScene.credentialGroup.rotation.x =
      this.interactionController.currentCardRot.x +
      this.interactionController.currentUserRot.x;
    this.builtScene.credentialGroup.rotation.y =
      this.interactionController.currentCardRot.y +
      this.interactionController.currentUserRot.y;
    this.camera.position.copy(this.interactionController.currentCamPos);
    this.camera.lookAt(this.interactionController.currentCamTarget);
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.stopLoop();
    this.resourceManager.disposeAll();
  }
}
