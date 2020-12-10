//SPDX-License-Identifier: MIT
pragma solidity 0.6.2;

interface IVoterProxy {
	function proxyVote(address, uint256, address, address) external returns (bool);
	function proxyActivate(address) external returns (bool);
	function proxyRevokeActive(address, uint256, address, address, uint256) external returns (bool);
	function proxyRevokePending(address, uint256, address, address, uint256) external returns (bool);
}
