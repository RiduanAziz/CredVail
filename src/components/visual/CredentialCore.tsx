"use client";

import dynamic from "next/dynamic";
import { CredentialStaticFallback } from "./fallback/CredentialStaticFallback";

const InteractiveCredentialExperience = dynamic(
  () =>
    import("./interactive/InteractiveCredentialExperience").then(
      (m) => m.InteractiveCredentialExperience
    ),
  {
    ssr: false,
    loading: () => <CredentialStaticFallback />,
  }
);

interface CredentialCoreProps {
  className?: string;
}

export function CredentialCore({ className = "" }: CredentialCoreProps) {
  return (
    <div className={`relative w-full flex items-center justify-center ${className}`}>
      <InteractiveCredentialExperience />
    </div>
  );
}
