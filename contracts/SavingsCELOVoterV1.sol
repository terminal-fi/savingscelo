//SPDX-License-Identifier: MIT
pragma solidity >= 0.6.0 < 0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./interfaces/IRegistry.sol";
import "./interfaces/ILockedGold.sol";
import "./interfaces/IElection.sol";
import "./interfaces/IVoterProxy.sol";

contract SavingsCELOVoterV1 {
	using SafeMath for uint256;

	address public _owner;
	IVoterProxy public _proxy;
	address public votedGroup;

	IRegistry constant _Registry = IRegistry(address(0x000000000000000000000000000000000000ce10));
	ILockedGold public _LockedGold;
	IElection public _Election;

	constructor (address savingsCELO) public {
		_owner = msg.sender;
		_proxy = IVoterProxy(savingsCELO);
		_LockedGold = ILockedGold(_Registry.getAddressForStringOrDie("LockedGold"));
		_Election = IElection(_Registry.getAddressForStringOrDie("Election"));
	}

	modifier ownerOnly() {
        require(_owner == msg.sender, "caller must be the registered _owner");
        _;
    }

	function changeOwner(address newOwner) ownerOnly external {
		require(newOwner != address(0x0), "must provide valid new owner");
		_owner = newOwner;
	}

	function changeVotedGroup(
		address newGroup,
		uint256 votedGroupIndex,
		address lesserAfterPendingRevoke,
		address greaterAfterPendingRevoke,
		address lesserAfterActiveRevoke,
		address greaterAfterActiveRevoke) ownerOnly external {
		if (votedGroup != address(0)) {
			uint256 pendingVotes = _Election.getPendingVotesForGroupByAccount(votedGroup, address(_proxy));
			uint256 activeVotes = _Election.getActiveVotesForGroupByAccount(votedGroup, address(_proxy));
			require(
				_proxy.proxyRevokePending(
					votedGroup, pendingVotes, lesserAfterPendingRevoke, greaterAfterPendingRevoke, votedGroupIndex),
				"revokePending for voted group failed");
			require(
				_proxy.proxyRevokeActive(
					votedGroup, pendingVotes, lesserAfterPendingRevoke, greaterAfterPendingRevoke, votedGroupIndex),
				"revokeActive for voted group failed");
		}
		votedGroup = newGroup;
	}

	function ActivateAndVote(
		address lesser,
		address greater
	) external {
		require(votedGroup != address(0), "voted group is not set");
		if (_Election.hasActivatablePendingVotes(address(_proxy), votedGroup)) {
			require(
				_proxy.proxyActivate(votedGroup),
				"activate for voted group failed");
		}
		uint256 toVote = _LockedGold.getAccountNonvotingLockedGold(address(_proxy));
		if (toVote > 0) {
			require(
				_proxy.proxyVote(votedGroup, toVote, lesser, greater),
				"casting votes for voted group failed");
		}
	}
}
