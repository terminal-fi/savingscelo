import { ContractKit } from "@celo/contractkit"
import { ElectionWrapper } from "@celo/contractkit/lib/wrappers/Election"
import { PendingWithdrawal } from "@celo/contractkit/lib/wrappers/LockedGold"
import BigNumber from "bignumber.js"
import { SavingsCELOInstance } from "../types/truffle-contracts"

export function pendingIndexGlobal(
	pendings: {0: BN[], 1: BN[]},
	pendingsGlobal: PendingWithdrawal[],
	index: number) {
	const idx = pendingsGlobal.findIndex((p) => (
		p.value.eq(pendings[0][index].toString()) &&
		p.time.eq(pendings[1][index].toString())))
	if (idx === -1) {
		throw Error(`pendings mismatch!`)
	}
	return idx
}

export async function withdrawStart(
	kit: ContractKit,
	savingsCELO: SavingsCELOInstance,
	from: string,
	savingsAmt: BigNumber.Value) {
	const lockedGold = await kit.contracts.getLockedGold()
	const election = await kit.contracts.getElection()
	const amt = new BigNumber(savingsAmt).toFixed(0)
	const toUnlock = await savingsCELO.savingsCELOasCELO(amt)

	const nonvoting = await lockedGold.getAccountNonvotingLockedGold(savingsCELO.address)
	const toRevoke = BigNumber.maximum(nonvoting.negated().plus(toUnlock.toString()), 0)

	const votedGroups = await election.getGroupsVotedForByAccount(savingsCELO.address)
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
		const votes = await election.getVotesForGroupByAccount(savingsCELO.address, revokeGroup)
		const toRevokePending = BigNumber.minimum(toRevoke, votes.pending)
		pendingRevoke = await election.findLesserAndGreaterAfterVote(votes.group, toRevokePending.negated())
		activeRevoke = await election.findLesserAndGreaterAfterVote(votes.group, toRevoke.negated())
	}

	return savingsCELO.withdrawStart(
		amt,
		pendingRevoke.lesser,
		pendingRevoke.greater,
		activeRevoke.lesser,
		activeRevoke.greater,
		{from: from})
}
