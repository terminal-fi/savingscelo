import { Address, ContractKit } from "@celo/contractkit";
import BigNumber from "bignumber.js";
import { SavingsCELO } from "../../types/web3-v1-contracts/SavingsCELO";

import savingsCELOJson from "../../build/contracts/SavingsCELO.json"
import { toTransactionObject } from "@celo/contractkit/lib/wrappers/BaseWrapper";

class SavingsKit {
	public readonly savingsCELO: SavingsCELO

	constructor(
		private kit: ContractKit,
		public readonly savingsCELOAddress: Address) {
		this.savingsCELO = new kit.web3.eth.Contract(
			savingsCELOJson.abi as any, savingsCELOAddress) as unknown as SavingsCELO
	}

	public withdrawStart = async (savingsAmt: BigNumber.Value) => {
		const lockedGold = await this.kit.contracts.getLockedGold()
		const election = await this.kit.contracts.getElection()
		const amt = new BigNumber(savingsAmt).toFixed(0)
		const toUnlock = await this.savingsCELO.methods.savingsToCELO(amt).call()

		const nonvoting = await lockedGold.getAccountNonvotingLockedGold(this.savingsCELOAddress)
		const toRevoke = BigNumber.maximum(nonvoting.negated().plus(toUnlock), 0)

		const votedGroups = await election.getGroupsVotedForByAccount(this.savingsCELOAddress)
		let pendingRevoke = {
			lesser: "0x0000000000000000000000000000000000000000",
			greater: "0x0000000000000000000000000000000000000000",
		}
		let activeRevoke = {
			lesser: "0x0000000000000000000000000000000000000000",
			greater: "0x0000000000000000000000000000000000000000",
		}
		if (votedGroups.length > 0) {
			const revokeGroup = votedGroups[votedGroups.length - 1]
			const votes = await election.getVotesForGroupByAccount(this.savingsCELOAddress, revokeGroup)
			const toRevokePending = BigNumber.minimum(toRevoke, votes.pending)
			pendingRevoke = await election.findLesserAndGreaterAfterVote(votes.group, toRevokePending.negated())
			activeRevoke = await election.findLesserAndGreaterAfterVote(votes.group, toRevoke.negated())
		}

		const txo = this.savingsCELO.methods.withdrawStart(
			amt,
			pendingRevoke.lesser,
			pendingRevoke.greater,
			activeRevoke.lesser,
			activeRevoke.greater)
		return toTransactionObject(this.kit, txo)
	}

	public withdrawFinish = async(
		pendings: {0: BN[], 1: BN[]},
		index: number) => {
		const indexGlobal = await this.withdrawIndexGlobal(pendings, index)
		const txo = this.savingsCELO.methods.withdrawFinish(index, indexGlobal)
		return toTransactionObject(this.kit, txo)
	}
	public withdrawCancel = async(
		pendings: {0: BN[], 1: BN[]},
		index: number) => {
		const indexGlobal = await this.withdrawIndexGlobal(pendings, index)
		const txo = this.savingsCELO.methods.withdrawCancel(index, indexGlobal)
		return toTransactionObject(this.kit, txo)
	}
	public withdrawIndexGlobal = async(pendings: {0: BN[], 1: BN[]}, index: number) => {
		const lockedGold = await this.kit.contracts.getLockedGold()
		const pendingsGlobal = await lockedGold.getPendingWithdrawals(this.savingsCELOAddress)
		const idx = pendingsGlobal.findIndex((p) => (
			p.value.eq(pendings[0][index].toString()) &&
			p.time.eq(pendings[1][index].toString())))
		if (idx === -1) {
			throw Error(`pendings mismatch!`)
		}
		return idx
	}

}

export default SavingsKit
