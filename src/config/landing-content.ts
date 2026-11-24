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
    eyebrow: "Institutional credential infrastructure",
    headlineLine1: "Digital credentials.",
    headlineLine2: "Anchored by cryptographic proof.",
    description:
      "CREDVAIL enables universities, regulatory authorities, and enterprises to design, issue, claim, and independently verify high-assurance credentials with W3C compliance and Ethereum finality.",
    primaryCta: {
      label: "Explore architecture",
      href: "#platform",
    },
    secondaryCta: {
      label: "Open public verifier",
      href: "/verify",
    },
    verifyAction: {
      label: "Verify credential",
      href: "/verify",
      placeholder: "Paste credential ID, DID, or Merkle root",
    },
    metrics: [
      { label: "Revocation latency", value: "< 1.0s", detail: "W3C Bitstring 2021" },
      { label: "Inclusion proof", value: "O(log N)", detail: "Keccak-256 Merkle tree" },
      { label: "Consensus anchor", value: "Ethereum", detail: "Sepolia smart contract" },
    ],
  },

  trustStrip: {
    header: "Core architecture & cryptographic guarantees",
    pillars: [
      {
        id: "issuance",
        title: "Institutional issuance",
        tagline: "Governed authority",
        description: "Cryptographic signing with NIST P-256 and DID:web institutional identifiers.",
        metric: "10,000 per batch",
        iconName: "KeyRound",
      },
      {
        id: "ownership",
        title: "Durable ownership",
        tagline: "Holder custody",
        description: "Zero-knowledge claim invitations bound irrevocably to self-custodial recipient wallets.",
        metric: "Single-owner guarantee",
        iconName: "Wallet",
      },
      {
        id: "integrity",
        title: "Cryptographic integrity",
        tagline: "Merkle root commitments",
        description: "RFC 8785 canonical serialization anchored to Ethereum Sepolia smart contracts.",
        metric: "Tamper-evident ledger",
        iconName: "ShieldCheck",
      },
      {
        id: "verification",
        title: "Independent verification",
        tagline: "Zero-trust public audit",
        description: "Open verifier inspecting signatures, status lists, and inclusion proofs in real time.",
        metric: "Direct browser audit",
        iconName: "SearchCheck",
      },
    ] as TrustPillar[],
  },

  lessFriction: {
    eyebrow: "Verifiable data architecture",
    headlineLine1: "High-volume issuance.",
    headlineLine2: "Cryptographic finality.",
    description:
      "Eliminate fraudulent records, manual attestations, and unverified document files. CREDVAIL automates the complete lifecycle from batch ingest to independent third-party verification.",
    cards: [
      {
        step: "01",
        title: "Automated batch issuance",
        subtitle: "High-throughput ingestion",
        description:
          "Upload CSV or API streams to generate thousands of signed W3C Verifiable Credentials in seconds. Intelligent column mapping and formula injection sanitization run automatically.",
        badge: "Batch engine",
        details: ["CSV & API streaming", "RFC 4180 parsing with SEC-07 defense", "Auto-generated vector certificates"],
      },
      {
        step: "02",
        title: "Durable holder custody",
        subtitle: "Self-sovereign identity",
        description:
          "Recipients claim credentials directly into a private browser-based vault. Cryptographic challenge-response binding prevents replay attacks, duplicate claims, and credential theft.",
        badge: "Holder wallet",
        details: ["Single-owner database enforcement", "ECDSA challenge nonces", "Offline export & presentation"],
      },
      {
        step: "03",
        title: "Real-time status & revocation",
        subtitle: "W3C Bitstring 2021",
        description:
          "Instantly revoke or suspend credentials without leaking recipient identifiers or invalidating sibling records. Verifiers inspect compressed bitstring snapshots in sub-second time.",
        badge: "Status engine",
        details: ["GZIP-compressed bitstrings", "Sub-second revocation latency", "Zero-collateral isolation"],
      },
    ] as CapabilityCard[],
  },

  lifecycle: {
    eyebrow: "Credential lifecycle",
    headlineLine1: "End-to-end provenance.",
    headlineLine2: "From genesis to on-chain verification.",
    description:
      "Every credential moves through six mathematically verifiable states, preserving institutional authority and recipient privacy at every step.",
    milestones: [
      {
        number: "01",
        phase: "Design",
        title: "Institutional template",
        description: "Author customized vector templates with dynamic placeholders and security rules.",
        standard: "W3C VC 2.0 Data Model",
      },
      {
        number: "02",
        phase: "Sign",
        title: "Cryptographic signing",
        description: "Sign canonical JSON payloads using governed institutional keys and active epoch credentials.",
        standard: "NIST P-256 / JWS 2020",
      },
      {
        number: "03",
        phase: "Anchor",
        title: "Merkle batch commitment",
        description: "Roll leaf hashes into a deterministic Keccak-256 Merkle root anchored to Ethereum.",
        standard: "OpenZeppelin MerkleProof v5",
      },
      {
        number: "04",
        phase: "Dispatch",
        title: "Claim invitation dispatch",
        description: "Deliver high-entropy single-use claim tokens to verified recipient endpoints.",
        standard: "RFC 8785 Canonicalization",
      },
      {
        number: "05",
        phase: "Claim",
        title: "Holder wallet ingestion",
        description: "Holder signs challenge nonce to bind the credential permanently to their private wallet.",
        standard: "Argon2id & ECDSA Nonces",
      },
      {
        number: "06",
        phase: "Verify",
        title: "Universal verification",
        description: "Relying parties independently verify signature validity, root inclusion, and status lists.",
        standard: "Public REST & WebGL Audit",
      },
    ] as LifecycleMilestone[],
  },

  trustNetwork: {
    eyebrow: "Network topology",
    headlineLine1: "Decentralized trust layers.",
    headlineLine2: "Secured at every stage.",
    description:
      "CREDVAIL connects three distinct actors in a tripartite trust model: Institutional Issuers, Credential Holders, and Relying Parties.",
    nodes: [
      {
        id: "issuer",
        name: "Institutional issuer",
        role: "Authority & governance",
        description:
          "Configures organization DID:web profiles, administers staff RBAC roles, provisions signing epochs, and triggers bulk issuance pipelines.",
        technologies: ["W3C DID:web", "AES-256-GCM Private Key Vault", "Automated Batch Engine"],
        metrics: "Multi-tenant isolation",
      },
      {
        id: "holder",
        name: "Credential holder",
        role: "Self-sovereign custody",
        description:
          "Receives claim tokens, binds credentials to personal keypairs, and presents portable verifiable credentials without centralized telemetry.",
        technologies: ["Browser LocalVault", "Selective Disclosure", "Challenge Nonce Verification"],
        metrics: "Zero telemetry leakage",
      },
      {
        id: "verifier",
        name: "Universal verifier",
        role: "Zero-trust inspection",
        description:
          "Accepts credential payloads, hashes, or URN identifiers to cryptographically validate signatures, Merkle paths, and live revocation status.",
        technologies: ["Ethereum Consensus", "W3C StatusList2021", "O(log N) Inclusion Proofs"],
        metrics: "Independent verification",
      },
    ] as ArchitectureNode[],
  },

  finale: {
    eyebrow: "Production readiness",
    headlineLine1: "Deploy institutional trust.",
    headlineLine2: "Verifiable in milliseconds.",
    description:
      "Join premier universities, accreditation councils, and enterprise teams securing digital achievement with CREDVAIL verifiable infrastructure.",
    primaryCta: {
      label: "Start issuing credentials",
      href: "/register",
    },
    secondaryCta: {
      label: "Inspect public verifier",
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
