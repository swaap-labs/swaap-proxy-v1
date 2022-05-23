const { wnative_addresses } = require("./constants/wnative_addresses");
const Proxy = artifacts.require("Proxy");
const index = process.env.ACCOUNT_INDEX;

module.exports = async function (deployer, network, accounts) {
	
    const wnative = wnative_addresses[network];

    if (wnative === undefined || wnative.length != 42) {
        console.log("wnative token undefined, skipping proxy deployment");
    } else {
        if (index === undefined) {
            throw "Undefined account index";
        }
        let gasPrice = await web3.eth.getGasPrice();
        let proxy = await deployer.deploy(Proxy, wnative, {gasPrice:gasPrice});
        console.log(`Proxy address: ${proxy.address}`);
    }

};