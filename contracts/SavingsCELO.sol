//SPDX-License-Identifier: MIT
pragma solidity 0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./UsingRegistry.sol";
import "./interfaces/IRegistry.sol";
import "./interfaces/ILockedGold.sol";
import "./interfaces/IElection.sol";
import "./interfaces/IVoterProxy.sol";

/// @title SavingsCELO contract
contract SavingsCELO is ERC20, IVoterProxy, Ownable, UsingRegistry {
	using SafeMath for uint256;

	/// @dev authorized voter contract.
	address public _voter;

	/// @dev emitted when new voter contract is authorized.
	/// @param previousVoter previously authorized voter.
	/// @param newVoter newly authorized voter.
	event VoterAuthorized(address indexed previousVoter, address indexed newVoter);

	/// @dev PendingWithdrawal matches struct from core Celo LockedGold.sol.
	struct PendingWithdrawal {
		// The value of the pending withdrawal.
		uint256 value;
		// The timestamp at which the pending withdrawal becomes available.
		uint256 timestamp;
	}
	/// @dev Maps address to its initiated pending withdrawals.
	mapping(address => PendingWithdrawal[]) internal pendingByAddr;

	/// @dev emitted when CELO is deposited in SavingsCELO contract.
	/// @param from address that initiated the deposit.
	/// @param celoAmount amount of CELO deposited.
	/// @param savingsAmount amount of sCELO tokens received in exchange.
	event Deposited(address indexed from, uint256 celoAmount, uint256 savingsAmount);

	/// @dev emitted when CELO withdrawal process is initiated.
	/// @param from address that initiated the withdrawal.
	/// @param savingsAmount amount of sCELO tokens that were returned.
	/// @param celoAmount amount of CELO tokens that will be withdrawn.
	event WithdrawStarted(address indexed from, uint256 savingsAmount, uint256 celoAmount);

	/// @dev emitted when withdrawal process is finished.
	/// @param from address that finished the withdrawal process.
	/// @param celoAmount amount of CELO tokens that were withdrawn from SavingsCELO contract.
	event WithdrawFinished(address indexed from, uint256 celoAmount);

	/// @dev emitted when withdrawal process is cancelled.
	/// @param from address that canceled the withdrawal process.
	/// @param celoAmount amount of CELO tokens that were returned to SavingsCELO contract.
	/// @param savingsAmount amount of sCELO tokens that were returned to the caller.
	event WithdrawCanceled(address indexed from, uint256 celoAmount, uint256 savingsAmount);

	constructor () ERC20("Savings CELO", "sCELO") public {
		require(
			getAccounts().createAccount(),
			"createAccount failed");
	}

	/// @notice Authorizes new vote signer that can manage voting for all of contract's locked
	/// CELO. {v, r, s} constitutes proof-of-key-possession signature of signer for this
	/// contract address.
	/// @dev Vote Signer authorization exists only as a means of a potential escape-hatch if
	/// some sort of really unexpected issue occurs. By default, it is expected that there
	/// will be no authorized vote signer, and a voting contract will be configured using
	/// .authorizeVoterProxy call instead.
	/// @param signer address to authorize as a signer.
	/// @param v {v, r, s} proof-of-key possession signature.
	/// @param r {v, r, s} proof-of-key possession signature.
	/// @param s {v, r, s} proof-of-key possession signature.
	function authorizeVoteSigner(
		address signer,
		uint8 v,
		bytes32 r,
		bytes32 s) onlyOwner external {
		getAccounts().authorizeVoteSigner(signer, v, r, s);
	}

	/// @notice Authorizes another contract to perform voting on behalf of SavingsCELO.
	/// @param voter address of the voter contract to authorize.
	function authorizeVoterProxy(address voter) onlyOwner external {
		_voter = voter;
		emit VoterAuthorized(_voter, voter);
	}

	modifier voterOnly() {
		require(_voter == msg.sender, "caller must be the registered _voter");
		_;
	}

	// Proxy functions for validator election voting.
	function proxyVote(
		address group,
		uint256 value,
		address lesser,
		address greater) voterOnly external override returns (bool) {
		return getElection().vote(group, value, lesser, greater);
	}
	function proxyActivate(address group) voterOnly external override returns (bool) {
		return getElection().activate(group);
	}
	function proxyRevokeActive(
		address group,
		uint256 value,
		address lesser,
		address greater,
		uint256 index) voterOnly external override returns (bool) {
		return getElection().revokeActive(group, value, lesser, greater, index);
	}
	function proxyRevokePending(
		address group,
		uint256 value,
		address lesser,
		address greater,
		uint256 index) voterOnly external override returns (bool) {
		return getElection().revokePending(group, value, lesser, greater, index);
	}

	// Proxy functions for governance voting.
	function proxyGovernanceVote(
		uint256 proposalId,
		uint256 index,
		Governance.VoteValue value) voterOnly external override returns (bool) {
		return getGovernance().vote(proposalId, index, value);
	}
	function proxyGovernanceUpvote(
		uint256 proposalId,
		uint256 lesser,
		uint256 greater) voterOnly external override returns (bool) {
		return getGovernance().upvote(proposalId, lesser, greater);
	}
	function proxyGovernanceRevokeUpvote(
		uint256 lesser,
		uint256 greater) voterOnly external override returns (bool) {
		return getGovernance().revokeUpvote(lesser, greater);
	}

	/// @notice Deposits CELO to the contract in exchange of SavingsCELO (sCELO) tokens.
	/// @return Amount of sCELO tokens minted.
	function deposit() external payable returns (uint256) {
		uint256 totalCELO = totalSupplyCELO().sub(msg.value);
		uint256 totalSavingsCELO = this.totalSupply();
		uint256 toMint = savingsToMint(totalSavingsCELO, totalCELO, msg.value);
		_mint(msg.sender, toMint);

		uint256 toLock = address(this).balance;
		assert(toLock >= msg.value);
		// It is safe to call _lockedGold.lock() with 0 value.
		getLockedGold().lock{value: toLock}();
		emit Deposited(msg.sender, msg.value, toMint);
		return toMint;
	}

	/// @notice Starts withdraw process for savingsAmount SavingsCELO tokens.
	/// @dev Since only nonvoting CELO can be unlocked, withdrawStart might have to call Election.revoke* calls to
	/// revoke currently cast votes. To keep this call simple, maximum amount of CELO that can be unlocked in single call is:
	/// `nonvoting locked CELO + total votes for last voted group`. This way, withdrawStart call will only
	/// revoke votes for a single group at most, making it simpler overall.
	///
	/// lesser.../greater... parameters are needed to perform Election.revokePending and Election.revokeActive
	/// calls. See Election contract for more details. lesser.../greater... arguments
	/// are for last voted group by this contract, since revoking only happens for the last voted group.
	///
	/// Note that it is possible for this call to fail due to accidental race conditions if lesser.../greater...
	/// parameters no longer match due to changes in overall voting ranking.
	/// @return amount of CELO tokens that will be withdrawn.
	function withdrawStart(
		uint256 savingsAmount,
		address lesserAfterPendingRevoke,
		address greaterAfterPendingRevoke,
		address lesserAfterActiveRevoke,
		address greaterAfterActiveRevoke
		) external returns (uint256) {
		require(savingsAmount > 0, "withdraw amount must be positive");
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		_burn(msg.sender, savingsAmount);
		// If there is any unlocked CELO, lock it to make rest of the logic always
		// consistent. There should never be unlocked CELO in the contract unless some
		// user explicitly donates it.
		uint256 unlocked = address(this).balance;
		ILockedGold _lockedGold = getLockedGold();
		if (unlocked > 0) {
			_lockedGold.lock{value: unlocked}();
		}
		// toUnlock formula comes from:
		// (supply / totalCELO) === (supply - savingsAmount) / (totalCELO - toUnlock)
		uint256 toUnlock = savingsAmount.mul(totalCELO).div(totalSavingsCELO);
		uint256 nonvoting = _lockedGold.getAccountNonvotingLockedGold(address(this));
		if (toUnlock > nonvoting) {
			revokeVotes(
				toUnlock.sub(nonvoting),
				lesserAfterPendingRevoke,
				greaterAfterPendingRevoke,
				lesserAfterActiveRevoke,
				greaterAfterActiveRevoke
			);
		}
		_lockedGold.unlock(toUnlock);

		(uint256[] memory pendingValues, uint256[] memory pendingTimestamps) = _lockedGold.getPendingWithdrawals(address(this));
		uint256 pendingValue = pendingValues[pendingValues.length - 1];
		assert(pendingValue == toUnlock);
		pendingByAddr[msg.sender].push(PendingWithdrawal(pendingValue, pendingTimestamps[pendingTimestamps.length - 1]));
		emit WithdrawStarted(msg.sender, savingsAmount, pendingValue);
		return pendingValue;
	}

	/// @dev Helper function to revoke cast votes. See documentation for .withdrawStart function for more
	/// information about the arguments.
	function revokeVotes(
		uint256 toRevoke,
		address lesserAfterPendingRevoke,
		address greaterAfterPendingRevoke,
		address lesserAfterActiveRevoke,
		address greaterAfterActiveRevoke
	) private {
		IElection _election = getElection();
		address[] memory votedGroups = _election.getGroupsVotedForByAccount(address(this));
		require(votedGroups.length > 0, "not enough votes to revoke");
		uint256 revokeIndex = votedGroups.length - 1;
		address revokeGroup = votedGroups[revokeIndex];
		uint256 pendingVotes = _election.getPendingVotesForGroupByAccount(revokeGroup, address(this));
		uint256 activeVotes = _election.getActiveVotesForGroupByAccount(revokeGroup, address(this));
		require(
			pendingVotes.add(activeVotes) >= toRevoke,
			"not enough unlocked CELO and revokable votes");

		uint256 toRevokePending = pendingVotes;
		if (toRevokePending > toRevoke) {
			toRevokePending = toRevoke;
		}
		uint256 toRevokeActive = toRevoke.sub(toRevokePending);
		if (toRevokePending > 0) {
			require(
				_election.revokePending(
				revokeGroup, toRevokePending, lesserAfterPendingRevoke, greaterAfterPendingRevoke, revokeIndex),
				"revokePending failed");
		}
		if (toRevokeActive > 0) {
			require(
				_election.revokeActive(
				revokeGroup, toRevokeActive, lesserAfterActiveRevoke, greaterAfterActiveRevoke, revokeIndex),
				"revokeActive failed");
		}
	}

	/// @notice Finishes withdraw process, transfering unlocked CELO back to the caller.
	/// @param index index of pending withdrawal to finish as returned by .pendingWithdrawals() call.
	/// @param indexGlobal index of matching pending withdrawal as returned by lockedGold.getPendingWithdrawals() call.
	function withdrawFinish(uint256 index, uint256 indexGlobal) external {
		PendingWithdrawal memory pending = popPendingWithdrawal(msg.sender, index, indexGlobal);
		getLockedGold().withdraw(indexGlobal);
		require(
			getGoldToken().transfer(msg.sender, pending.value),
			"unexpected failure: CELO transfer has failed");
		emit WithdrawFinished(msg.sender, pending.value);
	}

	/// @notice Cancels withdraw process, re-locking CELO back in the contract and returning SavingsCELO tokens back
	/// to the caller. At the time of re-locking, SavingsCELO can be more valuable compared to when .withdrawStart
	/// was called. Thus caller might receive less SavingsCELO compared to what was supplied to .withdrawStart.
	/// @param index index of pending withdrawal to finish as returned by .pendingWithdrawals() call.
	/// @param indexGlobal index of matching pending withdrawal as returned by lockedGold.getPendingWithdrawals() call.
	/// @return amount of sCELO tokens returned to the caller.
	function withdrawCancel(uint256 index, uint256 indexGlobal) external returns (uint256) {
		PendingWithdrawal memory pending = popPendingWithdrawal(msg.sender, index, indexGlobal);
		uint256 totalCELO = totalSupplyCELO();
		uint256 totalSavingsCELO = this.totalSupply();
		getLockedGold().relock(indexGlobal, pending.value);
		uint256 toMint = savingsToMint(totalSavingsCELO, totalCELO, pending.value);
		_mint(msg.sender, toMint);
		emit WithdrawCanceled(msg.sender, pending.value, toMint);
		return toMint;
	}

	/// @dev Returns (values[], timestamps[]) of all pending withdrawals for given address.
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

	/// @dev Helper function to verify indexes and to pop specific PendingWithdrawal from the list.
	function popPendingWithdrawal(
		address addr,
		uint256 index,
		uint256 indexGlobal) private returns(PendingWithdrawal memory pending) {
		PendingWithdrawal[] storage pendings = pendingByAddr[addr];
		require(index < pendings.length, "bad pending withdrawal index");
		(uint256[] memory pendingValues, uint256[] memory pendingTimestamps) = getLockedGold().getPendingWithdrawals(address(this));
		require(indexGlobal < pendingValues.length, "bad pending withdrawal indexGlobal");
		require(pendings[index].value == pendingValues[indexGlobal], "mismatched value for index and indexGlobal");
		require(pendings[index].timestamp == pendingTimestamps[indexGlobal], "mismatched timestamp for index and indexGlobal");
		pending = pendings[index]; // This makes a copy.

		pendings[index] = pendings[pendings.length - 1];
		pendings.pop();
		return pending;
	}


	/// @notice Returns amount of CELO that can be claimed for savingsAmount SavingsCELO tokens.
	/// @param savingsAmount amount of sCELO tokens.
	/// @return amount of CELO tokens.
	function savingsToCELO(uint256 savingsAmount) external view returns (uint256) {
		uint256 totalSavingsCELO = this.totalSupply();
		if (totalSavingsCELO == 0) {
			return 0;
		}
		uint256 totalCELO = totalSupplyCELO();
		return savingsAmount.mul(totalCELO).div(totalSavingsCELO);
	}
	/// @notice Returns amount of SavingsCELO tokens that can be received for depositing celoAmount CELO tokens.
	/// @param celoAmount amount of CELO tokens.
	/// @return amount of sCELO tokens.
	function celoToSavings(uint256 celoAmount) external view returns (uint256) {
		uint256 totalSavingsCELO = this.totalSupply();
		uint256 totalCELO = totalSupplyCELO();
		return savingsToMint(totalSavingsCELO, totalCELO, celoAmount);
	}

	function totalSupplyCELO() internal view returns(uint256) {
		uint256 locked = getLockedGold().getAccountTotalLockedGold(address(this));
		uint256 unlocked = address(this).balance;
		return locked.add(unlocked);
	}

	function savingsToMint(
		uint256 totalSavingsCELO,
		uint256 totalCELO,
		uint256 celoToAdd) private pure returns (uint256) {
		if (totalSavingsCELO == 0 || totalCELO == 0) {
			// 2^16 is chosen arbitrarily. since maximum amount of CELO is capped at 1BLN, we can afford to
			// multiply it by 2^16 without running into any overflow issues. This also makes it clear that
			// SavingsCELO and CELO don't have 1:1 relationship to avoid confusion down the line.
			return celoToAdd.mul(65536);
		}
		return celoToAdd.mul(totalSavingsCELO).div(totalCELO);
	}

	receive() external payable {}
}
