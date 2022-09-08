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

interface IProxyOwner {
    
    /**
    * @notice Emitted when the proxy is paused 
    */
    event LOG_PAUSED_PROXY();

    /**
    * @notice Emitted when the proxy is unpaused 
    */
    event LOG_UNPAUSED_PROXY();

    /**
    * @notice Emitted when a Swaap labs transfer is requested
    * @param from The current Swaap labs address
    * @param to The pending new Swaap labs address
    */
    event LOG_TRANSFER_REQUESTED(
        address indexed from,
        address indexed to
    );

    /**
    * @notice Emitted when a new address accepts the Swaap labs role
    * @param from The old Swaap labs address
    * @param to The new Swaap labs address
    */
    event LOG_NEW_SWAAPLABS(
        address indexed from,
        address indexed to
    );
}