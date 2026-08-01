# Performance Notes

- Bellman-Ford runs in `O(V * E)` per source; cycle deduplication reduces repeated work from multi-source scans.
- Synthetic pool fetching is a placeholder; production performance depends on batching RPC/subgraph requests.
- Metrics are in-memory and cheap to update.
- `revm` simulation avoids network round-trips for preflight execution checks.
- For larger route universes, shard by network and token cluster, then merge canonical opportunities.
