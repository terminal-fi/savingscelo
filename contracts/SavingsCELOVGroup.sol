//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./UsingRegistry.sol";
import "./interfaces/IExchange.sol";

/// @title SavingsCELO validator Group
contract SavingsCELOVGroup is Ownable, UsingRegistry {
	using SafeMath for uint256;

	address public _savingsCELO;

	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

	constructor (address savingsCELO) public {
		_savingsCELO = savingsCELO;
		require(
			getAccounts().createAccount(),
			"createAccount failed");
		getAccounts().setName("SavingsCELO - Group");
	}

	/// Authorizes new vote signer that can manage voting for all of groups locked CELO.
	/// {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contract address.
	function authorizeVoteSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) onlyOwner external {
		getAccounts().authorizeVoteSigner(signer, v, r, s);
	}

	/// Authorizes new validator signer that can manage group registration/deregistration and
	/// group memebrs.
	/// {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contract address.
	function authorizeValidatorSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) onlyOwner external {
		getAccounts().authorizeValidatorSigner(signer, v, r, s);
	}

	/// Proxy function for locked CELO management.
	function lockGold(uint256 value) onlyOwner external {
		getLockedGold().lock{gas:gasleft(), value: value}();
	}
	/// Proxy function for locked CELO management.
	function unlockGold(uint256 value) onlyOwner external {
		getLockedGold().unlock(value);
	}
	/// Proxy function for locked CELO management.
	function relockGold(uint256 index, uint256 value) onlyOwner external {
		getLockedGold().relock(index, value);
	}
	/// Proxy function for locked CELO management.
	function withdrawLockedGold(uint256 index) onlyOwner external {
		getLockedGold().withdraw(index);
	}
	/// Transfer CELO back to the owner.
	function withdraw(uint256 amount) onlyOwner external {
		require(
			getGoldToken().transfer(msg.sender, amount),
			"withdraw failed");
	}

	/// Exchanges cUSD epoch rewards to CELO and donates it back to SavingsCELO contract.
	/// Anyone can call this function. Since cUSD rewards per epoch are significantly smaller
	/// compared to Exchange buckets, it is safe to allow anyone to call this function and
	/// convert cUSD -> CELO at market rate at any point.
	function exchangeAndDonateEpochRewards(
		uint256 amount,
		uint256 minExchangeAmount) external {
		IExchange _exchange = getExchange();
		require(
			getStableToken().approve(address(_exchange), amount),
			"unable to approve stableToken transfer");
		uint256 celoAmount = _exchange.sell(amount, minExchangeAmount, false);
		require(
			getGoldToken().transfer(_savingsCELO, celoAmount),
			"transfer of CELO failed");
	}

	receive() external payable {}
}
