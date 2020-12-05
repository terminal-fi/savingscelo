//SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IRegistry.sol";
import "./interfaces/IAccounts.sol";
import "./interfaces/ILockedGold.sol";
import "./interfaces/IElection.sol";

interface IExchange {
	function sell(uint256, uint256, bool) external returns (uint256);
}

contract SavingsCELOVGroup {
	using SafeMath for uint256;

	address public _owner;
	address public _savingsCELO;

	IRegistry constant _registry = IRegistry(address(0x000000000000000000000000000000000000ce10));
	IAccounts public _accounts;
	ILockedGold public _lockedGold;
	IExchange public _exchange;
	IERC20 public _goldToken;
	IERC20 public _stableToken;

	constructor (address savingsCELO) public {
		_owner = msg.sender;
		_savingsCELO = savingsCELO;
		_accounts = IAccounts(_registry.getAddressForStringOrDie("Accounts"));
		_lockedGold = ILockedGold(_registry.getAddressForStringOrDie("LockedGold"));
		_exchange = IExchange(_registry.getAddressForStringOrDie("Exchange"));
		_goldToken = IERC20(_registry.getAddressForStringOrDie("GoldToken"));
		_stableToken = IERC20(_registry.getAddressForStringOrDie("StableToken"));
		require(
			_accounts.createAccount(),
			"createAccount failed");
	}

	modifier ownerOnly() {
        require(_owner == msg.sender, "caller must be the registered _owner");
        _;
    }

	/// Changes owner of the contract that has authorizeVoteSigner privileges.
	function changeOwner(address newOwner) ownerOnly external {
		require(newOwner != address(0x0), "must provide valid new owner");
		_owner = newOwner;
	}


	/// Authorizes new vote signer that can manage voting for all of groups locked CELO.
	/// {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contract address.
	function authorizeVoteSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) ownerOnly external {
		_accounts.authorizeVoteSigner(signer, v, r, s);
	}

	/// Authorizes new validator signer that can manage group registration/deregistration and
	/// group memebrs.
	/// {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contract address.
	function authorizeValidatorSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) ownerOnly external {
		_accounts.authorizeValidatorSigner(signer, v, r, s);
	}

	/// Proxy function for locked CELO management.
	function lockGold(uint256 value) ownerOnly external {
		_lockedGold.lock.gas(gasleft()).value(value)();
	}
	/// Proxy function for locked CELO management.
	function unlockGold(uint256 value) ownerOnly external {
		_lockedGold.unlock(value);
	}
	/// Proxy function for locked CELO management.
	function relockGold(uint256 index, uint256 value) ownerOnly external {
		_lockedGold.relock(index, value);
	}
	/// Proxy function for locked CELO management.
	function withdrawLockedGold(uint256 index) ownerOnly external {
		_lockedGold.withdraw(index);
	}
	/// Transfer CELO back to the owner.
	function withdraw(uint256 amount) ownerOnly external {
		require(
			_goldToken.transfer(msg.sender, amount),
			"withdraw failed");
	}

	/// Exchanges cUSD epoch rewards to CELO and donates it back to SavingsCELO contract.
	/// Anyone can call this function. Since cUSD rewards per epoch are significantly smaller
	/// compared to Exchange buckets, it is safe to allow anyone to call this function and
	/// convert cUSD -> CELO at market rate at any point.
	function ExchangeAndDonateEpochRewards(
		uint256 amount,
		uint256 minExchangeAmount) external {
		require(
			_stableToken.approve(address(_exchange), amount),
			"unable to approve stableToken transfer");
		uint256 celoAmount = _exchange.sell(amount, minExchangeAmount, true);
		require(
			_goldToken.transfer(_savingsCELO, celoAmount),
			"transfer of CELO failed");
	}

	receive() external payable {}
}
