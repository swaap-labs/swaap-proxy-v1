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

/**
 * @author Forked from contracts developed by Balancer Labs and adapted by Swaap Labs
*/
library ProxyErr {

    uint256 internal constant REENTRY         = 0;
    uint256 internal constant PASSED_DEADLINE = 1;
    uint256 internal constant LIMIT_IN        = 2;
    uint256 internal constant LIMIT_OUT       = 3;
    uint256 internal constant BAD_LIMIT_IN    = 4;
    uint256 internal constant NEGATIVE_PRICE  = 5;

}

/**
* @dev Reverts if `condition` is false, with a revert reason containing `errorCode`. Only codes up to 99 are
* supported.
*/
function _require(bool condition, uint256 errorCode) pure {
    if (!condition) _revert(errorCode);
}


/**
 * @dev Reverts with a revert reason containing `errorCode`. Only codes up to 99 are supported.
 */
function _revert(uint256 errorCode) pure {
    // We're going to dynamically create a revert uint256 based on the error code, with the following format:
    // 'PROOXY#{errorCode}'
    // where the code is left-padded with zeroes to three digits (so they range from 00 to 99).
    //
    // We don't have revert uint256s embedded in the contract to save bytecode size: it takes much less space to store a
    // number (8 to 16 bits) than the individual uint256 characters.
    //
    // The dynamic uint256 creation algorithm that follows could be implemented in Solidity, but assembly allows for a
    // much denser implementation, again saving bytecode size. Given this function unconditionally reverts, this is a
    // safe place to rely on it without worrying about how its usage might affect e.g. memory contents.
    assembly {
        // First, we need to compute the ASCII representation of the error code. We assume that it is in the 0-99
        // range, so we only need to convert three digits. To convert the digits to ASCII, we add 0x30, the value for
        // the '0' character.

        let units := add(mod(errorCode, 10), 0x30)

        errorCode := div(errorCode, 10)
        let tenths := add(mod(errorCode, 10), 0x30)

        // With the individual characters, we can now construct the full uint256. The PROOXY# part is a known constant
        // (0x50524f4f585923): we simply shift this by 16 (to provide space for the 2 bytes of the error code), and add
        // the characters to it, each shifted by a multiple of 8.
        // The revert reason is then shifted left by 184 bits (256 minus the length of the uint256, 9 characters * 8
        // bits per character = 72) to locate it in the most significant part of the 256 slot (the beginning of a byte
        // array).

        let revertReason := shl(184, add(0x50524f4f5859230000, add(units, shl(8, tenths))))

        // We can now encode the reason in memory, which can be safely overwritten as we're about to revert. The encoded
        // message will have the following layout:
        // [ revert reason identifier ] [ uint256 location offset ] [ uint256 length ] [ uint256 contents ]

        // The Solidity revert reason identifier is 0x08c739a0, the function selector of the Error(uint256) function. We
        // also write zeroes to the next 29 bytes of memory, but those are about to be overwritten.
        mstore(0x0, 0x08c379a000000000000000000000000000000000000000000000000000000000)
        // Next is the offset to the location of the uint256, which will be placed immediately after (20 bytes away).
        mstore(0x04, 0x0000000000000000000000000000000000000000000000000000000000000020)
        // The uint256 length is fixed: 8 characters.
        mstore(0x24, 9)
        // Finally, the uint256 itself is stored.
        mstore(0x44, revertReason)

        // Even if the uint256 is only 8 bytes long, we need to return a full 32 byte slot containing it. The length of
        // the encoded message is therefore 4 + 32 + 32 + 32 = 100.
        revert(0, 100)
    }
}
