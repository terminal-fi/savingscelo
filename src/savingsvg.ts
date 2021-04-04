import { Address, ContractKit } from "@celo/contractkit"

import savingsCELOVGroupJson from "../build/contracts/SavingsCELOVoterV1.json"
import { SavingsCelovGroup } from "../types/web3-v1-contracts/SavingsCELOVGroup"

export class SavingsVG {
	public readonly contract: SavingsCelovGroup

	constructor(
		private kit: ContractKit,
		public contractAddress: Address) {
		this.contract = new kit.web3.eth.Contract(
			savingsCELOVGroupJson.abi as any, contractAddress) as unknown as SavingsCelovGroup
	}
}