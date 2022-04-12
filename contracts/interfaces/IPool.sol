// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.ROUTER

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.8.12;

import "../test/structs/Struct.sol";

interface IPool {
    function swapExactAmountInMMM(address, uint, address, uint, uint) external returns (uint, uint);
    function swapExactAmountOutMMM(address, uint, address, uint, uint) external returns (uint, uint);
    function getAmountInGivenOutMMM(address, uint256, address, uint256, uint256) external view returns (Struct.SwapResult memory, uint256);
    function setSwapFee(uint) external;
    function setDynamicCoverageFeesZ(uint64) external;
    function setDynamicCoverageFeesHorizon(uint) external;
    function setPriceStatisticsLookbackInRound(uint8) external;
    function setPriceStatisticsLookbackInSec(uint) external;
    function bindMMM(address, uint, uint80, address) external;
    function permitJoinPool(bytes calldata, uint[] calldata, address, uint, uint) external;
    function setPublicSwap(bool) external;
    function setController(address) external;
    function finalize() external;
    function getBalance(address token) external view returns (uint256);
    function getDenormalizedWeightMMM(address token) external view returns (uint256);
    function getTokens() external view returns (address[] memory);
}