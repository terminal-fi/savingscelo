#!/usr/bin/env node
import { CeloTransactionObject, ContractKit, newKit } from "@celo/contractkit"
import { toWei } from "web3-utils"
import { program } from "commander"
import { SavingsKit } from "./savingskit"
import BigNumber from "bignumber.js"

process.on('unhandledRejection', (reason, _promise) => {
	// @ts-ignore
	console.error('Unhandled Rejection at:', reason.stack || reason)
	process.exit(0)
})

program
	.option("-n --network <url>", "Celo network to connect to", "http://127.0.0.1:7545")
	.option("--contract <address>", "SavingsCELO contract address", "0x6ee7F5347120e43c1dB116dd140a3173D5f899E8")
	.option("-f --from <address>", "Account address")

function initKit() {
	const opts = program.opts()
	const kit = newKit(opts.network)
	const savingsKit = new SavingsKit(kit, opts.contract)
	kit.defaultAccount = opts.from
	return {kit, savingsKit}
}

async function sendTX(name: string, tx: CeloTransactionObject<unknown>) {
	console.info(`Sending TX: ${name} ...`)
	const result = await tx.send()
	const hash = await result.getHash()
	console.info(`Waiting TX: ${hash} ...`)
	const receipt = await result.waitReceipt()
	console.info(`DONE`)
	return receipt
}

function fmtValue(v: BigNumber.Value, toFixed?: number): string {
	return new BigNumber(v).div(1e18).toFixed(toFixed || 18)
}

program
	.command("deposit <CELO amount>")
	.description("Deposit CELO to SavingsCELO contract.")
	.action(async (value: string) => {
		const {kit, savingsKit} = initKit()
		const goldToken = await kit.contracts.getGoldToken()
		const allowance = await goldToken.allowance(kit.defaultAccount!, savingsKit.contractAddress)
		if (allowance.lt(value)) {
			await sendTX(
				'ALLOW SavingsCELO',
				goldToken.increaseAllowance(savingsKit.contractAddress, '1e35'))
		}
		await sendTX('DEPOSIT', savingsKit.deposit(toWei(value, 'ether')))
	})

async function printPendingWithdrawals(kit: ContractKit, savingsKit: SavingsKit) {
	const pendings = await savingsKit.pendingWithdrawals(kit.defaultAccount!)
	if (pendings.length === 0) {
		console.info(`No pending withdrawals.`)
	} else {
		console.info(`Pending Withdrawals:`)
		for (let idx = 0; idx < pendings.length; idx += 1) {
			const pending = pendings[idx]
			const timestamp = new Date(pending.time.multipliedBy(1000).toNumber())
			console.info(`${idx}:`)
			console.info(`  ready: ${timestamp.toLocaleString()}`)
			console.info(`  value: ${fmtValue(pending.value)} CELO`)
		}
	}
}

program
	.command("balance")
	.description("Display SavingsCELO balance, and pending withdrawals")
	.action(async () => {
		const {kit, savingsKit} = initKit()
		const savingsBalance = await savingsKit.contract.methods.balanceOf(kit.defaultAccount!).call()
		const savingsAsCELO = await savingsKit.contract.methods.savingsToCELO(savingsBalance).call()
		console.info(`SavingsCELO: ${fmtValue(savingsBalance)} (~= ${fmtValue(savingsAsCELO, 2)} CELO)`)
		printPendingWithdrawals(kit, savingsKit)
	})

program
	.command("withdraw:start <SavingsCELO amount>")
	.description("Start withdraw process to convert SavingsCELO back to CELO.")
	.action(async (value: string) => {
		const {kit, savingsKit} = initKit()
		await sendTX('WITHDRAW', await savingsKit.withdrawStart(toWei(value, 'ether')))
		printPendingWithdrawals(kit, savingsKit)
	})

program
	.command("withdraw:cancel <index>")
	.description("Cancel withdraw process.")
	.action(async (index: string) => {
		const {kit, savingsKit} = initKit()
		const pendings = await savingsKit.pendingWithdrawals(kit.defaultAccount!)
		await sendTX('WITHDRAW:Cancel', await savingsKit.withdrawCancel(pendings, Number.parseInt(index)))
	})

program
	.command("withdraw:finish <index>")
	.description("Finish withdraw process.")
	.action(async (index: string) => {
		const {kit, savingsKit} = initKit()
		const pendings = await savingsKit.pendingWithdrawals(kit.defaultAccount!)
		const idx = Number.parseInt(index)
		const pendingReady = new Date(pendings[idx].time.multipliedBy(1000).toNumber())
		if (pendingReady > new Date()) {
			console.error(`Pending withdrawal not yet ready! Available on: ${pendingReady.toLocaleString()}`)
			process.exit(1)
		}
		await sendTX('WITHDRAW:Finish', await savingsKit.withdrawFinish(pendings, idx))
	})

async function main() {
	await program.parseAsync(process.argv)
}
main()