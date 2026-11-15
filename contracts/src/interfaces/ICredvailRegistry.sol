// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title ICredvailRegistry
 * @notice Interface for CREDVAIL's multi-tenant Ethereum registry.
 * Provides on-chain anchors for issuer key epochs, batch Merkle roots, and status list digests.
 */
interface ICredvailRegistry {
    // --- Data Structures ---
    struct IssuerKeyRecord {
        bytes32 publicKeyFingerprint;
        uint64 validFrom;
        uint64 validTo;
        uint64 compromisedAt;
        bool isCompromised;
        bool exists;
    }

    struct BatchRecord {
        bytes32 merkleRoot;
        uint32 leafCount;
        uint64 anchoredAtBlockTimestamp;
        bool exists;
    }

    struct StatusDigestRecord {
        bytes32 digestSha256;
        uint64 anchoredAtBlockTimestamp;
        bool exists;
    }

    // --- Events ---
    event IssuerKeyRegistered(bytes32 indexed tenantHash, uint256 indexed epoch, bytes32 fingerprint, uint64 validFrom, uint64 validTo);
    event IssuerKeyRotated(bytes32 indexed tenantHash, uint256 indexed oldEpoch, uint256 indexed newEpoch, bytes32 newFingerprint);
    event IssuerKeyCompromised(bytes32 indexed tenantHash, uint256 indexed epoch, uint64 compromisedTimestamp);
    event BatchAnchored(bytes32 indexed tenantHash, bytes32 indexed batchId, bytes32 merkleRoot, uint32 leafCount);
    event StatusDigestAnchored(bytes32 indexed tenantHash, uint256 indexed statusEpoch, bytes32 digestSha256);

    // --- Key Governance ---
    function registerIssuerKey(bytes32 tenantHash, uint256 epoch, bytes32 fingerprint, uint64 validFrom, uint64 validTo) external;
    function rotateIssuerKey(bytes32 tenantHash, uint256 oldEpoch, uint256 newEpoch, bytes32 newFingerprint, uint64 validFrom, uint64 validTo) external;
    function flagKeyCompromised(bytes32 tenantHash, uint256 epoch, uint64 compromisedTimestamp) external;
    function getIssuerKey(bytes32 tenantHash, uint256 epoch) external view returns (IssuerKeyRecord memory);

    // --- Integrity Anchoring ---
    function anchorBatch(bytes32 tenantHash, bytes32 batchId, bytes32 merkleRoot, uint32 leafCount) external;
    function getBatch(bytes32 tenantHash, bytes32 batchId) external view returns (BatchRecord memory);
    function verifyCredentialProof(bytes32 tenantHash, bytes32 batchId, bytes32 leafHash, bytes32[] calldata proof) external view returns (bool);

    // --- Status List Digest Anchoring ---
    function anchorStatusDigest(bytes32 tenantHash, uint256 statusEpoch, bytes32 digestSha256) external;
    function getStatusDigest(bytes32 tenantHash, uint256 statusEpoch) external view returns (StatusDigestRecord memory);
}
