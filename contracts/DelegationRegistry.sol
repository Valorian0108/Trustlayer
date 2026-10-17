// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DelegationRegistry
 * @notice Stores delegation commitments from owners to agents with bounded authorization tiers
 * @dev Designed for Monad Trust Layer proportional authorization system
 */
contract DelegationRegistry is Ownable(msg.sender), ReentrancyGuard {
    
    // Delegation tiers as defined in the hackathon plan
    enum Tier {
        Basic,    // $5
        Routine,  // $50  
        Elevated  // $500
    }
    
    struct Delegation {
        address owner;              // Owner who delegated (can be commitment hash for privacy)
        address agent;             // Agent being delegated
        Tier tier;                  // Authorization tier
        uint256 createdAt;          // When delegation was created
        uint256 expiresAt;          // When delegation expires (0 = no expiry)
        bool active;                // Whether delegation is currently active
        bool revoked;              // Whether delegation was revoked
    }
    
    // Mapping from delegation ID to delegation data
    mapping(uint256 => Delegation) public delegations;
    
    // Mapping from owner to their delegation IDs
    mapping(address => uint256[]) public ownerDelegations;
    
    // Mapping from agent to their delegation IDs
    mapping(address => uint256[]) public agentDelegations;
    
    // Counter for delegation IDs
    uint256 public delegationCounter;
    
    // Events
    event DelegationCreated(
        uint256 indexed delegationId,
        address indexed owner,
        address indexed agent,
        Tier tier,
        uint256 expiresAt
    );
    
    event DelegationRevoked(uint256 indexed delegationId, address indexed owner);
    
    event DelegationUpdated(
        uint256 indexed delegationId,
        Tier newTier,
        uint256 newExpiresAt
    );
    
    /**
     * @notice Create a new delegation from owner to agent
     * @param agent The agent address being delegated
     * @param tier The authorization tier
     * @param expiresAt Timestamp when delegation expires (0 for no expiry)
     * @return delegationId The ID of the created delegation
     */
    function createDelegation(
        address agent,
        Tier tier,
        uint256 expiresAt
    ) external nonReentrant returns (uint256) {
        require(agent != address(0), "Invalid agent address");
        require(msg.sender != address(0), "Invalid owner address");
        
        // Ensure expiry is in the future or 0 (no expiry)
        if (expiresAt != 0) {
            require(expiresAt > block.timestamp, "Expiry must be in the future");
        }
        
        uint256 delegationId = ++delegationCounter;
        
        delegations[delegationId] = Delegation({
            owner: msg.sender,
            agent: agent,
            tier: tier,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            active: true,
            revoked: false
        });
        
        ownerDelegations[msg.sender].push(delegationId);
        agentDelegations[agent].push(delegationId);
        
        emit DelegationCreated(delegationId, msg.sender, agent, tier, expiresAt);
        
        return delegationId;
    }
    
    /**
     * @notice Revoke an existing delegation
     * @param delegationId The ID of the delegation to revoke
     */
    function revokeDelegation(uint256 delegationId) external nonReentrant {
        Delegation storage delegation = delegations[delegationId];
        
        require(delegation.owner == msg.sender, "Not delegation owner");
        require(delegation.active, "Delegation already inactive");
        require(!delegation.revoked, "Delegation already revoked");
        
        delegation.active = false;
        delegation.revoked = true;
        
        emit DelegationRevoked(delegationId, msg.sender);
    }
    
    /**
     * @notice Update delegation tier and/or expiry
     * @param delegationId The ID of the delegation to update
     * @param newTier The new authorization tier
     * @param newExpiresAt The new expiry timestamp (0 to keep current)
     */
    function updateDelegation(
        uint256 delegationId,
        Tier newTier,
        uint256 newExpiresAt
    ) external nonReentrant {
        Delegation storage delegation = delegations[delegationId];
        
        require(delegation.owner == msg.sender, "Not delegation owner");
        require(delegation.active, "Delegation inactive");
        require(!delegation.revoked, "Delegation revoked");
        
        // Update tier if provided
        if (newTier != delegation.tier) {
            delegation.tier = newTier;
        }
        
        // Update expiry if provided (0 means keep current)
        if (newExpiresAt != 0) {
            require(newExpiresAt > block.timestamp, "Expiry must be in the future");
            delegation.expiresAt = newExpiresAt;
        }
        
        emit DelegationUpdated(delegationId, delegation.tier, delegation.expiresAt);
    }
    
    /**
     * @notice Check if a delegation is valid and active
     * @param delegationId The ID of the delegation to check
     * @return valid Whether the delegation is currently valid
     */
    function isDelegationValid(uint256 delegationId) external view returns (bool) {
        Delegation memory delegation = delegations[delegationId];
        
        if (!delegation.active || delegation.revoked) {
            return false;
        }
        
        // Check expiry
        if (delegation.expiresAt != 0 && block.timestamp >= delegation.expiresAt) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @notice Get delegation details
     * @param delegationId The ID of the delegation
     * @return The delegation struct
     */
    function getDelegation(uint256 delegationId) external view returns (Delegation memory) {
        return delegations[delegationId];
    }
    
    /**
     * @notice Get all delegation IDs for an owner
     * @param owner The owner address
     * @return Array of delegation IDs
     */
    function getOwnerDelegations(address owner) external view returns (uint256[] memory) {
        return ownerDelegations[owner];
    }
    
    /**
     * @notice Get all delegation IDs for an agent
     * @param agent The agent address
     * @return Array of delegation IDs
     */
    function getAgentDelegations(address agent) external view returns (uint256[] memory) {
        return agentDelegations[agent];
    }
    
    /**
     * @notice Check if an agent has a valid delegation from an owner
     * @param owner The owner address
     * @param agent The agent address
     * @return hasValidDelegation Whether a valid delegation exists
     * @return delegationId The ID of the valid delegation (if any)
     * @return tier The tier of the valid delegation (if any)
     */
    function checkAgentDelegation(
        address owner,
        address agent
    ) external view returns (bool hasValidDelegation, uint256 delegationId, Tier tier) {
        uint256[] memory delegationIds = ownerDelegations[owner];
        
        for (uint256 i = 0; i < delegationIds.length; i++) {
            Delegation memory delegation = delegations[delegationIds[i]];
            
            if (delegation.agent == agent && delegation.active && !delegation.revoked) {
                // Check expiry
                if (delegation.expiresAt == 0 || block.timestamp < delegation.expiresAt) {
                    return (true, delegationIds[i], delegation.tier);
                }
            }
        }
        
        return (false, 0, Tier.Basic);
    }
}
