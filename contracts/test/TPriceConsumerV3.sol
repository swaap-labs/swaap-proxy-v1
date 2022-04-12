// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

contract TPriceConsumerV3 {

    int256 answer;
    function latestAnswer() external view returns (int256) {
        return answer;
    }

}