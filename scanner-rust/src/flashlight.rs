use ethers::abi::{encode, Token};
use ethers::types::{Address, U256};
use sha3::{Digest, Keccak256};

pub struct FlashlightEncoder;

impl FlashlightEncoder {
    pub fn encode_execute_arbitrage(
        asset: Address,
        amount: U256,
        router_a: Address,
        router_b: Address,
        token_b: Address,
        router_a_is_v3: bool,
        router_b_is_v3: bool,
        fee_a: u32,
        fee_b: u32,
        amount_b_min: U256,
    ) -> Vec<u8> {
        let selector = function_selector(
            "executeArbitrage(address,uint256,address,address,address,bool,bool,uint24,uint24,uint256)",
        );
        let params = encode(&[
            Token::Address(asset),
            Token::Uint(amount),
            Token::Address(router_a),
            Token::Address(router_b),
            Token::Address(token_b),
            Token::Bool(router_a_is_v3),
            Token::Bool(router_b_is_v3),
            Token::Uint(U256::from(fee_a)),
            Token::Uint(U256::from(fee_b)),
            Token::Uint(amount_b_min),
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

    #[test]
    fn test_encode_execute_arbitrage_correct_length() {
        let addr = Address::zero();
        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            addr,
            U256::from(1000),
            addr,
            addr,
            addr,
            true,
            false,
            500,
            3000,
            U256::from(990),
        );
        assert_eq!(calldata.len(), 4 + 10 * 32);
    }

    #[test]
    fn test_encode_execute_arbitrage_correct_selector() {
        let addr = Address::zero();
        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            addr,
            U256::from(1),
            addr,
            addr,
            addr,
            false,
            false,
            0,
            0,
            U256::from(0),
        );
        assert_ne!(&calldata[0..4], &[0, 0, 0, 0]);
    }

    #[test]
    fn test_encode_execute_arbitrage_v3_flag() {
        let asset: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".parse().unwrap();
        let router: Address = "0xE592427A0AEce92De3Edee1F18E0157C05861564".parse().unwrap();
        let token_b: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".parse().unwrap();

        let calldata = FlashlightEncoder::encode_execute_arbitrage(
            asset,
            U256::from(10_u128.pow(18)),
            router,
            router,
            token_b,
            true,
            true,
            500,
            500,
            U256::from(9_990_u64 * 10_u64.pow(6)),
        );
        assert_eq!(calldata.len(), 4 + 320);
    }

    #[test]
    fn test_function_selector_known_value() {
        assert_eq!(function_selector("transfer(address,uint256)"), [0xa9, 0x05, 0x9c, 0xbb]);
    }
}
