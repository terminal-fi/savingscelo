import { Address, ContractKit } from "@celo/contractkit"
import { toTransactionObject } from "@celo/contractkit/lib/wrappers/BaseWrapper"

import savingsCELOVoterV1Json from "../build/contracts/SavingsCELOVoterV1.json"
import { SavingsCELOVoterV1 } from "../types/web3-v1-contracts/SavingsCELOVoterV1"

export async function voterV1ActivateAndVote(kit: ContractKit, voterV1: Address) {
	const contract = new kit.web3.eth.Contract(
		savingsCELOVoterV1Json.abi as any, voterV1) as unknown as SavingsCELOVoterV1
	const savingsCELOAddress = await contract.methods._proxy().call()
	const votedGroup = await contract.methods.votedGroup().call()

	const election = await kit.contracts.getElection()
	const lockedGold = await kit.contracts.getLockedGold()

	const toVote = await lockedGold.getAccountNonvotingLockedGold(savingsCELOAddress)
	const {lesser, greater} = await election.findLesserAndGreaterAfterVote(votedGroup, toVote)
	const txo = contract.methods.ActivateAndVote(lesser, greater)
	return toTransactionObject(kit, txo)
}