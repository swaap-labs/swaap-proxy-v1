<img src="https://docs.swaap.finance/img/brand.png" alt="drawing" width="300"/>


# Proxy @ v1
[![npm version](https://img.shields.io/npm/v/@swaap-labs/swaap-proxy-v1/latest.svg)](https://www.npmjs.com/package/@swaap-labs/swaap-proxy-v1/v/latest)
[![License](https://img.shields.io/badge/License-GPLv3-green.svg)](https://www.gnu.org/licenses/gpl-3.0)

## Overview

Swaap Protocol is building the first market neutral AMM. This repository contains its proxy smart contract.

Proxy contract enables a user to create custom pools, join existing ones, and batchswap/multihop trades on multiple pools.

For an in-depth documentation of Swaap, see our [docs](https://docs.swaap.finance/).

## Get Started

### Build and Test
```bash
$ yarn # install all dependencies
$ yarn build # compile all contracts
$ yarn test # run all tests (the tests are based on few polygon deployed SCs)
```

### Deployment
To deploy the Proxy contract to an EVM-compatible chain:

```bash
$ yarn deploy:$NETWORK
```

Where $NETWORK corresponds to a target network as defined in the [hardhat.config.ts](hardhat.config.ts) file.
The deployment script won't deploy the factory except when running tests.

## Ecosystem

### Using Swaap interfaces
The Swaap Proxy v1 interfaces are available for import into solidity smart contracts via the npm artifact `@swaap-labs/swaap-proxy-v1`, e.g.:

```solidity
import '@swaap-labs/swaap-proxy-v1/contracts/interfaces/IProxy.sol';

contract MyContract {
  IProxy swaapProxy;

  function doSomethingWithPool() {
    // swaapProxy.joinPool(...);
  }
}
```

### Error codes
Error messages are formated as `PROOXY#$ERROR_ID` strings.

Corresponding human readable messages can be found here: [contracts/ProxyErrors.sol](contracts/ProxyErrors.sol).

## Security
### Upgradability
All smart contracts are immutable, and cannot be upgraded.

## Licensing
Solidity source code is licensed under the GNU General Public License Version 3 (GPL v3): see [`LICENSE`](./LICENSE).