export interface TrustPillar {
  id: string;
  title: string;
  tagline: string;
  description: string;
  metric: string;
  iconName: "ShieldCheck" | "Wallet" | "KeyRound" | "SearchCheck";
}

export interface CapabilityCard {
  step: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  details: string[];
}

export interface LifecycleMilestone {
  number: string;
  phase: string;
  title: string;
  description: string;
  standard: string;
}

export interface ArchitectureNode {
  id: string;
  name: string;
  role: string;
  description: string;
  technologies: string[];
  metrics: string;
}

export const LANDING_CONTENT = {
  hero: {
    eyebrow: "ENTERPRISE TRUST INFRASTRUCTURE",
    headlineLine1: "Digital Credentials.",
    headlineLine2: "Built on Verifiable Trust.",
    description:
      "CREDVAIL empowers universities, state bodies, and enterprises to design, issue, claim, and independently verify high-assurance credentials with W3C standard compliance and cryptographic finality.",
    primaryCta: {
      label: "Meet CREDVAIL",
      href: "#platform",
    },
    secondaryCta: {
      label: "Explore the Platform",
      href: "#lifecycle",
    },
    verifyAction: {
      label: "Open Public Verifier",
      href: "/verify",
      placeholder: "Paste credential ID, DID, or Merkle root...",
    },
    metrics: [
      { label: "Revocation Latency", value: "< 1.0s", detail: "W3C Bitstring 2021" },
      { label: "Verification Proof", value: "O(log N)", detail: "Keccak-256 Merkle" },
      { label: "Blockchain Anchor", value: "Ethereum", detail: "Sepolia Layer 1" },
    ],
  },

  trustStrip: {
    header: "TRUSTED BY MODERN INSTITUTIONS & RELYING PARTIES",
    pillars: [
      {
        id: "issuance",
        title: "Institutional Issuance",
        tagline: "Governed Authority",
        description: "Cryptographic signing with NIST P-256 and DID:web institutional identifiers.",
        metric: "10,000+ per batch",
        iconName: "KeyRound",
      },
      {
        id: "ownership",
        title: "Durable Ownership",
        tagline: "Holder Custody",
        description: "Zero-knowledge claim invitations bound irrevocably to self-custodial recipient wallets.",
        metric: "Single-Owner Guarantee",
        iconName: "Wallet",
      },
      {
        id: "integrity",
        title: "Cryptographic Integrity",
        tagline: "Merkle Root Commitments",
        description: "RFC 8785 canonical serialization anchored to Ethereum Sepolia smart contracts.",
        metric: "100% Tamper Evident",
        iconName: "ShieldCheck",
      },
      {
        id: "verification",
        title: "Independent Verification",
        tagline: "Zero-Trust Public Audit",
        description: "Open verifier inspecting signatures, status lists, and inclusion proofs in real time.",
        metric: "Instant Resolution",
        iconName: "SearchCheck",
      },
    ] as TrustPillar[],
  },

  lessFriction: {
    eyebrow: "OPERATIONAL EXCELLENCE",
    headlineLine1: "Less administrative friction.",
    headlineLine2: "More confidence in every credential.",
    description:
      "Eliminate fraudulent transcripts, paper attestation delays, and vulnerable PDF attachments. CREDVAIL automates the complete lifecycle from batch ingest to instant third-party verification.",
    cards: [
      {
        step: "01",
        title: "Automated Batch Issuance",
        subtitle: "High-Throughput Ingestion",
        description:
          "Upload CSV or API streams to generate thousands of signed W3C Verifiable Credentials in seconds. Intelligent column mapping and formula injection sanitization run automatically.",
        badge: "BATCH ENGINE",
        details: ["CSV & API streaming", "RFC 4180 parsing with SEC-07 defense", "Auto-generated vector certificates"],
      },
      {
        step: "02",
        title: "Durable Holder Custody",
        subtitle: "Self-Sovereign Identity",
        description:
          "Recipients claim credentials directly into a private browser-based vault. Cryptographic challenge-response binding prevents replay attacks, duplicate claims, and credential theft.",
        badge: "HOLDER WALLET",
        details: ["Single-owner database enforcement", "ECDSA challenge nonces", "Offline export & presentation"],
      },
      {
        step: "03",
        title: "Real-Time Status & Revocation",
        subtitle: "W3C Bitstring 2021",
        description:
          "Instantly revoke or suspend credentials without leaking recipient identifiers or invalidating sibling records. Verifiers inspect compressed bitstring snapshots in sub-second time.",
        badge: "STATUS ENGINE",
        details: ["GZIP-compressed bitstrings", "Sub-second revocation latency", "Zero-collateral isolation"],
      },
    ] as CapabilityCard[],
  },

  lifecycle: {
    eyebrow: "END-TO-END TRUST TIMELINE",
    headlineLine1: "From institutional issuance",
    headlineLine2: "to independently verified trust.",
    description:
      "Every credential moves through six mathematically verifiable states, preserving institutional authority and recipient privacy at every step.",
    milestones: [
      {
        number: "01",
        phase: "DESIGN",
        title: "Institutional Template",
        description: "Author customized vector templates with dynamic placeholders and security rules.",
        standard: "W3C VC 2.0 Data Model",
      },
      {
        number: "02",
        phase: "SIGN",
        title: "Cryptographic Signing",
        description: "Sign canonical JSON payloads using governed institutional keys and active epoch credentials.",
        standard: "NIST P-256 / JWS 2020",
      },
      {
        number: "03",
        phase: "ANCHOR",
        title: "Merkle Batch Commitment",
        description: "Roll leaf hashes into a deterministic Keccak-256 Merkle root anchored to Ethereum.",
        standard: "OpenZeppelin MerkleProof v5",
      },
      {
        number: "04",
        phase: "DISPATCH",
        title: "Claim Invitation Dispatch",
        description: "Deliver high-entropy single-use claim tokens to verified recipient endpoints.",
        standard: "RFC 8785 Canonicalization",
      },
      {
        number: "05",
        phase: "CLAIM",
        title: "Holder Wallet Ingestion",
        description: "Holder signs challenge nonce to bind the credential permanently to their private wallet.",
        standard: "Argon2id & ECDSA Nonces",
      },
      {
        number: "06",
        phase: "VERIFY",
        title: "Universal Verification",
        description: "Relying parties independently verify signature validity, root inclusion, and status lists.",
        standard: "Public REST & WebGL Audit",
      },
    ] as LifecycleMilestone[],
  },

  trustNetwork: {
    eyebrow: "DISTRIBUTED SYSTEM ARCHITECTURE",
    headlineLine1: "One connected platform.",
    headlineLine2: "Every credential journey.",
    description:
      "CREDVAIL unifies three distinct actors into a trust triangle: Institutional Issuers, Credential Holders, and Relying Parties.",
    nodes: [
      {
        id: "issuer",
        name: "Institutional Issuer",
        role: "Authority & Governance",
        description:
          "Configures organization DID:web profiles, administers staff RBAC roles, provisions signing epochs, and triggers bulk issuance pipelines.",
        technologies: ["W3C DID:web", "AES-256-GCM Private Key Vault", "Automated Batch Engine"],
        metrics: "Multi-tenant Isolation",
      },
      {
        id: "holder",
        name: "Credential Holder",
        role: "Self-Sovereign Custody",
        description:
          "Receives claim tokens, binds credentials to personal keypairs, and presents portable verifiable credentials without centralized telemetry.",
        technologies: ["Browser LocalVault", "Selective Disclosure", "Challenge Nonce Verification"],
        metrics: "Zero Telemetry Leakage",
      },
      {
        id: "verifier",
        name: "Universal Verifier",
        role: "Zero-Trust Inspection",
        description:
          "Accepts credential payloads, hashes, or URN identifiers to cryptographically validate signatures, Merkle paths, and live revocation status.",
        technologies: ["Ethereum Consensus", "W3C StatusList2021", "O(log N) Inclusion Proofs"],
        metrics: "100% Independent Audit",
      },
    ] as ArchitectureNode[],
  },

  finale: {
    eyebrow: "THE FUTURE OF CREDENTIAL INTEGRITY",
    headlineLine1: "Let every credential",
    headlineLine2: "carry its proof.",
    description:
      "Join premier universities, accreditation councils, and enterprise teams securing digital achievement with CREDVAIL's verifiable infrastructure.",
    primaryCta: {
      label: "Start Issuing Credentials",
      href: "/register",
    },
    secondaryCta: {
      label: "Inspect Public Verifier",
      href: "/verify",
    },
    badges: [
      "W3C Verifiable Credentials 2.0",
      "Ethereum Sepolia L1 Anchoring",
      "NIST P-256 Cryptography",
      "W3C Bitstring Status Lists",
    ],
  },
} as const;
