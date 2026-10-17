// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AuthorizationVerifier
 * @notice Verifies authorization proofs that a valid delegation exists without revealing owner identity
 * @dev Designed for Monad Trust Layer privacy-preserving authorization
 * Simplified version that can be extended with specific ZK proof systems
 */
contract AuthorizationVerifier is Ownable(msg.sender), ReentrancyGuard {
    
    // Simple proof verification mapping for demo purposes
    // In production, this would use actual ZK proof verification
    mapping(uint256 => bool) public verifiedProofs;
    
    // The Merkle tree root representing valid delegations
    uint256 public delegationRoot;
    
    // Mapping from nullifier hashes to prevent proof reuse
    mapping(uint256 => bool) public nullifierHashes;
    
    // Mapping from delegation IDs to their inclusion in the current tree
    mapping(uint256 => bool) public delegationIncluded;
    
    // Events
    event ProofVerified(
        uint256 indexed proofId,
        uint256 delegationRoot,
        uint256 timestamp
    );
    
    event DelegationRootUpdated(uint256 newRoot);
    
    event DelegationAddedToTree(uint256 indexed delegationId);
    
    /**
     * @notice Simplified proof verification for demo purposes
     * @param proofId A unique identifier for the proof
     * @param root The Merkle root
     * @param nullifierHash The nullifier hash
     * @return valid Whether the proof is valid
     */
    function verifyAuthorization(
        uint256 proofId,
        uint256 root,
        uint256 nullifierHash
    ) external nonReentrant returns (bool valid) {
        // Check that the proof hasn't been used before (prevent replay attacks)
        require(!nullifierHashes[nullifierHash], "Proof already used");
        
        // Verify the proof against the current delegation root
        require(root == delegationRoot, "Invalid delegation root");
        
        // For demo purposes, we accept the proof if it matches the root
        // In production, this would use actual ZK proof verification
        valid = true;
        
        if (valid) {
            // Mark the nullifier as used to prevent replay
            nullifierHashes[nullifierHash] = true;
            verifiedProofs[proofId] = true;
            
            emit ProofVerified(proofId, root, block.timestamp);
        }
        
        return valid;
    }
    
    /**
     * @notice Update the delegation root (called when delegations are added/revoked)
     * @param newRoot The new Merkle root
     */
    function updateDelegationRoot(uint256 newRoot) external onlyOwner {
        delegationRoot = newRoot;
        emit DelegationRootUpdated(newRoot);
    }
    
    /**
     * @notice Mark a delegation as included in the current tree
     * @param delegationId The delegation ID
     */
    function markDelegationIncluded(uint256 delegationId) external onlyOwner {
        delegationIncluded[delegationId] = true;
        emit DelegationAddedToTree(delegationId);
    }
    
    /**
     * @notice Check if a proof nullifier has been used
     * @param nullifierHash The nullifier hash
     * @return used Whether the nullifier has been used
     */
    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return nullifierHashes[nullifierHash];
    }
    
    /**
     * @notice Check if a delegation is included in the current tree
     * @param delegationId The delegation ID
     * @return included Whether the delegation is included
     */
    function isDelegationIncluded(uint256 delegationId) external view returns (bool) {
        return delegationIncluded[delegationId];
    }
    
    /**
     * @notice Get the current delegation root
     * @return The current Merkle root
     */
    function getCurrentRoot() external view returns (uint256) {
        return delegationRoot;
    }
}
