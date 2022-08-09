import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require('dotenv').config();

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
    }
  }
};

export default config;
