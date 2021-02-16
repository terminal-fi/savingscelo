import fs from "fs"

import axios from "axios"

async function main() {
	// TODO(zviad): verifying contracts still doesn't work on blockscout.
	// This is just a test script until then. Once blockscout API is fixed it can
	// support verifying for any of the networks.

	// TODO(zviad): run:
	// > npx truffle-flattener contracts/SavingsCELO.sol > /tmp/SavingsCELO.flat.sol
	const flattened = fs.readFileSync("/tmp/SavingsCELO.flat.sol").toString()
	try {
		// const resp = await axios.get(
		// 	"https://baklava-blockscout.celo-testnet.org/api?module=contract&action=listcontracts")
		// console.info(`List Contracts`, resp.data)

		await axios.post(
			"https://baklava-blockscout.celo-testnet.org/api?module=contract&action=verify", {
				addressHash: "0x87AF5A902c22917A821077C86EbD873Dc64524Fc",
				compilerVersion: "0.6.8",
				contractSourceCode: flattened,
				name: "SavingsCELO",
				optimization: false,
			},
		)
	} catch (e) {
		console.error(`Error:`, e.response?.data)
	}
}
main()
