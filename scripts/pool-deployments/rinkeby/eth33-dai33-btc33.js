const { tokenOraclePairs } = require('./token-oracle-pairs');

const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");
const IERC20WithDecimals = artifacts.require("IERC20WithDecimals");

const Pool = artifacts.require("Pool");
const Proxy = artifacts.require("Proxy");
const assert = require("assert");

/* ------------------------------------- Pool Configuration ------------------------------------- */
// network id
const networkId = 4;

// Tokens and weights
const tokens = ["WETH", "DAI", "WBTC"];
const weights = [10, 10, 10];

// Quote currency
const quote = "USD";

// initial TVL in quote currency (i.e. in USD if oracle prices are in USD)
const TVL = 10000;

// pool parameters
const params = [
    publicSwap = true,
    swapFee = web3.utils.toWei('0.00025'),
    priceStatisticsLookbackInRound = '5',
    dynamicCoverageFeesZ = web3.utils.toWei('1.5'),
    dynamicCoverageFeesHorizon = web3.utils.toWei('60'),
    priceStatisticsLookbackInSec = '900'
];

const isFinalized = true;

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS_RINKEBY;
const PROXY_ADDRESS = process.env.PROXY_ADDRESS_RINKEBY;
const NEW_CONTROLLER = process.env.NEW_CONTROLLER_RINKEBY;
const GAS_PRICE = process.env.GAS_PRICE_WEI_RINKEBY;

LOG_NEW_POOL_SIGN = "0x8ccec77b0cb63ac2cafd0f5de8cdfadab91ce656d262240ba8a6343bccc5f945"

/* ---------------------------------------------------------------------------------------------- */

async function main(){

    const [sender, FACTORY_ADDRESS, PROXY_ADDRESS] = await getEnvVariables();

    const maxBalances = await getMaxBalancesGivenTVL();

    await setApprovals(sender, PROXY_ADDRESS, maxBalances);

    // building bind tokens parameters
    const bindTokens = buildBindTokens(maxBalances);

    // transaction deadline is set to 10 minutes
    const maxDeadline = Math.floor(Date.now()/1000) + 60*10;

    const proxy = await Proxy.at(PROXY_ADDRESS);

    const tx = await proxy.createBalancedPoolWithParams(
        bindTokens,
        params,
        FACTORY_ADDRESS,
        isFinalized,
        maxDeadline,
        {from: sender, gasPrice: GAS_PRICE}
    );
    let poolAddress;
    for (let i = 0; i < tx.receipt.rawLogs.length; i++) {
    	if (tx.receipt.rawLogs[i].topics[0] == LOG_NEW_POOL_SIGN) {
    		poolAddress = "0x" + tx.receipt.rawLogs[i].topics[2].slice(26);
    		break;
    	}
    }

    if (poolAddress == undefined) {
    	throw ("null pool's address")
    }
    console.log("pool's address:", poolAddress)

    const pool = await Pool.at(poolAddress);

    // Set transfer ownership
    if(NEW_CONTROLLER !== undefined && NEW_CONTROLLER.length == 42) {
        pool.transferOwnership(NEW_CONTROLLER, {from: sender});
        console.log(`Controller ownership request sent to ${NEW_CONTROLLER}`);
    }

    await assertParameters(pool);

    console.log("\n You are all setup :)")
    console.log(`\n Pool's address: ${poolAddress}`);
}

// Gets maxAmountsIn of the non-leading tokens
async function getMaxBalancesGivenTVL() {
    // sum of weights
    totalWeight = weights.reduce((partialSum, a) => partialSum + a, 0);
    const slippageTolerance = web3.utils.toBN(1010); // 1%
    let maximumBalances = [];

    for (const [index, token] of tokens.entries()) {
        const tokenContract = await IERC20WithDecimals.at(tokenOraclePairs[token].token);
        const tokenDecimals = (await tokenContract.decimals.call()).toNumber();
        const tokenAggregator = await AggregatorV3Interface.at(tokenOraclePairs[token].oracles[quote]);
        const oracleDecimals = (await tokenAggregator.decimals.call()).toNumber();
        const oraclePrice = ((await tokenAggregator.latestRoundData.call()).answer).toNumber();

        let tokenMaxBalance = web3.utils.toBN(TVL)
			.mul(web3.utils.toBN(10).pow(web3.utils.toBN(tokenDecimals+oracleDecimals)))
			.mul(web3.utils.toBN(web3.utils.toBN(weights[index])))
        	.div(web3.utils.toBN(oraclePrice).mul(web3.utils.toBN(totalWeight)))

        if(index > 0) {
            tokenMaxBalance = tokenMaxBalance.mul(slippageTolerance).div(web3.utils.toBN(1000));
        }

        maximumBalances.push(tokenMaxBalance);
    }

    return maximumBalances;
}

