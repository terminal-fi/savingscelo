//SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/IAccounts.sol";
import "./interfaces/ILockedGold.sol";

contract SavingsCELO is ERC20 {
	using SafeMath for uint256;

	IERC20 public _GoldToken;
	IAccounts public _Accounts;
	ILockedGold public _LockedGold;
	address public _owner;

	struct PendingWithdrawal {
		// The value of the pending withdrawal.
		uint256 value;
		// The timestamp at which the pending withdrawal becomes available.
		uint256 timestamp;
	}
	mapping(address => PendingWithdrawal[]) internal pendingByAddr;

	event Deposited(address indexed from, uint256 celoAmount, uint256 savingsAmount);
	event WithdrawStarted(address indexed from, uint256 savingsAmount, uint256 celoAmount);
	event WithdrawFinished(address indexed from, uint256 celoAmount);
	event WithdrawCanceled(address indexed from, uint256 celoAmount, uint256 savingsAmount);

	constructor (
		address Accounts,
		address GoldToken,
		address LockedGold
	) ERC20("Savings CELO", "sCELO") public {
		_owner = msg.sender;
		_GoldToken = IERC20(GoldToken);
		_LockedGold = ILockedGold(LockedGold);
		_Accounts = IAccounts(Accounts);
		require(
			_Accounts.createAccount(),
			"createAccount failed");
	}

	function changeOwner(address newOwner) external {
		require(msg.sender == _owner, "only current owner can change the owner");
		require(newOwner != address(0x0), "must provide valid new owner");
		_owner = newOwner;
	}

	function authorizeVoteSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) external {
		require(msg.sender == _owner, "only current owner can authorize a new vote signer");
		_Accounts.authorizeVoteSigner(signer, v, r, s);
	}

	function depositCELO(uint256 amount) external {
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		require(
			_GoldToken.transferFrom(msg.sender, address(this), amount),
			"transfer of CELO failed");
		uint256 toMint = savingsToMint(totalSavingsCELO, totalCELO, amount);
		_mint(msg.sender, toMint);

		uint256 toLock = _GoldToken.balanceOf(address(this));
		assert(toLock >= amount);
		_LockedGold.lock.value(toLock)();
		// TODO(zviad): Should we attempt to auto vote or activate votes here?
		emit Deposited(msg.sender, amount, toMint);
	}

	function withdrawStart(uint256 savingsAmount) external {
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		_burn(msg.sender, savingsAmount);
		// toUnlock formula comes from:
		// (supply / totalCELO) === (supply - savingsAmount) / (totalCELO - toUnlock)
		uint256 toUnlock = savingsAmount * totalCELO / totalSavingsCELO;
		uint256 nonvoting = _LockedGold.getAccountNonvotingLockedGold(address(this));
		if (nonvoting < toUnlock) {
			// TODO(zviad): will need to force revoke votes to have enough nonvoting CELO.
		}
		require(nonvoting >= toUnlock, "unable to unlock: revoking votes has failed");
		_LockedGold.unlock(toUnlock);

		(uint256[] memory pendingValues, uint256[] memory pendingTimestamps) = _LockedGold.getPendingWithdrawals(address(this));
		uint256 pendingValue = pendingValues[pendingValues.length - 1];
		uint256 pendingTimestamp = pendingTimestamps[pendingTimestamps.length - 1];
		assert(pendingValue == toUnlock);
		pendingByAddr[msg.sender].push(PendingWithdrawal(pendingValue, pendingTimestamp));
		emit WithdrawStarted(msg.sender, savingsAmount, pendingValue);
	}

	function withdrawFinish(uint256 index, uint256 indexGlobal) external {
		PendingWithdrawal[] storage pending = verifyWithdrawArgs(msg.sender, index, indexGlobal);
		uint256 toWithdraw = pending[index].value;
		_LockedGold.withdraw(indexGlobal);
		deletePendingWithdrawal(pending, index);
		require(
			_GoldToken.transfer(msg.sender, toWithdraw),
			"unexpected failure: CELO transfer has failed");
		emit WithdrawFinished(msg.sender, toWithdraw);
	}

	function withdrawCancel(uint256 index, uint256 indexGlobal) external {
		PendingWithdrawal[] storage pending = verifyWithdrawArgs(msg.sender, index, indexGlobal);
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		uint256 toRelock = pending[index].value;
		_LockedGold.relock(indexGlobal, toRelock);
		deletePendingWithdrawal(pending, index);
		uint256 toMint = savingsToMint(totalSavingsCELO, totalCELO, toRelock);
		_mint(msg.sender, toMint);
		// TODO(zviad): Should we attempt to auto vote or activate votes here?
		emit WithdrawCanceled(msg.sender, toRelock, toMint);
	}

	function pendingWithdrawals(address addr)
		external
		view
		returns (uint256[] memory, uint256[] memory) {
		PendingWithdrawal[] storage pending = pendingByAddr[addr];
		uint256 length = pending.length;
		uint256[] memory values = new uint256[](length);
		uint256[] memory timestamps = new uint256[](length);
		for (uint256 i = 0; i < length; i = i.add(1)) {
			values[i] = pending[i].value;
			timestamps[i] = pending[i].timestamp;
		}
		return (values, timestamps);
	}

	function savingsCELOasCELO(uint256 amount) external returns (uint256) {
		uint256 totalSavingsCELO = this.totalSupply();
		if (totalSavingsCELO == 0) {
			return 0;
		}
		uint256 totalCELO = totalSupplyCELO();
		return amount * totalCELO / totalSavingsCELO;
	}

	function totalSupplyCELO() internal view returns(uint256) {
		uint256 locked = _LockedGold.getAccountTotalLockedGold(address(this));
		uint256 unlocked = _GoldToken.balanceOf(address(this));
		return locked + unlocked;
	}

	function savingsToMint(
		uint256 totalSavingsCELO,
		uint256 totalCELO,
		uint256 celoToAdd) private view returns (uint256) {
		if (totalCELO == 0) {
			// 2^16 is chosen arbitrarily. since maximum amount of CELO is capped at 1BLN, we can afford to
			// multiply it be 2^16 without running into any overflow issues. This also makes it clear that
			// SavingsCELO and CELO don't have 1:1 relationship to avoid confusion down the line.
			return celoToAdd * 65536;
		}
		return celoToAdd * totalSavingsCELO / totalCELO;
	}

	function verifyWithdrawArgs(
		address addr,
		uint256 index,
		uint256 indexGlobal) private view returns(PendingWithdrawal[] storage pending) {
		pending = pendingByAddr[addr];
		require(index < pending.length, "bad pending withdrawal index");
		(uint256[] memory pendingValues, uint256[] memory pendingTimestamps) = _LockedGold.getPendingWithdrawals(address(this));
		require(indexGlobal < pendingValues.length, "bad pending withdrawal indexGlobal");
		require(pending[index].value == pendingValues[indexGlobal], "mismatched value for index and indexGlobal");
		require(pending[index].timestamp == pendingTimestamps[indexGlobal], "mismatched timestamp for index and indexGlobal");
		return pending;
	}

	function deletePendingWithdrawal(PendingWithdrawal[] storage list, uint256 index) private {
		list[index] = list[list.length - 1];
		list.pop();
	}

	receive() external payable {}
}
