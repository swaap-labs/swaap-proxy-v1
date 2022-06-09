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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@swaap-labs/swaap-core-v1/contracts/interfaces/IFactory.sol";
import "@swaap-labs/swaap-core-v1/contracts/interfaces/IPool.sol";
import "@swaap-labs/swaap-core-v1/contracts/structs/Struct.sol";
import "@swaap-labs/swaap-core-v1/contracts/interfaces/IAggregatorV3.sol";

import "./interfaces/IERC20WithDecimals.sol";
import "./interfaces/IWrappedERC20.sol";


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
        uint    limitAmount; // minAmountOut / maxAmountIn
        uint    maxPrice;
    }

    struct Params {
        bool    publicSwap;
        uint8   priceStatisticsLookbackInRound;
        uint64  dynamicCoverageFeesZ;
        uint256 swapFee;
        uint256 priceStatisticsLookbackInSec;
        uint256 dynamicCoverageFeesHorizon;
    }

    struct BindToken {
        address token;
        uint256 balance;
        uint80  weight;
        address oracle;
    }
    
    struct SwapResult {
        uint256 amount;
        uint256 spread;
    }

    modifier _beforeDeadline(uint deadline) {
        require(block.timestamp <= deadline, "ERR_PASSED_DEADLINE");
        _;
    }

    bool locked;
    modifier _lock() {
        require(!locked, "ERR_REENTRANCY");
        locked = true;
        _;
        locked = false;
    }

    address immutable private wnative;
    address constant private NATIVE_ADDRESS = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    uint256 constant private ONE = 10 ** 18;

    constructor(address _wnative) {
        wnative = _wnative;
    }

    /**
    * @notice Swap the same tokenIn/tokenOut pair from multiple pools given the amount of tokenIn on each swap
    * @dev totalAmountIn should be equal to the sum of tokenAmountIn on each swap
    * @param swaps Array of swaps
    * @param tokenIn Address of tokenIn
    * @param tokenOut Address of tokenOut
    * @param totalAmountIn Maximum amount of tokenIn that the user is willing to trade
    * @param minTotalAmountOut Minimum amount of tokenOut that the user wants to receive
    * @param deadline Maximum deadline for accepting the trade
    * @return totalAmountOut Total amount of tokenOut received
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
        _lock
        returns (uint totalAmountOut)
    {
        transferFromAll(tokenIn, totalAmountIn);

        for (uint i; i < swaps.length;) {
            Swap memory swap = swaps[i];

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
                swap.limitAmount,
                swap.maxPrice
            );
            
            totalAmountOut += tokenAmountOut;
                
            unchecked{++i;}
        }

        require(totalAmountOut >= minTotalAmountOut, "ERR_LIMIT_OUT");

        transferAll(tokenOut, totalAmountOut);
        transferAll(tokenIn, getBalance(tokenIn));
    }


    /**
    * @notice Swap the same tokenIn/tokenOut pair from multiple pools given the amount of tokenOut on each swap
    * @param swaps Array of swaps
    * @param tokenIn Address of tokenIn
    * @param tokenOut Address of tokenOut
    * @param totalAmountIn Maximum amount of tokenIn that the user is willing to trade
    * @param deadline Maximum deadline for accepting the trade
    * @return totalAmountIn Total amount of traded tokenIn
    */
    function batchSwapExactOut(
        Swap[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint maxTotalAmountIn,
        uint deadline
    )
        external payable
        _beforeDeadline(deadline)
        _lock
        returns (uint totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint i; i < swaps.length;) {
            Swap memory swap = swaps[i];

            IERC20 SwapTokenIn = IERC20(swap.tokenIn);
            IPool pool = IPool(swap.pool);

            // required for some ERC20 such as USDT before changing the allowed transferable tokens
            // https://github.com/d-xo/weird-erc20
            if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                SwapTokenIn.approve(swap.pool, 0);
            }

            // approving type(uint).max may result an error for some ERC20 tokens
            // https://github.com/d-xo/weird-erc20
            SwapTokenIn.approve(swap.pool, swap.limitAmount);

            (uint tokenAmountIn,) = pool.swapExactAmountOutMMM(
                swap.tokenIn,
                swap.limitAmount,
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


    /**
    * @notice Performs multiple swapSequences given the amount of tokenIn on each swap 
    * @dev Few considerations: 
    * - swapSequences[i][j]:
    *   a) i: represents a swap sequence (swapSequences[i]   : tokenIn --> B --> C --> tokenOut)
    *   b) j: represents a swap          (swapSequences[i][0]: tokenIn --> B)
    * - rows 'i' could be of varying lengths for ex:
    * - swapSequences = {swapSequence 1: tokenIn --> B --> C --> tokenOut,
    *                    swapSequence 2: tokenIn --> tokenOut}
    * - each swap sequence should have the same starting tokenIn and finishing tokenOut
    * - totalAmountIn should be equal to the sum of tokenAmountIn on each swapSequence
    * @param swapSequences Array of swapSequences
    * @param tokenIn Address of tokenIn
    * @param tokenOut Address of tokenOut
    * @param totalAmountIn Maximum amount of tokenIn that the user is willing to trade
    * @param minTotalAmountOut Minimum amount of tokenOut that the user must receive
    * @param deadline Maximum deadline for accepting the trade
    * @return totalAmountOut Total amount of tokenOut received
    */
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
        _lock
        returns (uint totalAmountOut)
    {

        transferFromAll(tokenIn, totalAmountIn);

        for (uint i; i < swapSequences.length;) {
            uint tokenAmountOut;
            for (uint j; j < swapSequences[i].length;) {
                Swap memory swap = swapSequences[i][j];

                IERC20WithDecimals SwapTokenIn = IERC20WithDecimals(swap.tokenIn);
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
                    swap.limitAmount,
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

    /**
    * @notice Performs multiple swapSequences given the amount of tokenOut on each swapSequence 
    * @dev Few considerations: 
    * - swapSequences[i][j]:
    *   a) i: represents a swap sequence (swapSequences[i]   : tokenIn --> B --> tokenOut)
    *   b) j: represents a swap          (swapSequences[i][0]: tokenIn --> B)
    * - rows 'i' could be of varying lengths for ex:
    * - swapSequences = {swapSequence 1: tokenIn --> B --> tokenOut,
    *                    swapSequence 2: tokenIn --> tokenOut}
    * - each swap sequence should have the same starting tokenIn and finishing tokenOut
    * - maxTotalAmountIn can be differennt than the sum of tokenAmountIn on each swapSequence
    * - totalAmountOut is equal to the sum of the amount of tokenOut on each swap sequence
    * - /!\ /!\ a swap sequence should have 1 multihop at most (swapSequences[i].length <= 2) /!\ /!\
    * @param swapSequences Array of swapSequences
    * @param tokenIn Address of tokenIn
    * @param tokenOut Address of tokenOut
    * @param maxTotalAmountIn Maximum amount of tokenIn that the user is willing to trade
    * @param deadline Maximum deadline for accepting the trade
    * @return totalAmountIn Total amount of traded tokenIn
    */
    function multihopBatchSwapExactOut(
        Swap[][] memory swapSequences,
        address tokenIn,
        address tokenOut,
        uint maxTotalAmountIn,
        uint deadline
    )
        public payable
        _beforeDeadline(deadline)
        _lock
        returns (uint totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint i; i < swapSequences.length;) {
            uint tokenAmountInFirstSwap;
            // Specific code for a simple swap and a multihop (2 swaps in sequence)

            if (swapSequences[i].length == 1) {
                Swap memory swap = swapSequences[i][0];
                IERC20WithDecimals SwapTokenIn = IERC20WithDecimals(swap.tokenIn);

                IPool pool = IPool(swap.pool);
                if (SwapTokenIn.allowance(address(this), swap.pool) > 0) {
                    SwapTokenIn.approve(swap.pool, 0);
                }
                SwapTokenIn.approve(swap.pool, swap.limitAmount);

                (tokenAmountInFirstSwap,) = pool.swapExactAmountOutMMM(
                    swap.tokenIn,
                    swap.limitAmount,
                    swap.tokenOut,
                    swap.swapAmount,
                    swap.maxPrice
                );
            } else {
                // Consider we are swapping A -> B and B -> C. The goal is to buy a given amount
                // of token C. But first we need to buy B with A so we can then buy C with B
                // To get the exact amount of C we then first need to calculate how much B we'll need:
                Swap memory firstSwap = swapSequences[i][0];
                Swap memory secondSwap = swapSequences[i][1];

                IPool poolSecondSwap = IPool(secondSwap.pool);
                IPool poolFirstSwap = IPool(firstSwap.pool);
                (Struct.SwapResult memory secondSwapResult, ) = poolSecondSwap.getAmountInGivenOutMMM(
                    secondSwap.tokenIn,
                    secondSwap.limitAmount,
                    secondSwap.tokenOut,
                    secondSwap.swapAmount,
                    secondSwap.maxPrice
                );
                // This would be token B as described above
                uint intermediateTokenAmount = secondSwapResult.amount;
                (Struct.SwapResult memory firstSwapResult, ) = poolFirstSwap.getAmountInGivenOutMMM(
                    firstSwap.tokenIn,
                    firstSwap.limitAmount,
                    firstSwap.tokenOut,
                    intermediateTokenAmount,
                    firstSwap.maxPrice
                );
                tokenAmountInFirstSwap = firstSwapResult.amount;
                require(tokenAmountInFirstSwap <= firstSwap.limitAmount, "ERR_LIMIT_IN");

                //// Buy intermediateTokenAmount of token B with A in the first pool
                IERC20WithDecimals FirstSwapTokenIn = IERC20WithDecimals(firstSwap.tokenIn);
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
                IERC20WithDecimals SecondSwapTokenIn = IERC20WithDecimals(secondSwap.tokenIn);
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

    /**
    * @notice Creates a balanced pool with customized parameters where oracle-spot-price == pool-spot-price
    * @dev A pool is balanced if (balance_i * weight_j) / (balance_j * weight_i) = oraclePrice_j / oraclePrice_i, for all i != j
    * as a result: balance_i = (oraclePrice_j * balance_j * weight_i) / (oraclePrice_i * weight_j)
    * @param bindTokens Array containing the information of the tokens to bind [tokenAddress, balance, weight, oracleAddress]
    * @param params Customized parameters of the pool 
    * @param finalize Bool to finalize the pool or not
    * @param deadline Maximum deadline for accepting the creation of the pool
    * @return poolAddress The created pool's address
    */
    function createBalancedPoolWithParams(
	    BindToken[] memory bindTokens,
        Params calldata params,
        IFactory factory,
        bool finalize,
        uint deadline
    ) 
        external payable
        _beforeDeadline(deadline)
        _lock
        returns (address poolAddress)
    {
        uint bindTokensNumber = bindTokens.length;
        uint256[] memory oraclePrices = new uint256[](bindTokensNumber);
        int256 price;
        for(uint i; i < bindTokensNumber;) {
            (,price,,,) = IAggregatorV3(bindTokens[i].oracle).latestRoundData();
            require(price > 0, "ERR_NEGATIVE_PRICE");
            oraclePrices[i] = uint(price);
            unchecked {++i;}
        }

        
        uint balance_i;
        uint8 decimals_0 = IAggregatorV3(bindTokens[0].oracle).decimals() + IERC20WithDecimals(bindTokens[0].token).decimals();
        for(uint i=1; i < bindTokensNumber;){
            //    balance_i = (oraclePrice_j / oraclePrice_i) * (balance_j * weight_i) / (weight_j)
            // => balance_i = (relativePrice_j_i * balance_j * weight_i) / (weight_j)
            balance_i = getTokenRelativePrice(
                oraclePrices[i],
                IAggregatorV3(bindTokens[i].oracle).decimals() + IERC20WithDecimals(bindTokens[i].token).decimals(),
                oraclePrices[0],
                decimals_0
            );
            
            balance_i = bmul(balance_i, bindTokens[0].balance);
            balance_i = bmul(balance_i, bindTokens[i].weight);
            balance_i = bdiv(balance_i, bindTokens[0].weight);
            require(balance_i <= bindTokens[i].balance, "ERR_LIMIT_IN");
            bindTokens[i].balance = balance_i;
            unchecked {++i;}
        }
    

        poolAddress = _createPoolWithParams(
            bindTokens,
            params,
            factory,
            finalize
        );

    }

    /**
    * @notice Creates a pool with customized parameters
    * @param bindTokens Array containing the information of the tokens to bind [tokenAddress, balance, weight, oracleAddress]
    * @param params Customized parameters of the pool 
    * @param finalize Bool to finalize the pool or not
    * @param deadline Maximum deadline for accepting the creation of the pool
    * @return poolAddress The created pool's address
    */
    function createPoolWithParams(
	    BindToken[] calldata bindTokens,
        Params calldata params,
        IFactory factory,
        bool finalize,
        uint deadline
    ) 
        _beforeDeadline(deadline)
        _lock
        external payable
        returns (address poolAddress)
    {
        poolAddress = _createPoolWithParams(
                bindTokens,
                params,
                factory,
                finalize
        );
    }

    function _createPoolWithParams(
	    BindToken[] memory bindTokens,
        Params calldata params,
        IFactory factory,
        bool finalize
    ) 
        internal
        returns (address poolAddress)
    {
        poolAddress = factory.newPool();
        IPool pool = IPool(poolAddress);
        
        // setting the pool's parameters
        pool.setPublicSwap(params.publicSwap);
        pool.setSwapFee(params.swapFee);
        pool.setDynamicCoverageFeesZ(params.dynamicCoverageFeesZ);
        pool.setDynamicCoverageFeesHorizon(params.dynamicCoverageFeesHorizon);
        pool.setPriceStatisticsLookbackInRound(params.priceStatisticsLookbackInRound);
        pool.setPriceStatisticsLookbackInSec(params.priceStatisticsLookbackInSec);

        _setPool(poolAddress, bindTokens, finalize);
    }

    /**
    * @notice Creates a pool with default parameters
    * @param bindTokens Array containing the information of the tokens to bind [tokenAddress, balance, weight, oracleAddress]
    * @param finalize Bool to finalize the pool or not
    * @param deadline Maximum deadline for accepting the creation of the pool
    * @return poolAddress The created pool's address
    */
    function createPool(
	    BindToken[] calldata bindTokens,
        IFactory factory,
        bool finalize,
        uint deadline
    ) 
        external payable
        _beforeDeadline(deadline)
        _lock
        returns (address poolAddress)
    {
        poolAddress = factory.newPool();

        _setPool(poolAddress, bindTokens, finalize);
    }

    function _setPool(
        address pool,
	    BindToken[] memory bindTokens,
        bool finalize
    )
        internal
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
            
            transferAll(bindToken.token, getBalance(bindToken.token));

            unchecked{++i;}
        }

        if (finalize) {
            // This will finalize the pool and send the pool shares to the caller
            IPool(pool).finalize();
            IERC20WithDecimals(pool).transfer(msg.sender, IERC20WithDecimals(pool).balanceOf(address(this)));
        }

        /*
        NOTES:
            If we add "require(!finalized && no bound tokens)" for Pool.setController(address manager)
            The proxy cannot transfer the controller to the msg.sender
            In that case we should either set the controller in pool.finalize(msg.sender)
            Or use Auth like in BActions' proxy
        */ 
        IPool(pool).setControllerAndTransfer(msg.sender);
    }

    /**
    * @notice Join a pool with a fixed poolAmountOut
    * @dev Joining a pool could be done using the native token or its wrapped token, but not with both at the same time. 
    * In both cases, the wrapped token's address should be specified as an input (tokenIn).
    * @param pool Pool's address
    * @param poolAmountOut Pool tokens (shares) to be receives
    * @param maxAmountsIn Maximum amounts of each token
    * @param deadline Maximum deadline for accepting the joinPool
    */
    function joinPool(
        address pool,
        uint256 poolAmountOut,
        uint256[] calldata maxAmountsIn,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _lock
    {

        address[] memory tokensIn = IPool(pool).getTokens();

        for(uint i; i < tokensIn.length;) {

            if(tokensIn[i] == wnative && msg.value > 0) {
                require(msg.value == maxAmountsIn[i], "ERR_BAD_MAX_AMOUNT_IN");
                transferFromAll(NATIVE_ADDRESS, maxAmountsIn[i]);
            } else {
                transferFromAll(tokensIn[i], maxAmountsIn[i]);
            }

            if (IERC20(tokensIn[i]).allowance(address(this), pool) > 0) {
                IERC20(tokensIn[i]).approve(pool, 0);
            }
            IERC20(tokensIn[i]).approve(pool, maxAmountsIn[i]);

            unchecked{++i;}
        }

        IPool(pool).joinPool(poolAmountOut, maxAmountsIn);

        for(uint i; i < tokensIn.length;) {

            if(tokensIn[i] == wnative && msg.value > 0) {
                transferAll(NATIVE_ADDRESS, IERC20(tokensIn[i]).balanceOf(address(this)));
            } else {
                transferAll(tokensIn[i], IERC20(tokensIn[i]).balanceOf(address(this)));
            }

            unchecked{++i;}
        }

        IERC20WithDecimals(pool).transfer(msg.sender, IERC20WithDecimals(pool).balanceOf(address(this)));

    }

    /**
    * @notice Joins a pool with 1 tokenIn
    * @dev When joining a with the native token, msg.value should be equal to tokenAmountIn
    * @param pool Pool's address
    * @param tokenIn TokenIn's address
    * @param tokenAmountIn Amount of token In
    * @param minPoolAmountOut Minimum pool tokens (shares) expected to receive
    * @param deadline Maximum deadline for accepting the joinswapExternAmountIn
    * @return poolAmountOut The pool tokens received
    */
    function joinswapExternAmountIn(
        address pool,
        address tokenIn,
        uint tokenAmountIn,
        uint minPoolAmountOut,
        uint256 deadline
    ) external payable
    _beforeDeadline(deadline)
    _lock
    returns (uint256 poolAmountOut)
    {
        transferFromAll(tokenIn, tokenAmountIn);

        if(tokenIn == NATIVE_ADDRESS) {
            require(msg.value == tokenAmountIn, "ERR_BAD_AMOUNT_IN");
            tokenIn = wnative;
        }
        
        if (IERC20(tokenIn).allowance(address(this), pool) > 0) {
            IERC20(tokenIn).approve(pool, 0);
        }
        IERC20(tokenIn).approve(pool, tokenAmountIn);

        poolAmountOut = IPool(pool).joinswapExternAmountInMMM(tokenIn, tokenAmountIn, minPoolAmountOut);
        
        IERC20WithDecimals(pool).transfer(msg.sender, IERC20WithDecimals(pool).balanceOf(address(this)));
        
        return poolAmountOut;
    }

    function transferFromAll(address token, uint amount) internal {
        if (isNative(token)) {
            // The 'amount' input is not used in the payable case in order to convert all the
            // native token to wrapped native token. This is useful in function transferAll where only 
            // one transfer is needed when a fraction of the wrapped tokens are used.
            IWrappedERC20(wnative).deposit{value: msg.value}();
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function getBalance(address token) internal view returns (uint) {
        if (isNative(token)) {
            return IWrappedERC20(wnative).balanceOf(address(this));
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }

    function transferAll(address token, uint amount) internal {
        if (amount != 0) {
            if (isNative(token)) {
                IWrappedERC20(wnative).withdraw(amount);
                payable(msg.sender).transfer(amount);
            } else {
                IERC20(token).safeTransfer(msg.sender, amount);
            }
        }
    }

    function isNative(address token) internal pure returns(bool) {
        return (token == NATIVE_ADDRESS);
    }

    receive() external payable{}

    function bmul(uint256 a, uint256 b)
        internal pure
        returns (uint256)
    {
        uint256 c0 = a * b;
        uint256 c1 = c0 + (ONE / 2);
        uint256 c2 = c1 / ONE;
        return c2;
    }

    function bdiv(uint256 a, uint256 b)
        internal pure
        returns (uint256)
    {
        uint256 c0 = a * ONE;
        uint256 c1 = c0 + (b / 2);
        uint256 c2 = c1 / b;
        return c2;
    }

    function getTokenRelativePrice(
        uint256 price_1, uint8 decimal_1,
        uint256 price_2, uint8 decimal_2
    )
    internal
    pure
    returns (uint256) {
        // we consider tokens price to be > 0
        uint256 rawDiv = bdiv(price_2, price_1);
        if (decimal_1 == decimal_2) {
            return rawDiv;
        } else if (decimal_1 > decimal_2) {
            return bmul(
                rawDiv,
                10**(decimal_1 - decimal_2)*ONE
            );
        } else {
            return bdiv(
                rawDiv,
                10**(decimal_2 - decimal_1)*ONE
            );
        }
    }
}
