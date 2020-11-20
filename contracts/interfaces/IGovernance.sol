//SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.8.0;

enum VoteValue { None, Abstain, No, Yes }

interface IGovernance {
	function vote(uint256 proposalId, uint256 index, VoteValue value) external returns (bool);
}