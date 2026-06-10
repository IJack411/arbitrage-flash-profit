import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { Swap, Vault } from "../generated/Vault/Vault";
import { ERC20 } from "../generated/Vault/ERC20";
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

function toDecimal(value: BigInt, decimals: i32): BigDecimal {
  let scale = pow10(decimals);
  if (scale.equals(bdZero())) return bdZero();
  return value.toBigDecimal().div(scale);
}

function getSymbol(addr: Address): string {
  let erc20 = ERC20.bind(addr);
  let sym = erc20.try_symbol();
  return sym.reverted ? addr.toHexString().slice(0, 6) : sym.value;
}

function getDecimals(addr: Address): i32 {
  let erc20 = ERC20.bind(addr);
  let dec = erc20.try_decimals();
  return dec.reverted ? 18 : dec.value;
}

function loadOrCreatePool(poolId: string, blockNumber: BigInt): Pool {
  let pool = Pool.load(poolId);
  if (pool == null) {
    pool = new Pool(poolId);
    pool.tokensList = [];
    pool.totalLiquidity = bdZero();
    pool.totalSwapVolume = bdZero();
    pool.createdAtBlock = blockNumber;
    pool.updatedAtBlock = blockNumber;
    pool.save();
  }
  return pool as Pool;
}

export function handleSwap(event: Swap): void {
  let poolId = event.params.poolId.toHexString();
  let pool = loadOrCreatePool(poolId, event.block.number);

  let vault = Vault.bind(event.address);
  let tokenState = vault.try_getPoolTokens(event.params.poolId);

  if (!tokenState.reverted) {
    let tokens = tokenState.value.value0;
    let balances = tokenState.value.value1;

    let symbols = new Array<string>();
    let totalLiquidity = bdZero();

    for (let i = 0; i < tokens.length; i++) {
      let symbol = getSymbol(tokens[i]);
      symbols.push(symbol);
      let decimals = getDecimals(tokens[i]);
      totalLiquidity = totalLiquidity.plus(toDecimal(balances[i], decimals));
    }

    pool.tokensList = symbols;
    pool.totalLiquidity = totalLiquidity;
  }

  let inDecimals = getDecimals(event.params.tokenIn);
  pool.totalSwapVolume = pool.totalSwapVolume.plus(toDecimal(event.params.amountIn, inDecimals));
  pool.updatedAtBlock = event.block.number;
  pool.save();
}
