import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";
import { CredentialTextureGenerator } from "./CredentialTextureGenerator";
import { CredentialGeometryBuilder, CredentialSceneMeshes } from "./CredentialGeometryBuilder";
import { LightingRig } from "./LightingRig";
import { InteractionController, ViewMode } from "./InteractionController";

export class CredentialSceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private resourceManager: ResourceManager;
  private lightingRig: LightingRig;
  private meshes: CredentialSceneMeshes;
  private interactionController: InteractionController;

  private animationFrameId: number | null = null;
  private isVisible = true;
  private isTabActive = true;
  private isContextLost = false;

  private intersectionObserver: IntersectionObserver | null = null;

  constructor(private container: HTMLElement) {
    this.resourceManager = new ResourceManager();

    const width = container.clientWidth || 540;
    const height = container.clientHeight || 540;

    // 1. Scene & Camera Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    this.camera.position.set(0, 0.12, 6.7);
    this.scene.add(this.camera);

    // 2. High-Precision Renderer
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
    const pixelRatioCap = isMobile ? 1.25 : Math.min(window.devicePixelRatio || 1, 1.75);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatioCap);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    this.resourceManager.trackDisposable({
      dispose: () => {
        this.renderer.dispose();
        if (container.contains(this.renderer.domElement)) {
          container.removeChild(this.renderer.domElement);
        }
      },
    });

    // 3. Lighting Rig
    this.lightingRig = new LightingRig(this.scene, this.resourceManager);

    // 4. Procedural Vector-Grade Certificate Texture
    const certificateTexture = CredentialTextureGenerator.createCertificateTexture(
      this.resourceManager
    );

    // 5. Geometry Builder (Plaque, Plinth, Halo, Ribbon Seal, Shield, Magnifier, Frosted Glass)
    this.meshes = CredentialGeometryBuilder.buildScene(
      certificateTexture,
      this.resourceManager
    );
    this.scene.add(this.meshes.masterGroup);

    // 6. Interaction Controller (Pointer drag, hover parallax, mode transitions)
    this.interactionController = new InteractionController(
      this.camera,
      this.meshes,
      this.lightingRig,
      this.renderer.domElement,
      this.resourceManager
    );

    // 7. Event & Lifecycle Listeners
    this.setupLifecycleObservers();
  }

  private setupLifecycleObservers(): void {
    // Resize Listener
    const handleResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth || 540;
      const h = this.container.clientHeight || 540;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Visibility / Inactive Tab Listener
    const handleVisibility = () => {
      this.isTabActive = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Intersection Observer (Stop rendering when container is scrolled out of viewport)
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            this.isVisible = entry.isIntersecting;
          }
        },
        { threshold: 0.05 }
      );
      this.intersectionObserver.observe(this.container);
    }

    // WebGL Context Loss Handling
    const canvas = this.renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.isContextLost = true;
      this.stop();
    };
    const onContextRestored = () => {
      this.isContextLost = false;
      this.start();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    this.resourceManager.trackDisposable({
      dispose: () => {
        window.removeEventListener("resize", handleResize);
        document.removeEventListener("visibilitychange", handleVisibility);
        if (this.intersectionObserver) {
          this.intersectionObserver.disconnect();
          this.intersectionObserver = null;
        }
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
      },
    });
  }

  public setMode(mode: ViewMode): void {
    this.interactionController.setMode(mode);
  }

  public toggleMode(): ViewMode {
    return this.interactionController.toggleMode();
  }

  public reset(): void {
    this.interactionController.reset();
  }

  public getMode(): ViewMode {
    return this.interactionController.getMode();
  }

  public start(): void {
    if (this.animationFrameId !== null) return;

    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      if (!this.isVisible || !this.isTabActive || this.isContextLost) {
        return; // Conserve CPU/GPU cycles when offscreen or hidden
      }

      this.interactionController.update();
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public dispose(): void {
    this.stop();
    this.resourceManager.disposeAll();
  }
}
