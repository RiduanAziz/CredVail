import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export interface CredentialSceneMeshes {
  masterGroup: THREE.Group;
  cardGroup: THREE.Group;
  cardMesh: THREE.Mesh;
  frostedGlassMesh: THREE.Mesh;
  frostedGlassMat: THREE.MeshPhysicalMaterial;
  frostedEdgeMesh: THREE.Mesh;
  frostedEdgeMat: THREE.MeshBasicMaterial;
  sealGroup: THREE.Group;
  plinthGroup: THREE.Group;
  backdropGroup: THREE.Group;
  shieldGroup: THREE.Group;
  magnifierGroup: THREE.Group;
}

export class CredentialGeometryBuilder {
  public static buildScene(
    frontTexture: THREE.CanvasTexture,
    resourceManager: ResourceManager
  ): CredentialSceneMeshes {
    const masterGroup = new THREE.Group();

    // -------------------------------------------------------------
    // 1. Certificate Plaque (Reference 01)
    // -------------------------------------------------------------
    const cardGroup = new THREE.Group();
    const cardWidth = 2.45;
    const cardHeight = 3.32;
    const cardRadius = 0.12;

    const shape = new THREE.Shape();
    const x0 = -cardWidth / 2;
    const y0 = -cardHeight / 2;
    const w = cardWidth;
    const h = cardHeight;
    const r = cardRadius;

    shape.moveTo(x0 + r, y0);
    shape.lineTo(x0 + w - r, y0);
    shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    shape.lineTo(x0 + w, y0 + h - r);
    shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    shape.lineTo(x0 + r, y0 + h);
    shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    shape.lineTo(x0, y0 + r);
    shape.quadraticCurveTo(x0, y0, x0 + r, y0);

    const cardGeo = resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.07,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.02,
        bevelThickness: 0.02,
      })
    );
    cardGeo.center();

    // Front: Premium Satin Finish with high-res canvas map
    const frontFaceMat = resourceManager.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        map: frontTexture,
        roughness: 0.22,
        metalness: 0.06,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        reflectivity: 0.88,
        ior: 1.52,
      })
    );

    // Sides & Back: Pure Porcelain White with soft titanium sheen
    const titaniumBackMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xF8FAFC,
        metalness: 0.28,
        roughness: 0.32,
      })
    );

    const cardMesh = new THREE.Mesh(cardGeo, [frontFaceMat, titaniumBackMat]);
    cardMesh.castShadow = true;
    cardMesh.receiveShadow = true;
    cardGroup.add(cardMesh);

    // -------------------------------------------------------------
    // 2. Stratified Frosted Glass Security Sheet (Reference 03)
    // -------------------------------------------------------------
    const glassWidth = 2.32;
    const glassHeight = 3.18;
    const glassRadius = 0.09;
    const glassShape = new THREE.Shape();
    const gx0 = -glassWidth / 2;
    const gy0 = -glassHeight / 2;
    const gw = glassWidth;
    const gh = glassHeight;
    const gr = glassRadius;

    glassShape.moveTo(gx0 + gr, gy0);
    glassShape.lineTo(gx0 + gw - gr, gy0);
    glassShape.quadraticCurveTo(gx0 + gw, gy0, gx0 + gw, gy0 + gr);
    glassShape.lineTo(gx0 + gw, gy0 + gh - gr);
    glassShape.quadraticCurveTo(gx0 + gw, gy0 + gh, gx0 + gw - gr, gy0 + gh);
    glassShape.lineTo(gx0 + gr, gy0 + gh);
    glassShape.quadraticCurveTo(gx0, gy0 + gh, gx0, gy0 + gh - gr);
    glassShape.lineTo(gx0, gy0 + gr);
    glassShape.quadraticCurveTo(gx0, gy0, gx0 + gr, gy0);

    const glassGeo = resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(glassShape, {
        depth: 0.025,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.012,
        bevelThickness: 0.012,
      })
    );
    glassGeo.center();

    const frostedGlassMat = resourceManager.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xF5F3FF,
        transmission: 0.65,
        opacity: 0.35,
        transparent: true,
        roughness: 0.38,
        metalness: 0.05,
        ior: 1.48,
        clearcoat: 0.8,
      })
    );
    const frostedGlassMesh = new THREE.Mesh(glassGeo, frostedGlassMat);
    frostedGlassMesh.position.z = 0.065;
    cardGroup.add(frostedGlassMesh);

    // Glowing Purple/Violet Edge Ribbon (Ref 03)
    const edgeGeo = resourceManager.trackGeometry(
      new THREE.RingGeometry(1.22, 1.25, 64)
    );
    const frostedEdgeMat = resourceManager.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x8B5CF6,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    const frostedEdgeMesh = new THREE.Mesh(edgeGeo, frostedEdgeMat);
    frostedEdgeMesh.scale.set(1.0, 1.34, 1);
    frostedEdgeMesh.position.z = 0.082;
    cardGroup.add(frostedEdgeMesh);

    // -------------------------------------------------------------
    // 3. Ribbon Seal Medallion (Reference 01 & Reference 03)
    // -------------------------------------------------------------
    const sealGroup = new THREE.Group();
    sealGroup.position.set(0.78, -1.18, 0.075);

    // Outer scalloped medallion ring
    const sealBaseGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 0.035, 32)
    );
    const sealBaseMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1E3A8A,
        metalness: 0.75,
        roughness: 0.25,
      })
    );
    const sealBaseMesh = new THREE.Mesh(sealBaseGeo, sealBaseMat);
    sealBaseMesh.rotation.x = Math.PI / 2;
    sealGroup.add(sealBaseMesh);

    // Inner embossed center disc
    const sealInnerGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(0.20, 0.20, 0.042, 32)
    );
    const sealInnerMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x2563EB,
        metalness: 0.65,
        roughness: 0.3,
      })
    );
    const sealInnerMesh = new THREE.Mesh(sealInnerGeo, sealInnerMat);
    sealInnerMesh.rotation.x = Math.PI / 2;
    sealGroup.add(sealInnerMesh);

    // Gold core rim
    const sealRimGeo = resourceManager.trackGeometry(
      new THREE.TorusGeometry(0.18, 0.015, 16, 48)
    );
    const sealRimMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xF59E0B,
        metalness: 0.9,
        roughness: 0.2,
      })
    );
    const sealRimMesh = new THREE.Mesh(sealRimGeo, sealRimMat);
    sealRimMesh.position.z = 0.026;
    sealGroup.add(sealRimMesh);

    // Two Hanging Ribbon Tails (Ref 01)
    const ribbonTailGeo = resourceManager.trackGeometry(
      new THREE.BoxGeometry(0.12, 0.42, 0.015)
    );
    const ribbonTailMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1E3A8A,
        metalness: 0.6,
        roughness: 0.35,
      })
    );

    const leftTail = new THREE.Mesh(ribbonTailGeo, ribbonTailMat);
    leftTail.position.set(-0.06, -0.26, -0.01);
    leftTail.rotation.z = 0.22;
    sealGroup.add(leftTail);

    const rightTail = new THREE.Mesh(ribbonTailGeo, ribbonTailMat);
    rightTail.position.set(0.06, -0.26, -0.01);
    rightTail.rotation.z = -0.22;
    sealGroup.add(rightTail);

    cardGroup.add(sealGroup);
    masterGroup.add(cardGroup);

    // -------------------------------------------------------------
    // 4. Studio Pedestal / Plinth (Reference 01)
    // -------------------------------------------------------------
    const plinthGroup = new THREE.Group();
    plinthGroup.position.set(0, -1.82, 0);

    const plinthGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(2.35, 2.38, 0.16, 64)
    );
    const plinthMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        metalness: 0.08,
        roughness: 0.25,
      })
    );
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.receiveShadow = true;
    plinthGroup.add(plinthMesh);

    // Plinth Blue/Titanium Base Accent Ring
    const plinthRingGeo = resourceManager.trackGeometry(
      new THREE.TorusGeometry(2.37, 0.018, 16, 64)
    );
    const plinthRingMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1E293B,
        metalness: 0.85,
        roughness: 0.25,
      })
    );
    const plinthRing = new THREE.Mesh(plinthRingGeo, plinthRingMat);
    plinthRing.rotation.x = Math.PI / 2;
    plinthRing.position.y = -0.07;
    plinthGroup.add(plinthRing);

    masterGroup.add(plinthGroup);

    // -------------------------------------------------------------
    // 5. Circular Backdrop Disc & Halo (Reference 01)
    // -------------------------------------------------------------
    const backdropGroup = new THREE.Group();
    backdropGroup.position.set(0, 0.1, -1.15);

    const discGeo = resourceManager.trackGeometry(
      new THREE.CircleGeometry(2.7, 64)
    );
    const discMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xF8FAFC,
        metalness: 0.05,
        roughness: 0.65,
      })
    );
    const discMesh = new THREE.Mesh(discGeo, discMat);
    backdropGroup.add(discMesh);

    // Luminous Halo Ring
    const haloGeo = resourceManager.trackGeometry(
      new THREE.RingGeometry(2.68, 2.76, 64)
    );
    const haloMat = resourceManager.trackMaterial(
      new THREE.MeshBasicMaterial({
        color: 0xE0E7FF,
        side: THREE.DoubleSide,
      })
    );
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    backdropGroup.add(haloMesh);

    masterGroup.add(backdropGroup);

    // -------------------------------------------------------------
    // 6. Flanking Trust Metaphors: Shield & Magnifying Glass (Reference 01)
    // -------------------------------------------------------------
    // Left: 3D Metallic Shield with checkmark
    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(-1.88, -0.45, 0.18);
    shieldGroup.rotation.y = 0.38; // angled toward the certificate

    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 0.72);
    shieldShape.quadraticCurveTo(0.48, 0.65, 0.48, 0.2);
    shieldShape.quadraticCurveTo(0.48, -0.35, 0, -0.72);
    shieldShape.quadraticCurveTo(-0.48, -0.35, -0.48, 0.2);
    shieldShape.quadraticCurveTo(-0.48, 0.65, 0, 0.72);

    const shieldGeo = resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(shieldShape, {
        depth: 0.08,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.02,
        bevelThickness: 0.02,
      })
    );
    shieldGeo.center();

    const shieldMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xE2E8F0,
        metalness: 0.88,
        roughness: 0.22,
      })
    );
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldGroup.add(shieldMesh);

    // Raised Checkmark in relief inside shield
    const checkShape = new THREE.Shape();
    checkShape.moveTo(-0.18, 0.02);
    checkShape.lineTo(-0.06, -0.12);
    checkShape.lineTo(0.20, 0.16);
    checkShape.lineTo(0.14, 0.22);
    checkShape.lineTo(-0.06, -0.02);
    checkShape.lineTo(-0.12, 0.06);
    checkShape.closePath();

    const checkGeo = resourceManager.trackGeometry(
      new THREE.ExtrudeGeometry(checkShape, {
        depth: 0.03,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.01,
        bevelThickness: 0.01,
      })
    );
    checkGeo.center();

    const checkMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x2563EB,
        metalness: 0.5,
        roughness: 0.3,
      })
    );
    const checkMesh = new THREE.Mesh(checkGeo, checkMat);
    checkMesh.position.z = 0.065;
    shieldGroup.add(checkMesh);

    masterGroup.add(shieldGroup);

    // Right: 3D Chrome Magnifying Glass with Glass Lens
    const magnifierGroup = new THREE.Group();
    magnifierGroup.position.set(1.82, -0.52, 0.24);
    magnifierGroup.rotation.y = -0.42; // angled toward the certificate
    magnifierGroup.rotation.z = -0.22;

    // Outer rim
    const rimGeo = resourceManager.trackGeometry(
      new THREE.TorusGeometry(0.48, 0.045, 16, 48)
    );
    const chromeMat = resourceManager.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xE2E8F0,
        metalness: 0.95,
        roughness: 0.15,
      })
    );
    const rimMesh = new THREE.Mesh(rimGeo, chromeMat);
    magnifierGroup.add(rimMesh);

    // Optical Glass Lens
    const lensGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(0.46, 0.46, 0.02, 32)
    );
    const lensMat = resourceManager.trackMaterial(
      new THREE.MeshPhysicalMaterial({
        color: 0xFFFFFF,
        transmission: 0.92,
        opacity: 0.6,
        transparent: true,
        roughness: 0.05,
        ior: 1.52,
      })
    );
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.rotation.x = Math.PI / 2;
    magnifierGroup.add(lensMesh);

    // Cylindrical Handle angled down-right
    const handleGeo = resourceManager.trackGeometry(
      new THREE.CylinderGeometry(0.042, 0.038, 0.72, 24)
    );
    const handleMesh = new THREE.Mesh(handleGeo, chromeMat);
    handleMesh.position.set(0.46, -0.46, 0);
    handleMesh.rotation.z = Math.PI / 4;
    magnifierGroup.add(handleMesh);

    masterGroup.add(magnifierGroup);

    return {
      masterGroup,
      cardGroup,
      cardMesh,
      frostedGlassMesh,
      frostedGlassMat,
      frostedEdgeMesh,
      frostedEdgeMat,
      sealGroup,
      plinthGroup,
      backdropGroup,
      shieldGroup,
      magnifierGroup,
    };
  }
}
