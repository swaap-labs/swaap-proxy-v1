const Factory = artifacts.require('Factory');
const Pool = artifacts.require('Pool');
const IAggregatorV3 = artifacts.require('IAggregatorV3');
const web3 = require('web3')
const { toWei } = web3.utils;
const TToken = artifacts.require('TToken');
const MAX = web3.utils.toTwosComplement(-1);

async function createBalancedPool(tokenBalances, tokensAddresses, aggregatorsAddresses)
{
    let factory = await Factory.deployed();

    let POOL = await factory.newPool.call();
    await factory.newPool();
    let pool = await Pool.at(POOL);

    let latestPrices = []
    for (const [index, aggregatorAddress] of aggregatorsAddresses.entries()) {
        const tokenAggregator = await IAggregatorV3.at(aggregatorAddress);
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
        let tokenContract = await TToken.at(tokenAddress); 
        await tokenContract.approve(POOL, MAX);
        await pool.bindMMM(tokenAddress, toWei(tokenBalances[i].toString()), toWei(weights[i].toString()), aggregatorsAddresses[i]);
    }

    await pool.finalize();
    
    return pool;
}

module.exports = {
    createBalancedPool
};