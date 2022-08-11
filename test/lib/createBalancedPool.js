const Factory = artifacts.require('Factory');
const Pool = artifacts.require('Pool');
const AggregatorV3Interface = artifacts.require('AggregatorV3Interface');
const web3 = require('web3')
const { toWei } = web3.utils;
const IERC20WithDecimals = artifacts.require('IERC20WithDecimals');
const MAX = web3.utils.toTwosComplement(-1);

async function createBalancedPool(tokenBalances, tokensAddresses, aggregatorsAddresses, factory)
{
    let POOL = await factory.newPool.call();
    await factory.newPool();
    let pool = await Pool.at(POOL);

    let latestPrices = []
    for (const [index, aggregatorAddress] of aggregatorsAddresses.entries()) {
        const tokenAggregator = await AggregatorV3Interface.at(aggregatorAddress);
        latestPrices.push(((await tokenAggregator.latestRoundData.call()).answer).toNumber());
    }

    // Assume lead weight = 5
    const leadWeight = 5.0;
    let weights = [];
    weights.push(leadWeight);

    for (let i = 1; i < tokensAddresses.length; i++) {
        weights.push((latestPrices[i]*tokenBalances[i]*leadWeight)/(latestPrices[0]*tokenBalances[0]));
    }

    for (let [i, tokenAddress] of tokensAddresses.entries()) {
        let tokenContract = await IERC20WithDecimals.at(tokenAddress);
        await tokenContract.approve(POOL, MAX);
        await pool.bindMMM(tokenAddress, toWei(tokenBalances[i].toString()), toWei(weights[i].toString()), aggregatorsAddresses[i]);
    }

    await pool.finalize();
    
    return pool;
}

module.exports = {
    createBalancedPool
};