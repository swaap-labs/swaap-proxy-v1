import { ethers } from "hardhat";
const { wnative_addresses, zeroEx_addresses, paraswap_addresses, oneInch_addresses } = require("./constant_addresses");

async function main() {

  const network = (await ethers.provider.getNetwork()).name;
  const wnative = wnative_addresses[network];
  const zeroEx = zeroEx_addresses[network];
  const paraswap = paraswap_addresses[network];
  const oneInch = oneInch_addresses[network];

  if (wnative === undefined || wnative.length != 42) {
      throw `wnative token undefined for chainId "${network}", aborting proxy deployment`;
  } else if (zeroEx === undefined || zeroEx.length != 42) {
    throw `zeroEx aggregator address undefined for chainId "${network}", aborting proxy deployment`;
  } else if (paraswap === undefined || paraswap.length != 42) {
    throw `paraswap aggregator address undefined for chainId "${network}", aborting proxy deployment`;
  } else if (oneInch === undefined || oneInch.length != 42) {
    throw `oneInch aggregator address undefined for chainId "${network}", aborting proxy deployment`;
  }

  const Proxy = await ethers.getContractFactory("Proxy");
  const proxy = await Proxy.deploy(wnative, zeroEx, paraswap, oneInch);
  await proxy.deployed();

  console.log("Proxy deployed to: ", proxy.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
