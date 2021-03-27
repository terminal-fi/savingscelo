import { toWei } from "web3-utils"
import { newKit } from "@celo/contractkit"
import { addressToPublicKey } from '@celo/utils/lib/signatureUtils'
import BigNumber from "bignumber.js";
import { increaseTime, Provider } from "celo-devchain"
import { SavingsCELOInstance } from "../../types/truffle-contracts";
import { SavingsCELOVGroupInstance } from "../../types/truffle-contracts";
import { createAccounts } from "./utils";

const SavingsCELO = artifacts.require("SavingsCELO");
const SavingsCELOVGroup = artifacts.require("SavingsCELOVGroup");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELOVGroup', (accounts) => {
	const owner = accounts[0]
	let validator0: string
	let vgroupVoteSigner: string
	let vgroupValidatorSigner: string

	let savingsCELO: SavingsCELOInstance
	let savingsVGroup: SavingsCELOVGroupInstance

	before(async () => {
		savingsCELO = await SavingsCELO.new()
		savingsVGroup = await SavingsCELOVGroup.new(savingsCELO.address)
		kit.defaultAccount = owner
	})

	it(`create accounts`, async () => {
		[
			validator0,
			vgroupVoteSigner,
			vgroupValidatorSigner,
		] = await createAccounts(
			kit, owner, [
				toWei('10001', 'ether'),
				toWei('1', 'ether'),
				toWei('1', 'ether'),
			])
	})

	it(`register validator group`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const accountsC = await kit.contracts.getAccounts()
		const lockedGold = await kit.contracts.getLockedGold()
		const validator = await kit.contracts.getValidators()

		// Lock gold and register validator group.
		await goldToken
			.transfer(savingsVGroup.address, toWei('10000', 'ether'))
			.sendAndWaitForReceipt({from: owner})
		await savingsVGroup.lockGold(toWei('10000', 'ether'), {from: owner})
		const signerPOP = await accountsC.generateProofOfKeyPossession(savingsVGroup.address, vgroupValidatorSigner)
		await savingsVGroup.authorizeValidatorSigner(
			vgroupValidatorSigner,
			signerPOP.v, signerPOP.r, signerPOP.s,
			{from: owner})
		await (await validator
			.registerValidatorGroup(new BigNumber(0.3)))
			.sendAndWaitForReceipt({from: vgroupValidatorSigner})

		// Lock gold and register validator.
		await accountsC
			.createAccount()
			.sendAndWaitForReceipt({from: validator0})
		await lockedGold
			.lock()
			.sendAndWaitForReceipt({
				from: validator0,
				value: toWei('10000.1', 'ether')})
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
			.affiliate(savingsVGroup.address)
			.sendAndWaitForReceipt({from: validator0})
		await (await validator
			.addMember(savingsVGroup.address, validator0))
			.sendAndWaitForReceipt({from: vgroupValidatorSigner})
	})

	it(`authorize vgroup vote signer`, async () => {
		const accountsC = await kit.contracts.getAccounts()
		const election = await kit.contracts.getElection()
		const signerPOP = await accountsC.generateProofOfKeyPossession(savingsVGroup.address, vgroupVoteSigner)
		await savingsVGroup.authorizeVoteSigner(
			vgroupVoteSigner,
			signerPOP.v, signerPOP.r, signerPOP.s,
			{from: owner})
		await (await election
			.vote(savingsVGroup.address, new BigNumber(toWei('10000', 'ether'))))
			.sendAndWaitForReceipt({from: vgroupVoteSigner})
	})

	it(`exchange and donate cUSD rewards`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const stableToken = await kit.contracts.getStableToken()
		const exchange = await kit.contracts.getExchange()

		const toExchange = toWei('100', 'ether')
		await goldToken
			.increaseAllowance(exchange.address, toExchange)
			.sendAndWaitForReceipt({from: owner})
		await exchange
			.sellGold(toExchange, 0)
			.sendAndWaitForReceipt({from: owner})
		const cUSDAmt = await stableToken.balanceOf(owner)
		assert(cUSDAmt.gt(0), `cUSD: ${cUSDAmt}`)
		await stableToken
			.transfer(savingsVGroup.address, cUSDAmt.toFixed(0))
			.sendAndWaitForReceipt({from: owner})

		let savingsCELOAmt = await goldToken.balanceOf(savingsCELO.address)
		assert(savingsCELOAmt.eq(0), `CELO: ${savingsCELOAmt}`)
		await savingsVGroup.exchangeAndDonateEpochRewards(cUSDAmt.toFixed(0), 0)
		savingsCELOAmt = await goldToken.balanceOf(savingsCELO.address)
		assert(savingsCELOAmt.gt(0), `CELO: ${savingsCELOAmt}`)
		const vgroupCUSDAmt = await stableToken.balanceOf(savingsVGroup.address)
		assert(vgroupCUSDAmt.eq(0), `CUSD: ${vgroupCUSDAmt}`)
	})

	it(`revoke votes, unlock and withdraw CELO`, async () => {
		const election = await kit.contracts.getElection()
		const validator = await kit.contracts.getValidators()
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()

		await (await election
			.revokePending(savingsVGroup.address, savingsVGroup.address, new BigNumber(toWei('10000', 'ether'))))
			.sendAndWaitForReceipt({from: vgroupVoteSigner})
		await validator
			.removeMember(validator0)
			.sendAndWaitForReceipt({from: vgroupValidatorSigner})

		await increaseTime(kit.web3.currentProvider as Provider, 15552001)
		await (await validator
			.deregisterValidatorGroup(savingsVGroup.address))
			.sendAndWaitForReceipt({from: vgroupValidatorSigner})
		await savingsVGroup.unlockGold(toWei('10000', 'ether'), {from: owner})
		await increaseTime(kit.web3.currentProvider as Provider, 259201)
		await savingsVGroup.withdrawLockedGold(0, {from: owner})

		const vgroupLockedCELO = await lockedGold.getAccountTotalLockedGold(savingsVGroup.address)
		assert(vgroupLockedCELO.eq(0), `locked CELO: ${vgroupLockedCELO}`)
		let vgroupCELO = await goldToken.balanceOf(savingsVGroup.address)
		assert(vgroupCELO.eq(toWei('10000', 'ether')), `CELO: ${vgroupCELO}`)
		await savingsVGroup.withdraw(vgroupCELO.toFixed(0), {from: owner})
		vgroupCELO = await goldToken.balanceOf(savingsVGroup.address)
		assert(vgroupCELO.eq(0), `CELO: ${vgroupCELO}`)
	})
})

export {}
