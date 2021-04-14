import { toWei } from "web3-utils"
import { newKit } from "@celo/contractkit"
import BigNumber from "bignumber.js";
import { increaseTime, Provider } from "celo-devchain"
import { celoToSavings, SavingsKit, savingsToCELO } from "../savingskit";
import { Deposited, SavingsCELOInstance } from "../../types/truffle-contracts/SavingsCELO";
import { createAccounts } from "./utils";

const SavingsCELO = artifacts.require("SavingsCELO");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELO - Deposits', (accounts) => {
	const owner = accounts[0]
	let a0: string
	let a1: string
	const toLock = toWei('10', 'ether')
	const toDonate1 = toWei('100', 'ether')
	const toDonate2 = toWei('110', 'ether')

	let savingsCELO: SavingsCELOInstance
	let savingsKit: SavingsKit

	before(async () => {
		savingsCELO = await SavingsCELO.new()
		savingsKit = new SavingsKit(kit, savingsCELO.address)
	})

	it(`create accounts`, async () => {
		[
			a0,
			a1,
		] = await createAccounts(
			kit, owner, [
				new BigNumber(toWei('1', 'ether')).plus(toLock).toFixed(0),
				new BigNumber(toWei('1', 'ether')).plus(toDonate1).plus(toDonate2).toFixed(0),
			])
	})

	it(`simple deposit`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()

		let res = await savingsCELO.deposit({from: a0, value: toLock})
		const eventDeposited = res.logs.pop() as Truffle.TransactionLog<Deposited>
		assert.equal(eventDeposited.event, "Deposited")
		assert.equal(eventDeposited.args.from, a0)
		assert.equal(eventDeposited.args.celoAmount.toString(), toLock)

		let a0savings = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0savings.eq(eventDeposited.args.savingsAmount))
		assert.isTrue(a0savings.gtn(0))

		const a0deposit = await savingsCELO.savingsToCELO(a0savings)
		assert.equal(a0deposit.toString(), toLock)

		const balanceA0 = await goldToken.balanceOf(a0)
		assert.isTrue(balanceA0.lt(toWei('1', 'ether')))

		const contractCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractCELO.eq(toLock))
	})

	it(`invalid withdraws`, async () => {
		const toWithdraw = await savingsCELO.celoToSavings(toLock)
		try{
			await (await savingsKit
				.withdrawStart(toWithdraw.toString()))
				.sendAndWaitForReceipt({from: a1})
			assert.fail("withdraw from `a1` must have failed!")
		} catch {}
		try{
			await (await savingsKit
				.withdrawStart(toWithdraw.addn(1e18).toString()))
				.sendAndWaitForReceipt({from: a0})
			assert.fail("withdraw of too much CELO must have failed!")
		} catch {}
	})

	it(`simiple withdraw and withdraw cancel`, async () => {
		const a0savings = await savingsCELO.balanceOf(a0)
		const toWithdraw = await savingsCELO.celoToSavings(toWei('5', 'ether'))
		const toCancel = a0savings.sub(toWithdraw)
		await (await savingsKit
			.withdrawStart(toWithdraw.toString()))
			.sendAndWaitForReceipt({from: a0})
		await (await savingsKit
			.withdrawStart(toCancel.toString()))
			.sendAndWaitForReceipt({from: a0})

		const a0savings2 = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0savings2.eqn(0))

		const lockedGold = await kit.contracts.getLockedGold()
		let pendings = await savingsKit.pendingWithdrawals(a0)
		assert.equal(pendings.length, 2)

		try{
			await (await savingsKit
				.withdrawFinish(pendings, 0))
				.sendAndWaitForReceipt({from: a0})
			assert.fail("withdraw must fail since not enough time has passed!")
		} catch {}

		await increaseTime(kit.web3.currentProvider as Provider, 3 * 24 * 3600 + 1)
		await (await savingsKit
			.withdrawFinish(pendings, 0))
			.sendAndWaitForReceipt({from: a0})

		pendings = await savingsKit.pendingWithdrawals(a0)
		await (await savingsKit
			.withdrawCancel(pendings, 0))
			.sendAndWaitForReceipt({from: a0})

		// Check to make sure there are no more pending withdrawals.
		pendings = await savingsKit.pendingWithdrawals(a0)
		assert.equal(pendings.length, 0)

		const a0finalSavings = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0finalSavings.eq(toCancel))
		const finalTotalSupply = await savingsCELO.totalSupply()
		assert.isTrue(finalTotalSupply.eq(toCancel))
		const finalLockedCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(finalLockedCELO.eq(toWei('5', 'ether')))
	})

	it(`test celo donations`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()

		const contractCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		const savingsToCelo = await savingsCELO.savingsToCELO(toWei('1', 'ether'))

		// Donate 100 CELO
		await goldToken
			.transfer(savingsCELO.address, toDonate1)
			.sendAndWaitForReceipt({from: a1})

		const savingsToCELO_2 = await savingsCELO.savingsToCELO(toWei('1', 'ether'))
		assert.closeTo(
			savingsToCELO_2.div(savingsToCelo).toNumber(),
			contractCELO.plus(toDonate1).div(contractCELO).toNumber(),
			0.001)

		const contractCELO_2 = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractCELO.eq(contractCELO_2))
		// Make sure 0 deposit works to finish the donation.
		await savingsCELO.deposit({from: a1, value: "0"})
		const contractCELO_3 = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractCELO.plus(toDonate1).eq(contractCELO_3))
	})

	it(`test withdrawing unlocked donation`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()

		const a0savings = await savingsCELO.balanceOf(a0)
		await goldToken
			.transfer(savingsCELO.address, toDonate2)
			.sendAndWaitForReceipt({from: a1})

		// Withdraw in 3 chunks just to make things messy.
		await (await savingsKit
			.withdrawStart(a0savings.divn(3).toString()))
			.sendAndWaitForReceipt({from: a0})
		await (await savingsKit
			.withdrawStart(a0savings.divn(7).toString()))
			.sendAndWaitForReceipt({from: a0})
		const a0savingsLeft = await savingsCELO.balanceOf(a0)
		await (await savingsKit
			.withdrawStart(a0savingsLeft.toString()))
			.sendAndWaitForReceipt({from: a0})
		await increaseTime(kit.web3.currentProvider as Provider, 3 * 24 * 3600 + 1)

		const pendings = await savingsKit.pendingWithdrawals(a0)
		for (let i = 1; i <= 3; i++) {
			await (await savingsKit
				.withdrawFinish(pendings, pendings.length - i))
				.sendAndWaitForReceipt({from: a0})
		}

		const contractCELO = await goldToken.balanceOf(savingsCELO.address)
		assert.isTrue(contractCELO.eq(0))
		const contractLockedCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractLockedCELO.eq(0), `Locked CELO: ${contractLockedCELO}`)
	})

	it(`test 0 value and invalid arguments`, async () => {
		// This is ok, and used in the donation flow.
		await savingsKit
			.deposit()
			.sendAndWaitForReceipt({from: a0, value: 0})

		try{
			await (await savingsKit
				.withdrawStart(0))
				.sendAndWaitForReceipt({from: a0})
			assert.fail("withdrawStart must have failed")
		} catch {}
		try{
			await savingsCELO.withdrawFinish(2, 0)
			assert.fail("withdrawFinish must have failed")
		} catch {}
		try{
			await savingsCELO.withdrawCancel(2, 0)
			assert.fail("withdrawCancel must have failed")
		} catch {}
	})

	it(`test CELO <-> sCELO conversions`, async () => {
		const {celoTotal, savingsTotal} = await savingsKit.totalSupplies()
		assert.isTrue(
			(await savingsKit.celoToSavings(33e18)).eq(await celoToSavings(33e18, celoTotal, savingsTotal)))
		assert.isTrue(
			(await savingsKit.savingsToCELO(3305e18)).eq(await savingsToCELO(3305e18, savingsTotal, celoTotal)))
	})
})

export {}
