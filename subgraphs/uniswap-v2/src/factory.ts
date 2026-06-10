import { Address, BigDecimal } from "@graphprotocol/graph-ts";
import { PairCreated } from "../generated/Factory/Factory";
import { ERC20 } from "../generated/Factory/ERC20";
import { PairTemplate } from "../generated/templates";
import { Pair, Token } from "../generated/schema";

function loadOrCreateToken(tokenAddr: string): Token {
  let id = tokenAddr.toLowerCase();
  let token = Token.load(id);
  if (token == null) {
    token = new Token(id);
    token.address = id;

    let erc20 = ERC20.bind(Address.fromString(tokenAddr));
    let sym = erc20.try_symbol();
    token.symbol = sym.reverted ? id.slice(0, 6) : sym.value;

    let dec = erc20.try_decimals();
    token.decimals = dec.reverted ? 18 : dec.value;

    token.save();
  }
  return token as Token;
}

export function handlePairCreated(event: PairCreated): void {
  let pairId = event.params.pair.toHexString().toLowerCase();

  let token0 = loadOrCreateToken(event.params.token0.toHexString());
  let token1 = loadOrCreateToken(event.params.token1.toHexString());

  let pair = new Pair(pairId);
  pair.token0 = token0.id;
  pair.token1 = token1.id;
  pair.token0Price = BigDecimal.fromString("0");
  pair.token1Price = BigDecimal.fromString("0");
  pair.reserveUSD = BigDecimal.fromString("0");
  pair.volumeUSD = BigDecimal.fromString("0");
  pair.reserve0 = BigDecimal.fromString("0");
  pair.reserve1 = BigDecimal.fromString("0");
  pair.createdAtBlock = event.block.number;
  pair.createdAtTimestamp = event.block.timestamp;
  pair.save();

  PairTemplate.create(event.params.pair);
}
