use ethers::abi::{encode, Token};
use ethers::types::{Address, U256};
use sha3::{Digest, Keccak256};

pub struct FlashlightEncoder;

/// One swap leg of a multi-hop arbitrage path. Mirrors the Solidity struct
/// `FlashLoanArbitrage.Hop { address router; address tokenOut; bool isV3; uint24 fee; uint256 amountOutMin; }`.
///
/// The `tokenIn` of each hop is implicit: hop 0 spends the borrowed asset, and
/// hop `i` spends hop `i-1`'s `token_out`. The final hop's `token_out` MUST equal
/// the borrowed asset (enforced on-chain).
#[derive(Clone, Debug)]
pub struct Hop {
    pub router: Address,
    pub token_out: Address,
    pub is_v3: bool,
    pub fee: u32,
    pub amount_out_min: U256,
}

impl FlashlightEncoder {
    /// Encode calldata for `executeArbitrage(address asset, uint256 amount, Hop[] hops)`.
    ///
    /// NOTE: This only builds calldata; it does NOT broadcast anything. Execution
    /// remains disabled — this encoder exists so the off-chain ABI stays in sync
    /// with the Phase 5 multi-hop contract.
    pub fn encode_execute_arbitrage(
        asset: Address,
        amount: U256,
        hops: &[Hop],
    ) -> Vec<u8> {
        let selector = function_selector(
            "executeArbitrage(address,uint256,(address,address,bool,uint24,uint256)[])",
        );

        let hop_tokens: Vec<Token> = hops
            .iter()
            .map(|h| {
                Token::Tuple(vec![
                    Token::Address(h.router),
                    Token::Address(h.token_out),
                    Token::Bool(h.is_v3),
                    Token::Uint(U256::from(h.fee)),
                    Token::Uint(h.amount_out_min),
                ])
            })
            .collect();

        let params = encode(&[
            Token::Address(asset),
            Token::Uint(amount),
            Token::Array(hop_tokens),
        ]);
        [selector.to_vec(), params].concat()
    }

    pub fn encode_set_authorized_caller(caller: Address, authorized: bool) -> Vec<u8> {
        let selector = function_selector("setAuthorizedCaller(address,bool)");
        let params = encode(&[Token::Address(caller), Token::Bool(authorized)]);
        [selector.to_vec(), params].concat()
    }
}

fn function_selector(signature: &str) -> [u8; 4] {
    let mut hasher = Keccak256::new();
    hasher.update(signature.as_bytes());
    let hash = hasher.finalize();
    [hash[0], hash[1], hash[2], hash[3]]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_hops() -> Vec<Hop> {
        let addr = Address::zero();
        vec![
            Hop { router: addr, token_out: addr, is_v3: true,  fee: 500,  amount_out_min: U256::from(990) },
            Hop { router: addr, token_out: addr, is_v3: false, fee: 0,    amount_out_min: U256::from(0) },
        ]
    }

    #[test]
    fn test_encode_execute_arbitrage_two_hop_length() {
        let addr = Address::zero();
        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            addr,
            U256::from(1000),
            &sample_hops(),
        );
        // 4 (selector) + head[asset,amount,offset]=96 + array_len(32) + 2 tuples * 160
        assert_eq!(calldata.len(), 4 + 96 + 32 + 2 * 160);
    }

    #[test]
    fn test_encode_execute_arbitrage_three_hop_length() {
        let addr = Address::zero();
        let hops = vec![
            Hop { router: addr, token_out: addr, is_v3: true,  fee: 500,  amount_out_min: U256::from(1) },
            Hop { router: addr, token_out: addr, is_v3: false, fee: 0,    amount_out_min: U256::from(1) },
            Hop { router: addr, token_out: addr, is_v3: true,  fee: 3000, amount_out_min: U256::from(1) },
        ];
        let calldata = FlashlightEncoder::encode_execute_arbitrage(addr, U256::from(1), &hops);
        assert_eq!(calldata.len(), 4 + 96 + 32 + 3 * 160);
    }

    #[test]
    fn test_encode_execute_arbitrage_correct_selector() {
        let addr = Address::zero();
        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            addr,
            U256::from(1),
            &sample_hops(),
        );
        assert_ne!(&calldata[0..4], &[0, 0, 0, 0]);
    }

    #[test]
    fn test_encode_execute_arbitrage_selector_matches_new_signature() {
        let expected = function_selector(
            "executeArbitrage(address,uint256,(address,address,bool,uint24,uint256)[])",
        );
        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            Address::zero(),
            U256::from(1),
            &sample_hops(),
        );
        assert_eq!(&calldata[0..4], &expected);
    }

    #[test]
    fn test_encode_execute_arbitrage_real_addresses() {
        let asset: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".parse().unwrap();
        let router: Address = "0xE592427A0AEce92De3Edee1F18E0157C05861564".parse().unwrap();
        let token_b: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".parse().unwrap();

        let hops = vec![
            Hop { router, token_out: token_b, is_v3: true, fee: 500, amount_out_min: U256::from(9_990_u64 * 10_u64.pow(6)) },
            Hop { router, token_out: asset,   is_v3: true, fee: 500, amount_out_min: U256::from(0) },
        ];
        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            asset,
            U256::from(10_u128.pow(18)),
            &hops,
        );
        assert_eq!(calldata.len(), 4 + 96 + 32 + 2 * 160);
    }

    #[test]
    fn test_function_selector_known_value() {
        assert_eq!(function_selector("transfer(address,uint256)"), [0xa9, 0x05, 0x9c, 0xbb]);
    }
}
