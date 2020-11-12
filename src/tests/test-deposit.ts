import { newKit } from "@celo/contractkit"
import BigNumber from "bignumber.js";
import { increaseTime, Provider } from "celo-devchain"
import SavingsKit from "../savingskit/savingskit";
import { Deposited, WithdrawFinished } from "../../types/truffle-contracts/SavingsCELO";

const SavingsCELO = artifacts.require("SavingsCELO");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELO', (accounts) => {
	const a0 = accounts[0]
	const a1 = accounts[1]
	const toLock = new BigNumber(10e18)

	it(`simple deposit`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()
		const savingsCELO = await SavingsCELO.deployed()
		// infinite approval for sCELO for `a0` account.
		await goldToken
			.increaseAllowance(savingsCELO.address, 1e35.toFixed(0))
			.sendAndWaitForReceipt({from: a0} as any)

		const a0startBalance = await goldToken.balanceOf(a0)
		let res = await savingsCELO.deposit(toLock.toFixed(0), {from: a0})
		const eventDeposited = res.logs.pop() as Truffle.TransactionLog<Deposited>
		assert.equal(eventDeposited.event, "Deposited")
		assert.equal(eventDeposited.args.from, a0)
		assert.isTrue(toLock.eq(eventDeposited.args.celoAmount.toString()))

		let a0savings = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0savings.eq(eventDeposited.args.savingsAmount))
		assert.isTrue(a0savings.gtn(0))

		const a0deposit = await savingsCELO.savingsToCELO(a0savings)
		assert.isTrue(toLock.eq(a0deposit.toString()))

		const a0finalBalance = await goldToken.balanceOf(a0)
		assert.closeTo(a0startBalance.minus(a0finalBalance).minus(toLock).toNumber(), 0.0, 0.01e18) // Delta due to Gas costs.

		const contractCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractCELO.eq(toLock))
	})

	it(`invalid withdraws`, async () => {
		const savingsCELO = await SavingsCELO.deployed()
		const savingsKit = new SavingsKit(kit, savingsCELO.address)

		const toWithdraw = await savingsCELO.celoToSavings(toLock.toFixed(0))
		try{
			await (await savingsKit
				.withdrawStart(toWithdraw.toString()))
				.sendAndWaitForReceipt({from: a1} as any)
			assert.fail("withdraw from `a1` must have failed!")
		} catch {}
		try{
			await (await savingsKit
				.withdrawStart(toWithdraw.addn(1e18).toString()))
				.sendAndWaitForReceipt({from: a0} as any)
			assert.fail("withdraw of too much CELO must have failed!")
		} catch {}
	})

	it(`simiple withdraw and withdraw cancel`, async () => {
		const savingsCELO = await SavingsCELO.deployed()
		const savingsKit = new SavingsKit(kit, savingsCELO.address)

		const a0savings = await savingsCELO.balanceOf(a0)
		const toWithdraw = await savingsCELO.celoToSavings(toLock.div(2).toFixed(0))
		const toCancel = a0savings.sub(toWithdraw)
		await (await savingsKit
			.withdrawStart(toWithdraw.toString()))
			.sendAndWaitForReceipt({from: a0} as any)
		await (await savingsKit
			.withdrawStart(toCancel.toString()))
			.sendAndWaitForReceipt({from: a0} as any)

		const a0savings2 = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0savings2.eqn(0))

		const lockedGold = await kit.contracts.getLockedGold()
		let pendings = await savingsCELO.pendingWithdrawals(a0)
		assert.equal(pendings[0].length, 2)
		assert.equal(pendings[1].length, 2)

		try{
			await (await savingsKit
				.withdrawFinish(pendings, 0))
				.sendAndWaitForReceipt({from: a0} as any)
			assert.fail("withdraw must fail since not enough time has passed!")
		} catch {}

		await increaseTime(kit.web3.currentProvider as Provider, 3 * 24 * 3600 + 1)
		await (await savingsKit
			.withdrawFinish(pendings, 0))
			.sendAndWaitForReceipt({from: a0} as any)

		pendings = await savingsCELO.pendingWithdrawals(a0)
		await (await savingsKit
			.withdrawCancel(pendings, 0))
			.sendAndWaitForReceipt({from: a0} as any)

		// Check to make sure there are no more pending withdrawals.
		pendings = await savingsCELO.pendingWithdrawals(a0)
		assert.equal(pendings[0].length, 0)

		const a0finalSavings = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0finalSavings.eq(toCancel))
		const finalTotalSupply = await savingsCELO.totalSupply()
		assert.isTrue(finalTotalSupply.eq(toCancel))
		const finalLockedCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(finalLockedCELO.eq(toLock.div(2)))
	})

	it(`test celo donations`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()
		const savingsCELO = await SavingsCELO.deployed()

		const contractCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		const savingsToCelo = await savingsCELO.savingsToCELO(new BigNumber(1e18).toFixed(0))

		// Donate 100 CELO
		const toDonate = new BigNumber(100e18)
		await goldToken
			.transfer(savingsCELO.address, toDonate.toFixed(0))
			.sendAndWaitForReceipt({from: a1} as any)

		const savingsToCELO_2 = await savingsCELO.savingsToCELO(new BigNumber(1e18).toFixed(0))
		assert.closeTo(
			savingsToCELO_2.div(savingsToCelo).toNumber(),
			contractCELO.plus(toDonate).div(contractCELO).toNumber(),
			0.001)

		const contractCELO_2 = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractCELO.eq(contractCELO_2))
		// Make sure 0 deposit works to finish the donation.
		await savingsCELO.deposit(0, {from: a1})
		const contractCELO_3 = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractCELO.plus(toDonate).eq(contractCELO_3))
	})

	it(`test withdrawing unlocked donation`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()
		const savingsCELO = await SavingsCELO.deployed()
		const savingsKit = new SavingsKit(kit, savingsCELO.address)

		const a0savings = await savingsCELO.balanceOf(a0)
		const toDonate = new BigNumber(103e18)
		await goldToken
			.transfer(savingsCELO.address, toDonate.toFixed(0))
			.sendAndWaitForReceipt({from: a1} as any)

		// Withdraw in 3 chunks just to make things messy.
		await (await savingsKit
			.withdrawStart(a0savings.divn(3).toString()))
			.sendAndWaitForReceipt({from: a0} as any)
		await (await savingsKit
			.withdrawStart(a0savings.divn(7).toString()))
			.sendAndWaitForReceipt({from: a0} as any)
		const a0savingsLeft = await savingsCELO.balanceOf(a0)
		await (await savingsKit
			.withdrawStart(a0savingsLeft.toString()))
			.sendAndWaitForReceipt({from: a0} as any)
		await increaseTime(kit.web3.currentProvider as Provider, 3 * 24 * 3600 + 1)

		const pendings = await savingsCELO.pendingWithdrawals(a0)
		for (let i = 1; i <= 3; i++) {
			const index = pendings[0].length - i
			await (await savingsKit
				.withdrawFinish(pendings, pendings[0].length - i))
				.sendAndWaitForReceipt({from: a0} as any)
		}

		const contractCELO = await goldToken.balanceOf(savingsCELO.address)
		assert.isTrue(contractCELO.eq(0))
		const contractLockedCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(contractLockedCELO.eq(0), `Locked CELO: ${contractLockedCELO}`)
	})
})

export {}
