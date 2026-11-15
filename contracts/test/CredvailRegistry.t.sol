// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../src/CredvailRegistry.sol";
import "../src/interfaces/ICredvailRegistry.sol";

/**
 * @title CredvailRegistryTest
 * @notice Complete Foundry test suite for CredvailRegistry smart contract.
 * Covers multi-tenant isolation, manager permissions, key epochs, batch Merkle anchoring,
 * and OpenZeppelin-compatible Merkle proof verification.
 */
contract CredvailRegistryTest {
    CredvailRegistry public registry;

    address public owner;
    address public tenantAdmin;
    address public unauthorizedUser;

    bytes32 public constant TENANT_A = keccak256("tenant-a-slug");
    bytes32 public constant TENANT_B = keccak256("tenant-b-slug");

    // Events to mirror contract events for verification
    event IssuerKeyRegistered(bytes32 indexed tenantHash, uint256 indexed epoch, bytes32 fingerprint, uint64 validFrom, uint64 validTo);
    event IssuerKeyRotated(bytes32 indexed tenantHash, uint256 indexed oldEpoch, uint256 indexed newEpoch, bytes32 newFingerprint);
    event IssuerKeyCompromised(bytes32 indexed tenantHash, uint256 indexed epoch, uint64 compromisedTimestamp);
    event BatchAnchored(bytes32 indexed tenantHash, bytes32 indexed batchId, bytes32 merkleRoot, uint32 leafCount);
    event StatusDigestAnchored(bytes32 indexed tenantHash, uint256 indexed statusEpoch, bytes32 digestSha256);

    function setUp() public {
        owner = address(this);
        tenantAdmin = address(0x1001);
        unauthorizedUser = address(0x9999);

        registry = new CredvailRegistry();
        registry.setTenantManager(TENANT_A, tenantAdmin, true);
    }

    // --- Ownership & Management Authorization Tests ---

    function testOwnerIsDeployer() public view {
        require(registry.owner() == address(this), "Owner should be deployer");
    }

    function testSetTenantManagerAuthorization() public {
        address newManager = address(0x2002);
        registry.setTenantManager(TENANT_A, newManager, true);
        require(registry.tenantManagers(TENANT_A, newManager) == true, "Manager should be authorized");

        registry.setTenantManager(TENANT_A, newManager, false);
        require(registry.tenantManagers(TENANT_A, newManager) == false, "Manager should be de-authorized");
    }

    function testTransferOwnership() public {
        address newOwner = address(0x3003);
        registry.transferOwnership(newOwner);
        require(registry.owner() == newOwner, "Ownership not transferred");
    }

    // --- Key Epoch Governance Tests ---

    function testRegisterIssuerKey() public {
        bytes32 fp = keccak256("jwk-fingerprint-epoch-1");
        uint64 vFrom = uint64(block.timestamp);
        uint64 vTo = uint64(block.timestamp + 365 days);

        registry.registerIssuerKey(TENANT_A, 1, fp, vFrom, vTo);

        ICredvailRegistry.IssuerKeyRecord memory key = registry.getIssuerKey(TENANT_A, 1);
        require(key.exists, "Key record should exist");
        require(key.publicKeyFingerprint == fp, "Fingerprint mismatch");
        require(key.validFrom == vFrom, "ValidFrom mismatch");
        require(key.validTo == vTo, "ValidTo mismatch");
        require(!key.isCompromised, "Key should not be compromised");
    }

    function testRotateIssuerKey() public {
        bytes32 fp1 = keccak256("jwk-fingerprint-epoch-1");
        bytes32 fp2 = keccak256("jwk-fingerprint-epoch-2");
        uint64 vFrom = uint64(block.timestamp);
        uint64 vTo = uint64(block.timestamp + 365 days);

        registry.registerIssuerKey(TENANT_A, 1, fp1, vFrom, vTo);
        registry.rotateIssuerKey(TENANT_A, 1, 2, fp2, vFrom + 100, vTo + 365 days);

        ICredvailRegistry.IssuerKeyRecord memory key2 = registry.getIssuerKey(TENANT_A, 2);
        require(key2.exists, "Epoch 2 should exist");
        require(key2.publicKeyFingerprint == fp2, "Epoch 2 fingerprint mismatch");
    }

    function testFlagKeyCompromised() public {
        bytes32 fp = keccak256("jwk-fingerprint-epoch-1");
        uint64 vFrom = uint64(block.timestamp);
        registry.registerIssuerKey(TENANT_A, 1, fp, vFrom, 0);

        uint64 compTime = uint64(block.timestamp + 50);
        registry.flagKeyCompromised(TENANT_A, 1, compTime);

        ICredvailRegistry.IssuerKeyRecord memory key = registry.getIssuerKey(TENANT_A, 1);
        require(key.isCompromised, "Key must be flagged compromised");
        require(key.compromisedAt == compTime, "Compromise timestamp mismatch");
    }

    // --- Batch Anchoring & Merkle Verification Tests ---

    function testAnchorBatchAndVerifyProof() public {
        bytes32 batchId = keccak256("BATCH-2026-0001");

        // 2-leaf Merkle Tree:
        bytes32 leaf0 = keccak256("leaf-0-credential-data");
        bytes32 leaf1 = keccak256("leaf-1-credential-data");

        // Commutative sorted pairwise hash
        bytes32 root = leaf0 <= leaf1
            ? keccak256(abi.encodePacked(leaf0, leaf1))
            : keccak256(abi.encodePacked(leaf1, leaf0));

        registry.anchorBatch(TENANT_A, batchId, root, 2);

        ICredvailRegistry.BatchRecord memory batch = registry.getBatch(TENANT_A, batchId);
        require(batch.exists, "Batch should exist");
        require(batch.merkleRoot == root, "Root mismatch");
        require(batch.leafCount == 2, "Leaf count mismatch");

        // Proof for leaf0 is [leaf1]
        bytes32[] memory proof0 = new bytes32[](1);
        proof0[0] = leaf1;
        bool valid0 = registry.verifyCredentialProof(TENANT_A, batchId, leaf0, proof0);
        require(valid0, "Leaf 0 proof must be valid");

        // Proof for leaf1 is [leaf0]
        bytes32[] memory proof1 = new bytes32[](1);
        proof1[0] = leaf0;
        bool valid1 = registry.verifyCredentialProof(TENANT_A, batchId, leaf1, proof1);
        require(valid1, "Leaf 1 proof must be valid");

        // Tampered leaf should fail
        bytes32 fakeLeaf = keccak256("tampered-credential-data");
        bool validFake = registry.verifyCredentialProof(TENANT_A, batchId, fakeLeaf, proof0);
        require(!validFake, "Tampered leaf proof must fail");

        // Tampered proof element should fail
        bytes32[] memory badProof = new bytes32[](1);
        badProof[0] = keccak256("wrong-sibling");
        bool validBadProof = registry.verifyCredentialProof(TENANT_A, batchId, leaf0, badProof);
        require(!validBadProof, "Invalid proof element must fail");
    }

    function testTenantIsolation() public {
        bytes32 batchId = keccak256("BATCH-TENANT-A");
        bytes32 root = keccak256("root-hash");

        registry.anchorBatch(TENANT_A, batchId, root, 5);

        // Verification or query under TENANT_B must fail / not exist
        bytes32[] memory emptyProof = new bytes32[](0);
        bool verifiedOnB = registry.verifyCredentialProof(TENANT_B, batchId, root, emptyProof);
        require(!verifiedOnB, "Cannot verify under different tenant");
    }

    // --- Status Digest Anchoring Tests ---

    function testAnchorStatusDigest() public {
        bytes32 digest = keccak256("gzip-bitstring-sha256-digest");
        registry.anchorStatusDigest(TENANT_A, 1, digest);

        ICredvailRegistry.StatusDigestRecord memory rec = registry.getStatusDigest(TENANT_A, 1);
        require(rec.exists, "Status digest must exist");
        require(rec.digestSha256 == digest, "Digest SHA-256 mismatch");
    }
}
