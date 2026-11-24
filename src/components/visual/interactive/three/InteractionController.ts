import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export type PresetId = "full" | "identity" | "seal" | "authorization" | "reverse";

export interface PresetCallout {
  tag: string;
  title: string;
  body: string;
}

export interface ViewPreset {
  id: PresetId;
  hudLabel: string;
  cameraPos: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cardRot: { x: number; y: number };
  callout: PresetCallout | null;
}

export const VIEW_PRESETS: Record<PresetId, ViewPreset> = {
  full: {
    id: "full",
    hudLabel: "Reference 01 — Floating Credential",
    cameraPos: new THREE.Vector3(0, 0.04, 4.95),
    cameraTarget: new THREE.Vector3(0, -0.02, 0),
    cardRot: { x: 0.045, y: -0.15 },
    callout: null,
  },
  identity: {
    id: "identity",
    hudLabel: "Reference 03 — Close-Up: Title & Identity",
    cameraPos: new THREE.Vector3(-0.04, 0.56, 2.28),
    cameraTarget: new THREE.Vector3(0, 0.52, 0.04),
    cardRot: { x: -0.025, y: 0.05 },
    callout: {
      tag: "Ref 03 • Typography & Framing",
      title: "Institutional Hierarchy & Archival Framing",
      body: "Double-ruled navy border with inverted-arc corner flourishes, micro-text perimeter rules, and clear ILLUSTRATIVE DEMONSTRATION attribution.",
    },
  },
  seal: {
    id: "seal",
    hudLabel: "Reference 03 — Close-Up: Seal & Guilloché",
    cameraPos: new THREE.Vector3(0.92, -0.68, 2.08),
    cameraTarget: new THREE.Vector3(0.52, -0.82, 0.06),
    cardRot: { x: 0.06, y: -0.24 },
    callout: {
      tag: "Ref 03 • Tactile Security Relief",
      title: "Embossed Navy Rosette & Wave Guilloché",
      body: "Physically modeled fluted rosette medallion, beveled ribbon tails, and sweeping sinusoidal security linework cast subtle light response across cotton-porcelain stock.",
    },
  },
  authorization: {
    id: "authorization",
    hudLabel: "Reference 03 — Close-Up: QR & Authorization",
    cameraPos: new THREE.Vector3(-0.56, -0.74, 2.15),
    cameraTarget: new THREE.Vector3(-0.34, -0.82, 0.04),
    cardRot: { x: 0.03, y: 0.13 },
    callout: {
      tag: "Ref 03 • Verification Metadata",
      title: "Illustrative QR Matrix & Registrar Block",
      body: "Displays the structured Credential ID (CV-DEMO-2026-08491), illustrative authorization mark, and scannable verification matrix container for instant lookup.",
    },
  },
  reverse: {
    id: "reverse",
    hudLabel: "Reference 03 — Reverse Security Backing",
    cameraPos: new THREE.Vector3(0, 0.02, 4.45),
    cameraTarget: new THREE.Vector3(0, 0, 0),
    cardRot: { x: 0.03, y: Math.PI - 0.14 },
    callout: {
      tag: "Reverse Surface • Complete Physicality",
      title: "Architectural Backing & Verification Notice",
      body: "Finished reverse porcelain surface with guilloché security lattice, W3C VCDM 2.0 structural overview, and chamfered indigo optical rim trim.",
    },
  },
};

export class InteractionController {
  private activePreset: PresetId = "full";
  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private dragDistance = 0;

  public isHovered = false;
  public targetHoverTiltX = 0;
  public targetHoverTiltY = 0;
  public targetElevationZ = 0;
  public targetElevationY = 0;
  public targetScale = 1.0;

  public hoverParallax = { x: 0, y: 0 };
  public targetUserRot = { x: 0, y: 0 };
  public currentUserRot = { x: 0, y: 0 };

  public currentCamPos: THREE.Vector3;
  public currentCamTarget: THREE.Vector3;
  public currentCardRot: { x: number; y: number };

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  constructor(
    private domElement: HTMLElement,
    private viewportEl: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private hitZones: THREE.Mesh[],
    private onPresetChange: (preset: ViewPreset) => void,
    private onRequestSingleRender: () => void,
    resourceManager: ResourceManager,
    private credentialGroup?: THREE.Group
  ) {
    this.currentCamPos = VIEW_PRESETS.full.cameraPos.clone();
    this.currentCamTarget = VIEW_PRESETS.full.cameraTarget.clone();
    this.currentCardRot = { ...VIEW_PRESETS.full.cardRot };

    this.bindEvents(resourceManager);
  }

  public getActivePreset(): PresetId {
    return this.activePreset;
  }

