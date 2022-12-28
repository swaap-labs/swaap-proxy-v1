const wnative_addresses = {
    "mainnet": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "rinkeby": "0xc778417e063141139fce010982780140aa0cd5ab",
    "kovan"  : "0xd0a1e359811322d97991e03f863a0c30c2cf029c",
    "matic": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    "mumbai" : "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
    "unknown": "0x0000000000000000000000000000000000000000",
};

// 0x proxy
const zeroEx_addresses = {
    "matic": "0xdef1c0ded9bec7f1a1670819833240f027b25eff"
}

// Paraswap augustus proxy
const paraswap_addresses = {
    "matic": "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57"
}

// 1inch AggregationRouterV4
const oneInch_addresses = {
    "matic": "0x1111111254fb6c44bAC0beD2854e76F90643097d"
}
  
module.exports = { 
    wnative_addresses,
    zeroEx_addresses,
    paraswap_addresses,
    oneInch_addresses
};