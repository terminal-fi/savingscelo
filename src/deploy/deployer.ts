#!/usr/bin/env node
import { program } from "commander"
import fs from "fs"
import path from "path"
import {ContractKit, newKit} from "@celo/contractkit"
import { AddressValidation, newLedgerWalletWithSetup } from "@celo/contractkit/lib/wallets/ledger-wallet"
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid"

import SavingsCELOJson from "../../build/contracts/SavingsCELO.json"
import SavingsCELOVoterV1Json from "../../build/contracts/SavingsCELOVoterV1.json"

process.on('unhandledRejection', (reason, _promise) => {
	// @ts-ignore
	console.error('Unhandled Rejection at:', reason.stack || reason)
	process.exit(0)
})

program
	.option("-n --network <name>", "Network to deploy to.")
	.parse()

const networks: {[key: string]: string} = {
	"alfajores": "https://alfajores-forno.celo-testnet.org",
	"baklava": "https://baklava-forno.celo-testnet.org",
}

const contractsPath = __filename.endsWith(".ts") ?
	path.join(__dirname, "..", "..", "src", "deploy") :
	path.join(__dirname, "..", "..", "..", "src", "deploy")

function contractAddress(
	network: string,
	contractName: string) {
	const fpath = path.join(contractsPath, `${network}.${contractName}.addr.json`)
	if (!fs.existsSync(fpath)) {
		return null
	}
	const data = JSON.parse(fs.readFileSync(fpath).toString())
	return data.address
}

function storeContractAddress(
	network: string,
	contractName: string,
	contractAddress: string) {
	fs.writeFileSync(
		path.join(contractsPath, `${network}.${contractName}.addr.json`),
		JSON.stringify({address: contractAddress}))
}

async function readOrDeployContract(
	kit: ContractKit,
	network: string,
	contractName: string,
	contractData: string) {

	let address = contractAddress(network, contractName)
	if (!address) {
		console.info("DEPLOYING:", contractName, "...")
		const receipt = await (await kit
			.sendTransaction({data: contractData}))
			.waitReceipt()
		address = receipt.contractAddress
		if (!address) {
			throw new Error("Contract address not found?")
		}
		storeContractAddress(network, contractName, address)
	}
	console.info("DEPLOYED:", contractName, "ADDRESS:", address)
	return address
}

async function main() {
	const opts = program.opts()
	const networkURL = networks[opts.network]
	if (!networkURL) {
		throw new Error(`Unsupported network: ${opts.network}`)
	}

	const transport = await TransportNodeHid.open('')
	const wallet = await newLedgerWalletWithSetup(
		transport,
		[0],
		undefined,
		AddressValidation.never)
	const kit = newKit(networkURL, wallet)
	kit.defaultAccount = wallet.getAccounts()[0]

	const contractSavingsCELO = await readOrDeployContract(
		kit, opts.network,
		"SavingsCELO",
		SavingsCELOJson.bytecode,
	)
	const contractSavingsCELOVoterV1 = await readOrDeployContract(
		kit, opts.network,
		"SavingsCELOVoterV1",
		SavingsCELOVoterV1Json.bytecode +
		kit.web3.eth.abi.encodeParameters(['address'], [contractSavingsCELO]).slice(2),
	)
}

main()