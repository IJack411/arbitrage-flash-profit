import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts";
import { Pair as PairContract, Swap, Sync } from "../generated/templates/PairTemplate/Pair";
import { Pair, Token } from "../generated/schema";
import { bdZero, toDecimal } from "./math";

function updatePairState(pairId: string): void {
  let pair = Pair.load(pairId);
  if (pair == null) return;

  let token0 = Token.load(pair.token0);
  let token1 = Token.load(pair.token1);
  if (token0 == null || token1 == null) return;

  let contract = PairContract.bind(changetype<Address>(Bytes.fromHexString(pairId)));
  let reserves = contract.getReserves();

  let r0 = toDecimal(reserves.value0, token0.decimals);
  let r1 = toDecimal(reserves.value1, token1.decimals);

  pair.reserve0 = r0;
  pair.reserve1 = r1;

  if (!r0.equals(bdZero()) && !r1.equals(bdZero())) {
    pair.token0Price = r1.div(r0);
    pair.token1Price = r0.div(r1);
  }

  pair.reserveUSD = r0.plus(r1);
  pair.save();
}

export function handleSync(event: Sync): void {
  let pairId = event.address.toHexString().toLowerCase();
  updatePairState(pairId);
}

export function handleSwap(event: Swap): void {
  let pairId = event.address.toHexString().toLowerCase();
  let pair = Pair.load(pairId);
  if (pair == null) return;

  let vol0 = event.params.amount0In.plus(event.params.amount0Out).toBigDecimal();
  let vol1 = event.params.amount1In.plus(event.params.amount1Out).toBigDecimal();
  pair.volumeUSD = pair.volumeUSD.plus(vol0.plus(vol1));
  pair.save();

  updatePairState(pairId);
}
