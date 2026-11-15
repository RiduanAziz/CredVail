// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./interfaces/ICredvailRegistry.sol";

/**
 * @title CredvailRegistry
 * @author CREDVAIL Engineering
 * @notice Multi-tenant decentralized registry for institutional key governance,
 * batch Merkle root integrity anchoring, and W3C Bitstring status list commitments.
 */
contract CredvailRegistry is ICredvailRegistry {
    // --- State Storage ---
    address public owner;

    // tenantHash => authorizedManager => isAuthorized
    mapping(bytes32 => mapping(address => bool)) public tenantManagers;

    // tenantHash => epoch => IssuerKeyRecord
    mapping(bytes32 => mapping(uint256 => IssuerKeyRecord)) private _issuerKeys;

    // tenantHash => batchId => BatchRecord
    mapping(bytes32 => mapping(bytes32 => BatchRecord)) private _batches;

    // tenantHash => statusEpoch => StatusDigestRecord
    mapping(bytes32 => mapping(uint256 => StatusDigestRecord)) private _statusDigests;

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "CredvailRegistry: Caller is not contract owner");
        _;
    }

    modifier onlyTenantManager(bytes32 tenantHash) {
        require(
            msg.sender == owner || tenantManagers[tenantHash][msg.sender],
            "CredvailRegistry: Caller is not authorized tenant manager"
        );
        _;
    }

    // --- Constructor ---
    constructor() {
        owner = msg.sender;
    }

    // --- Management Authorization ---
    function setTenantManager(bytes32 tenantHash, address manager, bool authorized) external onlyOwner {
        tenantManagers[tenantHash][manager] = authorized;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CredvailRegistry: Zero address");
        owner = newOwner;
    }

    // --- ICredvailRegistry Implementation ---

    function registerIssuerKey(
        bytes32 tenantHash,
        uint256 epoch,
        bytes32 fingerprint,
        uint64 validFrom,
        uint64 validTo
    ) external override onlyTenantManager(tenantHash) {
        require(!_issuerKeys[tenantHash][epoch].exists, "CredvailRegistry: Key epoch already exists");
        require(fingerprint != bytes32(0), "CredvailRegistry: Fingerprint cannot be empty");
        require(validTo == 0 || validTo > validFrom, "CredvailRegistry: Invalid validity window");

        _issuerKeys[tenantHash][epoch] = IssuerKeyRecord({
            publicKeyFingerprint: fingerprint,
            validFrom: validFrom,
            validTo: validTo,
            compromisedAt: 0,
            isCompromised: false,
            exists: true
        });

        emit IssuerKeyRegistered(tenantHash, epoch, fingerprint, validFrom, validTo);
    }

    function rotateIssuerKey(
        bytes32 tenantHash,
        uint256 oldEpoch,
        uint256 newEpoch,
        bytes32 newFingerprint,
        uint64 validFrom,
        uint64 validTo
    ) external override onlyTenantManager(tenantHash) {
        require(_issuerKeys[tenantHash][oldEpoch].exists, "CredvailRegistry: Old epoch does not exist");
        require(!_issuerKeys[tenantHash][newEpoch].exists, "CredvailRegistry: New epoch already exists");
        require(newEpoch > oldEpoch, "CredvailRegistry: New epoch must be greater than old epoch");

        _issuerKeys[tenantHash][newEpoch] = IssuerKeyRecord({
            publicKeyFingerprint: newFingerprint,
            validFrom: validFrom,
            validTo: validTo,
            compromisedAt: 0,
            isCompromised: false,
            exists: true
        });

        emit IssuerKeyRotated(tenantHash, oldEpoch, newEpoch, newFingerprint);
    }

    function flagKeyCompromised(
        bytes32 tenantHash,
        uint256 epoch,
        uint64 compromisedTimestamp
    ) external override onlyTenantManager(tenantHash) {
        require(_issuerKeys[tenantHash][epoch].exists, "CredvailRegistry: Epoch does not exist");
        require(!_issuerKeys[tenantHash][epoch].isCompromised, "CredvailRegistry: Key already flagged compromised");

        _issuerKeys[tenantHash][epoch].isCompromised = true;
        _issuerKeys[tenantHash][epoch].compromisedAt = compromisedTimestamp;

        emit IssuerKeyCompromised(tenantHash, epoch, compromisedTimestamp);
    }

    function getIssuerKey(bytes32 tenantHash, uint256 epoch) external view override returns (IssuerKeyRecord memory) {
        require(_issuerKeys[tenantHash][epoch].exists, "CredvailRegistry: Key epoch not found");
        return _issuerKeys[tenantHash][epoch];
    }

    function anchorBatch(
        bytes32 tenantHash,
        bytes32 batchId,
        bytes32 merkleRoot,
        uint32 leafCount
    ) external override onlyTenantManager(tenantHash) {
        require(!_batches[tenantHash][batchId].exists, "CredvailRegistry: Batch already anchored");
        require(merkleRoot != bytes32(0), "CredvailRegistry: Merkle root cannot be empty");
        require(leafCount > 0, "CredvailRegistry: Leaf count must be positive");

        _batches[tenantHash][batchId] = BatchRecord({
            merkleRoot: merkleRoot,
            leafCount: leafCount,
            anchoredAtBlockTimestamp: uint64(block.timestamp),
            exists: true
        });

        emit BatchAnchored(tenantHash, batchId, merkleRoot, leafCount);
    }

    function getBatch(bytes32 tenantHash, bytes32 batchId) external view override returns (BatchRecord memory) {
        require(_batches[tenantHash][batchId].exists, "CredvailRegistry: Batch not found");
        return _batches[tenantHash][batchId];
    }

    function verifyCredentialProof(
        bytes32 tenantHash,
        bytes32 batchId,
        bytes32 leafHash,
        bytes32[] calldata proof
    ) external view override returns (bool) {
        BatchRecord memory batch = _batches[tenantHash][batchId];
        if (!batch.exists) return false;

        bytes32 computedHash = leafHash;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == batch.merkleRoot;
    }

    function anchorStatusDigest(
        bytes32 tenantHash,
        uint256 statusEpoch,
        bytes32 digestSha256
    ) external override onlyTenantManager(tenantHash) {
        require(digestSha256 != bytes32(0), "CredvailRegistry: Digest cannot be empty");
        require(!_statusDigests[tenantHash][statusEpoch].exists, "CredvailRegistry: Status epoch already exists");

        _statusDigests[tenantHash][statusEpoch] = StatusDigestRecord({
            digestSha256: digestSha256,
            anchoredAtBlockTimestamp: uint64(block.timestamp),
            exists: true
        });

        emit StatusDigestAnchored(tenantHash, statusEpoch, digestSha256);
    }

    function getStatusDigest(bytes32 tenantHash, uint256 statusEpoch) external view override returns (StatusDigestRecord memory) {
        require(_statusDigests[tenantHash][statusEpoch].exists, "CredvailRegistry: Status epoch not found");
        return _statusDigests[tenantHash][statusEpoch];
    }
}
