import Link from "next/link";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  FileCheck2,
  Fingerprint,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  ShieldCheck,
  Upload,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CredentialCore } from "@/components/visual/CredentialCore";

const capabilities = [
  {
    icon: FileCheck2,
    title: "Issue with confidence",
    description: "Create credentials from reusable templates and issue them through controlled institutional workflows.",
    href: "/register",
  },
  {
    icon: Upload,
    title: "Scale certificate operations",
    description: "Import recipient data in batches and generate signed, verifiable certificates without leaving the platform.",
    href: "/register",
  },
  {
    icon: WalletCards,
    title: "Put ownership first",
    description: "Give recipients a private browser wallet for claiming, storing, and presenting their credentials.",
    href: "/wallet",
  },
  {
    icon: ShieldCheck,
    title: "Verify independently",
    description: "Check credential authenticity, issuer identity, status, and integrity with the public verification engine.",
    href: "/verify",
  },
];

const lifecycle = [
  ["01", "ISSUE", "An institution prepares a credential for its recipient."],
  ["02", "SIGN", "The issuer signs the credential with its governed key."],
  ["03", "ANCHOR", "Batch integrity can be recorded through Merkle-root anchoring."],
  ["04", "CLAIM", "The recipient claims ownership into a private wallet."],
  ["05", "VERIFY", "A relying party checks the credential independently."],
];

export default function HomePage() {
  return (
    <div className="overflow-hidden">
      <section className="relative border-b bg-[radial-gradient(circle_at_78%_18%,hsl(239_84%_62%/.18),transparent_30%),linear-gradient(180deg,hsl(220_58%_13%)_0%,hsl(225_45%_17%)_68%,hsl(210_40%_98%)_100%)] text-white">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(0_0%_100%/.06)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%/.06)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="container relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-4 lg:pb-32 lg:pt-20">
          <div className="relative z-10 max-w-2xl">
            <Badge variant="brandSubtle" className="border-white/15 bg-white/10 text-indigo-100">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Digital trust infrastructure
            </Badge>
            <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-6xl lg:text-[4.5rem]">
              Digital credentials,{" "}
              <span className="bg-gradient-to-r from-blue-300 via-indigo-200 to-violet-300 bg-clip-text text-transparent">built on verifiable trust.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-blue-100/70 sm:text-lg">
              Create, issue, manage, claim, and verify digital credentials through secure institutional workflows and cryptographic integrity checks.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/verify">
                <Button size="lg" variant="brand" className="w-full gap-2 bg-white text-brand-navy hover:bg-blue-50 sm:w-auto">
                  Verify a credential <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/register">
                <Button size="lg" variant="brandOutline" className="w-full border-white/25 bg-white/5 text-white hover:bg-white/10 sm:w-auto">
                  Open institution portal
                </Button>
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-xs text-blue-100/60">
              <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-emerald-300" /> Privacy-aware workflows</span>
              <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-indigo-300" /> Cryptographic proofs</span>
              <span className="flex items-center gap-2"><Network className="h-4 w-4 text-violet-300" /> Independent verification</span>
            </div>
          </div>
          <CredentialCore />
        </div>
      </section>

      <section id="platform" className="border-b bg-background py-20 sm:py-28">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">One platform, every handoff</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From institutional issuance to independent verification.</h2>
            <p className="mt-4 text-muted-foreground">CREDVAIL connects the operational and cryptographic sides of a credential lifecycle without replacing the systems your organization already relies on.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((capability) => {
              const Icon = capability.icon;
              return (
                <Link key={capability.title} href={capability.href} className="group rounded-2xl border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-brand-glow">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white"><Icon className="h-5 w-5" /></div>
                  <h3 className="mt-5 font-semibold">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{capability.description}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-primary">Explore <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-b bg-muted/30 py-20 sm:py-28">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">The trust lifecycle</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A credential is more than a document.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">Each handoff is designed to preserve issuer authority, recipient ownership, and verifier confidence.</p>
          </div>
          <div className="mt-12 grid gap-3 md:grid-cols-5">
            {lifecycle.map(([number, title, description], index) => (
              <div key={title} className="relative rounded-2xl border bg-card p-5">
                {index < lifecycle.length - 1 && <div className="absolute right-[-0.8rem] top-10 z-10 hidden h-px w-5 bg-primary/30 md:block" />}
                <span className="font-mono text-xs text-primary">{number}</span>
                <h3 className="mt-8 text-sm font-bold tracking-[0.12em]">{title}</h3>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="border-b bg-background py-20 sm:py-28">
        <div className="container mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Designed for relying parties</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Make trust inspectable, not implied.</h2>
            <p className="mt-5 text-muted-foreground">The public verifier evaluates the credential that was submitted. It does not rely on a screenshot, a logo, or a claim made by the issuer.</p>
            <Link href="/verify" className="mt-7 inline-flex"><Button variant="outline" className="gap-2">Open public verifier <ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [ShieldCheck, "Authenticity", "Validate the credential signature and issuer relationship."],
              [Layers3, "Integrity", "Inspect inclusion proofs and any available anchoring evidence."],
              [KeyRound, "Governance", "Keep signing keys, epochs, and access under institutional control."],
              [CheckCircle2, "Freshness", "Distinguish current status from an unreachable or stale snapshot."],
            ].map(([Icon, title, description]) => {
              const TrustIcon = Icon as typeof ShieldCheck;
              return <div key={title as string} className="rounded-2xl border bg-card p-5"><TrustIcon className="h-5 w-5 text-primary" /><h3 className="mt-4 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description as string}</p></div>;
            })}
          </div>
        </div>
      </section>

      <section className="bg-brand-navy py-20 text-white sm:py-24">
        <div className="container mx-auto flex max-w-5xl flex-col items-center px-4 text-center sm:px-6">
          <Award className="h-8 w-8 text-indigo-300" />
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Build a credential program people can verify.</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-blue-100/70">Start with the public verifier or create an institution workspace for your issuance workflows.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/register"><Button size="lg" variant="brand" className="w-full sm:w-auto">Get started <ArrowRight className="ml-2 h-4 w-4" /></Button></Link><Link href="/verify"><Button size="lg" variant="brandOutline" className="w-full border-white/20 text-white sm:w-auto">Verify a credential</Button></Link></div>
        </div>
      </section>
    </div>
  );
}
