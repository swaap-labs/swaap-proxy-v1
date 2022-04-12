const Num = artifacts.require("Num");
const Math = artifacts.require("Math");
const GeometricBrownianMotionOracle = artifacts.require("GeometricBrownianMotionOracle");
const Factory = artifacts.require("Factory");
// const { createBalancedPool } = require('../test/lib/createBalancedPoolRinkeby');

module.exports = async function (deployer,network, accounts) {
	deployer.deploy(Num);
	deployer.link(Num, GeometricBrownianMotionOracle);
	deployer.deploy(GeometricBrownianMotionOracle);
	deployer.link(Num, Math);
	deployer.link(GeometricBrownianMotionOracle, Math);
	deployer.deploy(Math);
	deployer.link(Math, Factory);
	deployer.link(Num, Factory);
	let FACTORY;
	await deployer.deploy(Factory).then(() => Factory.deployed())
    .then(_instance => FACTORY = _instance.address);
	
	/*
	if (network === "rinkeby"){
		let WNATIVE = "0xc778417e063141139fce010982780140aa0cd5ab"
        deployer.deploy(Proxy, FACTORY, WNATIVE);
		let WETH = "0x4848683f3cC566E3588bFd6953FaAA7176968965";
		let DAI = "0x0aBABf7Cd9De9508D1B69B2dd2d374fA88d384d3";
		let WBTC = "0xead28cb59D01ad96c9CEEb486380FB514253f8eD";
		let admin = accounts[0];
		let pool = await createBalancedPool("rinkeby", FACTORY, 300, 900000, 20, WETH, DAI, WBTC, admin);
		console.log("Pool: ");
		console.log(pool.address);
		console.log("Proxy: ");
		console.log(proxy.address);
	}
	*/
};