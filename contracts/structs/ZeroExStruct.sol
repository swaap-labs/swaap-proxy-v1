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

contract ZeroExStruct {
    struct Quote {
        // The `sellAmount` field from the API response.
        uint256 sellAmount;
        // The `buyTokenAddress` field from the API response.
        address buyToken;
        // The `guaranteedPrice` * `sellAmount` fields from the API response. 
        uint256 guaranteedAmountOut;
        // The `allowanceTarget` field from the API response.
        address spender;
        // The `data` field from the API response.
        bytes swapCallData;
    }
}