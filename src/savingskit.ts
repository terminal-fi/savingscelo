import { Address, ContractKit } from "@celo/contractkit"
import { toTransactionObject } from "@celo/connect"
import { PendingWithdrawal } from "@celo/contractkit/lib/wrappers/LockedGold"

import BigNumber from "bignumber.js"
import { SavingsCelo, ABI } from "../types/web3-v1-contracts/SavingsCELO"

/**
 * SavingsKit provides wrappers to interact with SavingsCELO contract.
 * For operations that may not be exposed through wrappers, internal .contract object can
 * be used directly. See implementation of .deposit() wrapper as an example.
 */
export class SavingsKit {
	public readonly contract: SavingsCelo

	constructor(
		private kit: ContractKit,
		public readonly contractAddress: Address) {
		this.contract = new kit.web3.eth.Contract(ABI, contractAddress) as unknown as SavingsCelo
	}

	public deposit = () => {
		const txo = this.contract.methods.deposit()
		return toTransactionObject(this.kit.connection, txo)
	}

	public withdrawStart = async (savingsAmount: BigNumber.Value) => {
		const lockedGold = await this.kit.contracts.getLockedGold()
		const election = await this.kit.contracts.getElection()
		const amt = new BigNumber(savingsAmount).toString(10)
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
		return toTransactionObject(this.kit.connection, txo)
	}

	public pendingWithdrawals = async (account: Address): Promise<PendingWithdrawal[]> => {
		const pendings = await this.contract.methods.pendingWithdrawals(account).call()
		return pendings[0].map((v, idx) => ({
			value: new BigNumber(v),
			time: new BigNumber(pendings[1][idx]),
		} as PendingWithdrawal))
	}

	public withdrawFinish = async (
		pendings: PendingWithdrawal[],
		index: number) => {
		const indexGlobal = await this.withdrawIndexGlobal(pendings, index)
		const txo = this.contract.methods.withdrawFinish(index, indexGlobal)
		return toTransactionObject(this.kit.connection, txo)
	}

	public withdrawCancel = async (
		pendings: PendingWithdrawal[],
		index: number) => {
		const indexGlobal = await this.withdrawIndexGlobal(pendings, index)
		const txo = this.contract.methods.withdrawCancel(index, indexGlobal)
		return toTransactionObject(this.kit.connection, txo)
	}

	public withdrawIndexGlobal = async (pendings: PendingWithdrawal[], index: number) => {
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

	public celoToSavings = async (celoAmount: BigNumber.Value): Promise<BigNumber> => {
		const savingsAmount = await this.contract.methods.celoToSavings(new BigNumber(celoAmount).toString(10)).call()
		return new BigNumber(savingsAmount)
	}

	public savingsToCELO = async (savingsAmount: BigNumber.Value): Promise<BigNumber> => {
		const celoAmount = await this.contract.methods.savingsToCELO(new BigNumber(savingsAmount).toString(10)).call()
		return new BigNumber(celoAmount)
	}

	public totalCELOSupply = async (): Promise<BigNumber> => {
		const goldToken = await this.kit.contracts.getGoldToken()
		const lockedGold = await this.kit.contracts.getLockedGold()
		const balance = goldToken.balanceOf(this.contractAddress)
		const locked = lockedGold.getAccountTotalLockedGold(this.contractAddress)
		return (await balance).plus(await locked)
	}

	public totalSavingsSupply = async (): Promise<BigNumber> => {
		return new BigNumber(
			await this.contract.methods.totalSupply().call())
	}

	public totalSupplies = async (): Promise<{celoTotal: BigNumber, savingsTotal: BigNumber}> => {
		const celoTotal = this.totalCELOSupply()
		const savingsTotal = this.totalSavingsSupply()
		return {
			celoTotal: await celoTotal,
			savingsTotal: await savingsTotal,
		}
	}
}

export const savingsToCELO = (
	savingsAmount: BigNumber.Value,
	savingsTotal: BigNumber,
	celoTotal: BigNumber,
): BigNumber => {
	if (savingsTotal.eq(0)) {
		return new BigNumber(0)
	}
	return celoTotal.multipliedBy(savingsAmount).div(savingsTotal).integerValue(BigNumber.ROUND_DOWN)
}

export const celoToSavings = (
	celoAmount: BigNumber.Value,
	celoTotal: BigNumber,
	savingsTotal: BigNumber,
): BigNumber => {
	if (celoTotal.eq(0) || savingsTotal.eq(0)) {
		return new BigNumber(celoAmount).multipliedBy(65536)
	}
	return savingsTotal.multipliedBy(celoAmount).div(celoTotal).integerValue(BigNumber.ROUND_DOWN)
}
