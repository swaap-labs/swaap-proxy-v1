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

import "../structs/ProxyStruct.sol";

import "@swaap-labs/swaap-core-v1/contracts/structs/Struct.sol";

import "@swaap-labs/swaap-core-v1/contracts/interfaces/IFactory.sol";

interface IProxy {

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
    returns (uint256 totalAmountOut);

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
    returns (uint256 totalAmountIn);

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
    returns (uint256 totalAmountOut);

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
    returns (uint256 totalAmountIn);


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
    returns (address poolAddress);


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
    returns (address poolAddress);

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
    returns (address poolAddress);

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
    external payable;

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
    returns (uint256 poolAmountOut);

}