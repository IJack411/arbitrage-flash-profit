# Deploying FlashLoanArbitrage to Base — Fork‑Proven Guide

This document captures a **fork‑only, dry** verification of the `FlashLoanArbitrage`
contract on **Base mainnet (chainId 8453)** and gives the exact commands to deploy it
for real. **No real transaction was broadcast, no private key was used, and no funds
were spent** to produce this report — everything ran against a Hardhat fork of live
Base state using a funded test account.

---

## 1. Compile + test suite

```
cd contracts
npm install
npm run compile   # Compiled 11 Solidity files successfully
npm test          # 29 passing, 3 pending (Arbitrum fork tests skipped w/o FORK_RPC_URL)
```

Result: **PASS** — 29/29 unit tests green.

---

## 2. Fork‑deploy proof (Base mainnet fork)

Stands up an in‑process Hardhat fork of Base and deploys the contract against **real
Base state** with a Hardhat test signer (no real key, no real funds):

```
cd contracts
$env:FORK_RPC_URL='https://mainnet.base.org'   # PowerShell; use export on bash
npx hardhat run scripts/fork-deploy-base.js
```

Verified output:

| Item | Value |
|---|---|
| Fork RPC | `https://mainnet.base.org` |
| Fork block | ~49,205,087 |
| Base Aave V3 pool has code on fork | ✅ (1933 bytes) |
| Fork‑deployed address | `0x06ffd252B031980b16A9C7d97bafe0a2425bF8A0` |
| `POOL()` wired to | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` (Base Aave V3) ✅ |
| `owner()` | Hardhat test account ✅ |

> **RPC note:** `https://base-rpc.publicnode.com` returns **HTTP 403** for the
> state calls Hardhat forking makes and cannot be used for forking. `https://mainnet.base.org`
> works for a recent‑block fork. For deep archive forking at a pinned historical block,
> use a paid provider (Alchemy/Infura/QuickNode Base archive) via `BASE_RPC_URL`.
>
> **OP‑stack note:** forking Base requires an explicit hardfork history for chainId 8453
> in `hardhat.config.js` (`networks.hardhat.chains[8453].hardforkHistory = { cancun: 0 }`),
> otherwise `eth_call` at the fork block fails with *"No known hardfork for execution on
> historical block"*. This is already wired in the config.

---

## 3. Aerodrome compatibility — **KEY FINDING: NOT compatible as‑is**

The lead requires **buying AERO on Aerodrome V1**. Aerodrome is **Solidly‑style**, and
its router ABI differs from both interfaces the contract supports:

| | Contract supports (`_swapV2`) | Aerodrome V1 router |
|---|---|---|
| Swap fn | `swapExactTokensForTokens(uint,uint,address[] path,address,uint)` | `swapExactTokensForTokens(uint,uint,Route[] routes,address,uint)` |
| Quote fn | `getAmountsOut(uint,address[] path)` | `getAmountsOut(uint,Route[] routes)` |
| Route type | `address[]` | `struct Route{address from;address to;bool stable;address factory}` |

Because the `Route[]` struct changes the function **selector**, calling the Aerodrome
router with the contract's `address[]` path would revert. The contract's V3 path
(`exactInputSingle`) also does not match Solidly. **Verdict: the existing
`FlashLoanArbitrage` cannot route a swap through Aerodrome V1.**

**Minimal, safe change to add support (proposed — not a rewrite):**
add a third router "kind" (Solidly) alongside the existing V2/V3 flags, plus a
`_swapSolidly` helper that builds a single‑hop `Route[]` (`{from, to, stable:false,
factory}`) and calls Aerodrome's `swapExactTokensForTokens`. The `stable` flag and
`factory` would be passed through `params`. This is additive and can be gated behind
new unit tests + a Base fork test before any mainnet use. It was **not** implemented here
because the lead itself is unprofitable (see §4), so shipping the adapter now would add
attack surface for no gain.

---

## 4. AERO/WETH fork simulation — **lead is NOT profitable on real Base state**

Because the contract can't route Aerodrome, the two legs were simulated **directly**
against the forked routers at real execution sizes:

```
cd contracts
$env:FORK_RPC_URL='https://mainnet.base.org'
npx hardhat run scripts/fork-sim-aero.js      # executes both legs, reports net
npx hardhat run scripts/fork-spread-aero.js   # near-mid price + why fees eat it
```

Direction tested: **BUY AERO on Aerodrome V1 (1% fee) → SELL AERO on PancakeSwap V3 (0.05%)**.

| Size (WETH) | Leg1: WETH→AERO | Leg2: AERO→WETH | Gross | Net (incl. 0.05% Aave) |
|---|---|---|---|---|
| 0.1 | 422.46 AERO | 0.099820 WETH | −0.1795% | **−0.2295% ❌** |
| 0.5 | 2110.36 AERO | 0.497659 WETH | −0.4682% | **−0.5182% ❌** |
| 1.0 | 4211.03 AERO | 0.988605 WETH | −1.1394% | **−1.1894% ❌** |
| 2.0 | 8383.52 AERO | 1.952630 WETH | −2.3685% | **−2.4185% ❌** |

Near‑mid (~0.001 WETH) round trip: **−0.14% before** the Aave premium.

**Why:** the raw mid‑price spread between the two venues is only **~0.8–0.9%** (AERO is
priced slightly higher on PancakeSwap V3). Aerodrome's **1.0%** fee plus PancakeSwap's
**0.05%** fee (**1.05% total DEX fees**) already exceed that gross spread, and the Aave
**0.05%** flash‑loan premium makes it worse. The scanner's *+0.83%* figure reflects the
mid‑price spread but does **not** survive the real 1% Aerodrome fee. **Do not execute
this lead.** Real Aerodrome pool state at fork block: reserves ≈ 645.4 WETH / 2,754,616 AERO.

---

## 5. Deploy to Base for real (one command)

> Only run this when you have a **profitable, fee‑aware** lead. The AERO/WETH lead above
> is not one.

**Secrets to set** (in `contracts/.env`, copied from `.env.example`):

| Var | Required | Notes |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | ✅ | Wallet funded with **≥ 0.005 ETH on Base** for gas. Becomes contract owner. |
| `BASE_RPC_URL` | optional | Defaults to `https://mainnet.base.org`. A paid RPC is recommended. |
| `BASESCAN_API_KEY` | optional | For source verification on BaseScan. |

**Deploy:**

```
cd contracts
npm run deploy:base
```

This deploys `FlashLoanArbitrage` wired to the Base Aave V3 pool
`0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` and prints the contract address.

**Authorize your bot wallet** to call `executeArbitrage`:

```
cd contracts
$env:CONTRACT_ADDRESS='0x<deployed address>'
$env:CALLER_ADDRESS='0x<your bot wallet>'
npm run authorize:base
```

Then copy the printed `VITE_ARBITRAGE_CONTRACT_ADDRESS` / `VITE_FLASH_LOAN_PROVIDER_ADDRESS`
into the root `.env`.

---

## Fork verification scripts (all dry)

| Script | Purpose |
|---|---|
| `scripts/fork-deploy-base.js` | Deploy against a Base fork; assert `POOL()` == Base Aave pool. |
| `scripts/probe-base.js` | Read‑only: confirm routers/pools exist, pull quotes. |
| `scripts/fork-sim-aero.js` | Execute both AERO/WETH legs at real sizes; report net P/L. |
| `scripts/fork-spread-aero.js` | Near‑mid price + explains why fees consume the spread. |
