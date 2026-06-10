import { dataSource, Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { CurvePool, TokenExchange } from "../generated/CurvePool3Pool/CurvePool";
import { ERC20 } from "../generated/CurvePool3Pool/ERC20";
import { Pool } from "../generated/schema";

function bdZero(): BigDecimal {
  return BigDecimal.fromString("0");
}

function pow10(decimals: i32): BigDecimal {
  let result = BigDecimal.fromString("1");
  for (let i = 0; i < decimals; i++) {
    result = result.times(BigDecimal.fromString("10"));
  }
  return result;
}

function toDecimal(v: BigInt, decimals: i32): BigDecimal {
  let scale = pow10(decimals);
  if (scale.equals(bdZero())) return bdZero();
  return v.toBigDecimal().div(scale);
}

function tokenSymbol(addr: Address): string {
  let erc20 = ERC20.bind(addr);
  let sym = erc20.try_symbol();
  return sym.reverted ? addr.toHexString().slice(0, 6) : sym.value;
}

function tokenDecimals(addr: Address): i32 {
  let erc20 = ERC20.bind(addr);
  let dec = erc20.try_decimals();
  return dec.reverted ? 18 : dec.value;
}

function loadOrCreatePool(id: string): Pool {
  let pool = Pool.load(id);
  if (pool == null) {
    pool = new Pool(id);
    pool.coins = [];
    pool.balances = [];
    pool.cumulativeVolumeUSD = bdZero();
    pool.updatedAtBlock = BigInt.zero();
    pool.save();
  }
  return pool as Pool;
}

function refreshSnapshot(poolAddr: Address, blockNumber: BigInt): void {
  let id = poolAddr.toHexString().toLowerCase();
  let pool = loadOrCreatePool(id);
  let contract = CurvePool.bind(poolAddr);

  let symbols = new Array<string>();
  let balances = new Array<BigDecimal>();

  for (let i = 0; i < 3; i++) {
    let coinCall = contract.try_coins(BigInt.fromI32(i));
    let balCall = contract.try_balances(BigInt.fromI32(i));
    if (coinCall.reverted || balCall.reverted) continue;

    let coin = coinCall.value;
    let decimals = tokenDecimals(coin);

    symbols.push(tokenSymbol(coin));
    balances.push(toDecimal(balCall.value, decimals));
  }

  pool.coins = symbols;
  pool.balances = balances;
  pool.updatedAtBlock = blockNumber;
  pool.save();
}

export function handleBlock(block: ethereum.Block): void {
  refreshSnapshot(dataSource.address(), block.number);
}

export function handleTokenExchange(event: TokenExchange): void {
  let id = event.address.toHexString().toLowerCase();
  let pool = loadOrCreatePool(id);
  pool.cumulativeVolumeUSD = pool.cumulativeVolumeUSD.plus(event.params.tokens_sold.toBigDecimal());
  pool.updatedAtBlock = event.block.number;
  pool.save();

  refreshSnapshot(event.address, event.block.number);
}
