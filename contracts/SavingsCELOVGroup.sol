//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IRegistry.sol";
import "./interfaces/IAccounts.sol";
import "./interfaces/ILockedGold.sol";
import "./interfaces/IElection.sol";

interface IExchange {
	function sell(uint256, uint256, bool) external returns (uint256);
}

contract SavingsCELOVGroup is Ownable {
	using SafeMath for uint256;

	address public _savingsCELO;

	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

	IRegistry constant _registry = IRegistry(address(0x000000000000000000000000000000000000ce10));
	IAccounts public _accounts;
	ILockedGold public _lockedGold;
	IExchange public _exchange;
	IERC20 public _goldToken;
	IERC20 public _stableToken;

	constructor (address savingsCELO) public {
		_savingsCELO = savingsCELO;
		_accounts = IAccounts(_registry.getAddressForStringOrDie("Accounts"));
		_lockedGold = ILockedGold(_registry.getAddressForStringOrDie("LockedGold"));
		_exchange = IExchange(_registry.getAddressForStringOrDie("Exchange"));
		_goldToken = IERC20(_registry.getAddressForStringOrDie("GoldToken"));
		_stableToken = IERC20(_registry.getAddressForStringOrDie("StableToken"));
		require(
			_accounts.createAccount(),
			"createAccount failed");
		_accounts.setName("SavingsCELO - Group");
	}

	/// Authorizes new vote signer that can manage voting for all of groups locked CELO.
	/// {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contract address.
	function authorizeVoteSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) onlyOwner external {
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
		bytes32 s) onlyOwner external {
		_accounts.authorizeValidatorSigner(signer, v, r, s);
	}

	/// Proxy function for locked CELO management.
	function lockGold(uint256 value) onlyOwner external {
		_lockedGold.lock{gas:gasleft(), value: value}();
	}
	/// Proxy function for locked CELO management.
	function unlockGold(uint256 value) onlyOwner external {
		_lockedGold.unlock(value);
	}
	/// Proxy function for locked CELO management.
	function relockGold(uint256 index, uint256 value) onlyOwner external {
		_lockedGold.relock(index, value);
	}
	/// Proxy function for locked CELO management.
	function withdrawLockedGold(uint256 index) onlyOwner external {
		_lockedGold.withdraw(index);
	}
	/// Transfer CELO back to the owner.
	function withdraw(uint256 amount) onlyOwner external {
		require(
			_goldToken.transfer(msg.sender, amount),
			"withdraw failed");
	}

	/// Exchanges cUSD epoch rewards to CELO and donates it back to SavingsCELO contract.
	/// Anyone can call this function. Since cUSD rewards per epoch are significantly smaller
	/// compared to Exchange buckets, it is safe to allow anyone to call this function and
	/// convert cUSD -> CELO at market rate at any point.
	function exchangeAndDonateEpochRewards(
		uint256 amount,
		uint256 minExchangeAmount) external {
		require(
			_stableToken.approve(address(_exchange), amount),
			"unable to approve stableToken transfer");
		uint256 celoAmount = _exchange.sell(amount, minExchangeAmount, false);
		require(
			_goldToken.transfer(_savingsCELO, celoAmount),
			"transfer of CELO failed");
	}

	receive() external payable {}
}
