const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
abi = require("./abis.json");


const looksrare = '0xf4d2888d29D722226FafA5d9B24F9164c092421E';
const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

//contract for current reward per block (in WETH)
const feeSharing = '0xBcD7254A1D759EFA08eC7c3291B2E85c5dCC12ce';
//contract for number of (LOOKS) tokens that is minted at each block in the current phase and distributed for LOOKS staking
const distributor = '0x465A790B428268196865a3AE2648481ad7e0d3b1';
// compounding looks pool
const aggregator = '0x3ab16Af1315dc6C95F83Cbf522fecF98D00fd9ba';


const poolInfo = async (chain) => {
    //weth reward per block
    const rewardPerBlock = (await sdk.api.abi.call({ abi: abi.currentRewardPerBlock, target: feeSharing, chain: chain, })).output;
    const rewardToken = (await sdk.api.abi.call({ abi: abi.rewardToken, target: feeSharing, chain: chain, })).output;
    // looks balance staked in compounder pool
    const calculateSharesValueInLooks = (await sdk.api.abi.call({ abi: abi.calculateSharesValueInLOOKS, target: feeSharing, chain: chain, params: aggregator })).output;
    const rewardTokens = [rewardToken, looksrare];
    // looks reward per block
    const rewardPerBlockForStaking = (await sdk.api.abi.call({ abi: abi.rewardPerBlockForStaking, target: distributor, chain: chain, })).output;
    const totalAmountStaked = (await sdk.api.abi.call({ abi: abi.totalAmountStaked, target: distributor, chain: chain, })).output;

    const compounderReserve = calculateSharesValueInLooks / 1e18;
    const standardReserve = (totalAmountStaked / 1e18) - compounderReserve;

    return {
        rewardTokens,
        calculateSharesValueInLooks,
        rewardPerBlock,
        rewardPerBlockForStaking,
        compounderReserve,
        standardReserve,
    };
}

function calculateTvl(reserve, price) {
    const tvl = reserve * price;
    return tvl;
}

function calculateApy(reward, price, tvl) {
    // yearlyReward = reward X price X blocks
    // tvl = poolBalance X price
    // apy = yearlyReward / tvl
    const BLOCK_TIME = 13.5;
    const BLOCKS = 365 * 24 * 60 * 60 / BLOCK_TIME;
    const yearlyReward = (reward / 1e18) * price * BLOCKS;
    const apy = (yearlyReward / tvl) * 100;

    return apy;
}

function compounderApy(wethApy, looksApy) {
    const compounderApy = ((1 + (wethApy / 100)) * (1 + (looksApy / 100)) - 1) * 100;
    return compounderApy;
}

const getPrices = async (chain, addresses) => {
    const prices = (
        await superagent.post('https://coins.llama.fi/prices').send({
            coins: addresses.map((address) => `${chain}:${address}`),
        })
    ).body.coins;

    const pricesObj = Object.entries(prices).reduce(
        (acc, [address, price]) => ({
            ...acc,
            [address.split(':')[1].toLowerCase()]: price.price,
        }),
        {}
    );

    return pricesObj;
};

function exportFormatter(poolId, chain, tvlUsd, apy, rewardTokens) {
    return {
        pool: `${poolId}-${chain}`.toLowerCase(),
        chain,
        project: 'looksrare',
        symbol: `LOOKS`,
        tvlUsd,
        apy,
        rewardTokens,
    };
}

const getApy = async () => {
    let poolsApy = [];
    const chain = 'Ethereum';

    const pool = await poolInfo(chain.toLowerCase());
    const prices = await getPrices(chain.toLowerCase(), pool.rewardTokens);
    const standardTvl = calculateTvl(pool.standardReserve, prices[looksrare.toLowerCase()]);
    const compounderTvl = calculateTvl(pool.compounderReserve, prices[looksrare.toLowerCase()]);
    const wethApy = calculateApy(pool.rewardPerBlock, prices[weth.toLowerCase()], standardTvl + compounderTvl);
    const looksApy = calculateApy(pool.rewardPerBlockForStaking, prices[looksrare.toLowerCase()], standardTvl + compounderTvl);

    poolsApy.push(exportFormatter(distributor, chain, standardTvl, wethApy + looksApy, pool.rewardTokens));
    poolsApy.push(exportFormatter(aggregator, chain, compounderTvl, compounderApy(wethApy, looksApy), [pool.rewardTokens[1]]));

    return poolsApy;
}


module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://looksrare.org/rewards',
};