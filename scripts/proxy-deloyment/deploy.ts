import { ethers } from "hardhat";
const { wnative_addresses } = require("./wnative_addresses");

async function main() {

  const network = (await ethers.provider.getNetwork()).name;
  const wnative = wnative_addresses[network];

  if (wnative === undefined || wnative.length != 42) {
      throw `wnative token undefined for chainId "${network}", aborting proxy deployment`;
  } 

  const Proxy = await ethers.getContractFactory("Proxy");
  const proxy = await Proxy.deploy(wnative);
  await proxy.deployed();

  console.log("Proxy deployed to: ", proxy.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
