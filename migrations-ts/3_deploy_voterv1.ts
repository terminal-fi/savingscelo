const SavingsCELO = artifacts.require("SavingsCELO");
const SavingsCELOVoterV1 = artifacts.require("SavingsCELOVoterV1");

module.exports = function (deployer) {
	deployer.deploy(SavingsCELOVoterV1, SavingsCELO.address)
	SavingsCELO.deployed().then((savingsCELO) => {
		savingsCELO.authorizeVoterProxy(SavingsCELOVoterV1.address)
	})
} as Truffle.Migration;

export {}