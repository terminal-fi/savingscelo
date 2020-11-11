import { newKit } from "@celo/contractkit"
import { increaseTime } from "celo-devchain"

const SavingsCELO = artifacts.require("SavingsCELO");

contract('SavingsCELO', (accounts) => {
	// it(`locking and unlocking`, async () => {
	// 	const kit = newKit("http://127.0.0.1:7545")
	// 	const goldToken = await kit.contracts.getGoldToken()
	// 	const lockedGold = await kit.contracts.getLockedGold()
	// 	const a0 = accounts[0]
	// 	const a1 = accounts[1]
	// 	const a2 = accounts[2]

	// 	const balanceA0 = await goldToken.balanceOf(a0)
	// 	const balanceA1 = await goldToken.balanceOf(a1)
	// 	const balanceA2 = await goldToken.balanceOf(a2)

	// 	const instance = await HelloContract.deployed()

	// 	// Allow HelloContract to transfer 10 CELO from `a0`, and call Lock function on it.
	// 	let tx = await goldToken.increaseAllowance(instance.address, 10e18.toFixed(0))
	// 	await tx.sendAndWaitForReceipt({from: a0} as any)
	// 	await instance.Lock(10e18.toFixed(0), {from: a0})

	// 	// Anyone can call Unlock.
	// 	await instance.Unlock(3e18.toFixed(0), {from: a1})
	// 	await instance.Unlock(7e18.toFixed(0), {from: a2})

	// 	const pendings = await lockedGold.getPendingWithdrawals(instance.address)
	// 	assert.lengthOf(pendings, 2)
	// 	assert.equal(pendings[0].value.toNumber(), 3e18)
	// 	assert.equal(pendings[1].value.toNumber(), 7e18)

	// 	// Make sure unlock period passes.
	// 	await increaseTime(kit.web3.currentProvider as any, 3 * 24 * 3600 + 1)

	// 	// Anyone can withdraw anything..., `a1` gets +7 CELO, `a2` gets +3 CELO.
	// 	await instance.Withdraw(1, {from: a1})
	// 	await instance.Withdraw(0, {from: a2})

	// 	const contractCELO = await goldToken.balanceOf(instance.address)
	// 	const contractLockedCELO = await lockedGold.getAccountTotalLockedGold(instance.address)
	// 	assert.equal(contractCELO.toNumber(), 0)
	// 	assert.equal(contractLockedCELO.toNumber(), 0)

	// 	const finalBalanceA0 = await goldToken.balanceOf(a0)
	// 	const finalBalanceA1 = await goldToken.balanceOf(a1)
	// 	const finalBalanceA2 = await goldToken.balanceOf(a2)
	// 	assert.closeTo(finalBalanceA0.toNumber(), balanceA0.minus(10e18).toNumber(), 0.1e18) // Delta comes from Gas costs.
	// 	assert.closeTo(finalBalanceA1.toNumber(), balanceA1.plus(7e18).toNumber(), 0.1e18)
	// 	assert.closeTo(finalBalanceA2.toNumber(), balanceA2.plus(3e18).toNumber(), 0.1e18)
	// })
})

export {}
