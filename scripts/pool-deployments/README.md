<img src="https://docs.swaap.finance/img/brand.png" alt="drawing" width="300"/>

# Overview

The pool deployment scripts help a user to deploy a parametrized balanced pool using the proxy.
A pool configuration example can be found in [./polygon/eth33-usdc33-btc33.js](./polygon/eth33-usdc33-btc33.js)

## Configuration
### Pool Configuration
All the necessary pool configurations are defined in:

```js
/* ------------------------------------- Pool Configuration ------------------------------------- */
// network id
const networkId = 137;

// Tokens and weights
const tokens = ["WETH", "USDC", "WBTC"];
const weights = [10, 10, 10];

// Quote currency
const quote = "USD";

// initial TVL in quote currency (i.e. in USD if oracle prices are in USD)
const TVL = 1000;

// pool parameters
const params = [
    publicSwap = true,
    swapFee = web3.utils.toWei('0.00025'),
    priceStatisticsLookbackInRound = '5',
    dynamicCoverageFeesZ = web3.utils.toWei('6'),
    dynamicCoverageFeesHorizon = web3.utils.toWei('5'),
    priceStatisticsLookbackInSec = '3600'
];

const isFinalized = true;
```

The script will use the token and oracle addresses as specified in `./$NETWORK/token-oracle-pairs.js`
(i.e. [./polygon/token-oracle-pairs.js](./polygon/token-oracle-pairs.js)).

### Environment variables
In addition the following environment variables should be defined in the .env file:

```js
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS_POLYGON;
const PROXY_ADDRESS = process.env.PROXY_ADDRESS_POLYGON;
const NEW_CONTROLLER = process.env.NEW_CONTROLLER_POLYGON;
const GAS_PRICE = process.env.GAS_PRICE_WEI_POLYGON;
```

Where `FACTORY_ADDRESS` and `PROXY_ADDRESS` correspond to Swaap team's official SCs addresses (strongly recommended) or that of a user.

The `NEW_CONTROLLER` is an optional variable and should be only defined if the pool creator and the controller correspond to different addresses.

## Pool deployment
After configuring the pool and the environment variables, run the following from the base directory:

```bash
$ truffle exec $SCRIPT_RELATIVE_PATH --network $NETWORK
```

Where `$SCRIPT_RELATIVE_PATH` corresponds to the relative path of the configured script from the base directory, and `$NETWORK` corresponds to a target network as defined in the [truffle-config.js](truffle-config.js) file. The network id specified in the deployment script should match the one in [truffle-config.js](truffle-config.js).