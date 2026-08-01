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
 *         Borrows a token, executes an arbitrary-length swap path (2..MAX_HOPS)
 *         that must close back to the borrowed asset, repays loan + fee, keeps profit.
 * @dev Deploy once. Owner sets authorized callers (your bot wallet). Profit accumulates here; owner withdraws anytime.
 *      Phase 5: generalized from a fixed 2-hop shape to an arbitrary multi-hop `Hop[]` path.
 */
contract FlashLoanArbitrage is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ────────────────────────────────────────────────────────────────

    /**
     * @notice One swap leg of a multi-hop arbitrage path.
     * @param router       DEX router used for this hop.
     * @param tokenOut     Token received from this hop. The tokenIn is implicit:
     *                     hop 0 spends the borrowed asset; hop i spends hop (i-1)'s tokenOut.
     * @param isV3         true = Uniswap V3 style (exactInputSingle), false = V2 style.
     * @param fee          V3 fee tier (ignored when isV3 == false).
     * @param amountOutMin Per-hop slippage guard (minimum tokenOut for this hop).
     */
    struct Hop {
        address router;
        address tokenOut;
        bool    isV3;
        uint24  fee;
        uint256 amountOutMin;
    }

    // ── State ────────────────────────────────────────────────────────────────

    address public immutable POOL;

    // Path-length bounds: at least 2 hops (a closed loop), capped to bound gas / abuse.
    uint256 public constant MIN_HOPS = 2;
    uint256 public constant MAX_HOPS = 5;

    mapping(address => bool) public authorizedCallers;

    // ── Events ───────────────────────────────────────────────────────────────

    event ArbitrageExecuted(
        address indexed asset,
        uint256 loanAmount,
        uint256 profit,
        address indexed initiator
    );
    event CallerUpdated(address indexed caller, bool authorized);

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

    // ── Arbitrage Entry ──────────────────────────────────────────────────────

    /**
     * @notice Kick off a flash loan arbitrage over an arbitrary multi-hop path.
     * @param asset  Token to borrow (e.g. USDC, WETH). This is the tokenIn of hop 0
     *               and MUST equal the tokenOut of the final hop (the loop must close).
     * @param amount Amount to borrow (in the asset's native units).
     * @param hops   Ordered swap legs. `hops.length` must be within [MIN_HOPS, MAX_HOPS].
     *               tokenIn of hop 0 = asset; tokenIn of hop i = hops[i-1].tokenOut.
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        Hop[] calldata hops
    ) external nonReentrant onlyAuthorized {
        require(asset != address(0), "FlashLoanArbitrage: zero asset");
        require(amount > 0, "FlashLoanArbitrage: zero amount");
        require(
            hops.length >= MIN_HOPS && hops.length <= MAX_HOPS,
            "FlashLoanArbitrage: bad path length"
        );

        for (uint256 i = 0; i < hops.length; i++) {
            require(hops[i].router != address(0), "FlashLoanArbitrage: zero router");
            require(hops[i].tokenOut != address(0), "FlashLoanArbitrage: zero tokenOut");
        }

        // The path must close back to the borrowed asset.
        require(
            hops[hops.length - 1].tokenOut == asset,
            "FlashLoanArbitrage: path must close to asset"
        );

        bytes memory params = abi.encode(hops);

        IPool(POOL).flashLoanSimple(address(this), asset, amount, params, 0);
    }

    // ── Aave Callback ────────────────────────────────────────────────────────

    /**
     * @notice Called by Aave pool after sending flash loan funds.
     *         Executes the encoded multi-hop path and must repay (amount + premium)
     *         before returning. All safety checks are re-enforced here (fail-closed),
     *         since this is the code path that actually moves funds.
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

        Hop[] memory hops = abi.decode(params, (Hop[]));

        // Re-enforce path bounds and closure inside the fund-moving path (fail-closed).
        require(
            hops.length >= MIN_HOPS && hops.length <= MAX_HOPS,
            "FlashLoanArbitrage: bad path length"
        );
        require(
            hops[hops.length - 1].tokenOut == asset,
            "FlashLoanArbitrage: path must close to asset"
        );

        uint256 repayAmount = amount + premium;

        // ── Execute each hop in sequence ──────────────────────────────────
        address tokenIn = asset;
        uint256 amountIn = amount;

        for (uint256 i = 0; i < hops.length; i++) {
            Hop memory hop = hops[i];

            // Re-validate each hop inside the fund-moving path (fail-closed):
            // the entry point checks these too, but the callback must be self-contained.
            require(hop.router != address(0), "FlashLoanArbitrage: zero router");
            require(hop.tokenOut != address(0), "FlashLoanArbitrage: zero tokenOut");

            uint256 received;
            if (hop.isV3) {
                received = _swapV3(hop.router, tokenIn, hop.tokenOut, hop.fee, amountIn, hop.amountOutMin);
            } else {
                address[] memory path = new address[](2);
                path[0] = tokenIn;
                path[1] = hop.tokenOut;
                received = _swapV2(hop.router, amountIn, path, hop.amountOutMin);
            }

            // Feed this hop's output into the next hop.
            tokenIn = hop.tokenOut;
            amountIn = received;
        }

        // After the loop, `amountIn` holds the final received amount, denominated in `asset`.
        uint256 finalReceived = amountIn;

        require(finalReceived >= repayAmount, "FlashLoanArbitrage: trade unprofitable");

        // ── Repay Aave ────────────────────────────────────────────────────
        IERC20(asset).forceApprove(POOL, repayAmount);

        uint256 profit = finalReceived - repayAmount;
        emit ArbitrageExecuted(asset, amount, profit, initiator);

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
