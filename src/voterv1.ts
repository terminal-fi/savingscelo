import { Address, ContractKit } from "@celo/contractkit"
import { toTransactionObject } from "@celo/contractkit/lib/wrappers/BaseWrapper"

import savingsCELOVoterV1Json from "../build/contracts/SavingsCELOVoterV1.json"
import { SavingsCELOVoterV1 } from "../types/web3-v1-contracts/SavingsCELOVoterV1"

export class VoterV1 {
	public readonly contract: SavingsCELOVoterV1

	constructor(
		private kit: ContractKit,
		public readonly voterV1Address: Address) {
		this.contract = new kit.web3.eth.Contract(
			savingsCELOVoterV1Json.abi as any, voterV1Address) as unknown as SavingsCELOVoterV1
	}

	changeVotedGroup = async(newGroup: Address) => {
		const savingsCELOAddress = await this.contract.methods._proxy().call()
		const votedGroup = await this.contract.methods.votedGroup().call()

		const election = await this.kit.contracts.getElection()

		const groups = await election.getGroupsVotedForByAccount(savingsCELOAddress)
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
			const votes = await election.getVotesForGroupByAccount(savingsCELOAddress, votedGroup)
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
}