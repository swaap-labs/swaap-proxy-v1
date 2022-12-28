import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require('dotenv').config();
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-truffle5";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          }
        }
      },
    ]
  },
  networks: {
    hardhat: {
      forking: {
        url: `${process.env.POLYGON_RPC_URL}`,
      }
    },
    polygon: {
      url: `${process.env.POLYGON_RPC_URL}`,
      accounts: [`${process.env.PRIVATE_KEY}`]
    },
  }
};

export default config;
