import { Address, ContractKit } from "@celo/contractkit";

export async function createAccounts(
	kit: ContractKit,
	source: Address,
	amounts: string[]): Promise<Address[]> {

	const goldToken = await kit.contracts.getGoldToken()
	const addrs: Address[] = []
	for (const amount of amounts) {
		const addr = await kit.web3.eth.personal.newAccount("")
		await kit.web3.eth.personal.unlockAccount(addr, "", 0)
		await goldToken
			.transfer(addr, amount)
			.sendAndWaitForReceipt({from: source} as any)
		addrs.push(addr)
	}
	return addrs
}