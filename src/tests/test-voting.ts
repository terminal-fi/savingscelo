import { toWei } from "web3-utils"
import { newKit } from "@celo/contractkit"
import { addressToPublicKey } from '@celo/utils/lib/signatureUtils'
import BigNumber from "bignumber.js";
import { mineToNextEpoch } from "celo-devchain"
import { SavingsKit } from "../savingskit"
import { newVoterV1, VoterV1 } from "../voterv1";
import { SavingsCELOInstance } from "../../types/truffle-contracts";
import { createAccounts } from "./utils";

const SavingsCELO = artifacts.require("SavingsCELO");
const SavingsCELOVoterV1 = artifacts.require("SavingsCELOVoterV1");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELO - Voting', (accounts) => {
	const owner = accounts[0]
	let locker: string
	let vgroup: string
	let validator0: string

	let savingsCELO: SavingsCELOInstance
	let savingsKit: SavingsKit
	let voterV1: VoterV1

	before(async () => {
		savingsCELO = await SavingsCELO.new()
		const savingsCELOVoterV1 = await SavingsCELOVoterV1.new(savingsCELO.address)
		await savingsCELO.authorizeVoterProxy(savingsCELOVoterV1.address, {from: owner})

		savingsKit = new SavingsKit(kit, savingsCELO.address)
		voterV1 = await newVoterV1(kit, savingsKit)
		kit.defaultAccount = owner // TODO(zviad): remove this once contractkit is upgraded.
	})

	it(`create accounts`, async () => {
		[
			locker,
			vgroup,
			validator0,
		] = await createAccounts(
			kit, owner, [
				toWei('1001', 'ether'),
				toWei('10001', 'ether'),
				toWei('10001', 'ether'),
				toWei('1', 'ether'),
			])
	})

	it(`register validator group`, async () => {
		const accountsC = await kit.contracts.getAccounts()
		const lockedGold = await kit.contracts.getLockedGold()
		const validator = await kit.contracts.getValidators()

		for (const addr of [vgroup, validator0]) {
			await accountsC
				.createAccount()
				.sendAndWaitForReceipt({from: addr})
			await lockedGold
				.lock()
				.sendAndWaitForReceipt({
					from: addr,
					value: toWei('10000.1', 'ether')})
		}

		await (await validator
			.registerValidatorGroup(new BigNumber(0.5)))
			.sendAndWaitForReceipt({from: vgroup})
		// Random hex strings
		const blsPublicKey =
			'0x4fa3f67fc913878b068d1fa1cdddc54913d3bf988dbe5a36a20fa888f20d4894c408a6773f3d7bde11154f2a3076b700d345a42fd25a0e5e83f4db5586ac7979ac2053cd95d8f2efd3e959571ceccaa743e02cf4be3f5d7aaddb0b06fc9aff00'
		const blsPoP =
			'0xcdb77255037eb68897cd487fdd85388cbda448f617f874449d4b11588b0b7ad8ddc20d9bb450b513bb35664ea3923900'
		const ecdsaPublicKey = await addressToPublicKey(validator0, kit.web3.eth.sign)
		await validator
			.registerValidator(ecdsaPublicKey, blsPublicKey, blsPoP)
			.sendAndWaitForReceipt({from: validator0})

		await validator
			.affiliate(vgroup)
			.sendAndWaitForReceipt({from: validator0})
		await (await validator
			.addMember(vgroup, validator0))
			.sendAndWaitForReceipt({from: vgroup})

		await (await voterV1
			.changeVotedGroup(vgroup))
			.sendAndWaitForReceipt({from: owner})
	})

	it(`changeVotedGroup with 0 votes`, async () => {
		await (await voterV1
			.changeVotedGroup(vgroup))
			.sendAndWaitForReceipt({from: owner})
	})

	it(`withdraw pending and active votes`, async () => {
		const election = await kit.contracts.getElection()
		const approveTX = await savingsKit.infiniteApprove(locker)
		if (approveTX) {
			await approveTX.sendAndWaitForReceipt({from: locker})
		}

		// Deposit 1000 CELO and vote for `vgroup`
		await savingsCELO.deposit({from: locker, value: toWei('1000', 'ether')})
		await (await voterV1
			.activateAndVote())
			.sendAndWaitForReceipt({from: locker})

		// Withdraw 500 CELO, forcing revoking of half of the votes.
		let totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(toWei('1000', 'ether')))
		const toWithdraw500 = await savingsCELO.celoToSavings(toWei('500', 'ether'))
		await (await savingsKit
			.withdrawStart(toWithdraw500.toString()))
			.sendAndWaitForReceipt({from: locker})

		totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(toWei('500', 'ether')))
		let activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(0))

		await mineToNextEpoch(kit)
		await (await voterV1
			.activateAndVote())
			.sendAndWaitForReceipt({from: locker})
		activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(toWei('500', 'ether')), `activeVotes: ${activeVotes}`)

		// Cancel withdraw of 500 CELO, forcing to re-lock and re-vote.
		await savingsCELO.withdrawCancel(0, 0, {from: locker})
		await (await voterV1
			.activateAndVote())
			.sendAndWaitForReceipt({from: locker})

		totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(toWei('1000', 'ether')), `totalVotes: ${totalVotes}`)
		activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(toWei('500', 'ether')), `activeVotes: ${activeVotes}`)

		// Withdraw 600 CELO, forcing to unlock nonvoting celo and revoke all pending votes,
		// plus some of the active votes.
		const toWithdraw600 = await savingsCELO.celoToSavings(toWei('600', 'ether'))
		await (await savingsKit
			.withdrawStart(toWithdraw600.toString()))
			.sendAndWaitForReceipt({from: locker})

		totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(toWei('400', 'ether')), `totalVotes: ${totalVotes}`)
		activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(toWei('400', 'ether')), `activeVotes: ${activeVotes}`)
	})

	it(`changeVotedGroup with pending and active votes`, async () => {
		await (await voterV1
			.changeVotedGroup(vgroup))
			.sendAndWaitForReceipt({from: owner})
		const election = await kit.contracts.getElection()
		const totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(0), `totalVotes: ${totalVotes}`)
	})

	// TODO(zviad): This test doesn't work since it requires setting up another validator group
	// that is voted in to cause maximum voting cap to kick in.
	// it(`exceed voting capacity`, async () => {
	// 	const election = await kit.contracts.getElection()
	// 	const goldToken = await kit.contracts.getGoldToken()
	// 	const lockedGold = await kit.contracts.getLockedGold()

	// 	while (true) {
	// 		const groupVotes = await election.getValidatorGroupVotes(vgroup)
	// 		const toTransfer = groupVotes.capacity.plus(1e18)
	// 		await goldToken
	// 			.transfer(locker, toTransfer.toFixed(0))
	// 			.sendAndWaitForReceipt({from: owner})
	// 		await savingsCELO.deposit(toTransfer.toFixed(0), {from: locker})

	// 		const nonvotingCELO = await lockedGold.getAccountNonvotingLockedGold(savingsCELO.address)
	// 		const groupVotesAfter = await election.getValidatorGroupVotes(vgroup)
	// 		console.debug(`celo in contract: ${nonvotingCELO.div(1e18)}, capacitiy: ${groupVotesAfter.capacity.div(1e18)}`)
	// 		if (nonvotingCELO.gt(groupVotesAfter.capacity)) {
	// 			break
	// 		}
	// 	}

	// 	// vgroup now should have more locked CELO than vote capacity. make sure voteAndActivate still works
	// 	// and doesn't fail.
	// 	await (await voterV1.activateAndVote())
	// 		.sendAndWaitForReceipt({from: locker})
	// 	const nonvotingCELOAfter = await lockedGold.getAccountNonvotingLockedGold(savingsCELO.address)
	// 	assert.isTrue(nonvotingCELOAfter.gt(0), `non voting: ${nonvotingCELOAfter}`)

	// 	// Withdraw CELO to avoid inflating total locked CELO during subsequent test runs.
	// 	const toWithdraw = await savingsKit.contract.methods.balanceOf(locker).call()
	// 	await (await savingsKit
	// 		.withdrawStart(toWithdraw))
	// 		.sendAndWaitForReceipt({from: locker})
	// })

})

export {}
