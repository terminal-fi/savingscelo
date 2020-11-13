//SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./interfaces/IAccounts.sol";
import "./interfaces/ILockedGold.sol";
import "./interfaces/IElection.sol";

contract SavingsCELO is ERC20 {
	using SafeMath for uint256;

	address public _owner;
	address public _voter;

	IAccounts public _Accounts;
	IERC20 public _GoldToken;
	ILockedGold public _LockedGold;
	IElection public _Election;

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
		address LockedGold,
		address Election
	) ERC20("Savings CELO", "sCELO") public {
		_owner = msg.sender;
		_Accounts = IAccounts(Accounts);
		_GoldToken = IERC20(GoldToken);
		_LockedGold = ILockedGold(LockedGold);
		_Election = IElection(Election);
		require(
			_Accounts.createAccount(),
			"createAccount failed");
	}

	modifier ownerOnly() {
        require(_owner == msg.sender, "caller must be the registered _owner");
        _;
    }

	modifier voterOnly() {
        require(_voter == msg.sender, "caller must be the registered _voter");
        _;
    }

	/// Changes owner of the contract that has authorizeVoteSigner privileges.
	function changeOwner(address newOwner) ownerOnly external {
		require(newOwner != address(0x0), "must provide valid new owner");
		_owner = newOwner;
	}


	/// Authorizes new vote signer that can manage voting for all of contract's locked
	/// CELO. {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contracts address.
	function authorizeVoteSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) ownerOnly external {
		_Accounts.authorizeVoteSigner(signer, v, r, s);
	}

	/// Deposits CELO to the contract in exchange of SavingsCELO tokens. CELO tokens are transfered
	/// using ERC20.transferFrom call, thus caller must increaseAllowance first to allow for the
	/// transfer to go through.
	function deposit(uint256 celoAmount) external {
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		require(
			_GoldToken.transferFrom(msg.sender, address(this), celoAmount),
			"transfer of CELO failed");
		uint256 toMint = savingsToMint(totalSavingsCELO, totalCELO, celoAmount);
		_mint(msg.sender, toMint);

		uint256 toLock = _GoldToken.balanceOf(address(this));
		assert(toLock >= celoAmount);
		// It is safe to call _LockedGold.lock() with 0 value.
		_LockedGold.lock.value(toLock)();
		emit Deposited(msg.sender, celoAmount, toMint);
	}

	/// Starts withdraw process for savingsAmount SavingsCELO tokens. Since only nonvoting CELO can be
	/// unlocked, withdrawStart might have to call Election.revoke* calls to revoke currently cast votes.
	/// To keep this call simple, maximum amount of CELO that can be unlocked in single call is:
	/// `nonvoting locked CELO + total votes for last voted group`. This way, withdrawStart call will only
	/// revoke votes for a single group at most, making it simpler overall.
	///
	/// lesser.../greater... parameters are needed to perform Election.revokePending and Election.revokeActive
	/// calls. See Election contract for more details. lesser.../greater... arguments
	/// are for last voted group by this contract, since revoking only happens for the last voted group.
	///
	/// Note that it is possible for this call to fail due to accidental race conditions if lesser.../greater...
	/// parameters no longer match due to changes in overall voting ranking.
	function withdrawStart(
		uint256 savingsAmount,
		address lesserAfterPendingRevoke,
		address greaterAfterPendingRevoke,
		address lesserAfterActiveRevoke,
		address greaterAfterActiveRevoke
		) external {
		require(savingsAmount > 0, "withdraw amount must be positive");
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		_burn(msg.sender, savingsAmount);
		// If there is any unlocked CELO, lock it to make rest of the logic always
		// consistent. There should never be unlocked CELO in the contract unless some
		// user explicitly donates it.
		uint256 unlocked = _GoldToken.balanceOf(address(this));
		if (unlocked > 0) {
			_LockedGold.lock.value(unlocked)();
		}
		// toUnlock formula comes from:
		// (supply / totalCELO) === (supply - savingsAmount) / (totalCELO - toUnlock)
		uint256 toUnlock = savingsAmount * totalCELO / totalSavingsCELO;
		uint256 nonvoting = _LockedGold.getAccountNonvotingLockedGold(address(this));
		if (toUnlock > nonvoting) {
			revokeVotes(
				toUnlock - nonvoting,
				lesserAfterPendingRevoke,
				greaterAfterPendingRevoke,
				lesserAfterActiveRevoke,
				greaterAfterActiveRevoke
			);
		}
		_LockedGold.unlock(toUnlock);

		(uint256[] memory pendingValues, uint256[] memory pendingTimestamps) = _LockedGold.getPendingWithdrawals(address(this));
		uint256 pendingValue = pendingValues[pendingValues.length - 1];
		uint256 pendingTimestamp = pendingTimestamps[pendingTimestamps.length - 1];
		assert(pendingValue == toUnlock);
		pendingByAddr[msg.sender].push(PendingWithdrawal(pendingValue, pendingTimestamp));
		emit WithdrawStarted(msg.sender, savingsAmount, pendingValue);
	}

	/// Helper function to revoke cast votes. See documentation for .withdrawStart function for more
	/// information about the arguments.
	function revokeVotes(
		uint256 toRevoke,
		address lesserAfterPendingRevoke,
		address greaterAfterPendingRevoke,
		address lesserAfterActiveRevoke,
		address greaterAfterActiveRevoke
	) private {
		address[] memory votedGroups = _Election.getGroupsVotedForByAccount(address(this));
		require(votedGroups.length > 0, "not enough votes to revoke");
		uint256 revokeIndex = votedGroups.length - 1;
		address revokeGroup = votedGroups[revokeIndex];
		uint256 pendingVotes = _Election.getPendingVotesForGroupByAccount(revokeGroup, address(this));
		uint256 activeVotes = _Election.getActiveVotesForGroupByAccount(revokeGroup, address(this));
		require(
			pendingVotes + activeVotes >= toRevoke,
			"not enough unlocked CELO and revokable votes");

		uint256 toRevokePending = pendingVotes;
		if (toRevokePending > toRevoke) {
			toRevokePending = toRevoke;
		}
		uint256 toRevokeActive = toRevoke - toRevokePending;
		if (toRevokePending > 0) {
			require(
				_Election.revokePending(
				revokeGroup, toRevokePending, lesserAfterPendingRevoke, greaterAfterPendingRevoke, revokeIndex),
				"revokePending failed");
		}
		if (toRevokeActive > 0) {
			require(
				_Election.revokeActive(
				revokeGroup, toRevokeActive, lesserAfterActiveRevoke, greaterAfterActiveRevoke, revokeIndex),
				"revokeActive failed");
		}
	}

	/// Finishes withdraw process, transfering unlocked CELO back to the caller.
	/// `index` is index of pending withdrawal to finish as returned by .pendingWithdrawals() call.
	/// `indexGlobal` is index of matching pending withdrawal as returned by _LockedGold.getPendingWithdrawals() call.
	function withdrawFinish(uint256 index, uint256 indexGlobal) external {
		PendingWithdrawal memory pending = popPendingWithdrawal(msg.sender, index, indexGlobal);
		_LockedGold.withdraw(indexGlobal);
		require(
			_GoldToken.transfer(msg.sender, pending.value),
			"unexpected failure: CELO transfer has failed");
		emit WithdrawFinished(msg.sender, pending.value);
	}

	/// Cancels withdraw process, re-locking CELO back in the contract and returning SavingsCELO tokens back
	/// to the caller. At the time of re-locking, SavingsCELO can be more valuable compared to when .withdrawStart
	/// was called. Thus caller might receive less SavingsCELO compared to what was supplied to .withdrawStart.
	/// `index` is index of pending withdrawal to finish as returned by .pendingWithdrawals() call.
	/// `indexGlobal` is index of matching pending withdrawal as returned by _LockedGold.getPendingWithdrawals() call.
	function withdrawCancel(uint256 index, uint256 indexGlobal) external {
		PendingWithdrawal memory pending = popPendingWithdrawal(msg.sender, index, indexGlobal);
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		_LockedGold.relock(indexGlobal, pending.value);
		uint256 toMint = savingsToMint(totalSavingsCELO, totalCELO, pending.value);
		_mint(msg.sender, toMint);
		emit WithdrawCanceled(msg.sender, pending.value, toMint);
	}

	/// Returns (values[], timestamps[]) of all pending withdrawals for given address.
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

	/// Helper function to verify indexes and to pop specific PendingWithdrawal from the list.
	function popPendingWithdrawal(
		address addr,
		uint256 index,
		uint256 indexGlobal) private returns(PendingWithdrawal memory pending) {
		PendingWithdrawal[] storage pendings = pendingByAddr[addr];
		require(index < pendings.length, "bad pending withdrawal index");
		(uint256[] memory pendingValues, uint256[] memory pendingTimestamps) = _LockedGold.getPendingWithdrawals(address(this));
		require(indexGlobal < pendingValues.length, "bad pending withdrawal indexGlobal");
		require(pendings[index].value == pendingValues[indexGlobal], "mismatched value for index and indexGlobal");
		require(pendings[index].timestamp == pendingTimestamps[indexGlobal], "mismatched timestamp for index and indexGlobal");
		pending = pendings[index]; // This makes a copy.

		pendings[index] = pendings[pendings.length - 1];
		pendings.pop();
		return pending;
	}


	/// Returns amount of CELO that can be claimed for savingsAmount SavingsCELO tokens.
	function savingsToCELO(uint256 savingsAmount) external view returns (uint256) {
		uint256 totalSavingsCELO = this.totalSupply();
		if (totalSavingsCELO == 0) {
			return 0;
		}
		uint256 totalCELO = totalSupplyCELO();
		return savingsAmount * totalCELO / totalSavingsCELO;
	}
	/// Returns amount of SavingsCELO tokens that can be received for depositing celoAmount CELO tokens.
	function celoToSavings(uint256 celoAmount) external view returns (uint256) {
		uint256 totalSavingsCELO = this.totalSupply();
		uint256 totalCELO = totalSupplyCELO();
		return savingsToMint(totalSavingsCELO, totalCELO, celoAmount);
	}

	function totalSupplyCELO() internal view returns(uint256) {
		uint256 locked = _LockedGold.getAccountTotalLockedGold(address(this));
		uint256 unlocked = _GoldToken.balanceOf(address(this));
		return locked + unlocked;
	}

	function savingsToMint(
		uint256 totalSavingsCELO,
		uint256 totalCELO,
		uint256 celoToAdd) private pure returns (uint256) {
		if (totalSavingsCELO == 0 || totalCELO == 0) {
			// 2^16 is chosen arbitrarily. since maximum amount of CELO is capped at 1BLN, we can afford to
			// multiply it by 2^16 without running into any overflow issues. This also makes it clear that
			// SavingsCELO and CELO don't have 1:1 relationship to avoid confusion down the line.
			return celoToAdd * 65536;
		}
		return celoToAdd * totalSavingsCELO / totalCELO;
	}

	receive() external payable {}
}
