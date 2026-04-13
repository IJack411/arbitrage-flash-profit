// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Aave V3 Interfaces ────────────────────────────────────────────────────────

interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

// ─── DEX Interfaces ────────────────────────────────────────────────────────────

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

interface IUniswapV3Router {
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
    ) external returns (uint256 amountOut);
}

// ─── Main Contract ─────────────────────────────────────────────────────────────

/**
 * @title FlashLoanArbitrage
 * @notice Flash loan arbitrage receiver using Aave V3.
 *         Borrows a token, swaps A→B on one DEX, B→A on another, repays loan + fee, keeps profit.
 * @dev Deploy once. Owner sets authorized callers (your bot wallet). Profit accumulates here; owner withdraws anytime.
 */
contract FlashLoanArbitrage is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────────

    address public immutable POOL;

    uint256 public maxSlippageBps = 300; // 3% default slippage cap
    uint256 public constant BPS_DENOMINATOR = 10_000;

    mapping(address => bool) public authorizedCallers;

    // ── Events ───────────────────────────────────────────────────────────────

    event ArbitrageExecuted(
        address indexed asset,
        uint256 loanAmount,
        uint256 profit,
        address indexed initiator
    );
    event CallerUpdated(address indexed caller, bool authorized);
    event SlippageUpdated(uint256 bps);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(
            msg.sender == owner() || authorizedCallers[msg.sender],
            "FlashLoanArbitrage: not authorized"
        );
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _pool  Aave V3 Pool address for the target network.
     */
    constructor(address _pool) Ownable(msg.sender) {
        require(_pool != address(0), "FlashLoanArbitrage: zero pool");
        POOL = _pool;
    }

    // ── Owner Admin ──────────────────────────────────────────────────────────

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "FlashLoanArbitrage: zero address");
        authorizedCallers[caller] = authorized;
        emit CallerUpdated(caller, authorized);
    }

    function setMaxSlippage(uint256 _bps) external onlyOwner {
        require(_bps <= 1_000, "FlashLoanArbitrage: slippage > 10%");
        maxSlippageBps = _bps;
        emit SlippageUpdated(_bps);
    }

    // ── Arbitrage Entry ──────────────────────────────────────────────────────

    /**
     * @notice Kick off a flash loan arbitrage.
     * @param asset       Token to borrow (e.g. USDC, WETH)
     * @param amount      Amount to borrow (in token's native units)
     * @param routerA     DEX router for the first swap (A → B)
     * @param routerB     DEX router for the second swap (B → A)
     * @param tokenB      Intermediate token address
     * @param routerAisV3 true = Uniswap V3 style router, false = V2 style
     * @param routerBisV3 true = Uniswap V3 style router, false = V2 style
     * @param feeA        V3 fee tier for routerA (ignored if V2)
     * @param feeB        V3 fee tier for routerB (ignored if V2)
     * @param amountBMin  Minimum tokenB to receive from first swap (slippage guard)
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        address routerA,
        address routerB,
        address tokenB,
        bool routerAisV3,
        bool routerBisV3,
        uint24 feeA,
        uint24 feeB,
        uint256 amountBMin
    ) external nonReentrant onlyAuthorized {
        require(asset != address(0), "FlashLoanArbitrage: zero asset");
        require(amount > 0, "FlashLoanArbitrage: zero amount");
        require(routerA != address(0) && routerB != address(0), "FlashLoanArbitrage: zero router");
        require(tokenB != address(0) && tokenB != asset, "FlashLoanArbitrage: invalid tokenB");

        bytes memory params = abi.encode(
            routerA, routerB, tokenB,
            routerAisV3, routerBisV3,
            feeA, feeB,
            amountBMin
        );

        IPool(POOL).flashLoanSimple(address(this), asset, amount, params, 0);
    }

    // ── Aave Callback ────────────────────────────────────────────────────────

    /**
     * @notice Called by Aave pool after sending flash loan funds.
     *         Must repay (amount + premium) before returning.
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == POOL, "FlashLoanArbitrage: caller not Aave pool");
        require(initiator == address(this), "FlashLoanArbitrage: bad initiator");

        (
            address routerA,
            address routerB,
            address tokenB,
            bool routerAisV3,
            bool routerBisV3,
            uint24 feeA,
            uint24 feeB,
            uint256 amountBMin
        ) = abi.decode(params, (address, address, address, bool, bool, uint24, uint24, uint256));

        uint256 repayAmount = amount + premium;

        // ── Swap 1: asset → tokenB ────────────────────────────────────────
        uint256 receivedB;
        if (routerAisV3) {
            receivedB = _swapV3(routerA, asset, tokenB, feeA, amount, amountBMin);
        } else {
            address[] memory pathAB = new address[](2);
            pathAB[0] = asset;
            pathAB[1] = tokenB;
            receivedB = _swapV2(routerA, amount, pathAB, amountBMin);
        }

        // ── Swap 2: tokenB → asset (must cover repayAmount) ───────────────
        uint256 receivedA;
        if (routerBisV3) {
            receivedA = _swapV3(routerB, tokenB, asset, feeB, receivedB, repayAmount);
        } else {
            address[] memory pathBA = new address[](2);
            pathBA[0] = tokenB;
            pathBA[1] = asset;
            receivedA = _swapV2(routerB, receivedB, pathBA, repayAmount);
        }

        require(receivedA >= repayAmount, "FlashLoanArbitrage: trade unprofitable");

        // ── Repay Aave ────────────────────────────────────────────────────
        IERC20(asset).forceApprove(POOL, repayAmount);

        uint256 profit = receivedA - repayAmount;
        emit ArbitrageExecuted(asset, amount, profit, tx.origin);

        return true;
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────

    function _swapV2(
        address router,
        uint256 amountIn,
        address[] memory path,
        uint256 amountOutMin
    ) internal returns (uint256) {
        IERC20(path[0]).forceApprove(router, amountIn);

        uint256[] memory amounts = IUniswapV2Router(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 300
        );

        // Revoke leftover allowance
        IERC20(path[0]).forceApprove(router, 0);

        return amounts[amounts.length - 1];
    }

    function _swapV3(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).forceApprove(router, amountIn);

        amountOut = IUniswapV3Router(router).exactInputSingle(
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn:           tokenIn,
                tokenOut:          tokenOut,
                fee:               fee,
                recipient:         address(this),
                deadline:          block.timestamp + 300,
                amountIn:          amountIn,
                amountOutMinimum:  amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        // Revoke leftover allowance
        IERC20(tokenIn).forceApprove(router, 0);
    }

    // ── Withdrawal ───────────────────────────────────────────────────────────

    /// @notice Withdraw accumulated profit tokens to owner wallet.
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /// @notice Withdraw all of a token to owner wallet.
    function withdrawAllToken(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "FlashLoanArbitrage: no balance");
        IERC20(token).safeTransfer(owner(), bal);
    }

    /// @notice Withdraw any ETH to owner wallet.
    function withdrawETH() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "FlashLoanArbitrage: no ETH");
        (bool ok, ) = owner().call{value: bal}("");
        require(ok, "FlashLoanArbitrage: ETH transfer failed");
    }

    receive() external payable {}
}
