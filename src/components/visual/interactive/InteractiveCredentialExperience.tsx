"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CredentialSceneManager } from "./three/CredentialSceneManager";
import { CredentialStaticFallback } from "../fallback/CredentialStaticFallback";

interface InteractiveCredentialExperienceProps {
  className?: string;
}

export function InteractiveCredentialExperience({
  className = "",
}: InteractiveCredentialExperienceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CredentialSceneManager | null>(null);

  const [hasWebGL, setHasWebGL] = useState<boolean | null>(null);
  const [isContextLost, setIsContextLost] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // 1. Check system prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        setReducedMotion(e.matches);
        if (managerRef.current) {
          managerRef.current.setReducedMotion(e.matches);
        }
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  // 2. Initialize Three.js Scene Manager
  const initScene = useCallback(() => {
    const viewport = viewportRef.current;
    const canvasWrap = canvasWrapRef.current;
    if (!viewport || !canvasWrap) return;

    // Detect WebGL capability
    try {
      const testCanvas = document.createElement("canvas");
      const gl =
        testCanvas.getContext("webgl2") ||
        testCanvas.getContext("webgl") ||
        testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setHasWebGL(false);
        return;
      }
      setHasWebGL(true);
    } catch {
      setHasWebGL(false);
      return;
    }

    try {
      const manager = new CredentialSceneManager(
        viewport,
        canvasWrap,
        {
          onPresetChange: () => {},
          onContextLost: () => setIsContextLost(true),
          onContextRestored: () => setIsContextLost(false),
        },
        reducedMotion
      );

      managerRef.current = manager;
      manager.syncRenderLoop();
    } catch (err) {
      console.warn("CredentialSceneManager init failed, showing static fallback:", err);
      setHasWebGL(false);
    }
  }, [reducedMotion]);

  useEffect(() => {
    initScene();

    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
    };
  }, [initScene]);

  const showFallback = hasWebGL === false || isContextLost;

  return (
    <div
      className={`relative w-full h-[460px] sm:h-[520px] lg:h-[600px] flex items-center justify-center select-none ${className}`}
      role="region"
      aria-label="Interactive 3D Credential"
    >
      {/* Frameless 3D Viewport */}
      <div
        ref={viewportRef}
        className="relative h-full w-full flex items-center justify-center overflow-visible"
      >
        {/* Three.js Canvas Container */}
        <div
          ref={canvasWrapRef}
          className={`absolute inset-0 z-0 cursor-grab active:cursor-grabbing ${
            showFallback ? "invisible pointer-events-none" : ""
          }`}
          style={{ touchAction: "pan-y" }}
          aria-label="Interactive 3D credential. Hover and move cursor to explore."
        />

        {/* Static Fallback Presentation if WebGL is unavailable */}
        {showFallback && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="w-full max-w-[340px]">
              <CredentialStaticFallback />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
