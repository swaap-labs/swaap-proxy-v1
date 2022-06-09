const tokenOraclePairs = {
    "DAI": {
        "token": "0x0aBABf7Cd9De9508D1B69B2dd2d374fA88d384d3",
        "oracles": {
            "USD": "0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF"
        }
    },
    "WETH": {
        "token": "0x4848683f3cC566E3588bFd6953FaAA7176968965",
        "oracles": {
            "USD": "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e"
        }
    },
    "WBTC": {
        "token": "0xead28cb59D01ad96c9CEEb486380FB514253f8eD",
        "oracles": {
            "USD": "0xECe365B379E1dD183B20fc5f022230C044d51404"
        }
    }
}

module.exports = { tokenOraclePairs };