import { CeloTransactionObject, CeloTx } from "@celo/connect"
import BigNumber from "bignumber.js"
import { TransactionReceipt } from "web3-core"

export async function sendTX(
	name: string,
	tx: CeloTransactionObject<unknown>,
	params?: Pick<CeloTx, "value">) {
	console.info(`Sending TX: ${name} ...`)
	const result = await tx.send(params)
	const hash = await result.getHash()
	console.info(`Waiting TX: ${hash} ...`)
	const receipt = await result.waitReceipt()
	console.info(`DONE`)
	return receipt
}

export function fmtValue(v: BigNumber.Value, toFixed?: number): string {
	return new BigNumber(v).div(1e18).toFixed(toFixed || 18)
}
