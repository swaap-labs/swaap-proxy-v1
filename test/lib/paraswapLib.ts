
const qs = require('qs');
const fetch = require('node-fetch');

const URL_PARASWAP_TRANSACTION = 'https://apiv5.paraswap.io/transactions/137?ignoreChecks=true';

export async function getParaswapTxData(swapParameters: any, proxy: any) {

    let priceData: any;

    await Promise.all([
        fetch(`https://apiv5.paraswap.io/prices/?${qs.stringify(swapParameters)}&network=137`),
    ]).then(async(values) => {
        priceData = await values[0].json();
    });

    const body = {
        srcToken: priceData.priceRoute.srcToken,
        srcDecimals: priceData.priceRoute.srcDecimals,
        destToken: priceData.priceRoute.destToken,
        destDecimals: priceData.priceRoute.destDecimals,
        srcAmount: priceData.priceRoute.srcAmount,
        slippage: 100, // 100 represents 1%
        userAddress: proxy.address,
        priceRoute: priceData.priceRoute,
      };
      
      const txResp = await fetch(URL_PARASWAP_TRANSACTION, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

      const txData = await txResp.json();
      if (txResp.ok === false) {
        throw('ParaSwap price api fail:' + txData.error);
      }

      return [priceData, txData];
}