async function getEnvVariables() {
    const accounts = await web3.eth.getAccounts();
    const ACCOUNT_INDEX = Number(process.env.ACCOUNT_INDEX);
    if(ACCOUNT_INDEX === undefined){
        throw 'Account index is undefined';
    }
    // if account index is setup, truffle will set this address as account 0
    const sender = accounts[0];

    if(FACTORY_ADDRESS == undefined){
        throw 'Factory address is undefined';
    }

    if(PROXY_ADDRESS == undefined){
        throw 'Proxy address is undefined';
    }

    return [sender, FACTORY_ADDRESS, PROXY_ADDRESS];
}

async function setApprovals(sender, PROXY_ADDRESS, maxBalances) {

    for (const [index, token] of tokens.entries()) {
        const tokenContract = await IERC20WithDecimals.at(tokenOraclePairs[token].token);
        const balanceInDecimals = maxBalances[index];
        console.log(`Approving proxy to use ${balanceInDecimals} ${token}`);

        await tokenContract.approve(
            PROXY_ADDRESS,
            balanceInDecimals,
            {from: sender, gasPrice: GAS_PRICE}
        );
    }

    console.log("Successfully approved all tokens");

}

function buildBindTokens(maxBalances) {
    let bindTokens = []

    for (const [index, token] of tokens.entries()) {
        const bindToken = [
            tokenOraclePairs[token].token,
            maxBalances[index],
            web3.utils.toWei(String(weights[index])),
            tokenOraclePairs[token].oracles[quote]
        ];
        bindTokens.push(bindToken);
    }
    
    return bindTokens;
}

async function assertParameters(pool) {
    // Check parameters
    console.log("\nChecking deployed pool's parameters");

    assert.equal((await pool.isPublicSwap.call()), params[0]) // isPublic
    assert.equal((await pool.getSwapFee.call()).toString(), params[1]); // swap fee

    let coverageParams = await pool.getCoverageParameters.call()
    assert.equal(coverageParams.priceStatisticsLBInRound.toString(), params[2]); // priceStatisticsLookbackInRound
    assert.equal(coverageParams.dynamicCoverageFeesZ.toString(), params[3]); // dynamicCoverageFeesZ
    assert.equal(coverageParams.dynamicCoverageFeesHorizon.toString(), params[4]); // dynamicCoverageFeesHorizon
    assert.equal(coverageParams.priceStatisticsLBInSec.toString(), params[5]); // priceStatisticsLookbackInSec
    
    assert.equal((await pool.isFinalized.call()), isFinalized); // isFinalized

    for (const [index, token] of tokens.entries()) {
        const balance = web3.utils.fromWei(await pool.getBalance.call(tokenOraclePairs[token].token));
        const weight = web3.utils.fromWei(await pool.getDenormalizedWeight.call(tokenOraclePairs[token].token));
        const oracle = await pool.getTokenPriceOracle.call(tokenOraclePairs[token].token);
        
        const tokenAggregator = await AggregatorV3Interface.at(tokenOraclePairs[token].oracles[quote]);
        const oracleDecimals = await tokenAggregator.decimals();
        const oraclePrice = (await pool.getTokenOracleInitialPrice.call(tokenOraclePairs[token].token)).toNumber() / (10**oracleDecimals);

        assert.equal(weight, weights[index]);
        assert.equal(oracle, tokenOraclePairs[token].oracles[quote]);
        console.log(`${token}'s balance: ${balance}, weight: ${weight}, initial oracle price: ${oraclePrice}`);
    }
}

module.exports = async function(callback) {

    const detectedNetworkId = await web3.eth.net.getId();

    if (detectedNetworkId !== networkId) {
        throw 'Wrong network Id';
    }

    main().then(() => callback()).catch(err => callback(err));
}