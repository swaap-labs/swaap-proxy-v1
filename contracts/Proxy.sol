// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

pragma solidity =0.8.12;

import "./ProxyErrors.sol";

import "./structs/ProxyStruct.sol";
import "./structs/ZeroExStruct.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "@swaap-labs/swaap-core-v1/contracts/interfaces/IFactory.sol";
import "@swaap-labs/swaap-core-v1/contracts/interfaces/IPool.sol";
import "@swaap-labs/swaap-core-v1/contracts/structs/Struct.sol";

import "./interfaces/IProxy.sol";
import "./interfaces/IProxyOwner.sol";

import "./interfaces/IERC20WithDecimals.sol";
import "./interfaces/IWrappedERC20.sol";

contract Proxy is IProxy, IProxyOwner {

    using SafeERC20 for IERC20;

    modifier _beforeDeadline(uint256 deadline) {
        _require(block.timestamp <= deadline, ProxyErr.PASSED_DEADLINE);
        _;
    }

    bool internal locked;
    modifier _lock() {
        _require(!locked, ProxyErr.REENTRY);
        locked = true;
        _;
        locked = false;
    }

    enum Aggregator {
        ZeroEx,
        Paraswap,
        OneInch
    }

    bool    private paused;
    address private swaaplabs;
    address private pendingSwaaplabs;
    
    address immutable private wnative;
    address constant  private NATIVE_ADDRESS = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
    uint256 constant  private ONE = 10 ** 18;
    address immutable private zeroEx;
    address immutable private paraswap;
    address immutable private oneInch;

    constructor(address _wnative, address _zeroEx, address _paraswap, address _oneInch) {
        wnative = _wnative;
        zeroEx = _zeroEx;
        paraswap = _paraswap;
        oneInch = _oneInch;
        swaaplabs = msg.sender;
    }

    modifier _whenNotPaused() {
        _require(!paused, ProxyErr.PAUSED_PROXY);
        _;
    }

    modifier _onlySwaapLabs() {
        _require(msg.sender == swaaplabs, ProxyErr.NOT_SWAAPLABS);
        _;
    }

    /**
    * @notice Pause the proxy
    * @dev Pause disables all of the proxy's functionalities
    */
    function pauseProxy() 
    external
    _onlySwaapLabs
    {
        paused = true;
        emit LOG_PAUSED_PROXY();
    }

    /**
    * @notice Resume the factory's pools
    * @dev Unpausing re-enables all the proxy's functionalities
    */
    function resumeProxy()
    external 
    _onlySwaapLabs
    {
        paused = false;
        emit LOG_UNPAUSED_PROXY();
    }

    /**
    * @notice Allows an owner to begin transferring ownership to a new address,
    * pending.
    * @param _to The new pending owner's address
    */
    function transferOwnership(address _to)
    external
    _onlySwaapLabs
    {
        pendingSwaaplabs = _to;
        emit LOG_TRANSFER_REQUESTED(msg.sender, _to);
    }

    /**
    * @notice Allows an ownership transfer to be completed by the recipient.
    */
    function acceptOwnership()
    external
    {
        _require(msg.sender == pendingSwaaplabs, ProxyErr.NOT_PENDING_SWAAPLABS);

        address oldOwner = swaaplabs;
        swaaplabs = msg.sender;
        pendingSwaaplabs = address(0);

        emit LOG_NEW_SWAAPLABS(oldOwner, msg.sender);
    }

    function getSwaaplabs()
    external
    view
    returns (address)
    {
        return swaaplabs;
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
        ProxyStruct.Swap[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint256 totalAmountIn,
        uint256 minTotalAmountOut,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (uint256 totalAmountOut)
    {
        transferFromAll(tokenIn, totalAmountIn);

        for (uint256 i; i < swaps.length;) {
            ProxyStruct.Swap memory swap = swaps[i];

            IERC20 swapTokenIn = IERC20(swap.tokenIn);
            IPool pool = IPool(swap.pool);

            getApproval(swapTokenIn, swap.pool, swap.swapAmount);

            (uint256 tokenAmountOut,) = pool.swapExactAmountInMMM(
                swap.tokenIn,
                swap.swapAmount,
                swap.tokenOut,
                swap.limitAmount,
                swap.maxPrice
            );
            
            totalAmountOut += tokenAmountOut;
                
            unchecked{++i;}
        }

        _require(totalAmountOut >= minTotalAmountOut, ProxyErr.LIMIT_OUT);

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
        ProxyStruct.Swap[] memory swaps,
        address tokenIn,
        address tokenOut,
        uint256 maxTotalAmountIn,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (uint256 totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint256 i; i < swaps.length;) {
            ProxyStruct.Swap memory swap = swaps[i];

            IERC20 swapTokenIn = IERC20(swap.tokenIn);
            IPool pool = IPool(swap.pool);

            getApproval(swapTokenIn, swap.pool, swap.limitAmount);

            (uint256 tokenAmountIn,) = pool.swapExactAmountOutMMM(
                swap.tokenIn,
                swap.limitAmount,
                swap.tokenOut,
                swap.swapAmount,
                swap.maxPrice
            );

            totalAmountIn += tokenAmountIn;
            unchecked{++i;}
        }

        _require(totalAmountIn <= maxTotalAmountIn, ProxyErr.LIMIT_IN);

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
        ProxyStruct.Swap[][] memory swapSequences,
        address tokenIn,
        address tokenOut,
        uint256 totalAmountIn,
        uint256 minTotalAmountOut,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (uint256 totalAmountOut)
    {

        transferFromAll(tokenIn, totalAmountIn);

        for (uint256 i; i < swapSequences.length;) {
            uint256 tokenAmountOut;
            for (uint256 j; j < swapSequences[i].length;) {
                ProxyStruct.Swap memory swap = swapSequences[i][j];

                IERC20 swapTokenIn = IERC20(swap.tokenIn);
                if (j >= 1) {
                    // Makes sure that on the second swap the output of the first was used
                    // so there is not intermediate token leftover
                    swap.swapAmount = tokenAmountOut;
                }
                IPool pool = IPool(swap.pool);

                getApproval(swapTokenIn, swap.pool, swap.swapAmount);

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

        _require(totalAmountOut >= minTotalAmountOut, ProxyErr.LIMIT_OUT);

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
        ProxyStruct.Swap[][] memory swapSequences,
        address tokenIn,
        address tokenOut,
        uint256 maxTotalAmountIn,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (uint256 totalAmountIn)
    {
        transferFromAll(tokenIn, maxTotalAmountIn);

        for (uint256 i; i < swapSequences.length;) {
            uint256 tokenAmountInFirstSwap;
            // Specific code for a simple swap and a multihop (2 swaps in sequence)

            if (swapSequences[i].length == 1) {
                ProxyStruct.Swap memory swap = swapSequences[i][0];
                IERC20 swapTokenIn = IERC20(swap.tokenIn);

                IPool pool = IPool(swap.pool);

                getApproval(swapTokenIn, swap.pool, swap.limitAmount);

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
                ProxyStruct.Swap memory firstSwap = swapSequences[i][0];
                ProxyStruct.Swap memory secondSwap = swapSequences[i][1];

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
                uint256 intermediateTokenAmount = secondSwapResult.amount;
                (Struct.SwapResult memory firstSwapResult, ) = poolFirstSwap.getAmountInGivenOutMMM(
                    firstSwap.tokenIn,
                    firstSwap.limitAmount,
                    firstSwap.tokenOut,
                    intermediateTokenAmount,
                    firstSwap.maxPrice
                );
                tokenAmountInFirstSwap = firstSwapResult.amount;
                _require(tokenAmountInFirstSwap <= firstSwap.limitAmount, ProxyErr.LIMIT_IN);

                // Buy intermediateTokenAmount of token B with A in the first pool
                IERC20 firstSwapTokenIn = IERC20(firstSwap.tokenIn);

                getApproval(firstSwapTokenIn, firstSwap.pool, tokenAmountInFirstSwap);

                poolFirstSwap.swapExactAmountOutMMM(
                    firstSwap.tokenIn,
                    tokenAmountInFirstSwap,
                    firstSwap.tokenOut,
                    intermediateTokenAmount, // This is the amount of token B we need
                    firstSwap.maxPrice
                );

                // Buy the final amount of token C desired
                IERC20 secondSwapTokenIn = IERC20(secondSwap.tokenIn);

                getApproval(secondSwapTokenIn, secondSwap.pool, intermediateTokenAmount);

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

        _require(totalAmountIn <= maxTotalAmountIn, ProxyErr.LIMIT_IN);

        transferAll(tokenOut, getBalance(tokenOut));
        transferAll(tokenIn, getBalance(tokenIn));
    }

    /**
    * @notice Creates a balanced pool with customized parameters where oracle-spot-price == pool-spot-price
    * @dev A pool is balanced if (balanceI * weight_j) / (balance_j * weight_i) = oraclePrice_j / oraclePrice_i, for all i != j
    * as a result: balanceI = (oraclePrice_j * balance_j * weight_i) / (oraclePrice_i * weight_j)
    * @param bindTokens Array containing the information of the tokens to bind [tokenAddress, balance, weight, oracleAddress]
    * @param params Customized parameters of the pool 
    * @param finalize Bool to finalize the pool or not
    * @param deadline Maximum deadline for accepting the creation of the pool
    * @return poolAddress The created pool's address
    */
    function createBalancedPoolWithParams(
	    ProxyStruct.BindToken[] memory bindTokens,
        ProxyStruct.Params calldata params,
        IFactory factory,
        bool finalize,
        uint256 deadline
    ) 
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (address poolAddress)
    {
        uint256 bindTokensNumber = bindTokens.length;
        uint256[] memory oraclePrices = new uint256[](bindTokensNumber);
        int256 price;
        for(uint256 i; i < bindTokensNumber;) {
            (,price,,,) = AggregatorV3Interface(bindTokens[i].oracle).latestRoundData();
            _require(price > 0, ProxyErr.NEGATIVE_PRICE);
            oraclePrices[i] = uint(price);
            unchecked {++i;}
        }

        uint256 balanceI;
        uint8 decimals0 = AggregatorV3Interface(bindTokens[0].oracle).decimals() + IERC20WithDecimals(bindTokens[0].token).decimals();
        for(uint256 i=1; i < bindTokensNumber;){
            //    balanceI = (oraclePrice_j / oraclePrice_i) * (balance_j * weight_i) / (weight_j)
            // => balanceI = (relativePrice_j_i * balance_j * weight_i) / (weight_j)
            balanceI = getTokenRelativePrice(
                oraclePrices[i],
                AggregatorV3Interface(bindTokens[i].oracle).decimals() + IERC20WithDecimals(bindTokens[i].token).decimals(),
                oraclePrices[0],
                decimals0
            );
            
            balanceI = mul(balanceI, bindTokens[0].balance);
            balanceI = mul(balanceI, bindTokens[i].weight);
            balanceI = div(balanceI, bindTokens[0].weight);
            _require(balanceI <= bindTokens[i].balance, ProxyErr.LIMIT_IN);
            bindTokens[i].balance = balanceI;
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
	    ProxyStruct.BindToken[] calldata bindTokens,
        ProxyStruct.Params calldata params,
        IFactory factory,
        bool finalize,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
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
	    ProxyStruct.BindToken[] memory bindTokens,
        ProxyStruct.Params calldata params,
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
        pool.setPriceStatisticsLookbackInRound(params.priceStatisticsLookbackInRound);
        pool.setDynamicCoverageFeesZ(params.dynamicCoverageFeesZ);
        pool.setDynamicCoverageFeesHorizon(params.dynamicCoverageFeesHorizon);
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
	    ProxyStruct.BindToken[] calldata bindTokens,
        IFactory factory,
        bool finalize,
        uint256 deadline
    ) 
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (address poolAddress)
    {
        poolAddress = factory.newPool();

        _setPool(poolAddress, bindTokens, finalize);
    }

    function _setPool(
        address pool,
	    ProxyStruct.BindToken[] memory bindTokens,
        bool finalize
    )
        internal
    {
        address tokenIn;

        for (uint256 i; i < bindTokens.length;) {
            ProxyStruct.BindToken memory bindToken = bindTokens[i];

            transferFromAll(bindToken.token, bindToken.balance);
            
            if(isNative(bindToken.token)) {
                tokenIn = wnative;
            }
            else {
                tokenIn = bindToken.token;
            }

            getApproval(IERC20(tokenIn), pool, bindToken.balance);
            
            IPool(pool).bindMMM(tokenIn, bindToken.balance, bindToken.weight, bindToken.oracle);
            
            transferAll(bindToken.token, getBalance(bindToken.token));

            unchecked{++i;}
        }

        if (finalize) {
            // This will finalize the pool and send the pool shares to the caller
            IPool(pool).finalize();
            IERC20(pool).transfer(msg.sender, IERC20(pool).balanceOf(address(this)));
        }

        /*
        NOTES:
            If we add "require(!finalized && no bound tokens)" for Pool.setControllerAndTransfer(address manager)
            The proxy cannot transfer the controller to the msg.sender
            In that case we should either set the controller in pool.finalize(msg.sender)
            Or use Auth like in BActions' proxy
        */ 
        IPool(pool).setControllerAndTransfer(msg.sender);
    }

    /**
    * @notice Joins the pool after externally trading an input token with the necessary tokens for the pool
    * @dev The bindedTokens and maxAmountsIn should be in the same order of the output of pool.getTokens()
    * @dev when joining the pool using the native token, the wrapped address should be specified on 0x's API
    * @param bindedTokens The addresses of the binded tokens to the pool
    * @param maxAmountsIn The maximum amount of tokens that can be used to join the pool
    * @param fillQuotes The trades needed before joining the pool (uses 0x's API)
    * @param joiningAsset The address of the input token
    * @param joiningAmount The amount of the input token
    * @param pool The pool's address
    * @param poolAmountOut The amount of pool shares expected to be received
    * @param deadline Maximum deadline for accepting the joinswapExternAmountIn
    * @return poolAmountOut The amount of pool shares received
    */
    function joinPoolVia0x(
        address[] calldata bindedTokens,
        uint256[] memory maxAmountsIn,
        ZeroExStruct.Quote[] calldata fillQuotes,
        address joiningAsset,
        uint256 joiningAmount,
        address pool,
        uint256 poolAmountOut,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (uint256)
    {
        transferFromAll(joiningAsset, joiningAmount);
        
        tradeAssetsZeroEx(fillQuotes, joiningAsset);

        poolAmountOut = getMaximumPoolShares(bindedTokens, maxAmountsIn, pool, poolAmountOut);

        IPool(pool).joinPool(poolAmountOut, maxAmountsIn);

        for (uint256 i; i < bindedTokens.length;) {
            transferAll(bindedTokens[i], getBalance(bindedTokens[i]));
            unchecked {++i;}
        }

        // Each quote represents a unique ERC20 used for joining the pool
        // If the number of quotes is equal to the number of binded token to the pool
        // --> the joining asset is not in the pool and the function should transfer
        // any leftover asset from trading
        if(fillQuotes.length == bindedTokens.length ) {
            transferAll(joiningAsset, getBalance(joiningAsset));
        }

        IERC20(pool).transfer(msg.sender, poolAmountOut);
        
        return poolAmountOut;
    }

    function tradeAssetsZeroEx(
        ZeroExStruct.Quote[] calldata fillQuotes,
        address joiningAsset
    ) internal {

        address tradedToken = isNative(joiningAsset)? wnative : joiningAsset;
    
        for(uint256 i; i < fillQuotes.length;) {           

            getApproval(IERC20(tradedToken), fillQuotes[i].spender, fillQuotes[i].sellAmount);

            // Call the encoded swap function call on the contract at `swapTarget`
            (bool success,) = zeroEx.call(fillQuotes[i].swapCallData);
            _require(success, ProxyErr.FAILED_CALL);
            
            _require(getBalance(fillQuotes[i].buyToken) >= fillQuotes[i].guaranteedAmountOut, ProxyErr.LIMIT_OUT);

            unchecked{++i;}
        }
    }

    /**
    * @notice Performs a swap using 0x, paraswap or 1inch's sdk
    * @param tokenIn The address of tokenIn
    * @param amountIn The maximum amount of tokenIn
    * @param tokenOut The address of tokenOut
    * @param amountOut The minimum expected amount of tokenOut
    * @param spender The SC's address that will spender the input token
    * @param swapCallData The swap call data
    */
    function externalSwap(
        IERC20 tokenIn,
        uint256 amountIn,
        IERC20 tokenOut,
        uint256 amountOut,
        address spender,
        Aggregator aggregator,
        bytes calldata swapCallData,
        uint256 deadline
    )
    external
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    {
        
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);

        getApproval(tokenIn, spender, amountIn);

        // Call the encoded swap function call on the contract at `swapTarget`
        bool success;
        if (aggregator == Aggregator.ZeroEx) {
            (success,) = zeroEx.call(swapCallData);
        } else if (aggregator == Aggregator.Paraswap) {
            (success,) = paraswap.call(swapCallData);
        } else if (aggregator == Aggregator.OneInch) {
            (success,) = oneInch.call(swapCallData);
        }

        _require(success, ProxyErr.FAILED_CALL);
        
        if(address(tokenOut) != NATIVE_ADDRESS) {
            uint256 receivedAmountOut = tokenOut.balanceOf(address(this));
            _require(receivedAmountOut >= amountOut, ProxyErr.LIMIT_OUT);
            tokenOut.safeTransfer(msg.sender, receivedAmountOut);
        } else {
            uint256 receivedAmountOut = address(this).balance;
            _require(receivedAmountOut >= amountOut, ProxyErr.LIMIT_OUT);
            payable(msg.sender).transfer(receivedAmountOut);
        }

        tokenIn.safeTransfer(msg.sender, tokenIn.balanceOf(address(this)));

    }

    function getMaximumPoolShares(
        address[] calldata bindedTokens, // must be in the same order as the Pool
        uint256[] memory maxAmountsIn,
        address pool,
        uint256 poolAmountOut
    ) internal 
    returns (uint256)
    {

        uint256 ratio = type(uint256).max;

        for(uint256 i; i < bindedTokens.length;) {
            uint256 tokenBalance = IERC20(bindedTokens[i]).balanceOf(address(this));
            uint256 _ratio = divTruncated(tokenBalance, IPool(pool).getBalance(bindedTokens[i]));
            if(_ratio < ratio) {
                ratio  = _ratio;
            }
            unchecked {++i;}
        }

        uint256 extractablePoolShares = mulTruncated(ratio, IPool(pool).totalSupply());
        uint256 sharesRatio = div(extractablePoolShares, poolAmountOut);

        for(uint256 i; i < bindedTokens.length;) {
            maxAmountsIn[i] = mul(maxAmountsIn[i], sharesRatio);
            getApproval(IERC20(bindedTokens[i]), pool, maxAmountsIn[i]);
            unchecked {++i;}
        }

        return extractablePoolShares;

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
    _whenNotPaused
    _lock
    {

        address[] memory tokensIn = IPool(pool).getTokens();

        for(uint256 i; i < tokensIn.length;) {

            if(tokensIn[i] == wnative && msg.value > 0) {
                _require(msg.value == maxAmountsIn[i], ProxyErr.BAD_LIMIT_IN);
                transferFromAll(NATIVE_ADDRESS, maxAmountsIn[i]);
            } else {
                transferFromAll(tokensIn[i], maxAmountsIn[i]);
            }

            getApproval(IERC20(tokensIn[i]), pool, maxAmountsIn[i]);

            unchecked{++i;}
        }

        IPool(pool).joinPool(poolAmountOut, maxAmountsIn);

        for(uint256 i; i < tokensIn.length;) {

            if(tokensIn[i] == wnative && msg.value > 0) {
                transferAll(NATIVE_ADDRESS, IERC20(tokensIn[i]).balanceOf(address(this)));
            } else {
                transferAll(tokensIn[i], IERC20(tokensIn[i]).balanceOf(address(this)));
            }

            unchecked{++i;}
        }

        IERC20(pool).transfer(msg.sender, poolAmountOut);

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
        uint256 tokenAmountIn,
        uint256 minPoolAmountOut,
        uint256 deadline
    )
    external payable
    _beforeDeadline(deadline)
    _whenNotPaused
    _lock
    returns (uint256 poolAmountOut)
    {
        transferFromAll(tokenIn, tokenAmountIn);

        if(tokenIn == NATIVE_ADDRESS) {
            _require(msg.value == tokenAmountIn, ProxyErr.BAD_LIMIT_IN);
            tokenIn = wnative;
        }
        
        getApproval(IERC20(tokenIn), pool, tokenAmountIn);

        poolAmountOut = IPool(pool).joinswapExternAmountInMMM(tokenIn, tokenAmountIn, minPoolAmountOut);
        
        IERC20(pool).transfer(msg.sender, poolAmountOut);
        
        return poolAmountOut;
    }

    function transferFromAll(address token, uint256 amount) internal {
        if (isNative(token)) {
            // The 'amount' input is not used in the payable case in order to convert all the
            // native token to wrapped native token. This is useful in function transferAll where only 
            // one transfer is needed when a fraction of the wrapped tokens are used.
            IWrappedERC20(wnative).deposit{value: msg.value}();
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function getApproval(IERC20 token, address target, uint256 amount) internal {
        
        // required for some ERC20 such as USDT before changing the allowed transferable tokens
        // https://github.com/d-xo/weird-erc20
        if (token.allowance(address(this), target) < amount) {
            token.safeApprove(target, 0);
            token.safeApprove(target, type(uint256).max);
        }

    }

    function getBalance(address token) internal view returns (uint256) {
        if (isNative(token)) {
            return IWrappedERC20(wnative).balanceOf(address(this));
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }

    function transferAll(address token, uint256 amount) internal {
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

    function mul(uint256 a, uint256 b)
        internal pure
        returns (uint256)
    {
        uint256 c0 = a * b;
        uint256 c1 = c0 + (ONE / 2);
        uint256 c2 = c1 / ONE;
        return c2;
    }

    function mulTruncated(uint256 a, uint256 b)
    internal pure
    returns (uint256)
    {
        uint256 c0 = a * b;
        return c0 / ONE;
    }

    function div(uint256 a, uint256 b)
        internal pure
        returns (uint256)
    {
        uint256 c0 = a * ONE;
        uint256 c1 = c0 + (b / 2);
        uint256 c2 = c1 / b;
        return c2;
    }

    function divTruncated(uint256 a, uint256 b)
    internal pure
    returns (uint256)
    {
        uint256 c0 = a * ONE;
        return c0 / b;
    }

    function getTokenRelativePrice(
        uint256 price1, uint8 decimal1,
        uint256 price2, uint8 decimal2
    )
    internal
    pure
    returns (uint256) {
        // we consider tokens price to be > 0
        uint256 rawDiv = div(price2, price1);
        if (decimal1 == decimal2) {
            return rawDiv;
        } else if (decimal1 > decimal2) {
            return mul(
                rawDiv,
                10**(decimal1 - decimal2)*ONE
            );
        } else {
            return div(
                rawDiv,
                10**(decimal2 - decimal1)*ONE
            );
        }
    }
}