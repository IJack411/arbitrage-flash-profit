import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export function bdZero(): BigDecimal {
  return BigDecimal.fromString("0");
}

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let result = BigDecimal.fromString("1");
  for (let i = 0; i < decimals; i++) {
    result = result.times(BigDecimal.fromString("10"));
  }
  return result;
}

export function toDecimal(value: BigInt, decimals: i32): BigDecimal {
  if (decimals < 0) return bdZero();
  let scale = exponentToBigDecimal(decimals);
  if (scale.equals(bdZero())) return bdZero();
  return value.toBigDecimal().div(scale);
}
