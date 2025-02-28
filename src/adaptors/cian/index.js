const axios = require('axios');

const apiUrl_avax = 'https://data.cian.app/api/v1/staking_avax/apr';
const apiUrl_btc = 'https://data.cian.app/api/v1/staking_btc/apr';

async function fetch() {
  const response_avax = (await axios.get(apiUrl_avax)).data.data;
  const response_btc = (await axios.get(apiUrl_btc)).data.data;
  return [...response_avax, ...response_btc];
}

const main = async () => {
  const data = await fetch();

  return data.map((p) => {
    const symbolSplit = p.symbol.split('-')[1];
    const symbol = symbolSplit.replace(/ *\([^)]*\) */g, '');
    // extract content within () -> meta data
    const poolMeta = /\(([^)]+)\)/.exec(symbolSplit)[1];

    return {
      ...p,
      symbol,
      poolMeta,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://dapp.cian.app',
};
