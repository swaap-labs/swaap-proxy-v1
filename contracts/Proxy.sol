// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IMath.sol";
import "./interfaces/IFactory.sol";
import "./interfaces/IToken.sol";

contract Proxy {

    using SafeERC20 for IERC20;

    struct Pool {
        address pool;
        uint    tokenBalanceIn;
        uint    tokenWeightIn;
        uint    tokenBalanceOut;
        uint    tokenWeightOut;
        uint    swapFee;
        uint    effectiveLiquidity;
    }

    struct Swap {
        address pool;
        address tokenIn;
        address tokenOut;
        uint    swapAmount; // tokenInAmount / tokenOutAmount
        uint    limitReturnAmount; // minAmountOut / maxAmountIn
        uint    maxPrice;
    }

    struct Params {
        uint8   priceStatisticsLookbackInRound;
        uint64  dynamicCoverageFeesZ;
        uint256 swapFee;
        uint256 priceStatisticsLookbackInSec;
        uint256 dynamicCoverageFeesHorizon;
        bool    publicSwap;
    }

    struct BindToken {
        address token;
        uint256 balance;
        uint80  weight;
        address oracle;
    }

    modifier _beforeDeadline(uint deadline) {
        require(block.timestamp <= deadline, "ERR_PASSED_DEADLINE");
        _;
    }

    IFactory immutable private factory;
    address immutable private wnative;
    address constant private nativeAddress = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    constructor(address _factory, address _wnative) {
        factory = IFactory(_factory);
        wnative = _wnative;
    }

    /*
    *   TokenIn and TokenOut should be the same for each swap
    */
    function batchSwapExactIn(
        Swap[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut,
        uint deadline
    )
        external payable
        _beforeDeadline(deadline)
        returns (uint totalAmountOut)
    {
        transferFromAll(tokenIn, totalAmountIn);

        for (uint i; i < swaps.length;) {
            Swap memory swap = swaps[i];

            require(factory.isPool(swap.pool), "ERR_UNREGISTERED_POOL");

            IERC20 SwapTokenIn = IERC20(swap.tokenIn);
            IPool pool = IPool(swap.pool);

            // required for some ERC20 such as USDT before changing the allowed transferable tokens
            // https://github.com/d-xo/weird-erc20
            if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                SwapTokenIn.approve(swap.pool, 0);
            }

            // approving type(uint).max may result an error for some ERC20 tokens
            // https://github.com/d-xo/weird-erc20
            SwapTokenIn.approve(swap.pool, swap.swapAmount);

            (uint tokenAmountOut,) = pool.swapExactAmountInMMM(
                                        swap.tokenIn,
                                        swap.swapAmount,
                                        swap.tokenOut,
                                        swap.limitReturnAmount,
                                        swap.maxPrice
                                    );
            
            totalAmountOut += tokenAmountOut;
                
            unchecked{++i;}
        }

        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");

        transferAll(tokenOut, totalAmountOut);
        transferAll(tokenIn, getBalance(tokenIn));
    }

    function batchSwapExactOut(
        Swap[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint maxTotalAmountIn,
        uint deadline
    )
        external payable
        _beforeDeadline(deadline)
        returns (uint totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint i; i < swaps.length;) {
            Swap memory swap = swaps[i];

            require(factory.isPool(swap.pool), "ERR_UNREGISTERED_POOL");

            IERC20 SwapTokenIn = IERC20(swap.tokenIn);
            IPool pool = IPool(swap.pool);

            // required for some ERC20 such as USDT before changing the allowed transferable tokens
            // https://github.com/d-xo/weird-erc20
            if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                SwapTokenIn.approve(swap.pool, 0);
            }

            // approving type(uint).max may result an error for some ERC20 tokens
            // https://github.com/d-xo/weird-erc20
            SwapTokenIn.approve(swap.pool, swap.limitReturnAmount);

            (uint tokenAmountIn,) = pool.swapExactAmountOutMMM(
                                        swap.tokenIn,
                                        swap.limitReturnAmount,
                                        swap.tokenOut,
                                        swap.swapAmount,
                                        swap.maxPrice
                                    );

            totalAmountIn += tokenAmountIn;
            unchecked{++i;}
        }

        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");

        transferAll(tokenOut, getBalance(tokenOut));
        transferAll(tokenIn, getBalance(tokenIn));
    }

    function multihopBatchSwapExactIn(
        Swap[][] memory swapSequences,
        address tokenIn,
        address tokenOut,
        uint totalAmountIn,
        uint minTotalAmountOut,
        uint deadline
    )
        public payable
        _beforeDeadline(deadline)
        returns (uint totalAmountOut)
    {

        transferFromAll(tokenIn, totalAmountIn);

        for (uint i; i < swapSequences.length;) {
            uint tokenAmountOut;
            for (uint j; j < swapSequences[i].length;) {
                Swap memory swap = swapSequences[i][j];
                require(factory.isPool(swap.pool), "ERR_UNREGISTERED_POOL");

                IToken SwapTokenIn = IToken(swap.tokenIn);
                if (j >= 1) {
                    // Makes sure that on the second swap the output of the first was used
                    // so there is not intermediate token leftover
                    swap.swapAmount = tokenAmountOut;
                }
                IPool pool = IPool(swap.pool);
                if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                    SwapTokenIn.approve(swap.pool, 0);
                }
                SwapTokenIn.approve(swap.pool, swap.swapAmount);
                (tokenAmountOut,) = pool.swapExactAmountInMMM(
                                            swap.tokenIn,
                                            swap.swapAmount,
                                            swap.tokenOut,
                                            swap.limitReturnAmount,
                                            swap.maxPrice
                                        );
                unchecked{++j;}
            }
            // This takes the amountOut of the last swap
            totalAmountOut += tokenAmountOut;
            unchecked{++i;}
        }

        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");

        transferAll(tokenOut, totalAmountOut);
        transferAll(tokenIn, getBalance(tokenIn));

    }


    function multihopBatchSwapExactOut(
        Swap[][] memory swapSequences,
        address tokenIn,
        address tokenOut,
        uint maxTotalAmountIn,
        uint deadline
    )
        public payable
        _beforeDeadline(deadline)
        returns (uint totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint i; i < swapSequences.length;) {
            uint tokenAmountInFirstSwap;
            // Specific code for a simple swap and a multihop (2 swaps in sequence)

            if (swapSequences[i].length == 1) {

                Swap memory swap = swapSequences[i][0];
                require(factory.isPool(swap.pool), "ERR_UNREGISTERED_POOL");
                IToken SwapTokenIn = IToken(swap.tokenIn);

                IPool pool = IPool(swap.pool);
                if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                    SwapTokenIn.approve(swap.pool, 0);
                }
                SwapTokenIn.approve(swap.pool, swap.limitReturnAmount);

                (tokenAmountInFirstSwap,) = pool.swapExactAmountOutMMM(
                                        swap.tokenIn,
                                        swap.limitReturnAmount,
                                        swap.tokenOut,
                                        swap.swapAmount,
                                        swap.maxPrice
                                    );
            } else {
                // Consider we are swapping A -> B and B -> C. The goal is to buy a given amount
                // of token C. But first we need to buy B with A so we can then buy C with B
                // To get the exact amount of C we then first need to calculate how much B we'll need:
                uint intermediateTokenAmount; // This would be token B as described above
                Swap memory firstSwap = swapSequences[i][0];
                Swap memory secondSwap = swapSequences[i][1];
                require(factory.isPool(secondSwap.pool), "ERR_UNREGISTERED_POOL");
                IPool poolSecondSwap = IPool(secondSwap.pool);
                intermediateTokenAmount = poolSecondSwap.getAmountInGivenOutMMM(secondSwap.tokenIn, secondSwap.tokenOut, secondSwap.swapAmount);
                tokenAmountInFirstSwap = poolSecondSwap.getAmountInGivenOutMMM(firstSwap.tokenIn, firstSwap.tokenOut, intermediateTokenAmount);
                require(tokenAmountInFirstSwap <= firstSwap.limitReturnAmount, "ERR_LIMIT_IN");

                //// Buy intermediateTokenAmount of token B with A in the first pool
                require(factory.isPool(firstSwap.pool), "ERR_UNREGISTERED_POOL");
                IToken FirstSwapTokenIn = IToken(firstSwap.tokenIn);
                IPool poolFirstSwap = IPool(firstSwap.pool);
                if (FirstSwapTokenIn.allowance(address(this), firstSwap.pool) > 0) {
                    FirstSwapTokenIn.approve(firstSwap.pool, 0);
                }
                FirstSwapTokenIn.approve(firstSwap.pool, tokenAmountInFirstSwap);
                poolFirstSwap.swapExactAmountOutMMM(
                                        firstSwap.tokenIn,
                                        tokenAmountInFirstSwap,
                                        firstSwap.tokenOut,
                                        intermediateTokenAmount, // This is the amount of token B we need
                                        firstSwap.maxPrice
                                    );
                //// Buy the final amount of token C desired
                IToken SecondSwapTokenIn = IToken(secondSwap.tokenIn);
                if (SecondSwapTokenIn.allowance(address(this), secondSwap.pool) > 0) {
                    SecondSwapTokenIn.approve(secondSwap.pool, 0);
                }
                    SecondSwapTokenIn.approve(secondSwap.pool, intermediateTokenAmount);


                poolSecondSwap.swapExactAmountOutMMM(
                                        secondSwap.tokenIn,
                                        intermediateTokenAmount,
                                        secondSwap.tokenOut,
                                        secondSwap.swapAmount,
                                        secondSwap.maxPrice
                                    );
            }
            totalAmountIn += tokenAmountInFirstSwap;
            unchecked{++i;}
        }

        require(totalAmountIn <= maxTotalAmountIn, "ERR_LIMIT_IN");

        transferAll(tokenOut, getBalance(tokenOut));
        transferAll(tokenIn, getBalance(tokenIn));
    }


    // create pool with customized parameters
    function createPoolWithParams(
	    BindToken[] calldata bindTokens,
        Params calldata params,
        bool finalize,
        uint deadline
    ) 
        external payable
        returns (address poolAddress)
    {
        poolAddress = factory.newPool();
        IPool pool = IPool(poolAddress);
        
        // setting the pool's parameters
        pool.setSwapFee(params.swapFee);
        pool.setDynamicCoverageFeesZ(params.dynamicCoverageFeesZ);
        pool.setDynamicCoverageFeesHorizon(params.dynamicCoverageFeesHorizon);
        pool.setPriceStatisticsLookbackInRound(params.priceStatisticsLookbackInRound);
        pool.setPriceStatisticsLookbackInSec(params.priceStatisticsLookbackInSec);    

        _createPool(poolAddress, bindTokens, finalize, deadline);
    }

    // create pool with default parameters
    function createPool(
	    BindToken[] calldata bindTokens,
        bool finalize,
        uint deadline
    ) 
        external payable
        returns (address pool)
    {
        pool = factory.newPool();

        _createPool(pool, bindTokens, finalize, deadline);
    }

    function _createPool(
        address pool,
	    BindToken[] calldata bindTokens,
        bool finalize,
        uint deadline
    )
        internal
        _beforeDeadline(deadline)
    {
        address tokenIn;

        for (uint i; i < bindTokens.length;) {
            BindToken memory bindToken = bindTokens[i];

            transferFromAll(bindToken.token, bindToken.balance);
            
            if(isNative(bindToken.token)) {
                tokenIn = wnative;
            }
            else {
                tokenIn = bindToken.token;
            }

            // approving type(uint).max may result an error for some ERC20 tokens
            // https://github.com/d-xo/weird-erc20
            IERC20(tokenIn).approve(pool, bindToken.balance);
            
            IPool(pool).bindMMM(tokenIn, bindToken.balance, bindToken.weight, bindToken.oracle);
            
            unchecked{++i;}
        }

        if (finalize) {
            // This will finalize the pool and send the pool shares to the caller
            IPool(pool).finalize();
            IToken(pool).transfer(msg.sender, IToken(pool).balanceOf(address(this)));
        }

        /*
        NOTES:
            If we add "require(!finalized && no bound tokens)" for Pool.setController(address manager)
            The proxy cannot transfer the controller to the msg.sender
            In that case we should either set the controller in pool.finalize(msg.sender)
            Or use Auth like in BActions' proxy
        */ 
        IPool(pool).setController(msg.sender);
    }

    // Join pool
    function joinPool(
        IPool pool,
        bytes calldata signature,
        uint256[] calldata maxAmountsIn,
        address owner,
        uint256 poolAmountOut,
        uint256 deadline
    )
    external {

        require(factory.isPool(address(pool)), "ERR_UNREGISTERED_POOL");
        address[] memory tokensIn = pool.getTokens();

        for(uint i; i < tokensIn.length;) {
            transferFromAll(tokensIn[i], maxAmountsIn[i]);
       
            if (IERC20(tokensIn[i]).allowance(address(this), address(pool)) > 0) {
                IERC20(tokensIn[i]).approve(address(pool), 0);
            }
            IERC20(tokensIn[i]).approve(address(pool), maxAmountsIn[i]);

            unchecked{++i;}
        }

        pool.permitJoinPool(signature, maxAmountsIn, owner, poolAmountOut, deadline);

        for(uint i; i < tokensIn.length;) {
            transferAll(tokensIn[i], IERC20(tokensIn[i]).balanceOf(address(this)));
            unchecked{++i;}
        }

    }

    function transferFromAll(address token, uint amount) internal {
        if (isNative(token)) {
            IToken(wnative).deposit{value: msg.value}();
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function getBalance(address token) internal view returns (uint) {
        if (isNative(token)) {
            return IToken(wnative).balanceOf(address(this));
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }

    function transferAll(address token, uint amount) internal {
        if (amount != 0) {
            if (isNative(token)) {
                IToken(wnative).withdraw(amount);
                // TODO: check safety of transfer
                payable(msg.sender).transfer(amount);
            } else {
                IERC20(token).safeTransfer(msg.sender, amount);
            }
        }
    }

    function isNative(address token) internal pure returns(bool) {
        return (token == nativeAddress);
    }

    receive() external payable{}
}