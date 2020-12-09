import fs from "fs"
import path from "path"

import axios from "axios"

async function main() {
	const flattened = fs.readFileSync(path.join(__dirname, "..", "..", "flat.sol")).toString()
	try {
		// const resp = await axios.get(
		// 	"https://baklava-blockscout.celo-testnet.org/api?module=contract&action=listcontracts")
		// console.info(`List Contracts`, resp.data)

		await axios.post(
			"https://baklava-blockscout.celo-testnet.org/api?module=contract&action=verify", {
				addressHash: "0x87AF5A902c22917A821077C86EbD873Dc64524Fc",
				compilerVersion: "0.6.2",
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