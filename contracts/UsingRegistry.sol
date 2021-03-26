//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IRegistry.sol";
import "./interfaces/IAccounts.sol";
import "./interfaces/ILockedGold.sol";
import "./interfaces/IElection.sol";
import "./interfaces/IExchange.sol";
import "./interfaces/IGovernance.sol";

// This is a simplified version of Celo's: protocol/contracts/common/UsingRegistry.sol
contract UsingRegistry {

	IRegistry constant registry = IRegistry(address(0x000000000000000000000000000000000000ce10));

	bytes32 constant ACCOUNTS_REGISTRY_ID = keccak256(abi.encodePacked("Accounts"));
	bytes32 constant ELECTION_REGISTRY_ID = keccak256(abi.encodePacked("Election"));
	bytes32 constant EXCHANGE_REGISTRY_ID = keccak256(abi.encodePacked("Exchange"));
	bytes32 constant GOLD_TOKEN_REGISTRY_ID = keccak256(abi.encodePacked("GoldToken"));
	bytes32 constant GOVERNANCE_REGISTRY_ID = keccak256(abi.encodePacked("Governance"));
	bytes32 constant LOCKED_GOLD_REGISTRY_ID = keccak256(abi.encodePacked("LockedGold"));
	bytes32 constant STABLE_TOKEN_REGISTRY_ID = keccak256(abi.encodePacked("StableToken"));

	function getAccounts() internal view returns (IAccounts) {
		return IAccounts(registry.getAddressForOrDie(ACCOUNTS_REGISTRY_ID));
	}

	function getElection() internal view returns (IElection) {
		return IElection(registry.getAddressForOrDie(ELECTION_REGISTRY_ID));
	}

	function getExchange() internal view returns (IExchange) {
		return IExchange(registry.getAddressForOrDie(EXCHANGE_REGISTRY_ID));
	}

	function getGoldToken() internal view returns (IERC20) {
		return IERC20(registry.getAddressForOrDie(GOLD_TOKEN_REGISTRY_ID));
	}

	function getGovernance() internal view returns (IGovernance) {
		return IGovernance(registry.getAddressForOrDie(GOVERNANCE_REGISTRY_ID));
	}

	function getLockedGold() internal view returns (ILockedGold) {
		return ILockedGold(registry.getAddressForOrDie(LOCKED_GOLD_REGISTRY_ID));
	}

	function getStableToken() internal view returns (IERC20) {
		return IERC20(registry.getAddressForOrDie(STABLE_TOKEN_REGISTRY_ID));
	}
}