const SavingsCELO = artifacts.require("SavingsCELO");

module.exports = function (deployer, network) {
	if (network !== "development") {
		throw new Error("unsupported network!")
	}
	const contracts = {
		"development": {
			Accounts: "0xd3771D58F901C5d50b093501f38659016863Eb6C",
			GoldToken: "0x4D3d5c850Dd5bD9D6F4AdDA3DD039a3C8054CA29",
			LockedGold: "0x54102fA75B2446837b2c7472d4b533366eCd2811",
			Election: "0xf7dD2415e4c140B305f2516DCbbB0613aFcd25C7",
		},
	}
	deployer.deploy(
		SavingsCELO,
		contracts[network].Accounts,
		contracts[network].GoldToken,
		contracts[network].LockedGold,
		contracts[network].Election);
} as Truffle.Migration;

export {}