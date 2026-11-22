"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, RotateCcw, Sparkles } from "lucide-react";
import { CredentialSceneManager } from "./three/CredentialSceneManager";
import { ViewMode } from "./three/InteractionController";
import { CredentialStaticFallback } from "../fallback/CredentialStaticFallback";

interface InteractiveCredentialExperienceProps {
  className?: string;
}

export function InteractiveCredentialExperience({
  className = "",
}: InteractiveCredentialExperienceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CredentialSceneManager | null>(null);

  const [currentMode, setCurrentMode] = useState<ViewMode>("overview");
  const [hasWebGL, setHasWebGL] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  // Initialize Three.js Scene Manager
  useEffect(() => {
    if (reducedMotion) {
      setHasWebGL(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Detect WebGL
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

    let manager: CredentialSceneManager;
    try {
      manager = new CredentialSceneManager(container);
      managerRef.current = manager;
      manager.start();
    } catch {
      setHasWebGL(false);
      return;
    }

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, [reducedMotion]);

  const handleSetMode = (mode: ViewMode) => {
    if (!managerRef.current) return;
    managerRef.current.setMode(mode);
    setCurrentMode(mode);
  };

  const handleReset = () => {
    if (!managerRef.current) return;
    managerRef.current.reset();
    setCurrentMode("overview");
  };

  if (reducedMotion || hasWebGL === false) {
    return (
      <div className={`w-full max-w-[560px] ${className}`}>
        <CredentialStaticFallback />
      </div>
    );
  }

  return (
    <div
      className={`relative flex w-full max-w-[580px] flex-col items-center justify-center select-none ${className}`}
      role="region"
      aria-roledescription="3D Interactive Credential Viewer"
      aria-label="Interactive 3D Credential Experience based on Reference 01 (Floating Plaque) and Reference 03 (Macro Close-Up)"
    >
      {/* Interactive Mode Switching Pill Bar (Top) */}
      <div className="absolute top-2 z-20 flex items-center gap-1.5 rounded-full border border-black/10 bg-white/85 p-1 text-xs font-medium shadow-sm backdrop-blur-md transition-all">
        <button
          type="button"
          onClick={() => handleSetMode("overview")}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cobalt ${
            currentMode === "overview"
              ? "bg-[#0F1D38] text-white shadow-sm"
              : "text-[#475569] hover:bg-black/5 hover:text-[#0F1D38]"
          }`}
          aria-pressed={currentMode === "overview"}
          aria-label="Switch to Reference 01 Overview Floating View"
        >
          <Sparkles className="h-3 w-3" />
          <span>Overview (Ref 01)</span>
        </button>

        <button
          type="button"
          onClick={() => handleSetMode("closeup")}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cobalt ${
            currentMode === "closeup"
              ? "bg-[#0F1D38] text-white shadow-sm"
              : "text-[#475569] hover:bg-black/5 hover:text-[#0F1D38]"
          }`}
          aria-pressed={currentMode === "closeup"}
          aria-label="Switch to Reference 03 Macro Close-Up Inspection View"
        >
          <Eye className="h-3 w-3" />
          <span>Close-Up (Ref 03)</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#64748B] hover:bg-black/5 hover:text-[#0F1D38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cobalt"
          title="Reset View Orientation"
          aria-label="Reset View Orientation"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      {/* 3D WebGL Canvas Viewport */}
      <div
        ref={containerRef}
        onClick={() => {
          if (managerRef.current) {
            const nextMode = managerRef.current.toggleMode();
            setCurrentMode(nextMode);
          }
        }}
        className="relative aspect-square w-full min-h-[420px] sm:min-h-[480px] lg:min-h-[540px] cursor-grab active:cursor-grabbing rounded-3xl"
        style={{ touchAction: "pan-y" }}
      />

      {/* Bottom Subtle Interaction Cue Pill */}
      <div className="absolute bottom-2 z-10 flex items-center gap-2 rounded-full border border-black/8 bg-white/75 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64748B] shadow-sm backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-cobalt animate-pulse" />
        <span>Drag to rotate • Click to inspect</span>
      </div>
    </div>
  );
}
