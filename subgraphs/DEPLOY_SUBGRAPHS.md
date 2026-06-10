# Deploy The Three Subgraphs

This repository includes deploy-ready subgraphs:

- `subgraphs/uniswap-v2`
- `subgraphs/balancer-v2`
- `subgraphs/curve-lite`

## One-command deploy (PowerShell)

From repo root:

```powershell
$env:GRAPH_DEPLOY_KEY = "<PASTE_STUDIO_DEPLOY_KEY>"
$env:GRAPH_UNI_V2_SLUG = "<your-uniswap-v2-slug>"
$env:GRAPH_BALANCER_SLUG = "<your-balancer-v2-slug>"
$env:GRAPH_CURVE_SLUG = "<your-curve-lite-slug>"
./scripts/deploy-subgraphs.ps1
```

If your slugs are exactly `uniswap-v2`, `balancer-v2`, and `curve-lite`, you only need `GRAPH_DEPLOY_KEY`.

If each Studio subgraph has its own deploy key, set per-subgraph keys:

```powershell
$env:GRAPH_UNI_V2_DEPLOY_KEY = "<deploy-key-for-uniswap-subgraph>"
$env:GRAPH_BALANCER_DEPLOY_KEY = "<deploy-key-for-balancer-subgraph>"
$env:GRAPH_CURVE_DEPLOY_KEY = "<deploy-key-for-curve-subgraph>"
./scripts/deploy-subgraphs.ps1
```

## What this script does

1. Runs `graph codegen` and `graph build` for each subgraph.
2. Runs `graph deploy --studio <slug> --deploy-key <key> --version-label <label>` for each subgraph.
3. Retries deployment up to 3 times on transient upload failures.

## Manual CLI syntax

If you want to run a single deploy yourself, use:

```powershell
Set-Location subgraphs/uniswap-v2
npx graph deploy --studio your-uniswap-v2-slug --deploy-key <PASTE_STUDIO_DEPLOY_KEY> --version-label manual-1
```

`graph auth --studio ...` is not valid on your installed CLI version.
On your machine, `graph auth` opens an interactive prompt, so the non-interactive path is to skip it and pass `--deploy-key` directly to `graph deploy`.

```powershell
npx graph deploy --studio your-subgraph-slug --deploy-key <PASTE_STUDIO_DEPLOY_KEY> --version-label manual-1
```

## Optional flags

```powershell
./scripts/deploy-subgraphs.ps1 -DeployRetries 5
```

## After deploy

Open Graph Studio and click **Publish** on each deployed version.

Then copy each query endpoint and set it in Supabase secrets:

- `THEGRAPH_UNI_V2`
- `THEGRAPH_BALANCER`
- `THEGRAPH_CURVE`
