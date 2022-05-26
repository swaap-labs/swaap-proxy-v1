// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity =0.8.12;

contract TConstantOracle {

    uint256 timestamp;

    uint80 latestRoundId = 1;
    uint8 _decimals;
    int256 _precision = 100000000;

    mapping(uint80 => int256) public prices;

    constructor(int256 value_, uint8 decimals_) {
        prices[latestRoundId] = value_;
        _decimals = decimals_;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function description() public pure returns (string memory) {
        return "Constant";
    }

    function version() public pure returns (uint256) {
        return 1;
    }

    function latestRoundData()
    public
    view
    returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        int256 a = prices[latestRoundId];
        return (latestRoundId, a, block.timestamp, block.timestamp, latestRoundId);
    }

}
