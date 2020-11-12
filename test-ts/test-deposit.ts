import { newKit } from "@celo/contractkit"
import BigNumber from "bignumber.js";
import { increaseTime, Provider } from "celo-devchain"
import { Deposited, WithdrawFinished } from "../types/truffle-contracts/SavingsCELO";
import { pendingIndexGlobal, withdrawStart } from "./helpers";

const SavingsCELO = artifacts.require("SavingsCELO");

const kit = newKit("http://127.0.0.1:7545")
after(() => {
	kit.stop()
})
contract('SavingsCELO', (accounts) => {
	const a0 = accounts[0]
	const a1 = accounts[1]

	it(`simple deposit and withdraw`, async () => {
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()
		const savingsCELO = await SavingsCELO.deployed()
		// infinite approval for sCELO for `a0` account.
		await goldToken
			.increaseAllowance(savingsCELO.address, 1e35.toFixed(0))
			.sendAndWaitForReceipt({from: a0} as any)

		const a0startBalance = await goldToken.balanceOf(a0)
		const toLock = new BigNumber(10e18)
		let res = await savingsCELO.depositCELO(toLock.toFixed(0), {from: a0})
		const eventDeposited = res.logs.pop() as Truffle.TransactionLog<Deposited>
		assert.equal(eventDeposited.event, "Deposited")
		assert.equal(eventDeposited.args.from, a0)
		assert.isTrue(toLock.eq(eventDeposited.args.celoAmount.toString()))

		let a0savings = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0savings.eq(eventDeposited.args.savingsAmount))
		assert.isTrue(a0savings.gtn(0))

		try{
			await withdrawStart(kit, savingsCELO, a1, a0savings.toString())
			assert.fail("withdraw from `a1` must have failed!")
		} catch {}
		try{
			await withdrawStart(kit, savingsCELO, a0, a0savings.addn(1).toString())
			assert.fail("withdraw of too much CELO must have failed!")
		} catch {}

		let toWithdraw0 = a0savings.divn(2)
		let toCancel = a0savings.sub(toWithdraw0)
		await withdrawStart(kit, savingsCELO, a0, toWithdraw0.toString())
		await withdrawStart(kit, savingsCELO, a0, toCancel.toString())

		let pendings = await savingsCELO.pendingWithdrawals(a0)
		let pendingsGlobal = await lockedGold.getPendingWithdrawals(savingsCELO.address)
		assert.equal(pendings[0].length, 2)
		assert.equal(pendings[1].length, 2)
		let index = 0
		let idxGlobal = pendingIndexGlobal(pendings, pendingsGlobal, index)

		try{
			await savingsCELO.withdrawFinish(index, idxGlobal)
			assert.fail("withdraw must fail with unlock time passing!")
		} catch {}
		await increaseTime(kit.web3.currentProvider as Provider, 3 * 24 * 3600)
		res = await savingsCELO.withdrawFinish(index, idxGlobal)
		const eventWFinished = res.logs.pop() as Truffle.TransactionLog<WithdrawFinished>
		assert.equal(eventWFinished.event, "WithdrawFinished")
		assert.equal(eventWFinished.args.from, a0)
		assert.isTrue(eventWFinished.args.celoAmount.eq(pendings[0][0]))

		pendings = await savingsCELO.pendingWithdrawals(a0)
		pendingsGlobal = await lockedGold.getPendingWithdrawals(savingsCELO.address)
		index = 0
		idxGlobal = pendingIndexGlobal(pendings, pendingsGlobal, index)
		await savingsCELO.withdrawCancel(index, idxGlobal)

		// Check final state:
		// * No pending entries.
		// * a0 balance:
		//   CELO:  `initial balance - toLock / 2`
		//   sCELO: toCancel
		// * sCELO balance:
		//   LockedCELO: toLock / 2
		//   TotalSupply: toCancel
		pendings = await savingsCELO.pendingWithdrawals(a0)
		pendingsGlobal = await lockedGold.getPendingWithdrawals(savingsCELO.address)
		assert.equal(pendings[0].length, 0)
		assert.equal(pendingsGlobal.length, 0)

		const finalTotalSupply = await savingsCELO.totalSupply()
		assert.isTrue(finalTotalSupply.eq(toCancel))
		const a0finalSavings = await savingsCELO.balanceOf(a0)
		assert.isTrue(a0finalSavings.eq(toCancel))

		const finalLockedCELO = await lockedGold.getAccountTotalLockedGold(savingsCELO.address)
		assert.isTrue(finalLockedCELO.eq(toLock.div(2)))
		const a0finalBalance = await goldToken.balanceOf(a0)
		assert.closeTo(a0finalBalance.minus(a0startBalance.minus(toLock.div(2))).toNumber(), 0.0, 0.1e18) // Delta due to gas costs.
	})
})

export {}
