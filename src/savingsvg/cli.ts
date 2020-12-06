#!/usr/bin/env node
import { toWei } from "web3-utils"
import { program } from "commander"
import { newKit } from "@celo/contractkit"
import { AddressValidation, newLedgerWalletWithSetup } from "@celo/contractkit/lib/wallets/ledger-wallet"
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid"
import { toTransactionObject } from "@celo/contractkit/lib/wrappers/BaseWrapper"
import { SavingsCELOVGroup } from "../../types/web3-v1-contracts/SavingsCELOVGroup"

import savingsCELOVGroupJson from "../../build/contracts/SavingsCELOVGroup.json"
import { sendTX } from "../cli-utils"

process.on('unhandledRejection', (reason, _promise) => {
	// @ts-ignore
	console.error('Unhandled Rejection at:', reason.stack || reason)
	process.exit(0)
})

program
	.option("-n --network <url>", "Celo network to connect to", "https://forno.celo.org")
	.option("-f --from <address>", "Account address")
	.option("-i --ledger-idx <index>",
		"If provided, will use account from a Ledger hardware wallet. " +
		"Uses standard celo address derivation path of: \"44'/52752'/0'/0\"")

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
			process.exit(1)
		}
		fromAddr = wallet.getAccounts()[0]
		console.info(`Ledger Account: ${fromAddr}`)
	}
	const kit = newKit(opts.network, wallet)
	kit.defaultAccount = fromAddr

	const networkId = await kit.web3.eth.getChainId()
	let contractAddr
	switch (networkId) {
	case 1337:
		contractAddr = require("../deploy/ganache.SavingsCELOVGroup.addr.json").address
		break
	// case 44787:
	// 	contractAddr = alfajoresSavingsCELO.address
	// 	break
	// case 62320:
	// 	contractAddr = baklavaSavingsCELO.address
	// 	break
	default:
		throw new Error(`Unsupport networkId: ${networkId}`)
	}
	const savingsVG = new kit.web3.eth.Contract(
		savingsCELOVGroupJson.abi as any, contractAddr) as unknown as SavingsCELOVGroup
	return {kit, savingsVG}
}

program
	.command("lock <amount>")
	.description("Lock CELO")
	.action(async (value: string) => {
		const {kit, savingsVG} = await initKit()
		const txo = toTransactionObject(kit, savingsVG.methods.lockGold(toWei(value, 'ether')))
		await sendTX(`LOCK: ${value} CELO`, txo)
	})

program
	.command("unlock <amount>")
	.description("Unlock CELO")
	.action(async (value: string) => {
		const {kit, savingsVG} = await initKit()
		const txo = toTransactionObject(kit, savingsVG.methods.unlockGold(toWei(value, 'ether')))
		await sendTX(`UNLOCK: ${value} CELO`, txo)
	})

program
	.command("authorize:vote")
	.option("--signer <address>", "New vote signer address")
	.option("--signature <signature>", "Proof-of-possession signature")
	.description("Authorize new vote signer")
	.action(async (opts) => {
		const {kit, savingsVG} = await initKit()
		const accounts = await kit.contracts.getAccounts()
		const pop = accounts.parseSignatureOfAddress(savingsVG.options.address, opts.signer, opts.signature)
		const txo = toTransactionObject(kit, savingsVG.methods.authorizeVoteSigner(opts.signer, pop.v, pop.r, pop.s))
		await sendTX(`AUTHORIZE:VOTE ${opts.signer}`, txo)
	})

program
	.command("authorize:validator")
	.option("--signer <address>", "New vote signer address")
	.option("--signature <signature>", "Proof-of-possession signature")
	.description("Authorize new validator signer")
	.action(async (opts) => {
		const {kit, savingsVG} = await initKit()
		const accounts = await kit.contracts.getAccounts()
		const pop = accounts.parseSignatureOfAddress(savingsVG.options.address, opts.signer, opts.signature)
		const txo = toTransactionObject(kit, savingsVG.methods.authorizeValidatorSigner(opts.signer, pop.v, pop.r, pop.s))
		await sendTX(`AUTHORIZE:VALIDATOR ${opts.signer}`, txo)
	})


program
	.command("contracts")
	.description("Display addresses for SavingsCELO contracts")
	.action(async () => {
		const {savingsVG} = await initKit()
		const savingsCELOAddr = await savingsVG.methods._savingsCELO().call()
		console.info(`SavingsCELO               :`, savingsCELOAddr)
		console.info(`SavingsCELO ValidatorGroup:`, savingsVG.options.address)
	})

async function main() {
	await program.parseAsync(process.argv)
}
main()