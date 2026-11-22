"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CredentialStaticFallback } from "../fallback/CredentialStaticFallback";

interface CredentialCoreSceneProps {
  scrollProgress?: number;
  className?: string;
}

export function CredentialCoreScene({
  scrollProgress = 0,
  className = "",
}: CredentialCoreSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Smooth progress ref
  const progressRef = useRef(scrollProgress);
  useEffect(() => {
    progressRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setHasWebGL(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Check WebGL availability
    try {
      const testCanvas = document.createElement("canvas");
      const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setHasWebGL(false);
        return;
      }
      setHasWebGL(true);
    } catch {
      setHasWebGL(false);
      return;
    }

    let animationFrameId: number;
    const width = container.clientWidth || window.innerWidth || 1200;
    const height = container.clientHeight || window.innerHeight || 800;

    // Scene & Perspective Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 8.4);

    // High-performance WebGL Renderer with ACES Filmic tone mapping
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      container.appendChild(renderer.domElement);
    } catch {
      setHasWebGL(false);
      return;
    }

    // -------------------------------------------------------------
    // HIGH-RES RETINA FRONT TEXTURE (2048 x 1280)
    // Guilloche security rosettes, holographic foil, micro-text
    // -------------------------------------------------------------
    function createFrontTexture(): THREE.CanvasTexture {
      const canvas = document.createElement("canvas");
      canvas.width = 2048;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(canvas);

      // Porcelain cream & cool tint background
      const bgGrad = ctx.createLinearGradient(0, 0, 2048, 1280);
      bgGrad.addColorStop(0, "#FFFFFF");
      bgGrad.addColorStop(0.45, "#FAFBFD");
      bgGrad.addColorStop(1, "#F0F4FA");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 2048, 1280);

      // Mathematical Guilloche Rosette Background Patterns (Security Watermark)
      ctx.save();
      const drawGuilloche = (cx: number, cy: number, rBase: number, waves: number, amp: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let theta = 0; theta <= Math.PI * 12; theta += 0.015) {
          const r = rBase + amp * Math.sin(waves * theta);
          const x = cx + r * Math.cos(theta);
          const y = cy + r * Math.sin(theta);
          if (theta === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      // Two subtle security guilloche rosettes in background
      drawGuilloche(600, 640, 260, 9, 45, "rgba(37, 114, 244, 0.035)");
      drawGuilloche(1440, 640, 320, 11, 55, "rgba(90, 92, 242, 0.03)");
      drawGuilloche(1650, 950, 180, 7, 30, "rgba(217, 119, 6, 0.04)");
      ctx.restore();

      // Outer Precision Security Border
      ctx.strokeStyle = "rgba(15, 29, 56, 0.22)";
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 36, 1976, 1208);

      // Micro-text security thread along top and bottom
      ctx.fillStyle = "rgba(15, 29, 56, 0.35)";
      ctx.font = "bold 13px ui-monospace, Menlo, monospace";
      const microText = "CREDVAIL INFRASTRUCTURE • W3C VERIFIABLE CREDENTIAL 2.0 • NIST P-256 SIGNATURE • RFC 8785 CANONICAL JSON • OPENZEPPELIN MERKLE V5 • SEPOLIA L1 ANCHOR • ";
      ctx.fillText(microText.repeat(3), 44, 52);
      ctx.fillText(microText.repeat(3), 44, 1238);

      // Vertical Laser Holographic Security Ribbon (Left Side)
      const holoGrad = ctx.createLinearGradient(120, 80, 180, 1200);
      holoGrad.addColorStop(0, "rgba(90, 92, 242, 0.15)");
      holoGrad.addColorStop(0.2, "rgba(37, 114, 244, 0.18)");
      holoGrad.addColorStop(0.4, "rgba(16, 185, 129, 0.16)");
      holoGrad.addColorStop(0.6, "rgba(245, 158, 11, 0.15)");
      holoGrad.addColorStop(0.8, "rgba(131, 82, 233, 0.18)");
      holoGrad.addColorStop(1, "rgba(37, 114, 244, 0.15)");

      ctx.fillStyle = holoGrad;
      ctx.fillRect(110, 80, 36, 1120);

      ctx.strokeStyle = "rgba(15, 29, 56, 0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(110, 80, 36, 1120);

      // Main Header Block
      // Institutional Crest / Monogram
      ctx.fillStyle = "#0F1D38";
      ctx.beginPath();
      ctx.roundRect(190, 110, 90, 90, 20);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 52px Inter, sans-serif";
      ctx.fillText("C", 216, 175);

      // Header Typography
      ctx.fillStyle = "#0F1D38";
      ctx.font = "800 44px Inter, sans-serif";
      ctx.fillText("CREDVAIL TRUST NETWORK", 310, 155);

      ctx.fillStyle = "#64748B";
      ctx.font = "600 24px Inter, sans-serif";
      ctx.fillText("Decentralized Institutional Credential Infrastructure • W3C VC 2.0", 310, 190);

      // Security Protocol Badge (Top Right)
      ctx.fillStyle = "rgba(16, 185, 129, 0.1)";
      ctx.beginPath();
      ctx.roundRect(1520, 110, 420, 72, 16);
      ctx.fill();

      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#047857";
      ctx.font = "bold 22px Inter, sans-serif";
      ctx.fillText("● ECDSA NIST P-256 VERIFIED", 1555, 155);

      // Elegant Separator Line
      ctx.strokeStyle = "rgba(15, 29, 56, 0.12)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(190, 240);
      ctx.lineTo(1940, 240);
      ctx.stroke();

      // Certificate Body Content
      ctx.fillStyle = "#5A5CF2";
      ctx.font = "800 26px Inter, sans-serif";
      ctx.letterSpacing = "0.15em";
      ctx.fillText("GOVERNED INSTITUTIONAL ATTESTATION", 190, 330);

      ctx.fillStyle = "#0F1D38";
      ctx.font = "900 68px Inter, sans-serif";
      ctx.fillText("Master of Cryptographic Systems", 190, 425);

      ctx.fillStyle = "#475569";
      ctx.font = "500 30px Inter, sans-serif";
      ctx.fillText("Conferred with highest institutional honors upon:", 190, 505);

      ctx.fillStyle = "#0F1D38";
      ctx.font = "800 50px Inter, sans-serif";
      ctx.fillText("Dr. Elena Vance, Ph.D.", 190, 580);

      // Cryptographic Attestation Metadata Table
      ctx.fillStyle = "#64748B";
      ctx.font = "500 24px ui-monospace, Menlo, monospace";
      ctx.fillText("ISSUER DID:   did:web:credvail.org:authorities:sepolia", 190, 690);
      ctx.fillText("HOLDER VAULT: did:key:zDnaen19P8uX24k9L0mC...41b9a2 (Private)", 190, 735);
      ctx.fillText("MERKLE ROOT:  0x9a8f4c2e71d3b0851e428c9b6348ef...5d21c (L1)", 190, 780);
      ctx.fillText("STATUS LIST:  W3C Bitstring 2021 (Compressed Index #0482)", 190, 825);
      ctx.fillText("EPOCH ID:     2026-Q4-SEPOLIA-L1-ANCHORED", 190, 870);

      // Status Pill
      ctx.fillStyle = "rgba(37, 114, 244, 0.1)";
      ctx.beginPath();
      ctx.roundRect(190, 930, 440, 64, 32);
      ctx.fill();

      ctx.strokeStyle = "rgba(37, 114, 244, 0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#2572F4";
      ctx.font = "bold 26px Inter, sans-serif";
      ctx.fillText("STATUS: VALID_CURRENT", 235, 972);

      // Embossed Golden Seal (Bottom Right with Reeded Mint Rim)
      const sealX = 1720;
      const sealY = 960;
      const sealRadius = 140;

      // Outer Fluted / Reeded Rim (Coin Milling)
      ctx.save();
      ctx.translate(sealX, sealY);
      ctx.strokeStyle = "rgba(180, 83, 9, 0.5)";
      ctx.lineWidth = 4;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (sealRadius - 8), Math.sin(a) * (sealRadius - 8));
        ctx.lineTo(Math.cos(a) * sealRadius, Math.sin(a) * sealRadius);
        ctx.stroke();
      }
      ctx.restore();

      // Golden Radial Foil Gradient
      const goldGrad = ctx.createRadialGradient(
        sealX - 35,
        sealY - 35,
        15,
        sealX,
        sealY,
        sealRadius - 8
      );
      goldGrad.addColorStop(0, "#FEF3C7");
      goldGrad.addColorStop(0.25, "#F59E0B");
      goldGrad.addColorStop(0.65, "#D97706");
      goldGrad.addColorStop(1, "#78350F");

      ctx.fillStyle = goldGrad;
      ctx.beginPath();
      ctx.arc(sealX, sealY, sealRadius - 8, 0, Math.PI * 2);
      ctx.fill();

      // Inner Embossed Crest Circle
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sealX, sealY, sealRadius - 28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.font = "bold 22px Inter, sans-serif";
      ctx.fillText("OFFICIAL SEAL", sealX, sealY - 25);

      ctx.font = "900 32px Inter, sans-serif";
      ctx.fillText("VERIFIED", sealX, sealY + 16);

      ctx.font = "600 18px Inter, sans-serif";
      ctx.fillText("W3C VC 2.0", sealX, sealY + 48);
      ctx.textAlign = "left";

      // Micro QR Code Representation (Left of Seal)
      const qrX = 1360;
      const qrY = 860;
      const qrSize = 180;
      ctx.fillStyle = "#0F1D38";
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(qrX + 10, qrY + 10, qrSize - 20, qrSize - 20);
      ctx.fillStyle = "#0F1D38";
      ctx.fillRect(qrX + 22, qrY + 22, 44, 44);
      ctx.fillRect(qrX + qrSize - 66, qrY + 22, 44, 44);
      ctx.fillRect(qrX + 22, qrY + qrSize - 66, 44, 44);

      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    }

    // -------------------------------------------------------------
    // HIGH-RES RETINA BACK TEXTURE (2048 x 1280)
    // Deep Midnight Navy Chassis with Merkle Tree Holographic Blueprint
    // -------------------------------------------------------------
    function createBackTexture(): THREE.CanvasTexture {
      const canvas = document.createElement("canvas");
      canvas.width = 2048;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(canvas);

      // Deep Midnight Navy Matte Surface
      ctx.fillStyle = "#0A1428";
      ctx.fillRect(0, 0, 2048, 1280);

      // Cryptographic Merkle Tree Network Lines
      ctx.strokeStyle = "rgba(90, 92, 242, 0.22)";
      ctx.lineWidth = 2.5;

      // Merkle tree visualization in background
      const rootX = 1024;
      const rootY = 320;
      const l2 = [rootX - 350, rootX + 350];
      const l3 = [l2[0] - 180, l2[0] + 180, l2[1] - 180, l2[1] + 180];

      // Root to level 2
      ctx.beginPath();
      ctx.moveTo(rootX, rootY); ctx.lineTo(l2[0], rootY + 180);
      ctx.moveTo(rootX, rootY); ctx.lineTo(l2[1], rootY + 180);
      // Level 2 to level 3
      ctx.moveTo(l2[0], rootY + 180); ctx.lineTo(l3[0], rootY + 360);
      ctx.moveTo(l2[0], rootY + 180); ctx.lineTo(l3[1], rootY + 360);
      ctx.moveTo(l2[1], rootY + 180); ctx.lineTo(l3[2], rootY + 360);
      ctx.moveTo(l2[1], rootY + 180); ctx.lineTo(l3[3], rootY + 360);
      ctx.stroke();

      // Nodes on Merkle Tree
      const drawNode = (x: number, y: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3;
        ctx.stroke();
      };

      drawNode(rootX, rootY, "#10B981");
      drawNode(l2[0], rootY + 180, "#2572F4");
      drawNode(l2[1], rootY + 180, "#8352E9");
      drawNode(l3[0], rootY + 360, "#F59E0B");
      drawNode(l3[1], rootY + 360, "#F59E0B");
      drawNode(l3[2], rootY + 360, "#F59E0B");
      drawNode(l3[3], rootY + 360, "#F59E0B");

      // Monogram & Title
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.font = "900 76px Inter, sans-serif";
      ctx.fillText("CREDVAIL", 1024, 880);

      ctx.fillStyle = "#818CF8";
      ctx.font = "bold 26px ui-monospace, Menlo, monospace";
      ctx.fillText("HARDWARE-BOUND SOVEREIGN VAULT ARTIFACT", 1024, 930);

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "500 20px ui-monospace, Menlo, monospace";
      ctx.fillText("SERIAL: CV-2026-SEPOLIA-8849-V2 • LICENSED UNDER APACHE 2.0", 1024, 970);
      ctx.textAlign = "left";

      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    }

    const frontTexture = createFrontTexture();
    const backTexture = createBackTexture();

    // -------------------------------------------------------------
    // BEVELED ROUNDED CREDENTIAL CARD GEOMETRY
    // Precision chamfered corners matching luxury hardware
    // -------------------------------------------------------------
    const cardWidth = 3.6;
    const cardHeight = 2.25;
    const cardRadius = 0.16;

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

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
    };

    const cardGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    cardGeometry.center();

    // Precision Metallic Materials
    const titaniumEdgeMat = new THREE.MeshStandardMaterial({
      color: 0x1E293B,
      metalness: 0.92,
      roughness: 0.22,
    });

    const frontFaceMat = new THREE.MeshPhysicalMaterial({
      map: frontTexture,
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      reflectivity: 0.9,
      ior: 1.52,
    });

    const backFaceMat = new THREE.MeshPhysicalMaterial({
      map: backTexture,
      roughness: 0.3,
      metalness: 0.35,
      clearcoat: 0.5,
    });

    // In ExtrudeGeometry, material index 0 is front/back faces, index 1 is the extruded/beveled rim
    const credentialMesh = new THREE.Mesh(cardGeometry, [frontFaceMat, titaniumEdgeMat]);
    credentialMesh.castShadow = true;
    credentialMesh.receiveShadow = true;

    // Outer Master Group
    const masterCoreGroup = new THREE.Group();
    masterCoreGroup.add(credentialMesh);
    scene.add(masterCoreGroup);

    // -------------------------------------------------------------
    // REFINED CRYPTOGRAPHIC ORBITAL TELEMETRY RINGS
    // Fine hairline arcs with radar ticks
    // -------------------------------------------------------------
    const ringGroup = new THREE.Group();
    masterCoreGroup.add(ringGroup);

    // Ring 1: Primary Elliptical Coordinate Arc
    const ring1Curve = new THREE.EllipseCurve(0, 0, 2.7, 2.7, 0, Math.PI * 2, false, 0);
    const ring1Points = ring1Curve.getPoints(120);
    const ring1Geometry = new THREE.BufferGeometry().setFromPoints(ring1Points);
    const ring1Mat = new THREE.LineDashedMaterial({
      color: 0x5a5cf2,
      dashSize: 0.14,
      gapSize: 0.06,
      transparent: true,
      opacity: 0.45,
      linewidth: 1,
    });
    const ring1Line = new THREE.Line(ring1Geometry, ring1Mat);
    ring1Line.computeLineDistances();
    ring1Line.rotation.x = Math.PI * 0.36;
    ring1Line.rotation.y = Math.PI * 0.14;
    ringGroup.add(ring1Line);

    // Ring 2: Secondary Counter-Orbit Track
    const ring2Curve = new THREE.EllipseCurve(0, 0, 3.1, 3.1, 0, Math.PI * 2, false, 0);
    const ring2Points = ring2Curve.getPoints(120);
    const ring2Geometry = new THREE.BufferGeometry().setFromPoints(ring2Points);
    const ring2Mat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 0.18,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.35,
      linewidth: 1,
    });
    const ring2Line = new THREE.Line(ring2Geometry, ring2Mat);
    ring2Line.computeLineDistances();
    ring2Line.rotation.x = -Math.PI * 0.34;
    ring2Line.rotation.y = Math.PI * 0.18;
    ringGroup.add(ring2Line);

    // -------------------------------------------------------------
    // THREE CRYPTOGRAPHIC TRUST BEACONS (Issuer, Holder, Verifier)
    // Multi-element jewel beads with halo rings & dynamic point lights
    // -------------------------------------------------------------
    function createTrustBeacon(color: number, lightIntensity: number) {
      const beaconGroup = new THREE.Group();

      // Emissive core bead
      const coreGeo = new THREE.SphereGeometry(0.085, 24, 24);
      const coreMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 1.0,
        roughness: 0.1,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      beaconGroup.add(core);

      // Translucent halo ring
      const haloGeo = new THREE.TorusGeometry(0.14, 0.012, 12, 32);
      const haloMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      beaconGroup.add(halo);

      // Subtle dynamic point light
      const pLight = new THREE.PointLight(color, lightIntensity, 4);
      beaconGroup.add(pLight);

      return { group: beaconGroup, halo };
    }

    const issuerBeacon = createTrustBeacon(0x2572f4, 1.2);
    const holderBeacon = createTrustBeacon(0x8352e9, 1.2);
    const verifierBeacon = createTrustBeacon(0x10b981, 1.2);

    masterCoreGroup.add(issuerBeacon.group);
    masterCoreGroup.add(holderBeacon.group);
    masterCoreGroup.add(verifierBeacon.group);

    // Subtle ambient particle dust
    const particleCount = 65;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 11;
      particlePositions[i + 1] = (Math.random() - 0.5) * 8;
      particlePositions[i + 2] = (Math.random() - 0.5) * 5;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.035,
      transparent: true,
      opacity: 0.35,
    });
    const particleSystem = new THREE.Points(particleGeometry, particleMat);
    scene.add(particleSystem);

    // -------------------------------------------------------------
    // STUDIO LIGHTING SETUP
    // -------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.05);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(4.5, 5.5, 6.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc7d2fe, 0.9);
    fillLight.position.set(-4.5, -2.5, 4.5);
    scene.add(fillLight);

    // Cool rim lights for luxury edge reflections
    const rimLightBlue = new THREE.PointLight(0x2572f4, 1.8, 14);
    rimLightBlue.position.set(-4.5, 3.5, -2);
    scene.add(rimLightBlue);

    const rimLightViolet = new THREE.PointLight(0x8352e9, 1.8, 14);
    rimLightViolet.position.set(4.5, -3.5, -2);
    scene.add(rimLightViolet);

    // Pointer Interaction (Luxurious heavy damping)
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handleMouseMove = (event: MouseEvent) => {
      const relX = event.clientX / window.innerWidth - 0.5;
      const relY = event.clientY / window.innerHeight - 0.5;
      mouse.targetX = relX * 2;
      mouse.targetY = relY * 2;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Handle Window Resize
    const handleResize = () => {
      if (!container) return;
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);

    const clock = new THREE.Clock();

    // -------------------------------------------------------------
    // ANIMATION LOOP — DIGNIFIED, SLOW, EXECUTIVE MOTION
    // -------------------------------------------------------------
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const p = progressRef.current; // Normalized progress [0, 1]

      // Mouse smoothing (slow, soft inertia)
      mouse.x += (mouse.targetX - mouse.x) * 0.018;
      mouse.y += (mouse.targetY - mouse.y) * 0.018;

      // Trust Beacon Orbital Positions (Gentle, Slow Cosmic Rate)
      const t1 = elapsedTime * 0.15;
      const t2 = elapsedTime * 0.11 + 2.1;
      const t3 = elapsedTime * 0.13 + 4.2;

      issuerBeacon.group.position.set(
        Math.cos(t1) * 2.7,
        Math.sin(t1) * 2.7 * Math.sin(Math.PI * 0.36),
        Math.sin(t1) * 2.7 * Math.cos(Math.PI * 0.36)
      );
      issuerBeacon.halo.rotation.x = elapsedTime * 0.6;

      holderBeacon.group.position.set(
        Math.cos(t2) * 3.1,
        Math.sin(t2) * 3.1 * Math.sin(-Math.PI * 0.34),
        Math.sin(t2) * 3.1 * Math.cos(-Math.PI * 0.34)
      );
      holderBeacon.halo.rotation.y = elapsedTime * 0.6;

      verifierBeacon.group.position.set(
        Math.cos(t3) * 2.85,
        Math.sin(t3) * 2.85 * 0.48,
        Math.sin(t3) * 2.85 * 0.78
      );
      verifierBeacon.halo.rotation.z = elapsedTime * 0.6;

      // Slow orbital track rotation
      ringGroup.rotation.z = elapsedTime * 0.015;
      particleSystem.rotation.y = elapsedTime * 0.005;

      // Slow majestic breathing & floating
      const slowFloatY = Math.sin(elapsedTime * 0.38) * 0.08;
      const slowYaw = Math.sin(elapsedTime * 0.2) * 0.045;
      const slowPitch = Math.cos(elapsedTime * 0.25) * 0.025;

      // -------------------------------------------------------------
      // NARRATIVE SCROLL TIMELINE (Slowly glides into the background)
      // -------------------------------------------------------------
      let targetX = 0;
      let targetY = 0;
      let targetZ = 0;
      let targetRotX = 0;
      let targetRotY = 0;
      let targetRotZ = 0;
      let targetScale = 1.0;
      let rimIntensity = 1.2;

      const isMobile = window.innerWidth < 1024;

      if (p <= 0.2) {
        // SECTION 1: HERO
        // Positioned in right background, tilted with subtle specular glint
        const subP = p / 0.2;
        targetX = isMobile ? 0 : 1.4 * (1 - subP * 0.3);
        targetY = slowFloatY;
        targetZ = -0.3;
        targetRotX = 0.05 + slowPitch + mouse.y * 0.06;
        targetRotY = -0.22 + slowYaw + mouse.x * 0.1;
        targetRotZ = 0.02;
        targetScale = isMobile ? 0.78 : 1.15;
        rimIntensity = 1.2;
      } else if (p <= 0.45) {
        // SECTION 2 & 3: BRAND STRIP & LESS FRICTION
        // Glides gracefully to LEFT background behind pinned story headline
        const subP = (p - 0.2) / 0.25;
        targetX = isMobile ? 0 : THREE.MathUtils.lerp(0.95, -1.95, subP);
        targetY = slowFloatY;
        targetZ = THREE.MathUtils.lerp(-0.3, 0.15, subP);
        targetRotX = 0.04 + slowPitch + mouse.y * 0.06;
        targetRotY = THREE.MathUtils.lerp(-0.22, 0.26, subP) + slowYaw + mouse.x * 0.08;
        targetRotZ = THREE.MathUtils.lerp(0.02, -0.025, subP);
        targetScale = isMobile ? 0.74 : 1.08;
        rimIntensity = 1.4;
      } else if (p <= 0.68) {
        // SECTION 4: LIFECYCLE STORY
        // Centered face-forward presenting document details & gold seal
        const subP = (p - 0.45) / 0.23;
        targetX = isMobile ? 0 : THREE.MathUtils.lerp(-1.95, 0, subP);
        targetY = THREE.MathUtils.lerp(0, 0.1, subP) + slowFloatY;
        targetZ = THREE.MathUtils.lerp(0.15, 0.75, subP);
        targetRotX = THREE.MathUtils.lerp(0.04, 0.015, subP) + slowPitch + mouse.y * 0.05;
        targetRotY = THREE.MathUtils.lerp(0.26, 0.0, subP) + slowYaw + mouse.x * 0.06;
        targetRotZ = THREE.MathUtils.lerp(-0.025, 0, subP);
        targetScale = isMobile ? 0.8 : 1.2;
        rimIntensity = 1.6;
      } else if (p <= 0.85) {
        // SECTION 5: TRUST NETWORK
        // Shifts to RIGHT background behind architecture nodes
        const subP = (p - 0.68) / 0.17;
        targetX = isMobile ? 0 : THREE.MathUtils.lerp(0, 1.9, subP);
        targetY = THREE.MathUtils.lerp(0.1, -0.06, subP) + slowFloatY;
        targetZ = THREE.MathUtils.lerp(0.75, 0.1, subP);
        targetRotX = -0.04 + slowPitch + mouse.y * 0.06;
        targetRotY = THREE.MathUtils.lerp(0, -0.3, subP) + slowYaw + mouse.x * 0.08;
        targetRotZ = THREE.MathUtils.lerp(0, 0.04, subP);
        targetScale = isMobile ? 0.76 : 1.1;
        rimIntensity = 2.0;
      } else {
        // SECTION 6: INVERTED DARK FINALE
        // Centers and tilts upward with illuminated rim lights shining through dark navy canvas
        const subP = (p - 0.85) / 0.15;
        targetX = 0;
        targetY = THREE.MathUtils.lerp(-0.06, 0.32, subP) + slowFloatY;
        targetZ = THREE.MathUtils.lerp(0.1, 0.65, subP);
        targetRotX = THREE.MathUtils.lerp(-0.04, 0.34, subP) + slowPitch + mouse.y * 0.06;
        targetRotY = THREE.MathUtils.lerp(-0.3, 0.1, subP) + slowYaw + mouse.x * 0.08;
        targetRotZ = THREE.MathUtils.lerp(0.04, -0.03, subP);
        targetScale = isMobile ? 0.82 : 1.25;
        rimIntensity = THREE.MathUtils.lerp(2.0, 4.5, subP);

        ambientLight.intensity = THREE.MathUtils.lerp(1.05, 0.42, subP);
        keyLight.intensity = THREE.MathUtils.lerp(2.0, 0.85, subP);
      }

      // Dignified, smooth, slow interpolation (lerp speed: 0.022)
      const lerpSpeed = 0.022;
      masterCoreGroup.position.x += (targetX - masterCoreGroup.position.x) * lerpSpeed;
      masterCoreGroup.position.y += (targetY - masterCoreGroup.position.y) * lerpSpeed;
      masterCoreGroup.position.z += (targetZ - masterCoreGroup.position.z) * lerpSpeed;

      credentialMesh.rotation.x += (targetRotX - credentialMesh.rotation.x) * lerpSpeed;
      credentialMesh.rotation.y += (targetRotY - credentialMesh.rotation.y) * lerpSpeed;
      credentialMesh.rotation.z += (targetRotZ - credentialMesh.rotation.z) * lerpSpeed;

      masterCoreGroup.scale.setScalar(
        masterCoreGroup.scale.x + (targetScale - masterCoreGroup.scale.x) * lerpSpeed
      );

      rimLightBlue.intensity = rimIntensity;
      rimLightViolet.intensity = rimIntensity;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);

      cardGeometry.dispose();
      frontTexture.dispose();
      backTexture.dispose();
      titaniumEdgeMat.dispose();
      frontFaceMat.dispose();
      backFaceMat.dispose();
      ring1Geometry.dispose();
      ring1Mat.dispose();
      ring2Geometry.dispose();
      ring2Mat.dispose();
      particleGeometry.dispose();
      particleMat.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [reducedMotion]);

  if (reducedMotion || hasWebGL === false) {
    return (
      <div className={className}>
        <CredentialStaticFallback />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full pointer-events-none ${className}`}
      aria-label="Interactive 3D Credential Core artifact slowly moving in background"
    />
  );
}
