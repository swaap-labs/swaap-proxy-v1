const TYPE_HASH = web3.utils.soliditySha3("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
const _HASHED_NAME = web3.utils.soliditySha3("Swaap Pool Token");
const _HASHED_VERSION = web3.utils.soliditySha3("1.0.0");
// FUNCTION_HASH should be equal to the smart contract's Const.FUNCTION_HASH: 0xc6288954c2597defc3fe8f3ec4ab3f1a5de5f72684852a38f5769c5d205e1482
const FUNCTION_HASH = web3.utils.soliditySha3("_joinPool(address owner,uint256 poolAmountOut,uint256[] calldata maxAmountsIn,uint256 deadline,uint256 nonce)");

async function _buildDomainSeparator(poolAddress) {

    let chainId = await web3.eth.getChainId();
    const encodedDomainSeparator = web3.eth.abi.encodeParameters(
       ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
       [TYPE_HASH, _HASHED_NAME, _HASHED_VERSION, chainId, poolAddress]
    );
    
    const hashedDomainSeperator = web3.utils.soliditySha3(encodedDomainSeparator);
    return hashedDomainSeperator;
}

function structHash(owner, poolAmountOut, maxAmountsIn, deadline, nonce) {
 
    let encodedStruct = web3.eth.abi.encodeParameters(
        ['bytes32', 'address', 'uint256', 'uint256[]', 'uint256', 'uint256'],
        [FUNCTION_HASH, owner, poolAmountOut, maxAmountsIn, deadline, nonce]
    );
    
    let hashedStruct = web3.utils.soliditySha3(encodedStruct);
    return hashedStruct;

}

async function _hashTypedDataV4(poolAddress, owner, poolAmountOut, maxAmountsIn, deadline, nonce) {
    let hashedStruct = structHash(owner, poolAmountOut, maxAmountsIn, deadline, nonce);
    let hashedDomainSeperator = await _buildDomainSeparator(poolAddress);
    let encodedDigest = web3.eth.abi.encodeParameters(
        ['bytes32', 'bytes32'],
        [hashedDomainSeperator, hashedStruct]
    );
    
    let digest = web3.utils.soliditySha3('0x1901' + encodedDigest.substring(2));
    return digest;
}

module.exports = {
    _hashTypedDataV4
};