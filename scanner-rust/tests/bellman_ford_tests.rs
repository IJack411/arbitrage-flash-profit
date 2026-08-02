use ethers::types::Address;
use mev_scanner::scanner_pub::{bellman_ford_detect_cycles, PoolEdge};

fn make_pool_edge(
    from: Address,
    to: Address,
    price: f64,
    dex: &str,
    router: Address,
    is_v3: bool,
    fee: u32,
) -> PoolEdge {
    PoolEdge {
        token_in: from,
        token_out: to,
        price,
        liquidity_usd: 1_000_000.0,
        dex: dex.to_string(),
        network: "ethereum".to_string(),
        router,
        is_v3,
        fee,
        swap_state: None,
    }
}

#[test]
fn test_bellman_ford_detects_positive_cycle() {
    let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
    let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
    let pools = vec![
        make_pool_edge(a, b, 1.02, "dex1", Address::zero(), false, 3000),
        make_pool_edge(b, a, 1.005, "dex2", Address::zero(), false, 3000),
    ];
    let cycles = bellman_ford_detect_cycles(&pools);
    assert!(!cycles.is_empty());
    assert!(cycles[0].profit_ratio > 1.0);
}

#[test]
fn test_no_cycle_returns_empty() {
    let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
    let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
    let c: Address = "0x0000000000000000000000000000000000000003".parse().unwrap();
    let pools = vec![
        make_pool_edge(a, b, 0.98, "dex1", Address::zero(), false, 3000),
        make_pool_edge(b, c, 0.98, "dex2", Address::zero(), false, 3000),
        make_pool_edge(c, a, 0.98, "dex3", Address::zero(), false, 3000),
    ];
    let cycles = bellman_ford_detect_cycles(&pools);
    assert!(cycles.is_empty());
}

#[test]
fn test_bellman_ford_empty_input() {
    assert!(bellman_ford_detect_cycles(&[]).is_empty());
}

#[test]
fn test_bellman_ford_three_hop_profitable() {
    let a: Address = "0x0000000000000000000000000000000000000001".parse().unwrap();
    let b: Address = "0x0000000000000000000000000000000000000002".parse().unwrap();
    let c: Address = "0x0000000000000000000000000000000000000003".parse().unwrap();
    let pools = vec![
        make_pool_edge(a, b, 1.02, "uni", Address::zero(), true, 500),
        make_pool_edge(b, c, 1.02, "sushi", Address::zero(), false, 3000),
        make_pool_edge(c, a, 0.985, "curve", Address::zero(), false, 0),
    ];
    let cycles = bellman_ford_detect_cycles(&pools);
    assert!(!cycles.is_empty());
    assert!(cycles[0].profit_ratio > 1.0);
}
