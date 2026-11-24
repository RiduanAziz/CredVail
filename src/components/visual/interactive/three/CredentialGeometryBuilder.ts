import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export interface DocumentDimensions {
  width: number;
  height: number;
  cornerRadius: number;
  coreDepth: number;
  bevelThickness: number;
  bevelSize: number;
}

export const DOCUMENT_SPEC: DocumentDimensions = {
  width: 2.2,
  height: 2.95,
  cornerRadius: 0.06,
  coreDepth: 0.046,
  bevelThickness: 0.015,
  bevelSize: 0.015,
};

export interface BuiltCredentialScene {
  credentialGroup: THREE.Group;
  shadowDisc: THREE.Mesh;
  hitZones: THREE.Mesh[];
}

export class CredentialGeometryBuilder {
  private static createRoundedRectShape(
    width: number,
    height: number,
    radius: number
  ): THREE.Shape {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hh = height / 2;
    const r = Math.min(radius, hw, hh);

    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    return shape;
  }

  private static createNormalizedPlateGeometry(
    width: number,
    height: number,
    radius: number,
    resourceManager: ResourceManager
  ): THREE.BufferGeometry {
    const shape = this.createRoundedRectShape(width, height, radius);
    const geom = resourceManager.trackGeometry(new THREE.ShapeGeometry(shape, 12));
    const pos = geom.attributes.position;
    const uv = geom.attributes.uv;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      uv.setXY(i, (x + width / 2) / width, (y + height / 2) / height);
    }
    uv.needsUpdate = true;
    return geom;
  }

  private static createFlutedRosetteGeometry(
    outerRadius = 0.23,
    flutes = 24,
    resourceManager: ResourceManager
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const steps = flutes * 6;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const scallop = Math.cos(angle * flutes) * 0.014;
      const r = outerRadius + scallop;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.024,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.007,
        bevelSegments: 3,
        curveSegments: 12,
      })
    );
  }

  private static createRibbonTailGeometry(
    width = 0.115,
    length = 0.34,
    resourceManager: ResourceManager
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const hw = width / 2;
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(hw, -length);
    shape.lineTo(0, -length + 0.075); // Classic notched swallowtail
    shape.lineTo(-hw, -length);
    shape.closePath();

    return resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.011,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
      })
    );
  }

  private static createContactShadowTexture(
    resourceManager: ResourceManager
  ): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 64, 6, 128, 64, 118);
      grad.addColorStop(0, "rgba(11, 23, 42, 0.36)");
      grad.addColorStop(0.52, "rgba(11, 23, 42, 0.12)");
      grad.addColorStop(1, "rgba(11, 23, 42, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return resourceManager.trackTexture(tex);
  }

  public static buildCredentialObject(
    frontTex: THREE.CanvasTexture,
    reverseTex: THREE.CanvasTexture,
    bumpTex: THREE.CanvasTexture,
    resourceManager: ResourceManager
  ): BuiltCredentialScene {
    const credentialGroup = new THREE.Group();

    const { width, height, cornerRadius, coreDepth, bevelThickness, bevelSize } =
      DOCUMENT_SPEC;

    // 1. Core Architectural Beveled Chassis
    const coreShape = this.createRoundedRectShape(
      width - bevelSize * 2,
      height - bevelSize * 2,
      cornerRadius
    );
    const coreGeo = resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(coreShape, {
        depth: coreDepth,
        bevelEnabled: true,
        bevelThickness,
        bevelSize,
        bevelSegments: 5,
        curveSegments: 16,
      })
    );
    coreGeo.center();

    const coreMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xdbe3ee,
        roughness: 0.34,
        metalness: 0.38,
      })
    );
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    credentialGroup.add(coreMesh);

    // 2. Whisper-Thin Precision Cobalt/Indigo Optical Edge Inlay (Ref 01 accent)
    const trimShape = this.createRoundedRectShape(
      width - bevelSize * 1.45,
      height - bevelSize * 1.45,
      cornerRadius
    );
    const trimGeo = resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(trimShape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
        curveSegments: 14,
      })
    );
    trimGeo.center();

    const trimMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x0f1d38,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.32,
        metalness: 0.45,
      })
    );
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    credentialGroup.add(trimMesh);

    // 3. Soft Porcelain Archival Front Plate
    const faceZ = coreDepth / 2 + bevelThickness + 0.0012;
    const plateGeo = this.createNormalizedPlateGeometry(
      width - 0.042,
      height - 0.042,
      cornerRadius * 0.82,
      resourceManager
    );
    const frontMat = resourceManager.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        map: frontTex,
        bumpMap: bumpTex,
        bumpScale: 0.0022,
        roughness: 0.58,
        metalness: 0.03,
        clearcoat: 0.12,
        clearcoatRoughness: 0.44,
      })
    );
    const frontMesh = new THREE.Mesh(plateGeo, frontMat);
    frontMesh.position.z = faceZ;
    frontMesh.receiveShadow = true;
    credentialGroup.add(frontMesh);

    // 4. Detailed Reverse Security Plate
    const reverseMat = resourceManager.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        map: reverseTex,
        bumpMap: bumpTex,
        bumpScale: 0.0022,
        roughness: 0.62,
        metalness: 0.04,
        clearcoat: 0.08,
        clearcoatRoughness: 0.5,
      })
    );
    const reverseMesh = new THREE.Mesh(plateGeo, reverseMat);
    reverseMesh.position.z = -faceZ;
    reverseMesh.rotation.y = Math.PI;
    reverseMesh.receiveShadow = true;
    credentialGroup.add(reverseMesh);

    // 5. Physically Modeled 3D Embossed Navy Rosette Seal & Ribbons (Bottom-Right)
    const sealGroup = new THREE.Group();
    sealGroup.position.set(0.57, -0.84, faceZ + 0.002);

    const navySatinMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1b3b6f,
        roughness: 0.38,
        metalness: 0.22,
      })
    );
    const navyDeepMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x132b52,
        roughness: 0.44,
        metalness: 0.18,
      })
    );
    const silverInlayMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x8ea9d4,
        roughness: 0.28,
        metalness: 0.55,
      })
    );

    // Left & Right Angled Beveled Ribbon Tails
    const ribbonGeo = this.createRibbonTailGeometry(0.115, 0.34, resourceManager);
    const leftRibbon = new THREE.Mesh(ribbonGeo, navyDeepMat);
    leftRibbon.position.set(-0.045, -0.05, 0.002);
    leftRibbon.rotation.z = -0.22;
    leftRibbon.castShadow = true;
    leftRibbon.receiveShadow = true;
    sealGroup.add(leftRibbon);

    const rightRibbon = new THREE.Mesh(ribbonGeo, navySatinMat);
    rightRibbon.position.set(0.045, -0.05, 0.006);
    rightRibbon.rotation.z = 0.22;
    rightRibbon.castShadow = true;
    rightRibbon.receiveShadow = true;
    sealGroup.add(rightRibbon);

    // Scalloped Fluted Rosette Base
    const rosetteGeo = this.createFlutedRosetteGeometry(0.215, 24, resourceManager);
    const rosetteMesh = new THREE.Mesh(rosetteGeo, navySatinMat);
    rosetteMesh.position.z = 0.014;
    rosetteMesh.castShadow = true;
    rosetteMesh.receiveShadow = true;
    sealGroup.add(rosetteMesh);

    // Inner Stepped Coin Disc
    const innerCoinGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(0.152, 0.162, 0.016, 40)
    );
    innerCoinGeo.rotateX(Math.PI / 2);
    const innerCoin = new THREE.Mesh(innerCoinGeo, navyDeepMat);
    innerCoin.position.z = 0.045;
    innerCoin.castShadow = true;
    sealGroup.add(innerCoin);

    // Fine Embossed Concentric Rim Ring
    const ringGeo = resourceManager.trackGeometry(
      new THREE.TorusGeometry(0.132, 0.0065, 14, 48)
    );
    const ringMesh = new THREE.Mesh(ringGeo, silverInlayMat);
    ringMesh.position.z = 0.053;
    sealGroup.add(ringMesh);

    // Center Raised Medallion Emblem Disc
    const centerDiscGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(0.085, 0.092, 0.009, 32)
    );
    centerDiscGeo.rotateX(Math.PI / 2);
    const centerDisc = new THREE.Mesh(centerDiscGeo, navySatinMat);
    centerDisc.position.z = 0.055;
    sealGroup.add(centerDisc);

    credentialGroup.add(sealGroup);

    // 6. Invisible Interactive Raycast Hotspots for Region Inspection (Ref 03)
    const hitMat = resourceManager.trackMaterial(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    const hitZones: THREE.Mesh[] = [];
    const addHitZone = (presetId: string, w: number, h: number, x: number, y: number) => {
      const geo = resourceManager.trackGeometry(new THREE.PlaneGeometry(w, h));
      const mesh = new THREE.Mesh(geo, hitMat);
      mesh.position.set(x, y, faceZ + 0.07);
      mesh.userData = { presetId };
      credentialGroup.add(mesh);
      hitZones.push(mesh);
    };

    addHitZone("identity", 1.85, 1.35, 0, 0.58);
    addHitZone("authorization", 1.15, 0.92, -0.38, -0.78);
    addHitZone("seal", 0.82, 0.92, 0.56, -0.78);

    // 7. Grounded Architectural Studio Contact Shadow Disc
    const shadowTex = this.createContactShadowTexture(resourceManager);
    const shadowGeo = resourceManager.trackGeometry(new THREE.PlaneGeometry(2.8, 0.95));
    const shadowMat = resourceManager.trackMaterial(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.set(0, -1.78, 0);

    return { credentialGroup, shadowDisc, hitZones };
  }
}
