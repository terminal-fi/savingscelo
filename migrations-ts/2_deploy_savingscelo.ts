const SavingsCELO = artifacts.require("SavingsCELO");
const SavingsCELOVoterV1 = artifacts.require("SavingsCELOVoterV1");

module.exports = function (deployer) {
	deployer.deploy(SavingsCELO)
	deployer.deploy(SavingsCELOVoterV1, SavingsCELO.address)
} as Truffle.Migration;

export {}