const Factory = artifacts.require('Factory');
const Pool = artifacts.require('Pool');
const TPriceConsumerV3 = artifacts.require('TPriceConsumerV3');
const Decimal = require('decimal.js');
const web3 = require('web3')
const { toWei } = web3.utils;
const TToken = artifacts.require('TToken');
const MAX = web3.utils.toTwosComplement(-1);

async function createBalancedPool(ganacheNetwork, ethBalance, daiBalance, btcBalance, WETH, DAI, WBTC) {
    let factory = await Factory.deployed();

    let POOL = await factory.newPool.call();
    await factory.newPool();
    let pool = await Pool.at(POOL);

    let weth = await TToken.at(WETH);
    let dai = await TToken.at(DAI);
    let wbtc = await TToken.at(WBTC);

    // dev network should be a ganache client forked from ethereum or polygon's mainnet
    let ETHAggregatorAddress;
    let DAIAggregatorAddress;
    let BTCAggregatorAddress;

    if (ganacheNetwork === 'ethereum') {
        // Agrregators on ethereum's mainnet
        ETHAggregatorAddress = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
        DAIAggregatorAddress = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
        BTCAggregatorAddress = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
    } else if (ganacheNetwork === 'polygon'){
        // Agrregators on polygon's mainnet
        ETHAggregatorAddress = '0xF9680D99D6C9589e2a93a78A04A279e509205945';
        DAIAggregatorAddress = '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D';
        BTCAggregatorAddress = '0xc907E116054Ad103354f2D350FD2514433D57F6f';
    } else if (ganacheNetwork === 'rinkeby'){
        // Agrregators on polygon's mainnet
        ETHAggregatorAddress = '0x8A753747A1Fa494EC906cE90E9f37563A8AF630e';
        DAIAggregatorAddress = '0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF';
        BTCAggregatorAddress = '0xECe365B379E1dD183B20fc5f022230C044d51404';
    }

    let ETHAggregator = await TPriceConsumerV3.at(ETHAggregatorAddress);
    let DAIAggregator = await TPriceConsumerV3.at(DAIAggregatorAddress);
    let BTCAggregator = await TPriceConsumerV3.at(BTCAggregatorAddress);

    let ethPrice = await ETHAggregator.latestAnswer.call();
    let daiPrice = await DAIAggregator.latestAnswer.call();
    let btcPrice = await BTCAggregator.latestAnswer.call();

    // Assume that DAI weight = 5
    const daiWeight = 5.0;
    let ethWeight = (ethPrice*ethBalance*daiWeight)/(daiPrice*daiBalance);
    let btcWeight = (btcPrice*btcBalance*daiWeight)/(daiPrice*daiBalance);

    await weth.approve(POOL, MAX);
    await dai.approve(POOL, MAX);
    await wbtc.approve(POOL, MAX);

    await pool.bindMMM(WETH, toWei(ethBalance.toString()), toWei(ethWeight.toString()), ETHAggregatorAddress);
    await pool.bindMMM(DAI, toWei(daiBalance.toString()), toWei(daiWeight.toString()), DAIAggregatorAddress);
    await pool.bindMMM(WBTC, toWei(btcBalance.toString()), toWei(btcWeight.toString()), BTCAggregatorAddress); 

    await pool.finalize();
    
    return pool;
}

module.exports = {
    createBalancedPool
};