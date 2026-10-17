// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title IDelegationRegistry
 * @notice Minimal interface of the EXISTING deployed DelegationRegistry
 *         (0x088bc310c841fA5ed5b28F37050c3B419572b70d on Monad testnet).
 *         ABI-compatible with its `Delegation` struct (enum Tier decodes as uint8).
 */
interface IDelegationRegistry {
    struct Delegation {
        address owner;
        address agent;
        uint8 tier;
        uint256 createdAt;
        uint256 expiresAt;
        bool active;
        bool revoked;
    }

    function getDelegation(uint256 delegationId) external view returns (Delegation memory);
    function isDelegationValid(uint256 delegationId) external view returns (bool);
}

/**
 * @title AuthorizationVerifierV2
 * @notice Trust Layer verifier with REAL cryptographic checks (Step 1 of the rebuild).
 *
 *         What it proves: "a delegation exists that the owner personally committed to
 *         their approval set (Merkle root), it matches the on-chain DelegationRegistry
 *         exactly, its tier covers the requested action, and it has not expired,
 *         been revoked, or been replayed (nullifier)."
 *
 *         Design rules (see .build/DECISIONS.md):
 *         - Additive only: deployed alongside the old AuthorizationVerifier, which is untouched.
 *         - Adapts to existing code: cross-checks the existing DelegationRegistry instead
 *           of duplicating delegation state.
 *         - Decentralized roots: each OWNER commits their own root (no contract-owner trust).
 *         - Step 2 upgrade path: a ZK circuit will later prove the same statement without
 *           revealing the leaf (owner privacy). Claim/leaf layout is designed for that.
 *
 *         Leaf definition (must match client `src/zk/merkle.ts`):
 *             leaf = keccak256(keccak256(abi.encode(owner, delegationId, agent, tier, expiresAt)))
 *         (double-hash per OpenZeppelin guidance to prevent second-preimage attacks)
 */
contract AuthorizationVerifierV2 is Ownable, ReentrancyGuard {
    /// @notice The existing DelegationRegistry this verifier cross-checks against.
    IDelegationRegistry public immutable registry;

    /// @notice owner => Merkle root of the delegation leaves that owner has approved.
    mapping(address => bytes32) public ownerRoots;

    /// @notice nullifierHash => used. Prevents replaying the same authorization.
    mapping(uint256 => bool) public nullifierHashes;

    /// @notice agent => number of authorizations verified (lightweight stats for UIs).
    mapping(address => uint256) public verificationCount;

    event RootCommitted(address indexed owner, bytes32 root);

    event AuthorizationVerified(
        uint256 indexed delegationId,
        address indexed agent,
        uint256 nullifierHash,
        uint8 tier,
        uint256 timestamp
    );

    /**
     * @notice Everything a prover claims about one authorization.
     * @param owner          The delegating owner whose root set contains the leaf.
     * @param delegationId   ID in the DelegationRegistry.
     * @param agent          The agent wallet being authorized.
     * @param tier           Delegation tier (0 Basic, 1 Routine, 2 Elevated).
     * @param expiresAt      Delegation expiry (0 = never).
     * @param minTier        Minimum tier the action requires.
     * @param nullifierHash  Unique per (delegation, agent, action scope); prevents replay.
     */
    struct AuthorizationClaim {
        address owner;
        uint256 delegationId;
        address agent;
        uint8 tier;
        uint256 expiresAt;
        uint8 minTier;
        uint256 nullifierHash;
    }

    constructor(address registryAddress) Ownable(msg.sender) {
        require(registryAddress != address(0), "Invalid registry address");
        registry = IDelegationRegistry(registryAddress);
    }

    // ---------------------------------------------------------------------
    // Owner: commit approval set
    // ---------------------------------------------------------------------

    /**
     * @notice Owner commits the Merkle root of their approved delegation leaves.
     *         Signed by the owner's wallet (e.g. Privy embedded wallet in the UI),
     *         so the root itself is owner-authorized. Re-committing replaces the set
     *         (used when delegations are added or revoked).
     */
    function commitRoot(bytes32 root) external {
        require(root != bytes32(0), "Empty root");
        ownerRoots[msg.sender] = root;
        emit RootCommitted(msg.sender, root);
    }

    // ---------------------------------------------------------------------
    // Verification
    // ---------------------------------------------------------------------

    /**
     * @notice Canonical leaf encoding. Public so clients can compute leaves
     *         exactly the way the contract does.
     */
    function leafFor(
        address owner,
        uint256 delegationId,
        address agent,
        uint8 tier,
        uint256 expiresAt
    ) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(owner, delegationId, agent, tier, expiresAt))));
    }

    /**
     * @notice View-only dry run of every check `verifyAuthorization` performs,
     *         without consuming the nullifier. Lets UIs pre-validate before sending a tx.
     */
    function checkAuthorization(
        AuthorizationClaim calldata claim,
        bytes32[] calldata proof
    ) external view returns (bool) {
        return _validate(claim, proof, false);
    }

    /**
     * @notice Verify an authorization claim and consume its nullifier.
     *         Reverts with a specific reason if any check fails; returns true on success.
     */
    function verifyAuthorization(
        AuthorizationClaim calldata claim,
        bytes32[] calldata proof
    ) external nonReentrant returns (bool) {
        bool valid = _validate(claim, proof, true);

        nullifierHashes[claim.nullifierHash] = true;
        verificationCount[claim.agent] += 1;

        emit AuthorizationVerified(
            claim.delegationId,
            claim.agent,
            claim.nullifierHash,
            claim.tier,
            block.timestamp
        );

        return valid;
    }

    function _validate(
        AuthorizationClaim calldata claim,
        bytes32[] calldata proof,
        bool enforceNullifier
    ) internal view returns (bool) {
        require(claim.nullifierHash != 0, "Empty nullifier");
        if (enforceNullifier) {
            require(!nullifierHashes[claim.nullifierHash], "Proof already used");
        }

        // 1. Tier policy: delegation must cover what the action requires.
        require(claim.tier >= claim.minTier, "Tier below required level");

        // 2. Expiry policy (claim-level; registry is re-checked below as source of truth).
        require(claim.expiresAt == 0 || claim.expiresAt > block.timestamp, "Delegation expired");

        // 3. Membership: leaf must be inside the root the OWNER committed.
        bytes32 root = ownerRoots[claim.owner];
        require(root != bytes32(0), "Owner has no committed root");
        bytes32 leaf = leafFor(claim.owner, claim.delegationId, claim.agent, claim.tier, claim.expiresAt);
        require(MerkleProof.verifyCalldata(proof, root, leaf), "Invalid membership proof");

        // 4. Cross-check the existing DelegationRegistry: the claim must match
        //    the registered delegation exactly, and it must still be valid
        //    (active, not revoked, not expired).
        IDelegationRegistry.Delegation memory reg = registry.getDelegation(claim.delegationId);
        require(reg.active && !reg.revoked, "Delegation not active in registry");
        require(reg.owner == claim.owner, "Owner mismatch with registry");
        require(reg.agent == claim.agent, "Agent mismatch with registry");
        require(reg.tier == claim.tier, "Tier mismatch with registry");
        require(reg.expiresAt == claim.expiresAt, "Expiry mismatch with registry");
        require(registry.isDelegationValid(claim.delegationId), "Delegation invalid in registry");

        return true;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getOwnerRoot(address owner) external view returns (bytes32) {
        return ownerRoots[owner];
    }

    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return nullifierHashes[nullifierHash];
    }
}
