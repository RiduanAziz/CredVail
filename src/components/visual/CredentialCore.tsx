"use client";

import dynamic from "next/dynamic";
import { CredentialStaticFallback } from "./fallback/CredentialStaticFallback";

const CredentialCoreScene = dynamic(
  () =>
    import("./three/CredentialCoreScene").then((m) => m.CredentialCoreScene),
  {
    ssr: false,
    loading: () => <CredentialStaticFallback />,
  }
);

export function CredentialCore() {
  return (
    <div className="relative w-full aspect-square max-w-[540px] flex items-center justify-center">
      <CredentialCoreScene scrollProgress={0.1} />
    </div>
  );
}
