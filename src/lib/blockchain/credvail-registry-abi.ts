/**
 * CREDVAIL Registry Smart Contract ABI
 * 
 * Target Contract: CredvailRegistry.sol
 * Network: Ethereum Sepolia (Chain ID: 11155111)
 * Interfaces: ICredvailRegistry
 */

export const CREDVAIL_REGISTRY_ABI = [
  // --- Events ---
  {
    type: "event",
    name: "IssuerKeyRegistered",
    inputs: [
      { name: "tenantHash", type: "bytes32", indexed: true },
      { name: "epoch", type: "uint256", indexed: true },
      { name: "fingerprint", type: "bytes32", indexed: false },
      { name: "validFrom", type: "uint64", indexed: false },
      { name: "validTo", type: "uint64", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "IssuerKeyRotated",
    inputs: [
      { name: "tenantHash", type: "bytes32", indexed: true },
      { name: "oldEpoch", type: "uint256", indexed: true },
      { name: "newEpoch", type: "uint256", indexed: true },
      { name: "newFingerprint", type: "bytes32", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "IssuerKeyCompromised",
    inputs: [
      { name: "tenantHash", type: "bytes32", indexed: true },
      { name: "epoch", type: "uint256", indexed: true },
      { name: "compromisedTimestamp", type: "uint64", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "BatchAnchored",
    inputs: [
      { name: "tenantHash", type: "bytes32", indexed: true },
      { name: "batchId", type: "bytes32", indexed: true },
      { name: "merkleRoot", type: "bytes32", indexed: false },
      { name: "leafCount", type: "uint32", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "StatusDigestAnchored",
    inputs: [
      { name: "tenantHash", type: "bytes32", indexed: true },
      { name: "statusEpoch", type: "uint256", indexed: true },
      { name: "digestSha256", type: "bytes32", indexed: false }
    ],
    anonymous: false
  },

  // --- Read-Only View Functions ---
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "tenantManagers",
    stateMutability: "view",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "manager", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "getIssuerKey",
    stateMutability: "view",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "epoch", type: "uint256" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "publicKeyFingerprint", type: "bytes32" },
          { name: "validFrom", type: "uint64" },
          { name: "validTo", type: "uint64" },
          { name: "compromisedAt", type: "uint64" },
          { name: "isCompromised", type: "bool" },
          { name: "exists", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "getBatch",
    stateMutability: "view",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "batchId", type: "bytes32" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "merkleRoot", type: "bytes32" },
          { name: "leafCount", type: "uint32" },
          { name: "anchoredAtBlockTimestamp", type: "uint64" },
          { name: "exists", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "verifyCredentialProof",
    stateMutability: "view",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "batchId", type: "bytes32" },
      { name: "leafHash", type: "bytes32" },
      { name: "proof", type: "bytes32[]" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "getStatusDigest",
    stateMutability: "view",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "statusEpoch", type: "uint256" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "digestSha256", type: "bytes32" },
          { name: "anchoredAtBlockTimestamp", type: "uint64" },
          { name: "exists", type: "bool" }
        ]
      }
    ]
  },

  // --- State-Modifying Functions ---
  {
    type: "function",
    name: "setTenantManager",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "manager", type: "address" },
      { name: "authorized", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: []
  },
  {
    type: "function",
    name: "registerIssuerKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "epoch", type: "uint256" },
      { name: "fingerprint", type: "bytes32" },
      { name: "validFrom", type: "uint64" },
      { name: "validTo", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "rotateIssuerKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "oldEpoch", type: "uint256" },
      { name: "newEpoch", type: "uint256" },
      { name: "newFingerprint", type: "bytes32" },
      { name: "validFrom", type: "uint64" },
      { name: "validTo", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "flagKeyCompromised",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "epoch", type: "uint256" },
      { name: "compromisedTimestamp", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "anchorBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "batchId", type: "bytes32" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "leafCount", type: "uint32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "anchorStatusDigest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tenantHash", type: "bytes32" },
      { name: "statusEpoch", type: "uint256" },
      { name: "digestSha256", type: "bytes32" }
    ],
    outputs: []
  }
] as const;
