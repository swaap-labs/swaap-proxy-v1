const truffleAssert = require('truffle-assertions');
const Factory = artifacts.require('Factory');
const Pool = artifacts.require('Pool');
const Proxy = artifacts.require('Proxy');
const TToken = artifacts.require('TToken');
const TPriceConsumerV3 = artifacts.require('TPriceConsumerV3');
const Decimal = require('decimal.js');
const { createBalancedPool } = require('./lib/createBalancedPool');

contract('Proxy - BatchSwap', async (accounts) => {
    
    let network = 'ethereum';
    let wnative = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // weth on ethereum
    const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    let wnative_contract;

    const admin = accounts[0];
    const ttrader = accounts[1]; // test trader that will trade using the proxy
    const ctrader = accounts[2]; // control trader that will trade directly with the pool
    let tpool1; // test pool that will be called using the proxy
    let tpool2; // test pool that will be called using the proxy
    let cpool1; // control pool that we will compare the test pool with
    let cpool2; // control pool that we will compare the test pool with
    
    const { toWei } = web3.utils;
    const { fromWei } = web3.utils;
    const MAX = web3.utils.toTwosComplement(-1);

    let factory; // Pool factory
    let proxy;
    let weth;
    let dai;
    let wbtc;
    const errorDelta = 10 ** -4;

    function calcRelativeDiff(expected, actual) {
        if (actual == 0 && expected == 0) {
            return Decimal(0);
        }
        return ((Decimal(expected).minus(Decimal(actual))).div(expected)).abs();
    }    

    async function assertTraderBalances() {
        let ttraderBalance = fromWei(await weth.balanceOf.call(ttrader));
        let ctraderBalance = fromWei(await weth.balanceOf.call(ctrader));
        let relDif = calcRelativeDiff(ttraderBalance, ctraderBalance);
        assert.isAtMost(relDif.toNumber(), errorDelta);

        ttraderBalance = fromWei(await dai.balanceOf.call(ttrader));
        ctraderBalance = fromWei(await dai.balanceOf.call(ctrader));
        relDif = calcRelativeDiff(ttraderBalance, ctraderBalance);
        assert.isAtMost(relDif.toNumber(), errorDelta);
        
        ttraderBalance = fromWei(await wbtc.balanceOf.call(ttrader));
        ctraderBalance = fromWei(await wbtc.balanceOf.call(ctrader));
        relDif = calcRelativeDiff(ttraderBalance, ctraderBalance);
        assert.isAtMost(relDif.toNumber(), errorDelta);
    }

    async function assertProxyBalances() {
        let ethBalance = fromWei(await weth.balanceOf.call(proxy.address));
        assert.equal(ethBalance, 0);
        let daiBalance = fromWei(await dai.balanceOf.call(proxy.address));
        assert.equal(daiBalance, 0);
        let wbtcBalance = fromWei(await wbtc.balanceOf.call(proxy.address));
        assert.equal(wbtcBalance, 0);
    }

    before(async () => {        
        factory = await Factory.deployed();
        proxy = await Proxy.new(wnative);
    
        wnative_contract = await TToken.at(wnative);

        await Promise.all([
            TToken.new('Wrapped Ether', 'WETH', 18),
            TToken.new('Dai Stablecoin', 'DAI', 18),
            TToken.new('Wrapped Bitcoin', 'WBTC', 18),
        ]
        ).then((values) => {
            weth = values[0];
            dai = values[1];
            wbtc = values[2];

            WETH = weth.address;
            DAI = dai.address;
            WBTC = wbtc.address;
        });

        console.log("Minting ...");

        // Admin balances
        await weth.mint(admin, toWei('150000'));
        await dai.mint(admin, toWei('450000000'));
        await wbtc.mint(admin, toWei('10000'));
        // User1 balances
        await weth.mint(ttrader, toWei('150'), { from: admin });
        await dai.mint(ttrader,  toWei('450000'), { from: admin });
        await wbtc.mint(ttrader, toWei('10'), { from: admin });
        // User2 balances
        await weth.mint(ctrader, toWei('150'), { from: admin });
        await dai.mint(ctrader, toWei('450000'), { from: admin });
        await wbtc.mint(ctrader, toWei('10'), { from: admin });

        console.log("Minting finished");

        console.log("Creating Pools ...");

        tpool1 = await createBalancedPool(network, 15000, 45000000, 1000, WETH, DAI, WBTC, admin);
        cpool1 = await createBalancedPool(network, 15000, 45000000, 1000, WETH, DAI, WBTC, admin);
        tpool2 = await createBalancedPool(network, 7500, 22500000, 500, WETH, DAI, WBTC, admin);
        cpool2 = await createBalancedPool(network, 7500, 22500000, 500, WETH, DAI, WBTC, admin);

        console.log("Pools deployed");

        console.log("Approving tokens ...");
        
        // Admin balances
        await weth.approve(proxy.address, MAX, {from: ttrader});
        await dai.approve(proxy.address, MAX, {from: ttrader});
        await wbtc.approve(proxy.address, MAX, {from: ttrader});

        await weth.approve(cpool1.address, MAX, {from: ctrader});
        await dai.approve(cpool1.address, MAX, {from: ctrader});
        await wbtc.approve(cpool1.address, MAX, {from: ctrader});

        await weth.approve(cpool2.address, MAX, {from: ctrader});
        await dai.approve(cpool2.address, MAX, {from: ctrader});
        await wbtc.approve(cpool2.address, MAX, {from: ctrader});

        console.log("Tokens approved");

    });
    
    it('Fails when exceeding deadline', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice]
        // On a real trade 'minAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool1.address, WETH, DAI, toWei('1'), toWei('1000'), MAX];
        let swap2 = [tpool1.address, WETH, DAI, toWei('0.5'), toWei('500'), MAX];
        let swap3 = [tpool2.address, WETH, DAI, toWei('0.25'), toWei('250'), MAX];

        let batchSwap = [swap1, swap2, swap3];

        // batchSwapExactIn(swaps[], tokenIn, tokenOut, totalAmountIn(= sum of tokenIn), minTotalAmountOut, deadline)
        truffleAssert.reverts(
            proxy.batchSwapExactIn(batchSwap, WETH, DAI, toWei('1.75'), toWei('1750'), 0, { from: ttrader }),
            'ERR_PASSED_DEADLINE',
        );
    });

    it('batchSwapExactIn', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice]
        // On a real trade 'minAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool1.address, WETH, DAI, toWei('1'), toWei('1000'), MAX];
        let swap2 = [tpool1.address, WETH, DAI, toWei('0.5'), toWei('500'), MAX];
        let swap3 = [tpool2.address, WETH, DAI, toWei('0.25'), toWei('250'), MAX];

        let batchSwap = [swap1, swap2, swap3];

        // batchSwapExactIn(swaps[], tokenIn, tokenOut, totalAmountIn(= sum of tokenIn), minTotalAmountOut, deadline)
        await proxy.batchSwapExactIn(batchSwap, WETH, DAI, toWei('1.75'), toWei('1750'), MAX, { from: ttrader });

        // Trading using directly pools' interface
        await cpool1.swapExactAmountInMMM(WETH, toWei('1'), DAI, toWei('1000'), MAX, {from: ctrader});
        await cpool1.swapExactAmountInMMM(WETH, toWei('0.5'), DAI, toWei('500'), MAX, {from: ctrader});
        await cpool2.swapExactAmountInMMM(WETH, toWei('0.25'), DAI, toWei('250'), MAX, {from: ctrader});

        await assertTraderBalances();
        await assertProxyBalances();
    });

    it('batchSwapExactOut', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountOut, maxAmountIn maxPrice]
        // On a real trade 'maxAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool1.address, DAI, WETH, toWei('1'), toWei('10000'), MAX];
        let swap2 = [tpool1.address, DAI, WETH, toWei('0.5'), toWei('5000'), MAX];
        let swap3 = [tpool2.address, DAI, WETH, toWei('0.25'), toWei('2500'), MAX];

        let batchSwap = [swap1, swap2, swap3];
        // batchSwapExactOut(swaps[], tokenIn, tokenOut, maxTotalAmountIn, deadline)
        await proxy.batchSwapExactOut(batchSwap, DAI, WETH, toWei('17500'), MAX, { from: ttrader });

        // Trading using directly pools' interface
        await cpool1.swapExactAmountOutMMM(DAI, toWei('10000'), WETH, toWei('1'), MAX, {from: ctrader});
        await cpool1.swapExactAmountOutMMM(DAI, toWei('5000'), WETH, toWei('0.5'), MAX, {from: ctrader});
        await cpool2.swapExactAmountOutMMM(DAI, toWei('2500'), WETH, toWei('0.25'), MAX, {from: ctrader});

        await assertTraderBalances();
        await assertProxyBalances();
    });

    it('multihopBatchSwapExactIn', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice]
        // On a real trade 'minAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool1.address, WBTC, DAI, toWei('1'), toWei('20000'), MAX];
        // For swap2, amountIn is irrelevant since all of the DAI received in swap1 will be used in swap2
        let swap2 = [tpool2.address, DAI, WETH, toWei('0'), toWei('2'), MAX];
        // WBTC --> DAI --> WETH
        let multihop1 = [swap1, swap2];
        // WBTC --> WETH
        let swap3 = [tpool2.address, WBTC, WETH, toWei('0.5'), toWei('0.75'), MAX];
        let multihops = [multihop1, [swap3]];
        // inputs = [swapSequances[][], tokenIn, tokenOut, totalAmountIn, minTotalAmountOut, deadline]
        await proxy.multihopBatchSwapExactIn(multihops, WBTC, WETH, toWei('1.5'), toWei('3'), MAX, {from: ttrader});

        // Trading using directly pools' interface
        let intermediateDai = await cpool1.swapExactAmountInMMM.call(WBTC, toWei('1'), DAI, toWei('20000'), MAX, {from: ctrader});
        intermediateDai = (intermediateDai.tokenAmountOut).toString();

        await cpool1.swapExactAmountInMMM(WBTC, toWei('1'), DAI, toWei('20000'), MAX, {from: ctrader});
        await cpool2.swapExactAmountInMMM(DAI, intermediateDai, WETH, toWei('2'), MAX, {from: ctrader});
        await cpool2.swapExactAmountInMMM(WBTC, toWei('0.5'), WETH, toWei('0.75'), MAX, {from: ctrader});

        await assertTraderBalances();
        await assertProxyBalances();     
    });

    it('multihopBatchSwapExactOut', async () => {
        // Trading using proxy 
        // swap = [pool, tokenIn, tokenOut, amountOut, maxAmountIn, maxPrice]
        // On a real trade 'maxAmountIn' and 'maxPrice' should be well calibrated
        // For swap1, amountOut is irrelevant since it will be calculated on-chain and depends on amountOut of swap2
        let swap1 = [tpool2.address, WETH, DAI, toWei('0'), toWei('20'), MAX];
        // swap = [pool, tokenIn, tokenOut, amountOut, maxAmountIn, maxPrice]
        let swap2 = [tpool1.address, DAI, WBTC, toWei('1'), toWei('75000'), MAX];
        // WBTC --> DAI --> WETH
        let multihop1 = [swap1, swap2];
        // WBTC --> WETH
        let swap3 = [tpool2.address, WETH, WBTC, toWei('0.5'), toWei('10'), MAX];
        let multihops = [multihop1, [swap3]];
        // inputs = [swapSequances[][], tokenIn, tokenOut, maxAmountIn, deadline] 
        // totalAmountOut is determined by swap2 && swap3 --> 1.5 WBTC
        await proxy.multihopBatchSwapExactOut(multihops, WETH, WBTC, toWei('30'), MAX, {from: ttrader});

        // Trading using directly pools' interface
        let intermediateDai = await cpool1.getAmountInGivenOutMMM.call(DAI, MAX, WBTC, toWei('1'), MAX, {from: ctrader});    
        intermediateDai = (intermediateDai.swapResult.amount).toString();        

        await cpool2.swapExactAmountOutMMM(WETH, toWei('20'), DAI, intermediateDai, MAX, {from: ctrader});
        await cpool1.swapExactAmountOutMMM(DAI, toWei('100000'), WBTC, toWei('1'), MAX, {from: ctrader});
        await cpool2.swapExactAmountOutMMM(WETH, toWei('10'), WBTC, toWei('0.5'), MAX, {from: ctrader});
        
        await assertTraderBalances();
        await assertProxyBalances();
    });

    // dev network should be a ganache client forked from ethereum or polygon's mainnet
    let ETHAggregatorAddress;
    let DAIAggregatorAddress;
    let BTCAggregatorAddress;
    
    if (network === 'ethereum') {
        // Agrregators on ethereum's mainnet
        ETHAggregatorAddress = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
        DAIAggregatorAddress = '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9';
        BTCAggregatorAddress = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
    } else {
        // Agrregators on polygon's mainnet
        ETHAggregatorAddress = '0xF9680D99D6C9589e2a93a78A04A279e509205945';
        DAIAggregatorAddress = '0x4746DeC9e833A82EC7C2C1356 372CcF2cfcD2F3D';
        BTCAggregatorAddress = '0xc907E116054Ad103354f2D350FD2514433D57F6f';
    }
    
    let pool5;
    it('Create & finalize a pool without any parameter', async () => {
        // bindToken = [tokenAddress, balance, weight, oracleAddress]
        let bindToken1 = [WETH, toWei('2'), toWei('20'), ETHAggregatorAddress];
        let bindToken2 = [DAI, toWei('3500'), toWei('2.5'), DAIAggregatorAddress];
        let bindToken3 = [WBTC, toWei('0.25'), toWei('6'), BTCAggregatorAddress];

        let bindTokens = [bindToken1, bindToken2, bindToken3];
        // inputs: bindTokens[], finalize, deadline
        let POOL5 = await proxy.createPool.call(bindTokens, factory.address, true, MAX, {from: ttrader}); 
        await proxy.createPool(bindTokens, factory.address, true, MAX, {from: ttrader}); 
        
        pool5 = await Pool.at(POOL5);

        // assert creation of pool and bound tokens
        assert.equal((await factory.isPool.call(POOL5)).toString(), 'true');
        assert.equal((await pool5.isBound(WETH)).toString(), 'true');
        assert.equal((await pool5.isBound(DAI)).toString(), 'true');
        assert.equal((await pool5.isBound(WBTC)).toString(), 'true');
        // assert bound tokens parameters
        assert.equal((await pool5.getDenormalizedWeight.call(WETH)).toString(), toWei('20'));
        assert.equal((await dai.balanceOf.call(POOL5)).toString(), toWei('3500'));
        assert.equal((await pool5.getTokenPriceOracle.call(WBTC)).toString(), BTCAggregatorAddress);

        
        let poolTokenBalance = (await pool5.balanceOf.call(ttrader)).toString();
        assert.equal(poolTokenBalance, toWei('100'));
        await assertProxyBalances();
    });

    it('joinPool', async () => {
        let maxAmountsIn = [toWei('2'), toWei('3500'), toWei('0.25')];
        await proxy.joinPool(pool5.address, toWei('100'), maxAmountsIn, MAX, {from: ttrader});
        let poolTokenBalance = (await pool5.balanceOf.call(ttrader)).toString();
        assert.equal(poolTokenBalance, toWei('200'));
    });

    it('joinswapExternAmountIn', async () => {
        await proxy.joinswapExternAmountIn(pool5.address, WETH, toWei('0.5'), toWei('0.01'), MAX, {from: ttrader});
        let poolWETHBalance = (await weth.balanceOf.call(pool5.address)).toString();
        assert.equal(poolWETHBalance, toWei('4.5'));
    });

    it('Create a pool with parameters & without finalizing', async () => {
        // bindToken = [tokenAddress, balance, weight, oracleAddress]
        let bindToken1 = [WETH, toWei('2'), toWei('5'), ETHAggregatorAddress];
        let bindToken2 = [DAI, toWei('3500'), toWei('2.5'), DAIAggregatorAddress];
        let bindToken3 = [WBTC, toWei('0.25'), toWei('6'), BTCAggregatorAddress];

        let params = [
            publicSwap = 'true',
            priceStatisticsLookbackInRound = '5',
            dynamicCoverageFeesZ = toWei('10'),
            swapFee = toWei('0.1'),
            priceStatisticsLookbackInSec = '2000',
            dynamicCoverageFeesHorizon = toWei('50'),
        ];

        let bindTokens = [bindToken1, bindToken2, bindToken3];
        // inputs: bindTokens[], finalize, deadline
        let POOL6 = await proxy.createPoolWithParams.call(bindTokens, params, factory.address,  false, MAX, {from: ttrader}); 
        await proxy.createPoolWithParams(bindTokens, params, factory.address, false, MAX, {from: ttrader}); 
        
        let pool6 = await Pool.at(POOL6);

        // assert creation of pool and bound tokens
        assert.equal((await factory.isPool.call(POOL6)).toString(), 'true');
        assert.equal((await pool6.isBound(WETH)).toString(), 'true');
        assert.equal((await pool6.isBound(DAI)).toString(), 'true');
        assert.equal((await pool6.isBound(WBTC)).toString(), 'true');
        // assert bound tokens parameters
        assert.equal((await pool6.getDenormalizedWeight.call(WETH)).toString(), toWei('5'));
        assert.equal((await dai.balanceOf.call(POOL6)).toString(), toWei('3500'));
        assert.equal((await pool6.getTokenPriceOracle.call(WBTC)).toString(), BTCAggregatorAddress);

        let poolTokenBalance = (await pool6.balanceOf.call(ttrader)).toString();
        assert.equal(poolTokenBalance, toWei('0'));
        assert.equal((await pool6.isPublicSwap.call()).toString(), 'true');

        let coverageParams = await pool6.getCoverageParameters.call()
        assert.equal(await pool6.getSwapFee.call(), toWei('0.1'));
        assert.equal(coverageParams[0], toWei('10'));
        assert.equal(coverageParams[1], toWei('50'));
        assert.equal(coverageParams[2], 5);
        assert.equal(coverageParams[3], 2000);

        await assertProxyBalances();
    });

    let tpool7;
    it('Create & finalize a pool using native token', async () => {
        // bindToken = [tokenAddress, balance, weight, oracleAddress]
        let bindToken1 = [NATIVE_ADDRESS, toWei('2'), toWei('5'), ETHAggregatorAddress];
        let bindToken2 = [DAI, toWei('100000'), toWei('5'), DAIAggregatorAddress];
        let bindToken3 = [WBTC, toWei('5'), toWei('6'), BTCAggregatorAddress];

        let bindTokens = [bindToken1, bindToken2, bindToken3];
        // inputs: bindTokens[], finalize, deadline
        let POOL7 = await proxy.createPool.call(bindTokens, factory.address, true, MAX, {from: ttrader, value: toWei('20')}); 
        await proxy.createPool(bindTokens, factory.address, true, MAX, {from: ttrader, value: toWei('20')}); 
        
        tpool7 = await Pool.at(POOL7);

        // assert creation of pool and bound tokens
        assert.equal((await factory.isPool.call(POOL7)).toString(), 'true');
        assert.equal((await tpool7.isBound(wnative)).toString(), 'true');
        assert.equal((await tpool7.isBound(DAI)).toString(), 'true');
        assert.equal((await tpool7.isBound(WBTC)).toString(), 'true');
        // assert bound tokens parameters
        assert.equal((await wnative_contract.balanceOf.call(POOL7)).toString(), toWei('2'));
        
        let poolTokenBalance = (await tpool7.balanceOf.call(ttrader)).toString();
        assert.equal(poolTokenBalance, toWei('100'));
        assert.equal(await web3.eth.getBalance(proxy.address), 0);
        assert.equal(await wnative_contract.balanceOf.call(proxy.address), 0);
        assert.equal(await wbtc.balanceOf.call(proxy.address), 0);
    });

    it('BatchSwapIn with native token', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice]
        // On a real trade 'minAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool7.address, wnative, DAI, toWei('0.1'), toWei('100'), MAX];
        let swap2 = [tpool7.address, wnative, DAI, toWei('0.05'), toWei('50'), MAX];
        let swap3 = [tpool7.address, wnative, DAI, toWei('0.025'), toWei('25'), MAX];

        let batchSwap = [swap1, swap2, swap3];

        // batchSwapExactIn(swaps[], tokenIn, tokenOut, totalAmountIn(= sum of tokenIn), minTotalAmountOut, deadline)
        await proxy.batchSwapExactIn(batchSwap, NATIVE_ADDRESS, DAI, toWei('0.180'), toWei('175'), MAX, { from: ttrader, value: toWei('0.275') });

        assert.equal((await wnative_contract.balanceOf.call(tpool7.address)).toString(), toWei('2.175'));        
        let nativeBalance = await web3.eth.getBalance(proxy.address);
        assert.equal(nativeBalance, 0);
    });

    it('multihopBatchSwapExactIn with native token', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice]
        // On a real trade 'minAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool7.address, wnative, DAI, toWei('0.5'), toWei('0.0001'), MAX];
        // For swap2, amountIn is irrelevant since all of the DAI received in swap1 will be used in swap2
        let swap2 = [tpool2.address, DAI, WBTC, toWei('0'), toWei('0.0001'), MAX];
        // WBTC --> DAI --> WETH
        let multihop1 = [swap1, swap2];
        // WBTC --> WETH
        let swap3 = [tpool7.address, wnative, WBTC, toWei('0.5'), toWei('0.0001'), MAX];
        let multihops = [multihop1, [swap3]];
        // inputs = [swapSequances[][], tokenIn, tokenOut, totalAmountIn, minTotalAmountOut, deadline]
        await proxy.multihopBatchSwapExactIn(multihops, NATIVE_ADDRESS, WBTC, toWei('1'), toWei('0.002'), MAX, {from: ttrader, value: toWei('5')});

        
        assert.equal((await wnative_contract.balanceOf.call(tpool7.address)).toString(), toWei('3.175'));        
        let nativeBalance = await web3.eth.getBalance(proxy.address);
        assert.equal(nativeBalance, 0);

      });

      let pool_native_balance;
      it('BatchSwapOut with native token', async () => {
        // Trading using proxy
        // swap = [pool, tokenIn, tokenOut, amountOut, maxAmountIn maxPrice]
        // On a real trade 'maxAmountOut' and 'maxPrice' should be well calibrated
        let swap1 = [tpool7.address, wnative, DAI, toWei('1000'), toWei('10000'), MAX];
        let swap2 = [tpool7.address, wnative, DAI, toWei('500'), toWei('5000'), MAX];

        let batchSwap = [swap1, swap2];
        // batchSwapExactOut(swaps[], tokenIn, tokenOut, maxTotalAmountIn, deadline)
        await proxy.batchSwapExactOut(batchSwap, NATIVE_ADDRESS, DAI, toWei('1500'), MAX, { from: ttrader, value: toWei('1') });

        pool_native_balance = Number(fromWei(await wnative_contract.balanceOf.call(tpool7.address)));

        assert.isAbove(pool_native_balance, 3.175);

        let nativeBalance = await web3.eth.getBalance(proxy.address);
        assert.equal(nativeBalance, 0);
    });


    it('multihopBatchSwapExactOut with native token', async () => {
        // Trading using proxy 
        // swap = [pool, tokenIn, tokenOut, amountOut, maxAmountIn, maxPrice]
        // On a real trade 'maxAmountIn' and 'maxPrice' should be well calibrated
        // For swap1, amountOut is irrelevant since it will be calculated on-chain and depends on amountOut of swap2
        let swap1 = [tpool7.address, wnative, WBTC, toWei('0'), toWei('1'), MAX];
        // swap = [pool, tokenIn, tokenOut, amountOut, maxAmountIn, maxPrice]
        let swap2 = [tpool2.address, WBTC, DAI, toWei('1000'), toWei('1'), MAX];
        // wnative --> WBTC --> DAI
        let multihop1 = [swap1, swap2];
        // wnative --> DAI
        let swap3 = [tpool7.address, wnative, DAI, toWei('500'), toWei('0.5'), MAX];
        let multihops = [multihop1, [swap3]];
        // inputs = [swapSequances[][], tokenIn, tokenOut, maxAmountIn, deadline] 
        // totalAmountOut is determined by swap2 && swap3 --> 1.5 WBTC
        await proxy.multihopBatchSwapExactOut(multihops, NATIVE_ADDRESS, WBTC, toWei('1.5'), MAX, {from: ttrader, value: toWei('1.5')});

        assert.isAbove(Number(fromWei(await wnative_contract.balanceOf.call(tpool7.address))), pool_native_balance);

        let nativeBalance = await web3.eth.getBalance(proxy.address);
        assert.equal(nativeBalance, 0);
      });

    it('joinPool with native token', async () => {
        let maxAmountsIn = [toWei('2'), toWei('3500'), toWei('1')];
        await proxy.joinPool(tpool7.address, toWei('1'), maxAmountsIn, MAX, {from: ttrader, value: toWei('2')});
        let poolTokenBalance = (await tpool7.balanceOf.call(ttrader)).toString();
        assert.equal(poolTokenBalance, toWei('101'));

        assert.equal(await web3.eth.getBalance(proxy.address), 0);
        assert.equal(await wnative_contract.balanceOf.call(proxy.address), 0);
        assert.equal(await dai.balanceOf.call(proxy.address), 0);
        assert.equal(await wbtc.balanceOf.call(proxy.address), 0);
    });

    it('joinswapExternAmountIn with native token', async () => {
        await proxy.joinswapExternAmountIn(tpool7.address, NATIVE_ADDRESS, toWei('1'), toWei('0.01'), MAX, {from: ttrader, value: toWei('1')});
        let poolTokenBalance = Number(fromWei((await tpool7.balanceOf.call(ttrader)).toString()));
        assert.isAbove(poolTokenBalance, 100);

        assert.equal(await web3.eth.getBalance(proxy.address), 0);
        assert.equal(await wnative_contract.balanceOf.call(proxy.address), 0);
        assert.equal(await dai.balanceOf.call(proxy.address), 0);
        assert.equal(await wbtc.balanceOf.call(proxy.address), 0);
    });
});
