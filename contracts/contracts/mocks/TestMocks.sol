// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
// TEST-ONLY MOCKS
//
// These contracts exist purely to exercise FlashLoanArbitrage's multi-hop path
// under Hardhat WITHOUT a paid mainnet-fork RPC. They are never deployed to any
// live network and contain no production logic.
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal mintable ERC20 for tests.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockERC20: insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "MockERC20: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/**
 * @notice Mock DEX router (works for both V2 and V3 call shapes) with a
 *         configurable per-(tokenIn,tokenOut) rate. Rate is expressed as
 *         amountOut = amountIn * rateNum / rateDen. The router must be
 *         pre-funded with tokenOut (mint to it) so it can pay swappers.
 */
contract MockRouter {
    using SafeERC20 for IERC20;

    struct Rate {
        uint256 num;
        uint256 den;
        bool set;
    }

    // tokenIn => tokenOut => rate
    mapping(address => mapping(address => Rate)) public rates;

    function setRate(address tokenIn, address tokenOut, uint256 num, uint256 den) external {
        require(den > 0, "MockRouter: zero den");
        rates[tokenIn][tokenOut] = Rate({num: num, den: den, set: true});
    }

    function _quote(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        Rate memory r = rates[tokenIn][tokenOut];
        require(r.set, "MockRouter: no rate");
        return (amountIn * r.num) / r.den;
    }

    // ── V2 shape ──────────────────────────────────────────────────────────
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /*deadline*/
    ) external returns (uint256[] memory amounts) {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        uint256 out = _quote(tokenIn, tokenOut, amountIn);
        require(out >= amountOutMin, "MockRouter: insufficient output amount");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, out);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = out;
        return amounts;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = _quote(path[0], path[path.length - 1], amountIn);
        return amounts;
    }

    // ── V3 shape ──────────────────────────────────────────────────────────
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut) {
        amountOut = _quote(params.tokenIn, params.tokenOut, params.amountIn);
        require(amountOut >= params.amountOutMinimum, "MockRouter: insufficient output amount");

        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}

interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/**
 * @notice Mock Aave V3 pool implementing flashLoanSimple. It sends `amount` of
 *         `asset` to the receiver, invokes executeOperation, then pulls back
 *         `amount + premium` via allowance (reverts if not repaid). Must be
 *         pre-funded with `asset`. Premium is configurable in bps.
 */
contract MockAavePool {
    using SafeERC20 for IERC20;

    uint256 public premiumBps = 5; // 0.05% (matches Aave V3 flashLoanSimple default)

    function setPremiumBps(uint256 _bps) external {
        premiumBps = _bps;
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 /*referralCode*/
    ) external {
        uint256 premium = (amount * premiumBps) / 10_000;

        IERC20(asset).safeTransfer(receiverAddress, amount);

        bool ok = IFlashLoanReceiver(receiverAddress).executeOperation(
            asset,
            amount,
            premium,
            receiverAddress, // initiator == receiver (contract calls flashLoan on itself)
            params
        );
        require(ok, "MockAavePool: callback failed");

        // Pull repayment (receiver approved POOL for amount + premium).
        IERC20(asset).safeTransferFrom(receiverAddress, address(this), amount + premium);
    }
}

/**
 * @notice Malicious router that attempts to re-enter FlashLoanArbitrage.executeArbitrage
 *         during a swap, to prove the ReentrancyGuard blocks it.
 */
interface IReentrantTarget {
    struct Hop {
        address router;
        address tokenOut;
        bool isV3;
        uint24 fee;
        uint256 amountOutMin;
    }

    function executeArbitrage(address asset, uint256 amount, Hop[] calldata hops) external;
}

contract ReentrantRouter {
    address public target;
    address public attackAsset;

    function configure(address _target, address _asset) external {
        target = _target;
        attackAsset = _asset;
    }

    // V3 shape — used by the contract's _swapV3. Attempts reentry before returning.
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256) {
        // Attempt to re-enter the guarded entry point.
        IReentrantTarget.Hop[] memory hops = new IReentrantTarget.Hop[](2);
        hops[0] = IReentrantTarget.Hop(address(this), params.tokenOut, true, 0, 0);
        hops[1] = IReentrantTarget.Hop(address(this), attackAsset, true, 0, 0);
        IReentrantTarget(target).executeArbitrage(attackAsset, params.amountIn, hops);
        return params.amountIn; // unreachable if reentrancy reverts and bubbles up
    }
}
