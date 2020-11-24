#!/usr/bin/env node
import { toWei } from "web3-utils"
import { program } from "commander"
import BigNumber from "bignumber.js"
import { CeloTransactionObject, ContractKit, newKit } from "@celo/contractkit"
import { AddressValidation, LedgerWallet, newLedgerWalletWithSetup } from "@celo/contractkit/lib/wallets/ledger-wallet"
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid"


import { SavingsKit } from "./savingskit"

process.on('unhandledRejection', (reason, _promise) => {
	// @ts-ignore
	console.error('Unhandled Rejection at:', reason.stack || reason)
	process.exit(0)
})

// TODO(zviad): add support for Ledger.
program
	.option("-n --network <url>", "Celo network to connect to", "http://127.0.0.1:7545")
	.option("--contract <address>", "SavingsCELO contract address", "0x231eDcC0010ECA04796f00b6D6137d66F9FF2818")
	.option("-f --from <address>", "Account address")
	.option("-i --ledger-idx <index>",
		"Use account from a Ledger hardware wallet. " +
		"It will use standard celo address derivation path of: \"44'/52752'/0'/0\"")

async function initKit() {
	const opts = program.opts()
	if (opts.from !== undefined && opts.ledgerIdx !== undefined) {
		console.error(`Only one of --from or --ledger-idx flags can be used!`)
		process.exit(1)
	}
	let fromAddr = opts.from
	let wallet
	if (opts.ledgerIdx !== undefined) {
		try {
			const transport = await TransportNodeHid.open('')
			wallet = await newLedgerWalletWithSetup(
				transport,
				[Number.parseInt(opts.ledgerIdx)],
				undefined,
				AddressValidation.never)
		} catch (e) {
			console.error(`Check if the Ledger is connected and if the Celo app is open!`)
			throw e
		}
		fromAddr = wallet.getAccounts()[0]
		console.info(`Ledger Account: ${fromAddr}`)
	}
	const kit = newKit(opts.network, wallet)
	const savingsKit = new SavingsKit(kit, opts.contract)
	kit.defaultAccount = fromAddr
	return {kit, savingsKit}
}

async function sendTX(name: string, tx: CeloTransactionObject<unknown>) {
	console.info(`Sending TX: ${name} ...`, tx)
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
		const {kit, savingsKit} = await initKit()
		const goldToken = await kit.contracts.getGoldToken()
		const allowance = await goldToken.allowance(kit.defaultAccount!, savingsKit.contractAddress)
		const toDeposit = toWei(value, 'ether')
		if (allowance.lt(toDeposit)) {
			await sendTX(
				'APPROVE SavingsCELO',
				goldToken.approve(savingsKit.contractAddress, new BigNumber(1e35).toFixed(0)))
		}
		await sendTX('DEPOSIT', savingsKit.deposit(toDeposit))
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
		const {kit, savingsKit} = await initKit()
		const savingsBalance = await savingsKit.contract.methods.balanceOf(kit.defaultAccount!).call()
		const savingsAsCELO = await savingsKit.contract.methods.savingsToCELO(savingsBalance).call()
		console.info(`SavingsCELO: ${fmtValue(savingsBalance)} (~= ${fmtValue(savingsAsCELO, 2)} CELO)`)
		printPendingWithdrawals(kit, savingsKit)
	})

program
	.command("withdraw:start <SavingsCELO amount>")
	.description("Start withdraw process to convert SavingsCELO back to CELO.")
	.action(async (value: string) => {
		const {kit, savingsKit} = await initKit()
		await sendTX('WITHDRAW', await savingsKit.withdrawStart(toWei(value, 'ether')))
		printPendingWithdrawals(kit, savingsKit)
	})

program
	.command("withdraw:cancel <index>")
	.description("Cancel withdraw process.")
	.action(async (index: string) => {
		const {kit, savingsKit} = await initKit()
		const pendings = await savingsKit.pendingWithdrawals(kit.defaultAccount!)
		await sendTX('WITHDRAW:Cancel', await savingsKit.withdrawCancel(pendings, Number.parseInt(index)))
	})

program
	.command("withdraw:finish <index>")
	.description("Finish withdraw process.")
	.action(async (index: string) => {
		const {kit, savingsKit} = await initKit()
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