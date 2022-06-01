const { tokenOraclePairs } = require('./token-oracle-pairs');

const IAggregatorV3 = artifacts.require("IAggregatorV3");
const IToken = artifacts.require("IToken");

const Pool = artifacts.require("Pool");
const Proxy = artifacts.require("Proxy");
const assert = require("assert");

/* ------------------------------------- Pool Configuration ------------------------------------- */
// network id
const networkId = 137;

// Tokens and weights
const tokens = ["WETH", "USDC", "WBTC"];
const weights = [10, 10, 10];

// Quote currency
const quote = "USD";

// initial TVL in quote currency (i.e. in USD if oracle prices are in USD)
const TVL = 1000;

// pool parameters
const params = [
    publicSwap = true,
    priceStatisticsLookbackInRound = '5',
    dynamicCoverageFeesZ = web3.utils.toWei('1.5'),
    swapFee = web3.utils.toWei('0.00025'),
    priceStatisticsLookbackInSec = '900',
    dynamicCoverageFeesHorizon = web3.utils.toWei('60'),
];

const isFinalized = true;

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS_POLYGON;
const PROXY_ADDRESS = process.env.PROXY_ADDRESS_POLYGON;
const newController = process.env.NEW_CONTROLLER_POLYGON;
const gasPrice = process.env.GAS_PRICE_WEI;

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
        {from: sender, gasPrice: gasPrice}
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
    if(newController !== undefined && newController.length == 42) {
        pool.transferOwnership(newController, {from: sender});
        console.log(`Controller ownership request sent to ${newController}`);
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
        const tokenContract = await IToken.at(tokenOraclePairs[token].token);
        const tokenDecimals = (await tokenContract.decimals.call()).toNumber();
        const tokenAggregator = await IAggregatorV3.at(tokenOraclePairs[token].oracles[quote]);
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
        const tokenContract = await IToken.at(tokenOraclePairs[token].token);
        const balanceInDecimals = maxBalances[index];
        console.log(`Approving proxy to use ${balanceInDecimals} ${token}`);

        await tokenContract.approve(
            PROXY_ADDRESS,
            balanceInDecimals,
            {from: sender, gasPrice: gasPrice}
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

    let coverageParams = await pool.getCoverageParameters.call()
    assert.equal((await pool.getSwapFee.call()).toString(), params[3]); // swap fee
    assert.equal(coverageParams[0].toString(), params[2]); // dynamicCoverageFeesZ
    assert.equal(coverageParams[1].toString(), params[5]); // dynamicCoverageFeesHorizon
    assert.equal(coverageParams[2].toString(), params[1]); // priceStatisticsLookbackInRound
    assert.equal(coverageParams[3].toString(), params[4]); // priceStatisticsLookbackInSec
    assert.equal((await pool.isPublicSwap.call()), params[0]) // isPublic
    assert.equal((await pool.isFinalized.call()), isFinalized); // isFinalized

    for (const [index, token] of tokens.entries()) {
        const balance = web3.utils.fromWei(await pool.getBalance.call(tokenOraclePairs[token].token));
        const weight = web3.utils.fromWei(await pool.getDenormalizedWeight.call(tokenOraclePairs[token].token));
        const oracle = await pool.getTokenPriceOracle.call(tokenOraclePairs[token].token);
        
        const tokenAggregator = await IAggregatorV3.at(tokenOraclePairs[token].oracles[quote]);
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