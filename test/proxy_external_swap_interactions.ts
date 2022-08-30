import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { getParaswapTxData } from "./lib/paraswapLib";

const qs = require('qs');
const fetch = require('node-fetch');

describe("Proxy external swap", async () => {

    let owner: SignerWithAddress, otherAccount:SignerWithAddress;

    const wmaticAddress = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"; // wrapped matic on polygon
    const nativeAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    // Aggregators addresses
    const zeroEx   = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
    const paraswap = "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
    const oneInch  = "0x1111111254fb6c44bAC0beD2854e76F90643097d"; 
    
    enum Aggregator {
        zeroEx = 0,
        paraswap = 1,
        oneInch = 2
    }

    const libraryPrecision = 10n**18n

    async function deployProxyAndGetWETH() {
        
        const PROXY = await ethers.getContractFactory("Proxy");
        const proxy = await PROXY.deploy(wmaticAddress, zeroEx, paraswap, oneInch);

        const tradeParams = {
            sellToken: 'MATIC',
            buyToken: 'WETH',
            sellAmount: '30000000000000000000',
        };

        let quote: any;

        await Promise.all([
                fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(tradeParams)}`),
            ]).then(async(values) => {
                quote = await values[0].json();
            });

        await owner.sendTransaction(
            {   
                to: quote.to,
                data: quote.data,
                value: quote.sellAmount
            }
        );

        const ERC20 = await ethers.getContractFactory("TToken");

        let weth = await ERC20.attach(quote.buyTokenAddress);

        const initialWETHBalance = await weth.balanceOf(owner.address); 

        expect(initialWETHBalance).to.be.greaterThan(0);

        const minTokenOut = 
            BigInt(parseUnits(quote.guaranteedPrice, 18).toString())*BigInt(quote.sellAmount)/libraryPrecision;

        expect(initialWETHBalance).to.be.greaterThanOrEqual(minTokenOut);

        const initialMATICBalance = await ethers.provider.getBalance(owner.address);

        return { proxy, initialWETHBalance, weth, initialMATICBalance };
    }

    before(async() => {
        [owner, otherAccount] = await ethers.getSigners();
        const {proxy} = await loadFixture(deployProxyAndGetWETH);
        expect(proxy.address).not.to.equal(undefined);    
    });

    async function assertERC20Balances(tokenIn: string, tokenOut: string, minTokenOut: string | bigint, proxy: any) {
        const ERC20 = await ethers.getContractFactory("TToken");

        let erc20 = await ERC20.attach(tokenIn);
        
        expect(await erc20.balanceOf(proxy.address)).to.equal('0');
        expect(await erc20.balanceOf(owner.address)).to.equal('0');
    
        // conditions on buy token balance
        erc20 = await ERC20.attach(tokenOut);

        expect(await erc20.balanceOf(proxy.address)).to.equal('0');
        expect(await erc20.balanceOf(owner.address)).to.be.greaterThanOrEqual(minTokenOut);

    }

    async function assertBalances(tokenIn: string, initialMATICBalance: BigNumber, proxy: any) {
        const ERC20 = await ethers.getContractFactory("TToken");

        let erc20 = await ERC20.attach(tokenIn);
        
        expect(await erc20.balanceOf(proxy.address)).to.equal('0');
        expect(await erc20.balanceOf(owner.address)).to.equal('0');

        expect(await ethers.provider.getBalance(proxy.address)).to.equal('0');
        expect(await ethers.provider.getBalance(owner.address)).to.be.greaterThanOrEqual(initialMATICBalance);

    }


    describe("Using 0x's API", async () => {
    
        it("ERC20 to ERC20", async () => {

            const { proxy, initialWETHBalance, weth } = await loadFixture(deployProxyAndGetWETH);

            const tradeParams = {
                sellToken: 'WETH',
                buyToken: 'DAI',
                sellAmount: initialWETHBalance.toString()
            };
            
            await weth.approve(proxy.address, initialWETHBalance);

            let quote: any;

            await Promise.all([
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(tradeParams)}`),
                ]).then(async(values) => {
                    quote = await values[0].json();
                });
            
            // Undefined code means the route was successfully calculated
            expect(quote.code).to.equal(undefined);

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            const minTokenOut = 
                BigInt(parseUnits(quote.guaranteedPrice, 18).toString())*BigInt(quote.sellAmount)/libraryPrecision;

            await proxy.externalSwap(
                quote.sellTokenAddress,
                quote.sellAmount,
                quote.buyTokenAddress,
                minTokenOut,
                quote.allowanceTarget,
                Aggregator.zeroEx,
                quote.data,
                deadline
            );

            await assertERC20Balances(quote.sellTokenAddress, quote.buyTokenAddress, minTokenOut, proxy);

        });

        it("ERC20 to MATIC", async () => {

            const { proxy, initialWETHBalance, weth, initialMATICBalance } = await loadFixture(deployProxyAndGetWETH);

            const tradeParams = {
                sellToken: 'WETH',
                buyToken: 'MATIC',
                sellAmount: initialWETHBalance.toString()
            };
            
            await weth.approve(proxy.address, initialWETHBalance);

            let quote: any;

            await Promise.all([
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(tradeParams)}`),
                ]).then(async(values) => {
                    quote = await values[0].json();
                });
            
            // Undefined code means the route was successfully calculated
            expect(quote.code).to.equal(undefined);

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            const minTokenOut = 
                BigInt(parseUnits(quote.guaranteedPrice, 18).toString())*BigInt(quote.sellAmount)/libraryPrecision;

            await proxy.externalSwap(
                quote.sellTokenAddress,
                quote.sellAmount,
                quote.buyTokenAddress,
                minTokenOut,
                quote.allowanceTarget,
                Aggregator.zeroEx,
                quote.data,
                deadline
            );

            await assertBalances(quote.sellTokenAddress, initialMATICBalance, proxy);

        });

    });

    describe("Using Paraswap's API", async () => {
        
        it("ERC20 to ERC20", async () => {

            const { proxy, initialWETHBalance, weth } = await loadFixture(deployProxyAndGetWETH);

            const tradeParams = {
                srcToken: 'ETH',
                destToken: 'DAI',
                amount: initialWETHBalance.toString(),
            };

            await weth.approve(proxy.address, initialWETHBalance);

            const [ priceData, txData ] = await getParaswapTxData(tradeParams, proxy);

            const minTokenOut = BigInt(priceData.priceRoute.destAmount) * 98n / 100n; // 2% of slippage

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            await proxy.externalSwap(
                priceData.priceRoute.srcToken,
                tradeParams.amount, // sell amount
                priceData.priceRoute.destToken,
                minTokenOut,
                priceData.priceRoute.tokenTransferProxy, // spender
                Aggregator.paraswap,
                txData.data,
                deadline
            );

            await assertERC20Balances(priceData.priceRoute.srcToken, priceData.priceRoute.destToken, minTokenOut, proxy);

        });

        it("ERC20 to MATIC", async () => {

            const { proxy, initialWETHBalance, weth, initialMATICBalance } = await loadFixture(deployProxyAndGetWETH);

            const tradeParams = {
                srcToken: 'ETH',
                destToken: 'MATIC',
                amount: initialWETHBalance.toString(),
            };

            await weth.approve(proxy.address, initialWETHBalance);

            const [ priceData, txData ] = await getParaswapTxData(tradeParams, proxy);

            const minTokenOut = BigInt(priceData.priceRoute.destAmount) * 98n / 100n; // 2% of slippage

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            await proxy.externalSwap(
                priceData.priceRoute.srcToken,
                tradeParams.amount, // sell amount
                priceData.priceRoute.destToken,
                minTokenOut,
                priceData.priceRoute.tokenTransferProxy, // spender
                Aggregator.paraswap,
                txData.data,
                deadline
            );

            await assertBalances(priceData.priceRoute.srcToken, initialMATICBalance, proxy);

        });

    });

    describe("Using 1inch's API", async () => {

        it("ERC20 to ERC20", async () => {

            const { proxy, initialWETHBalance, weth } = await loadFixture(deployProxyAndGetWETH);

            const tradeParams = {
                fromTokenAddress: weth.address,
                toTokenAddress: wmaticAddress,
                amount: initialWETHBalance.toString(),
                slippage: '2',
                fromAddress: proxy.address,
                disableEstimate: true
            };
            
            await weth.approve(proxy.address, initialWETHBalance);

            let quote: any;

            await Promise.all([
                    fetch(`https://api.1inch.exchange/v4.0/137/swap?${qs.stringify(tradeParams)}`),
                ]).then(async(values) => {
                    quote = await values[0].json();
                });

            // Undefined code means the route was successfully calculated
            expect(quote.code).to.equal(undefined);

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            const minTokenOut = BigInt(quote.toTokenAmount) * 98n / 100n; // 2% slippage

            await proxy.externalSwap(
                quote.fromToken.address,
                quote.fromTokenAmount,
                quote.toToken.address,
                minTokenOut,
                quote.tx.to,
                Aggregator.oneInch,
                quote.tx.data,
                deadline,
            );

            await assertERC20Balances(quote.fromToken.address, quote.toToken.address, minTokenOut, proxy);

        });

        it("ERC20 to MATIC", async () => {

            const { proxy, initialWETHBalance, weth, initialMATICBalance } = await loadFixture(deployProxyAndGetWETH);

            const tradeParams = {
                fromTokenAddress: weth.address,
                toTokenAddress: nativeAddress,
                amount: initialWETHBalance.toString(),
                slippage: '2',
                fromAddress: proxy.address,
                disableEstimate: true
            };
            
            await weth.approve(proxy.address, initialWETHBalance);

            let quote: any;

            await Promise.all([
                    fetch(`https://api.1inch.exchange/v4.0/137/swap?${qs.stringify(tradeParams)}`),
                ]).then(async(values) => {
                    quote = await values[0].json();
                });

            // Undefined code means the route was successfully calculated
            expect(quote.code).to.equal(undefined);

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            const minTokenOut = BigInt(quote.toTokenAmount) * 98n / 100n; // 2% slippage

            await proxy.externalSwap(
                quote.fromToken.address,
                quote.fromTokenAmount,
                quote.toToken.address,
                minTokenOut,
                quote.tx.to,
                Aggregator.oneInch,
                quote.tx.data,
                deadline,
            );

            await assertBalances(quote.fromToken.address, initialMATICBalance, proxy);

        });

    });

});
