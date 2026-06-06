const endpoints = [
  {
    name: 'Uniswap V3',
    url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    entity: 'pools',
    liquidityField: 'totalValueLockedUSD',
  },
  {
    name: 'Uniswap V2',
    url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
    entity: 'pairs',
    liquidityField: 'reserveUSD',
  },
  {
    name: 'SushiSwap',
    url: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange',
    entity: 'pairs',
    liquidityField: 'reserveUSD',
  },
];

const pairs = [
  { base: 'WETH', quote: 'USDC' },
  { base: 'WETH', quote: 'USDT' },
  { base: 'LINK', quote: 'USDC' },
];

const graphQueryFor = (pair, entity) => {
  if (entity === 'pools') {
    return `{
      pools(
        first: 8,
        orderBy: totalValueLockedUSD,
        orderDirection: desc,
        where: {
          token0_: { symbol_in: ["${pair.base}", "${pair.quote}"] }
          token1_: { symbol_in: ["${pair.base}", "${pair.quote}"] }
        }
      ) {
        id
        feeTier
        token0 { symbol }
        token1 { symbol }
        token0Price
        token1Price
        totalValueLockedUSD
      }
    }`;
  }

  return `{
    pairs(
      first: 8,
      orderBy: reserveUSD,
      orderDirection: desc,
      where: {
        token0_: { symbol_in: ["${pair.base}", "${pair.quote}"] }
        token1_: { symbol_in: ["${pair.base}", "${pair.quote}"] }
      }
    ) {
      id
      token0 { symbol }
      token1 { symbol }
      token0Price
      token1Price
      reserveUSD
    }
  }`;
};

const queryGraph = async (url, query) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(JSON.stringify(payload.errors));
  }
  return payload.data;
};

const pairPrice = (row, base, quote) => {
  const token0 = row.token0?.symbol;
  const token1 = row.token1?.symbol;
  const token0Price = Number(row.token0Price);
  const token1Price = Number(row.token1Price);

  if (token0 === base && token1 === quote) return token0Price;
  if (token0 === quote && token1 === base) return 1 / token1Price;
  return Number.NaN;
};

const print = async () => {
  for (const pair of pairs) {
    console.log(`\n=== ${pair.base}/${pair.quote} (Ethereum) ===`);
    for (const endpoint of endpoints) {
      try {
        const query = graphQueryFor(pair, endpoint.entity);
        const data = await queryGraph(endpoint.url, query);
        const rows = data[endpoint.entity] || [];

        if (!rows.length) {
          console.log(`${endpoint.name.padEnd(10)} | no pools found`);
          continue;
        }

        const top = rows[0];
        const price = pairPrice(top, pair.base, pair.quote);
        const liquidity = Number(top[endpoint.liquidityField] || 0);
        const fee = top.feeTier ? ` fee=${Number(top.feeTier) / 10000}%` : '';
        console.log(
          `${endpoint.name.padEnd(10)} | ${pair.base}/${pair.quote}=${price.toFixed(6)} | liq=$${liquidity.toFixed(0)} | pool=${String(top.id).slice(0, 12)}...${fee}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${endpoint.name.padEnd(10)} | error=${message.slice(0, 160)}`);
      }
    }
  }
};

await print();