  public setPreset(presetId: PresetId, resetUserOffset = true): void {
    const preset = VIEW_PRESETS[presetId] || VIEW_PRESETS.full;
    this.activePreset = preset.id;

    if (resetUserOffset) {
      this.targetUserRot.x = 0;
      this.targetUserRot.y = 0;
    }

    this.onPresetChange(preset);
  }

  public resetAll(): void {
    this.hoverParallax.x = 0;
    this.hoverParallax.y = 0;
    this.targetUserRot.x = 0;
    this.targetUserRot.y = 0;
    this.setPreset("full", true);
  }

  public snapToPreset(responsivePos: THREE.Vector3): void {
    const preset = VIEW_PRESETS[this.activePreset];
    this.currentCamPos.copy(responsivePos);
    this.currentCamTarget.copy(preset.cameraTarget);
    this.currentCardRot.x = preset.cardRot.x;
    this.currentCardRot.y = preset.cardRot.y;
    this.currentUserRot.x = this.targetUserRot.x;
    this.currentUserRot.y = this.targetUserRot.y;
  }

  private bindEvents(resourceManager: ResourceManager): void {
    const el = this.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.isDragging = true;
      this.dragDistance = 0;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      if (this.isDragging) {
        const dx = e.clientX - this.lastPointerPos.x;
        const dy = e.clientY - this.lastPointerPos.y;
        this.lastPointerPos = { x: e.clientX, y: e.clientY };
        this.dragDistance += Math.hypot(dx, dy);

        // Controlled rotational sensitivity
        const sensitivity = 0.0072;
        this.targetUserRot.y += dx * sensitivity;
        this.targetUserRot.x += dy * sensitivity;

        // Clamp vertical and horizontal tilt cleanly
        const maxTiltX = 0.52;
        const maxTiltY = Math.PI * 1.15;
        this.targetUserRot.x = THREE.MathUtils.clamp(
          this.targetUserRot.x,
          -maxTiltX,
          maxTiltX
        );
        this.targetUserRot.y = THREE.MathUtils.clamp(
          this.targetUserRot.y,
          -maxTiltY,
          maxTiltY
        );

        this.onRequestSingleRender();
        return;
      }

      // Responsive pointer interaction when mouse is placed on or near the certificate
      if (e.pointerType === "mouse") {
        this.pointerNdc.set(nx, ny);
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);

        const targets = this.credentialGroup ? [this.credentialGroup] : this.hitZones;
        const hits = this.raycaster.intersectObjects(targets, true);
        const isDirectHit = hits.length > 0;

        this.isHovered = true;

        if (isDirectHit) {
          // Direct hover over certificate: subtle, controlled 3D tilt with dignified optical reflection
          this.targetHoverTiltY = THREE.MathUtils.clamp(nx * 0.16, -0.18, 0.18);
          this.targetHoverTiltX = THREE.MathUtils.clamp(-ny * 0.12, -0.14, 0.14);
          this.targetElevationZ = 0.05;
          this.targetElevationY = 0.015;
          this.targetScale = 1.0;
          el.style.cursor = "grab";
        } else {
          // Ambient proximity: subtle optical alignment with cursor
          const dist = Math.hypot(nx, ny);
          const falloff = Math.max(0, 1 - dist * 0.5);
          this.targetHoverTiltY = nx * 0.08 * falloff;
          this.targetHoverTiltX = -ny * 0.06 * falloff;
          this.targetElevationZ = 0;
          this.targetElevationY = 0;
          this.targetScale = 1.0;
          el.style.cursor = "default";
        }

        this.hoverParallax.y = this.targetHoverTiltY;
        this.hoverParallax.x = this.targetHoverTiltX;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // Safe ignore
      }
    };

    const onPointerCancel = () => {
      this.isDragging = false;
      this.isHovered = false;
      this.targetHoverTiltX = 0;
      this.targetHoverTiltY = 0;
      this.targetElevationZ = 0;
      this.targetElevationY = 0;
      this.targetScale = 1.0;
      this.hoverParallax.x = 0;
      this.hoverParallax.y = 0;
    };

    const onPointerLeave = () => {
      this.isHovered = false;
      this.targetHoverTiltX = 0;
      this.targetHoverTiltY = 0;
      this.targetElevationZ = 0;
      this.targetElevationY = 0;
      this.targetScale = 1.0;
      this.hoverParallax.x = 0;
      this.hoverParallax.y = 0;
      if (!this.isDragging) {
        el.style.cursor = "default";
      }
    };

    const onLostPointerCapture = () => {
      this.isDragging = false;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("lostpointercapture", onLostPointerCapture);

    resourceManager.trackDisposable({
      dispose: () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerCancel);
        el.removeEventListener("pointerleave", onPointerLeave);
        el.removeEventListener("lostpointercapture", onLostPointerCapture);
      },
    });
  }
}
