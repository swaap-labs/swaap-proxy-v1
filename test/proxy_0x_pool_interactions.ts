import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { parseUnits } from "ethers/lib/utils";

const qs = require('qs');
const fetch = require('node-fetch');

// https://polygon.api.0x.org/swap/v1/quote?sellToken=WETH&buyToken=MATIC&sellAmount=1000000000000000000

interface Quote {
    sellAmount: string
    buyTokenAddress: string
    guaranteedPrice: string
    allowanceTarget: string
    code: any
    to: string
    data: string
}

describe("Proxy joinPoolVia0x", async () => {

    let owner: SignerWithAddress, otherAccount:SignerWithAddress;

    const wmatic = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
    
    // Aggregators addresses
    const zeroEx   = "0xdef1c0ded9bec7f1a1670819833240f027b25eff";
    const paraswap = "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
    const oneInch  = "0x1111111254fb6c44bac0bed2854e76f90643097d"; 
    
    // Contracts are deployed using the first signer/account by default
    const poolAddress = '0x7f5f7411c2c7ec60e2db946abbe7dc354254870b';
    const mathAddress = '0x3f572c24d371c289578f76e5bb8b74e3473828a8';

    // address sould be lowercased
    const poolTokensWithContext = new Map(
        [
            {
                address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', 
                symbol: 'WETH',
                decimals: 18,
            },
            {
                address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
                symbol: 'USDC',
                decimals: 6,
            },
            {
                address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
                symbol: 'WBTC',
                decimals: 8,
            }
        ]
        .map(t => [t.address, t])
    )

    const libraryPrecision = 10n**18n
    const libraryErrorDecimalTolerance = 3n

    const maticTotalSellAmount = 900n*10n**18n // matic precision

    const tokenRelativeErrorDecimalTolerance = 1 / 6

    async function deployProxyAndGetPoolInfo() {
        
    
        const PROXY = await ethers.getContractFactory("Proxy");
        const proxy = await PROXY.deploy(wmatic, zeroEx, paraswap, oneInch);
        // await proxy.deployed();

        const POOL = await ethers.getContractFactory("Pool", {
            libraries: {
                Math: mathAddress,
            },
          });
        
        const pool = await POOL.attach(poolAddress);
        const poolTokens = await pool.getTokens();

        // get 1 pool token's price
        let [ poolAmoutOut, tokenAmountsIn ] = await pool.getJoinPool(
            "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
            (ethers.utils.parseEther('1.0')).toString()
        );
        
        // Array of token amounts in for 1 Pool Token (with 18 decimals)
        const tokenAmountsInPerPT: bigint[] = tokenAmountsIn.map((amount: BigNumber) =>
            {
                return ((amount.toBigInt()*libraryPrecision + (poolAmoutOut.toBigInt()/2n))/poolAmoutOut.toBigInt());
            }
        );

        return { proxy, pool, poolTokens, tokenAmountsInPerPT };
    }
    
    function minPoolSharesExpected(
        minExpectedTokensIn: bigint[],
        tokenAmountsInPerPT: bigint[]
    ): bigint {
        const minPoolShares: bigint[] = [...Array(minExpectedTokensIn.length).keys()].map(i => {
            return (minExpectedTokensIn[i] * libraryPrecision) / tokenAmountsInPerPT[i];
        })
        // returns the minimum PT shares in the array
        return minPoolShares.reduce((m, e) => e < m ? e : m, minPoolShares[0]);
    }

    before(async() => {
        [owner, otherAccount] = await ethers.getSigners();
        const {proxy, pool} = await loadFixture(deployProxyAndGetPoolInfo);
        expect(proxy.address).not.to.equal(undefined);    
        expect(pool.address).to.equal('0x7f5f7411c2c7ec60e2db946abbe7dc354254870b');
    });

    describe("One-asset-join with 0x API", async () => {

        let wethQuote: any; let usdcQuote: any; let wbtcQuote: any;

        it("One-asset-join with native token", async () => {
            const {proxy, pool, poolTokens, tokenAmountsInPerPT} = await loadFixture(deployProxyAndGetPoolInfo);

            const wethParams = {
                sellToken: 'WMATIC',
                buyToken: 'WETH',
                sellAmount: '30000000000000000000',
            };

            const usdcParams = {
                sellToken: 'WMATIC',
                buyToken: 'USDC',
                sellAmount: '30000000000000000000',
            }
            
            const wbtcParams = {
                sellToken: 'WMATIC',
                buyToken: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
                sellAmount: '30000000000000000000',
            }
            
            await Promise.all([
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wethParams)}`),
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(usdcParams)}`),
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wbtcParams)}`)
                ]).then(async(values) => {
                    wethQuote = await values[0].json();
                    usdcQuote = await values[1].json();
                    wbtcQuote = await values[2].json();
                });

            // Undefined code means the route was successfully calculated
            expect(wethQuote.code).to.equal(undefined);
            expect(usdcQuote.code).to.equal(undefined);
            expect(wbtcQuote.code).to.equal(undefined);

            const poolAmountOut = libraryPrecision;
            const maxAmountsIn = tokenAmountsInPerPT.map((amount: bigint) => amount*1001n/1000n);
            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            const joiningAsset: string = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
            const joiningAmount = BigInt(wethQuote.sellAmount) + BigInt(usdcQuote.sellAmount) + BigInt(wbtcQuote.sellAmount);

            const minExpectedTokensIn = [
                BigInt(parseUnits(wethQuote.guaranteedPrice, 18).toString())*BigInt(wethQuote.sellAmount)/libraryPrecision,
                BigInt(parseUnits(usdcQuote.guaranteedPrice, 6).toString())*BigInt(usdcQuote.sellAmount)/libraryPrecision,
                BigInt(parseUnits(wbtcQuote.guaranteedPrice, 8).toString())*BigInt(wbtcQuote.sellAmount)/libraryPrecision,
            ]

            const fillQuotes = [
                {
                    sellAmount: wethQuote.sellAmount,
                    buyToken: wethQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[0], // minimum expected amount of WETH
                    spender: wethQuote.allowanceTarget,
                    swapCallData: wethQuote.data
                },
                {
                    sellAmount: usdcQuote.sellAmount,
                    buyToken: usdcQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[1], // minimum expected amount of USDC
                    spender: usdcQuote.allowanceTarget,
                    swapCallData: usdcQuote.data
                },
                {
                    sellAmount: wbtcQuote.sellAmount,
                    buyToken: wbtcQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[2], // minimum expected amount of WBTC
                    spender: wbtcQuote.allowanceTarget,
                    swapCallData: wbtcQuote.data
                },
            ]

            await proxy.oneAssetJoin(
                poolTokens, // must be in the same order as in the Pool
                maxAmountsIn,
                fillQuotes,
                joiningAsset,
                joiningAmount,
                pool.address,
                poolAmountOut,
                deadline,
                {value: joiningAmount}
            );

            const minPoolAmountOut = minPoolSharesExpected(minExpectedTokensIn, tokenAmountsInPerPT);
            expect(await pool.balanceOf(owner.address)).to.be.greaterThanOrEqual(minPoolAmountOut);
            expect(await ethers.provider.getBalance(proxy.address)).to.equal('0');
            
            const ERC20 = await ethers.getContractFactory("TToken");
            await Promise.all(poolTokens.map(async (tokenAddress: string) => {
                const erc20 = await ERC20.attach(tokenAddress);
                expect(await erc20.balanceOf(proxy.address)).to.equal('0');
            }));
        });

        it("Should fail if tokenAmountOut is not enough", async () => {
            const {proxy, pool, poolTokens, tokenAmountsInPerPT} = await loadFixture(deployProxyAndGetPoolInfo);

            const wethParams = {
                sellToken: 'WMATIC',
                buyToken: 'WETH',
                sellAmount: '30000000000000000000',
            };

            const usdcParams = {
                sellToken: 'WMATIC',
                buyToken: 'USDC',
                sellAmount: '30000000000000000000',
            }
            
            const wbtcParams = {
                sellToken: 'WMATIC',
                buyToken: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
                sellAmount: '30000000000000000000',
            }
            
            await Promise.all([
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wethParams)}`),
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(usdcParams)}`),
                    fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wbtcParams)}`)
                ]).then(async(values) => {
                    wethQuote = await values[0].json();
                    usdcQuote = await values[1].json();
                    wbtcQuote = await values[2].json();
                });

            // Undefined code means the route was successfully calculated
            expect(wethQuote.code).to.equal(undefined);
            expect(usdcQuote.code).to.equal(undefined);
            expect(wbtcQuote.code).to.equal(undefined);

            const poolAmountOut = libraryPrecision;
            const maxAmountsIn = tokenAmountsInPerPT.map((amount: bigint) => amount*1001n/1000n);
            const deadline = Math.floor(Date.now()/1000) + 30 * 60;

            const joiningAsset: string = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
            const joiningAmount = BigInt(wethQuote.sellAmount) + BigInt(usdcQuote.sellAmount) + BigInt(wbtcQuote.sellAmount);

            const minExpectedTokensIn = [
                BigInt(parseUnits(wethQuote.guaranteedPrice, 18).toString())*BigInt(wethQuote.sellAmount)/libraryPrecision,
                BigInt(parseUnits(usdcQuote.guaranteedPrice, 6).toString())*BigInt(usdcQuote.sellAmount)/libraryPrecision,
                BigInt(parseUnits(wbtcQuote.guaranteedPrice, 8).toString())*BigInt(wbtcQuote.sellAmount)/libraryPrecision,
            ]

            const fillQuotes = [
                {
                    sellAmount: wethQuote.sellAmount,
                    buyToken: wethQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[0]*2n, // minimum expected amount of WETH
                    spender: wethQuote.allowanceTarget,
                    swapCallData: wethQuote.data
                },
                {
                    sellAmount: usdcQuote.sellAmount,
                    buyToken: usdcQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[1], // minimum expected amount of USDC
                    spender: usdcQuote.allowanceTarget,
                    swapCallData: usdcQuote.data
                },
                {
                    sellAmount: wbtcQuote.sellAmount,
                    buyToken: wbtcQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[2], // minimum expected amount of WBTC
                    spender: wbtcQuote.allowanceTarget,
                    swapCallData: wbtcQuote.data
                },
            ]

            await expect(proxy.oneAssetJoin(
                    poolTokens, // must be in the same order as in the Pool
                    maxAmountsIn,
                    fillQuotes,
                    joiningAsset,
                    joiningAmount,
                    pool.address,
                    poolAmountOut,
                    deadline,
                    {value: joiningAmount}
                )
            ).to.be.revertedWith("PROOXY#03");

        });

        poolTokensWithContext.forEach(joiningAsset => {

            it(`One asset join with ${joiningAsset.symbol}, while ${joiningAsset.symbol} is the limiting token`, async () => {
                const {proxy, pool, poolTokens, tokenAmountsInPerPT} = await loadFixture(deployProxyAndGetPoolInfo);

                const sellAmount = BigInt(maticTotalSellAmount)
                const joiningAssetParams = {
                    sellToken: 'MATIC',
                    buyToken: joiningAsset.address,
                    sellAmount: sellAmount,
                };

                let joiningAssetQuote = await fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(joiningAssetParams)}`)
                joiningAssetQuote = await joiningAssetQuote.json()
                
                // Undefined code means the route was successfully calculated
                expect(joiningAssetQuote.code).to.equal(undefined);

                // Trading MATIC to $joiningAsset
                await owner.sendTransaction(
                    {
                        to: joiningAssetQuote.to,
                        value: sellAmount,
                        data: joiningAssetQuote.data
                    }
                );
                
                const ERC20 = await ethers.getContractFactory("TToken");    
                const joiningAssetERC20 = await ERC20.attach(joiningAsset.address);
                const joiningAssetInitialBalance: bigint = (await joiningAssetERC20.balanceOf(owner.address)).toBigInt();

                const otherAssets = Array.from(poolTokensWithContext.values()).filter((t => t.address != joiningAsset.address))
                const fetchList = otherAssets.map(t => {
                    const param = {
                        sellToken: joiningAsset.address,
                        buyToken: t.address,
                        sellAmount: (joiningAssetInitialBalance / BigInt(poolTokensWithContext.size)),
                    }
                    return fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(param)}`)
                })
                
                let quotes: Quote[] = await Promise.all((await Promise.all(fetchList)).map(async(v) => v.json()))

                // Undefined code means the route was successfully calculated
                for (let i=0; i < quotes.length; i++) {
                    expect(quotes[i].code).to.equal(undefined);
                }

                const deadline = Math.floor(Date.now()/1000) + 30 * 60;
                
                const poolAmountOut = libraryPrecision;
                const maxAmountsIn = tokenAmountsInPerPT.map((amount: bigint) => amount*1001n/1000n);

                const minExpectedTokensIn = quotes
                    .reduce((acc, q, idx) => {
                        acc.set(
                            q.buyTokenAddress,
                            BigInt(parseUnits(q.guaranteedPrice, otherAssets[idx].decimals).toString())*BigInt(q.sellAmount)/10n**(BigInt(joiningAsset.decimals))
                        )
                        return acc
                    },
                    new Map([[joiningAsset.address, joiningAssetInitialBalance / BigInt(poolTokensWithContext.size)]])
                )

                let minPoolAmountOut = minPoolSharesExpected(poolTokens.map((t: string) => minExpectedTokensIn.get(t.toLowerCase())!), tokenAmountsInPerPT);
                // re-calculating minPoolAmountOut to ensure that $joinAsset is the limiting token
                const joiningAssetFactorBase100 = 1n
                minPoolAmountOut = (minPoolAmountOut * joiningAssetFactorBase100 / 100n)

                // Limiting $joiningAsset for joinPool input
                let joiningAssetJoinPool = minPoolAmountOut * tokenAmountsInPerPT[poolTokens.findIndex((t: string) => t.toLocaleLowerCase() == joiningAsset.address)] / libraryPrecision; // index 0 is $joiningAsset

                const joiningAmount = quotes.reduce((acc, q) => acc + BigInt(q.sellAmount), joiningAssetJoinPool);

                const fillQuotes = quotes.map(quote => {
                    return (
                        {
                            sellAmount: quote.sellAmount,
                            buyToken: quote.buyTokenAddress,
                            buyAmount: minExpectedTokensIn.get(quote.buyTokenAddress)!,
                            spender: quote.allowanceTarget,
                            swapCallData: quote.data
                        }
                    )
                })

                // Approving $joiningAsset to proxy
                await joiningAssetERC20.approve(proxy.address, joiningAmount);

                await proxy.oneAssetJoin(
                    poolTokens, // must be in the same order as in the Pool
                    maxAmountsIn,
                    fillQuotes,
                    joiningAsset.address,
                    joiningAmount,
                    pool.address,
                    poolAmountOut,
                    deadline
                );
                
                // adding a tolerance margin to minPoolAmountOut
                const libraryErrorDecimalToleranceCompTerm = 10n ** libraryErrorDecimalTolerance
                expect(await pool.balanceOf(owner.address)).to.be.greaterThanOrEqual(minPoolAmountOut * (libraryErrorDecimalToleranceCompTerm - 1n) / libraryErrorDecimalToleranceCompTerm);
                const expectedJoinigAssetAfterJoinPool = joiningAssetInitialBalance - joiningAmount;
                // the balance of limiting token for the LP after the one-asset-join should be close to 0
                expect(await joiningAssetERC20.balanceOf(owner.address)).to.be.lessThanOrEqual(expectedJoinigAssetAfterJoinPool + 10n**(BigInt(Math.floor(Math.max(1, joiningAsset.decimals * tokenRelativeErrorDecimalTolerance)))));

                await Promise.all(poolTokens.map(async (tokenAddress: string) => {
                    const erc20 = await ERC20.attach(tokenAddress);
                    expect(await erc20.balanceOf(proxy.address)).to.equal('0');
                }));
            });
        })
    
        it("Should fail with wrong maxAmountsIn", async () => {
            const {proxy, pool, poolTokens, tokenAmountsInPerPT} = await loadFixture(deployProxyAndGetPoolInfo);

            const wethParams = {
                sellToken: 'MATIC',
                buyToken: 'WETH',
                sellAmount: '300000000000000000000',
            };

            wethQuote = await fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wethParams)}`);
            wethQuote = await wethQuote.json();
            
            // Undefined code means the route was successfully calculated
            expect(wethQuote.code).to.equal(undefined);

            // Trading MATIC to WETH
            await owner.sendTransaction(
                {
                    to: wethQuote.to,
                    value: wethParams.sellAmount,
                    data: wethQuote.data
                }
            );
            
            const ERC20 = await ethers.getContractFactory("TToken");    
            const erc20 = await ERC20.attach(wethQuote.buyTokenAddress);
            const wethBalance: bigint = (await erc20.balanceOf(owner.address)).toBigInt();
            
            const usdcParams = {
                sellToken: 'WETH',
                buyToken: 'USDC',
                sellAmount: (wethBalance / 3n).toString(),
            }

            const wbtcParams = {
                sellToken: 'WETH',
                buyToken: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
                sellAmount: (wethBalance / 3n).toString(),
            }
            
            await Promise.all([
                fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(usdcParams)}`),
                fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wbtcParams)}`)
            ]).then(async(values) => {
                usdcQuote = await values[0].json();
                wbtcQuote = await values[1].json();
            });

            // Undefined code means the route was successfully calculated
            expect(usdcQuote.code).to.equal(undefined);
            expect(wbtcQuote.code).to.equal(undefined);

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;
            
            const poolAmountOut = libraryPrecision;
            const maxAmountsIn = tokenAmountsInPerPT.map((amount: bigint) => amount*99n/100n);

            const joiningAsset: string = usdcQuote.sellTokenAddress; // weth address
            const joiningAmount = wethBalance;

            const fillQuotes = [
                {
                    sellAmount: usdcQuote.sellAmount,
                    buyToken: usdcQuote.buyTokenAddress,
                    buyAmount: 0,
                    spender: usdcQuote.allowanceTarget,
                    swapCallData: usdcQuote.data
                },
                {
                    sellAmount: wbtcQuote.sellAmount,
                    buyToken: wbtcQuote.buyTokenAddress,
                    buyAmount: 0,
                    spender: wbtcQuote.allowanceTarget,
                    swapCallData: wbtcQuote.data
                },
            ]
            
            // Approving weth to proxy
            const weth = await ERC20.attach(joiningAsset);
            await weth.approve(proxy.address, joiningAmount);

            await expect(
                proxy.oneAssetJoin(
                    poolTokens, // must be in the same order as in the Pool
                    maxAmountsIn,
                    fillQuotes,
                    joiningAsset,
                    joiningAmount,
                    pool.address,
                    poolAmountOut,
                    deadline
                )
              ).to.be.revertedWith("SWAAP#08");
        });

        it("One-asset-join with USDC as joiningAsset and WBTC as limit", async () => {
            const {proxy, pool, poolTokens, tokenAmountsInPerPT} = await loadFixture(deployProxyAndGetPoolInfo);
            
            const usdcParams = {
                sellToken: 'MATIC',
                buyToken: 'USDC',
                sellAmount: '500000000000000000000',
            };

            usdcQuote = await fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(usdcParams)}`);
            usdcQuote = await usdcQuote.json();
            
            // Undefined code means the route was successfully calculated
            expect(usdcQuote.code).to.equal(undefined);

            // Trading MATIC to USDC
            await owner.sendTransaction(
                {
                    to: usdcQuote.to,
                    value: usdcParams.sellAmount,
                    data: usdcQuote.data
                }
            );


            const ERC20 = await ethers.getContractFactory("TToken");    
            const erc20 = await ERC20.attach(usdcQuote.buyTokenAddress);
            const usdcInitialBalance: bigint = (await erc20.balanceOf(owner.address)).toBigInt();
            
            const wethParams = {
                sellToken: 'USDC',
                buyToken: 'WETH',
                sellAmount: (usdcInitialBalance / 3n).toString(),
            }

            const wbtcParams = {
                sellToken: 'USDC',
                buyToken: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
                sellAmount: (usdcInitialBalance / 1000n).toString(),
            }

            await Promise.all([
                fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wethParams)}`),
                fetch(`https://polygon.api.0x.org/swap/v1/quote?${qs.stringify(wbtcParams)}`)
            ]).then(async(values) => {
                wethQuote = await values[0].json();
                wbtcQuote = await values[1].json();
            });

            // Undefined code means the route was successfully calculated
            expect(wethQuote.code).to.equal(undefined);
            expect(wbtcQuote.code).to.equal(undefined);

            const deadline = Math.floor(Date.now()/1000) + 30 * 60;
            
            const poolAmountOut = 10n**18n;
            const maxAmountsIn = tokenAmountsInPerPT.map((amount: bigint) => amount*1001n/1000n);

            const minExpectedTokensIn = [
                BigInt(parseUnits(wethQuote.guaranteedPrice, 18).toString())*BigInt(wethQuote.sellAmount)/10n**18n,
                usdcInitialBalance - BigInt(wethQuote.sellAmount) - BigInt(wbtcQuote.sellAmount),
                BigInt(parseUnits(wbtcQuote.guaranteedPrice, 8).toString())*BigInt(wbtcQuote.sellAmount)/10n**18n,
            ]

            let minPoolAmountOut = minPoolSharesExpected(minExpectedTokensIn, tokenAmountsInPerPT);

            minPoolAmountOut = minPoolAmountOut * 999999n/1000000n;

            const joiningAsset: string = wethQuote.sellTokenAddress; // usdc address
            const joiningAmount = usdcInitialBalance;

            // Approving weth to proxy
            const usdc = await ERC20.attach(joiningAsset);
            await usdc.approve(proxy.address, joiningAmount);
        
            const fillQuotes = [
                {
                    sellAmount: wethQuote.sellAmount,
                    buyToken: wethQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[0], // minimum expected amount of WETH
                    spender: wethQuote.allowanceTarget,
                    swapCallData: wethQuote.data
                },
                {
                    sellAmount: wbtcQuote.sellAmount,
                    buyToken: wbtcQuote.buyTokenAddress,
                    buyAmount: minExpectedTokensIn[2], // minimum expected amount of WBTC
                    spender: wbtcQuote.allowanceTarget,
                    swapCallData: wbtcQuote.data
                }
            ]
        
            await proxy.oneAssetJoin(
                poolTokens, // must be in the same order as in the Pool
                maxAmountsIn,
                fillQuotes,
                joiningAsset,
                joiningAmount,
                pool.address,
                poolAmountOut,
                deadline
            );

            expect(await pool.balanceOf(owner.address)).to.be.greaterThanOrEqual(minPoolAmountOut);

            const wbtc = await ERC20.attach('0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6');
            expect(await wbtc.balanceOf(owner.address)).to.be.lessThanOrEqual(1000n); // 1000 wei as tolerance

            await Promise.all(poolTokens.map(async (tokenAddress: string) => {
                const erc20 = await ERC20.attach(tokenAddress);
                expect(await erc20.balanceOf(proxy.address)).to.equal('0');
            }));
        });
    
    });
});
