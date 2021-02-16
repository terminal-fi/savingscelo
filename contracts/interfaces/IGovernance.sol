//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

contract Governance {
	enum VoteValue { None, Abstain, No, Yes }
}

interface IGovernance {
	function vote(uint256 proposalId, uint256 index, Governance.VoteValue value) external returns (bool);
	function upvote(uint256 proposalId, uint256 lesser, uint256 greater) external returns (bool);
	function revokeUpvote(uint256 lesser, uint256 greater) external returns (bool);
}
