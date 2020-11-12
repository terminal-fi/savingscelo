import { newKit } from "@celo/contractkit"
import { addressToPublicKey } from '@celo/utils/lib/signatureUtils'
import BigNumber from "bignumber.js";
import { mineToNextEpoch } from "celo-devchain"
import { withdrawStart } from "./helpers";

const SavingsCELO = artifacts.require("SavingsCELO");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELO', (accounts) => {
	const owner = accounts[0]
	let signer: string
	let vgroup: string

	it(`authorize vote signner`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		signer = await web3.eth.personal.newAccount("")
		await web3.eth.personal.unlockAccount(signer, "", 0)
		await goldToken
			.transfer(signer, 1e18.toFixed(0))
			.sendAndWaitForReceipt({from: owner} as any)

		const savingsCELO = await SavingsCELO.deployed()
		const accountsC = await kit.contracts.getAccounts()
		const proofOfPoss = await accountsC.generateProofOfKeyPossession(savingsCELO.address, signer)
		await savingsCELO.authorizeVoteSigner(
			signer, proofOfPoss.v, proofOfPoss.r, proofOfPoss.s,
			{from: owner})
	})

	it(`register validator group`, async () => {
		const accountsC = await kit.contracts.getAccounts()
		const lockedGold = await kit.contracts.getLockedGold()
		const validator = await kit.contracts.getValidators()
		const goldToken = await kit.contracts.getGoldToken()

		vgroup = await web3.eth.personal.newAccount("")
		const validator0 = await web3.eth.personal.newAccount("")
		for (const addr of [vgroup, validator0]) {
			await web3.eth.personal.unlockAccount(addr, "", 0)
			await goldToken
				.transfer(addr, new BigNumber(10001e18).toFixed(0))
				.sendAndWaitForReceipt({from: owner} as any)
			await accountsC
				.createAccount()
				.sendAndWaitForReceipt({from: addr} as any)
			await lockedGold
				.lock()
				.sendAndWaitForReceipt({
					from: addr,
					value: new BigNumber(10000e18).toFixed(0)} as any)
		}

		await (await validator
			.registerValidatorGroup(new BigNumber(0.5)))
			.sendAndWaitForReceipt({from: vgroup} as any)
		// Random hex strings
		const blsPublicKey =
			'0x4fa3f67fc913878b068d1fa1cdddc54913d3bf988dbe5a36a20fa888f20d4894c408a6773f3d7bde11154f2a3076b700d345a42fd25a0e5e83f4db5586ac7979ac2053cd95d8f2efd3e959571ceccaa743e02cf4be3f5d7aaddb0b06fc9aff00'
		const blsPoP =
			'0xcdb77255037eb68897cd487fdd85388cbda448f617f874449d4b11588b0b7ad8ddc20d9bb450b513bb35664ea3923900'
		const ecdsaPublicKey = await addressToPublicKey(validator0, kit.web3.eth.sign)
		await validator
			.registerValidator(ecdsaPublicKey, blsPublicKey, blsPoP)
			.sendAndWaitForReceipt({from: validator0} as any)

		await validator
			.affiliate(vgroup)
			.sendAndWaitForReceipt({from: validator0} as any)
		await (await validator
			.addMember(vgroup, validator0))
			.sendAndWaitForReceipt({from: vgroup} as any)
	})

	it(`withdraw pending and active votes`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const savingsCELO = await SavingsCELO.deployed()
		const election = await kit.contracts.getElection()

		let tx = await goldToken.increaseAllowance(savingsCELO.address, 1e35.toFixed(0))
		await tx.sendAndWaitForReceipt({from: owner} as any)

		// Deposit 1000 CELO and vote for `vgroup`
		await savingsCELO.deposit(
			new BigNumber(1000e18).toFixed(0),
			{from: owner} as any)
		kit.defaultAccount = signer
		await (await election
			.vote(vgroup, new BigNumber(1000e18)))
			.sendAndWaitForReceipt({from: signer} as any)

		// Withdraw 500 CELO, forcing revoking of half of the votes.
		let totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(1000e18))
		const toWithdraw500 = await savingsCELO.celoToSavings(new BigNumber(500e18).toFixed(0))
		await withdrawStart(kit, savingsCELO, owner, toWithdraw500.toString())

		totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(500e18))
		let activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(0))

		await mineToNextEpoch(kit)
		const activateTXs = await election.activate(savingsCELO.address)
		for (const tx of activateTXs) {
			await tx.sendAndWaitForReceipt({from: signer} as any)
		}
		activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(500e18), `activeVotes: ${activeVotes}`)

		// Cancel withdraw of 500 CELO, forcing to re-lock and re-vote.
		await savingsCELO.withdrawCancel(0, 0, {from: owner})
		await (await election
			.vote(vgroup, new BigNumber(300e18)))
			.sendAndWaitForReceipt({from: signer} as any)

		totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(800e18), `totalVotes: ${totalVotes}`)
		activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(500e18), `activeVotes: ${activeVotes}`)

		// Withdraw 600 CELO, forcing to unlock nonvoting celo and revoke all pending votes,
		// plus some of the active votes.
		const toWithdraw600 = await savingsCELO.celoToSavings(new BigNumber(600e18).toFixed(0))
		await withdrawStart(kit, savingsCELO, owner, toWithdraw600.toString())

		totalVotes = await election.getTotalVotesForGroup(vgroup)
		assert.isTrue(totalVotes.eq(400e18), `totalVotes: ${totalVotes}`)
		activeVotes = await election.getActiveVotesForGroup(vgroup)
		assert.isTrue(activeVotes.eq(400e18), `activeVotes: ${activeVotes}`)
	})
})

export {}
