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
    },
    rinkeby: {
      url: `${process.env.RINKEBY_RPC_URL}`,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    }
  }
};

export default config;
