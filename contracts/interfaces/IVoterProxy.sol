//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

import "./IGovernance.sol";

interface IVoterProxy {
	function proxyVote(address, uint256, address, address) external returns (bool);
	function proxyActivate(address) external returns (bool);
	function proxyRevokeActive(address, uint256, address, address, uint256) external returns (bool);
	function proxyRevokePending(address, uint256, address, address, uint256) external returns (bool);

	function proxyGovernanceVote(uint256, uint256, Governance.VoteValue) external returns (bool);
	function proxyGovernanceUpvote(uint256, uint256, uint256) external returns (bool);
	function proxyGovernanceRevokeUpvote(uint256, uint256) external returns (bool);
}
