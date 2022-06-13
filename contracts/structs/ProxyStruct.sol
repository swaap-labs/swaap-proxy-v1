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

contract ProxyStruct {
    struct Pool {
        address pool;
        uint256 tokenBalanceIn;
        uint256 tokenWeightIn;
        uint256 tokenBalanceOut;
        uint256 tokenWeightOut;
        uint256 swapFee;
        uint256 effectiveLiquidity;
    }

    struct Swap {
        address pool;
        address tokenIn;
        address tokenOut;
        uint256 swapAmount; // tokenInAmount / tokenOutAmount
        uint256 limitAmount; // minAmountOut / maxAmountIn
        uint256 maxPrice;
    }

    struct Params {
        bool    publicSwap;
        uint256 swapFee;
        uint8   priceStatisticsLookbackInRound;
        uint64  dynamicCoverageFeesZ;
        uint256 dynamicCoverageFeesHorizon;
        uint256 priceStatisticsLookbackInSec;
    }

    struct BindToken {
        address token;
        uint256 balance;
        uint80  weight;
        address oracle;
    }
}