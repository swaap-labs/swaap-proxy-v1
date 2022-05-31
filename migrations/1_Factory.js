const Num = artifacts.require("Num");
const Math = artifacts.require("Math");
const GeometricBrownianMotionOracle = artifacts.require("GeometricBrownianMotionOracle");
const Factory = artifacts.require("Factory");

module.exports = async function (deployer,network, accounts) {

	// Factory only deployed from test
	if(network === undefined || network == "test" || network === "dev-fork" || network === "dev") {
		deployer.deploy(Num);
		deployer.link(Num, GeometricBrownianMotionOracle);
		deployer.deploy(GeometricBrownianMotionOracle);
		deployer.link(Num, Math);
		deployer.link(GeometricBrownianMotionOracle, Math);
		deployer.deploy(Math);
		deployer.link(Math, Factory);
		deployer.link(Num, Factory);
		deployer.deploy(Factory);
	}
	
};