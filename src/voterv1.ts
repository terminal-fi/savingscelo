import { Address, ContractKit } from "@celo/contractkit"
import { toTransactionObject } from "@celo/contractkit/lib/wrappers/BaseWrapper"

import savingsCELOVoterV1Json from "../build/contracts/SavingsCELOVoterV1.json"
import { SavingsCELOVoterV1 } from "../types/web3-v1-contracts/SavingsCELOVoterV1"
import { SavingsKit } from "./savingskit"

export async function newVoterV1(kit: ContractKit, savingsKit: SavingsKit) {
	const voterV1Address = await savingsKit.contract.methods._voter().call()
	const voterV1 = new VoterV1(kit, savingsKit, voterV1Address)
	const proxyAddr = await voterV1.contract.methods._proxy().call()
	if (proxyAddr !== savingsKit.contractAddress) {
		new Error(`voterV1 _proxy: ${proxyAddr} != savingsCELO ${savingsKit.contractAddress}`)
	}
	return voterV1
}

export class VoterV1 {
	public readonly contract: SavingsCELOVoterV1

	constructor(
		private kit: ContractKit,
		private savingsKit: SavingsKit,
		public contractAddress: Address) {
		this.contract = new kit.web3.eth.Contract(
			savingsCELOVoterV1Json.abi as any, contractAddress) as unknown as SavingsCELOVoterV1
	}

	changeVotedGroup = async(newGroup: Address) => {
		const votedGroup = await this.contract.methods.votedGroup().call()
		const election = await this.kit.contracts.getElection()

		const groups = await election.getGroupsVotedForByAccount(this.savingsKit.contractAddress)
		let votedGroupIndex = groups.indexOf(votedGroup)
		let pendingRevoke = {
			lesser: "0x0000000000000000000000000000000000000000",
			greater: "0x0000000000000000000000000000000000000000",
		}
		let activeRevoke = {
			lesser: "0x0000000000000000000000000000000000000000",
			greater: "0x0000000000000000000000000000000000000000",
		}
		if (votedGroupIndex >= 0) {
			const votes = await election.getVotesForGroupByAccount(this.savingsKit.contractAddress, votedGroup)
			pendingRevoke = await election.findLesserAndGreaterAfterVote(votes.group, votes.pending.negated())
			activeRevoke = await election.findLesserAndGreaterAfterVote(votes.group, votes.pending.plus(votes.active).negated())
		} else {
			votedGroupIndex = 0
		}

		const txo = this.contract.methods.changeVotedGroup(
			newGroup,
			votedGroupIndex,
			pendingRevoke.lesser,
			pendingRevoke.greater,
			activeRevoke.lesser,
			activeRevoke.greater)
		return toTransactionObject(this.kit, txo)
	}

	activateAndVote = async() => {
		const savingsCELOAddress = await this.contract.methods._proxy().call()
		const votedGroup = await this.contract.methods.votedGroup().call()

		const election = await this.kit.contracts.getElection()
		const lockedGold = await this.kit.contracts.getLockedGold()

		const toVote = await lockedGold.getAccountNonvotingLockedGold(savingsCELOAddress)
		const {lesser, greater} = await election.findLesserAndGreaterAfterVote(votedGroup, toVote)
		const txo = this.contract.methods.activateAndVote(lesser, greater)
		return toTransactionObject(this.kit, txo)
	}

	needsActivateAndVote = async() => {
		const savingsCELOAddress = await this.contract.methods._proxy().call()
		const election = await this.kit.contracts.getElection()
		const mustActivate = await election.hasActivatablePendingVotes(savingsCELOAddress)
		if (mustActivate) {
			return true
		}
		const lockedGold = await this.kit.contracts.getLockedGold()
		const toVote = await lockedGold.getAccountNonvotingLockedGold(savingsCELOAddress)
		return toVote.gt(0)
	}
}