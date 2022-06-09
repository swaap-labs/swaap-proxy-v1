const Math = artifacts.require("Math");
const GeometricBrownianMotionOracle = artifacts.require("GeometricBrownianMotionOracle");
const Factory = artifacts.require("Factory");

module.exports = async function (deployer,network, accounts) {

	// Factory only deployed from test
	if(network === undefined || network == "test" || network === "dev-fork" || network === "dev") {
		deployer.deploy(GeometricBrownianMotionOracle);
		deployer.link(GeometricBrownianMotionOracle, Math);
		deployer.deploy(Math);
		deployer.link(Math, Factory);
		deployer.deploy(Factory);
	}
	
};