import { toWei } from "web3-utils"
import { newKit } from "@celo/contractkit"
import { increaseTime, Provider } from "celo-devchain"
import { SavingsKit } from "../savingskit"
import { SavingsCELOInstance } from "../../types/truffle-contracts/SavingsCELO"
import { createAccounts } from "./utils"
import { toTransactionObject } from "@celo/connect"
import { ProposalBuilder } from '@celo/governance'
import { ProposalStage, VoteValue } from '@celo/contractkit/lib/wrappers/Governance'

const SavingsCELO = artifacts.require("SavingsCELO");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELO - Governance', (accounts) => {
	const owner = accounts[0]
	let owner2: string
	let proxyVoter: string

	let savingsCELO: SavingsCELOInstance
	let savingsKit: SavingsKit

	before(async () => {
		savingsCELO = await SavingsCELO.new()
		savingsKit = new SavingsKit(kit, savingsCELO.address)
	})

	it(`create accounts`, async () => {
		[
			owner2,
			proxyVoter,
		] = await createAccounts(
			kit, owner, [
				toWei('1', 'ether'),
				toWei('2001', 'ether'),
			])
	})

	it(`change owner`, async () => {
		await toTransactionObject(kit.connection,
			savingsKit.contract.methods.transferOwnership(owner2))
			.sendAndWaitForReceipt({from: owner})

		try {
			await toTransactionObject(kit.connection,
				savingsKit.contract.methods.transferOwnership(owner2))
				.sendAndWaitForReceipt({from: owner})
			assert.fail("must fail since owner2 is the new owner")
		} catch {}

		try {
			await toTransactionObject(kit.connection,
				savingsKit.contract.methods.authorizeVoterProxy(proxyVoter))
				.sendAndWaitForReceipt({from: owner})
			assert.fail("must fail since owner2 is the new owner")
		} catch {}

		await toTransactionObject(kit.connection,
			savingsKit.contract.methods.authorizeVoterProxy(proxyVoter))
			.sendAndWaitForReceipt({from: owner2})
	})

	it(`proxy governance voting`, async () => {
		await savingsKit
			.deposit()
			.sendAndWaitForReceipt({from: proxyVoter, value: toWei('1000', 'ether')})

		const governance = await kit.contracts.getGovernance()
		const cfg = await governance.getConfig()
		// This should expire all existing proposals.
		await increaseTime(
			kit.web3.currentProvider as Provider,
			cfg.dequeueFrequency
				.plus(cfg.stageDurations.Approval)
				.plus(cfg.stageDurations.Referendum)
				.plus(cfg.stageDurations.Execution).toNumber())

		const proposal = await new ProposalBuilder(kit).build()
		await governance
			.propose(proposal, 'URL')
			.sendAndWaitForReceipt({
				from: owner,
				value: cfg.minDeposit.toFixed(0)})

		const queue = await governance.getQueue()
		assert.lengthOf(queue, 1)
		const proposalID = queue[0].proposalID
		console.debug(`proposed: ${proposalID}, upvoting...`)
		await toTransactionObject(kit.connection,
			savingsKit.contract.methods.proxyGovernanceUpvote(
				proposalID.toFixed(0),
				0, 0))
			.sendAndWaitForReceipt({from: proxyVoter})
		const queue2 = await governance.getQueue()
		assert.lengthOf(queue2, 1)
		assert.isTrue(queue2[0].upvotes.eq(toWei('1000', 'ether')), `upvotes: ${queue2[0].upvotes}`)

		console.debug(`proposed: ${proposalID}, revoking upvote...`)
		await toTransactionObject(kit.connection,
			savingsKit.contract.methods.proxyGovernanceRevokeUpvote(0, 0))
			.sendAndWaitForReceipt({from: proxyVoter})
		const queue3 = await governance.getQueue()
		assert.lengthOf(queue3, 1)
		assert.isTrue(queue3[0].upvotes.eq(0), `upvotes: ${queue3[0].upvotes}`)

		await increaseTime(kit.web3.currentProvider as Provider, cfg.dequeueFrequency.toNumber())
		await governance
			.dequeueProposalsIfReady()
			.sendAndWaitForReceipt({from: owner})
		console.debug(`approving: ${proposalID}...`)
		const multiSigAddress = await governance.getApprover()
		const governanceApproverMultiSig = await kit.contracts.getMultiSig(multiSigAddress)
		const govTX = await governance.approve(proposalID)
		await (await governanceApproverMultiSig
			.submitOrConfirmTransaction(governance.address, govTX.txo))
			.sendAndWaitForReceipt({from: owner})
		await increaseTime(kit.web3.currentProvider as Provider, cfg.stageDurations.Approval.toNumber())

		console.debug(`voting for: ${proposalID}...`)
		const deq = await governance.getDequeue()
		const pidx = deq.findIndex((e) => e.eq(proposalID))
		assert.notEqual(pidx, -1, `Deque: ${deq}`)
		for (const v of ["Yes", "No", "Abstain"]) {
			await toTransactionObject(kit.connection,
				savingsKit.contract.methods.proxyGovernanceVote(
					proposalID.toFixed(0),
					pidx,
					Object.keys(VoteValue).indexOf(v)))
				.sendAndWaitForReceipt({from: proxyVoter})
			const pVotes = await governance.getVotes(proposalID)
			assert.isTrue(
				pVotes[v as "Yes" | "No" | "Abstain"].eq(toWei('1000', 'ether')),
				`${v} votes: ${pVotes}`)
		}

		await increaseTime(kit.web3.currentProvider as Provider, cfg.stageDurations.Referendum.toNumber())
		await (await governance
			.execute(proposalID))
			.sendAndWaitForReceipt({from: owner})
	})
})

export {}
