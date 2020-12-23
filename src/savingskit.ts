import { Address, ContractKit } from "@celo/contractkit"
import { toTransactionObject } from "@celo/contractkit/lib/wrappers/BaseWrapper"
import { PendingWithdrawal } from "@celo/contractkit/lib/wrappers/LockedGold"

import BigNumber from "bignumber.js"
import { SavingsCELO } from "../types/web3-v1-contracts/SavingsCELO"

import savingsCELOJson from "../build/contracts/SavingsCELO.json"

/**
 * SavingsKit provides wrappers to interact with SavingsCELO contract.
 * For operations that may not be exposed through wrappers, internal .contract object can
 * be used directly. See implementation of .deposit() wrapper as an example.
 */
export class SavingsKit {
	public readonly contract: SavingsCELO

	constructor(
		private kit: ContractKit,
		public readonly contractAddress: Address) {
		this.contract = new kit.web3.eth.Contract(
			savingsCELOJson.abi as any, contractAddress) as unknown as SavingsCELO
	}

	public infiniteApprove = async (from: string) => {
		const goldToken = await this.kit.contracts.getGoldToken()
		const allowance = await goldToken.allowance(
			from, this.contractAddress)
		if (allowance.gt(1e34)) {
			return null
		} else {
			return goldToken.approve(this.contractAddress, new BigNumber(1e35).toFixed(0))
		}
	}

	public deposit = (celoAmount: BigNumber.Value) => {
		const txo = this.contract.methods.deposit(new BigNumber(celoAmount).toFixed(0))
		return toTransactionObject(this.kit, txo)
	}

	public withdrawStart = async (savingsAmount: BigNumber.Value) => {
		const lockedGold = await this.kit.contracts.getLockedGold()
		const election = await this.kit.contracts.getElection()
		const amt = new BigNumber(savingsAmount).toFixed(0)
		const toUnlock = await this.contract.methods.savingsToCELO(amt).call()

		const nonvoting = await lockedGold.getAccountNonvotingLockedGold(this.contractAddress)
		const toRevoke = BigNumber.maximum(nonvoting.negated().plus(toUnlock), 0)

		const votedGroups = await election.getGroupsVotedForByAccount(this.contractAddress)
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
			const votes = await election.getVotesForGroupByAccount(this.contractAddress, revokeGroup)
			const totalVotes = votes.pending.plus(votes.active)
			if (toRevoke.gt(totalVotes)) {
				throw new Error(
					`Can not withdraw requested amount in a single transaction. ` +
					`Current maximum withdrawable CELO in a single transaction is: `+
					`${nonvoting.plus(totalVotes).div(1e18).toFixed(18)} CELO!`)
			}
			const toRevokePending = BigNumber.minimum(toRevoke, votes.pending)
			pendingRevoke = await election.findLesserAndGreaterAfterVote(votes.group, toRevokePending.negated())
			activeRevoke = await election.findLesserAndGreaterAfterVote(votes.group, toRevoke.negated())
		}

		const txo = this.contract.methods.withdrawStart(
			amt,
			pendingRevoke.lesser,
			pendingRevoke.greater,
			activeRevoke.lesser,
			activeRevoke.greater)
		return toTransactionObject(this.kit, txo)
	}

	public pendingWithdrawals = async (account: Address): Promise<PendingWithdrawal[]> => {
		const pendings = await this.contract.methods.pendingWithdrawals(account).call()
		return pendings[0].map((v, idx) => ({
			value: new BigNumber(v),
			time: new BigNumber(pendings[1][idx]),
		} as PendingWithdrawal))
	}

	public withdrawFinish = async(
		pendings: PendingWithdrawal[],
		index: number) => {
		const indexGlobal = await this.withdrawIndexGlobal(pendings, index)
		const txo = this.contract.methods.withdrawFinish(index, indexGlobal)
		return toTransactionObject(this.kit, txo)
	}

	public withdrawCancel = async(
		pendings: PendingWithdrawal[],
		index: number) => {
		const indexGlobal = await this.withdrawIndexGlobal(pendings, index)
		const txo = this.contract.methods.withdrawCancel(index, indexGlobal)
		return toTransactionObject(this.kit, txo)
	}

	public withdrawIndexGlobal = async(pendings: PendingWithdrawal[], index: number) => {
		const lockedGold = await this.kit.contracts.getLockedGold()
		const pendingsGlobal = await lockedGold.getPendingWithdrawals(this.contractAddress)
		const idx = pendingsGlobal.findIndex((p) => (
			p.value.eq(pendings[index].value) &&
			p.time.eq(pendings[index].time)))
		if (idx === -1) {
			throw Error(`{time: ${pendings[index].time}, value: ${pendings[index].value}} not found in pending withdrawals`)
		}
		return idx
	}
}
