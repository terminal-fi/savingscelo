import { ContractKit, newKit } from "@celo/contractkit"
import { PendingWithdrawal } from "@celo/contractkit/lib/wrappers/LockedGold";
import BigNumber from "bignumber.js";
import { increaseTime } from "celo-devchain"
import { Deposited, SavingsCELOInstance, WithdrawFinished } from "../types/truffle-contracts/SavingsCELO";

const SavingsCELO = artifacts.require("SavingsCELO");

function indexGlobal(
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

async function withdrawStart(
	kit: ContractKit,
	sCELO: SavingsCELOInstance,
	from: string,
	savingsAmt: BigNumber.Value) {
	return sCELO.withdrawStart(
		new BigNumber(savingsAmt).toFixed(0),
		"0x0000000000000000000000000000000000000000",
		"0x0000000000000000000000000000000000000000",
		"0x0000000000000000000000000000000000000000",
		"0x0000000000000000000000000000000000000000",
		{from: from})
}

contract('SavingsCELO', (accounts) => {
	it(`simple deposit and withdraw`, async () => {
		const kit = newKit("http://127.0.0.1:7545")
		const goldToken = await kit.contracts.getGoldToken()
		const lockedGold = await kit.contracts.getLockedGold()
		const a0 = accounts[0]
		const a1 = accounts[1]

		const sCELO = await SavingsCELO.deployed()
		// infinite approval for sCELO for `a0` account.
		let tx = await goldToken.increaseAllowance(sCELO.address, 1e35.toFixed(0))
		await tx.sendAndWaitForReceipt({from: a0} as any)

		const a0startBalance = await goldToken.balanceOf(a0)
		const toLock = new BigNumber(10e18)
		let res = await sCELO.depositCELO(toLock.toFixed(0), {from: a0})
		const eventDeposited = res.logs.pop() as Truffle.TransactionLog<Deposited>
		assert.equal(eventDeposited.event, "Deposited")
		assert.equal(eventDeposited.args.from, a0)
		assert.isTrue(toLock.eq(eventDeposited.args.celoAmount.toString()))

		let a0savings = await sCELO.balanceOf(a0)
		assert.isTrue(a0savings.eq(eventDeposited.args.savingsAmount))
		assert.isTrue(a0savings.gtn(0))

		try{
			await withdrawStart(kit, sCELO, a1, a0savings.toString())
			assert.fail("withdraw from `a1` must have failed!")
		} catch {}
		try{
			await withdrawStart(kit, sCELO, a0, a0savings.addn(1).toString())
			assert.fail("withdraw of too much CELO must have failed!")
		} catch {}

		let toWithdraw0 = a0savings.divn(2)
		let toCancel = a0savings.sub(toWithdraw0)
		await withdrawStart(kit, sCELO, a0, toWithdraw0.toString())
		await withdrawStart(kit, sCELO, a0, toCancel.toString())

		let pendings = await sCELO.pendingWithdrawals(a0)
		let pendingsGlobal = await lockedGold.getPendingWithdrawals(sCELO.address)
		assert.equal(pendings[0].length, 2)
		assert.equal(pendings[1].length, 2)
		let index = 0
		let idxGlobal = indexGlobal(pendings, pendingsGlobal, index)

		try{
			await sCELO.withdrawFinish(index, idxGlobal)
			assert.fail("withdraw must fail with unlock time passing!")
		} catch {}
		await increaseTime(kit.web3.currentProvider as any, 3 * 24 * 3600)
		res = await sCELO.withdrawFinish(index, idxGlobal)
		const eventWFinished = res.logs.pop() as Truffle.TransactionLog<WithdrawFinished>
		assert.equal(eventWFinished.event, "WithdrawFinished")
		assert.equal(eventWFinished.args.from, a0)
		assert.isTrue(eventWFinished.args.celoAmount.eq(pendings[0][0]))

		pendings = await sCELO.pendingWithdrawals(a0)
		pendingsGlobal = await lockedGold.getPendingWithdrawals(sCELO.address)
		index = 0
		idxGlobal = indexGlobal(pendings, pendingsGlobal, index)
		await sCELO.withdrawCancel(index, idxGlobal)

		// Check final state:
		// * No pending entries.
		// * a0 balance:
		//   CELO:  `initial balance - toLock / 2`
		//   sCELO: toCancel
		// * sCELO balance:
		//   LockedCELO: toLock / 2
		//   TotalSupply: toCancel
		pendings = await sCELO.pendingWithdrawals(a0)
		pendingsGlobal = await lockedGold.getPendingWithdrawals(sCELO.address)
		assert.equal(pendings[0].length, 0)
		assert.equal(pendingsGlobal.length, 0)

		const finalTotalSupply = await sCELO.totalSupply()
		assert.isTrue(finalTotalSupply.eq(toCancel))
		const a0finalSavings = await sCELO.balanceOf(a0)
		assert.isTrue(a0finalSavings.eq(toCancel))

		const finalLockedCELO = await lockedGold.getAccountTotalLockedGold(sCELO.address)
		assert.isTrue(finalLockedCELO.eq(toLock.div(2)))
		const a0finalBalance = await goldToken.balanceOf(a0)
		assert.closeTo(a0finalBalance.minus(a0startBalance.minus(toLock.div(2))).toNumber(), 0.0, 0.1e18) // Delta due to gas costs.
	})

})

export {}
