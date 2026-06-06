# Repository Guidelines

This repository contains a DeFi Arbitrage Governance Platform, integrating a React frontend, Ethereum smart contracts, and Supabase backend services.

## Project Structure & Module Organization

- **Frontend (`src/`)**: Built with Vite, React 18, and TypeScript. Uses `shadcn/ui` components and Tailwind CSS.
  - **`src/components/`**: Organized into `governance/` for domain-specific logic and `ui/` for reusable elements.
  - **`src/contexts/`**: Manages global state for governance and application-wide data.
  - **`src/lib/`**: Contains service integrations like Supabase and audit logging.
- **Smart Contracts (`contracts/`)**: Hardhat-based environment for Solidity contracts.
- **Backend (`supabase/`)**: Database migrations and Edge Functions for serverless logic.
- **Scripts (`scripts/`)**: Node.js utilities for trade evaluation, synchronization, and preflight checks.

## Build, Test, and Development Commands

### Root (Frontend & General)
- **`npm run dev`**: Start the Vite development server.
- **`npm build`**: Build the production frontend.
- **`npm run lint`**: Run ESLint across the project.
- **`npx playwright test`**: Execute E2E tests.

### Contracts (in `/contracts`)
- **`npm run compile`**: Compile Solidity contracts.
- **`npm run test`**: Run Hardhat tests.
- **`npm run deploy:local`**: Deploy to a local Hardhat node.

### Supabase
- **`npm run supabase:dev`**: Start local Supabase environment and Edge Functions.
- **`npm run supabase:functions:deploy:all`**: Deploy all Edge Functions to production.

## Coding Style & Naming Conventions

- **TypeScript**: Relaxed strictness (`strictNullChecks: false`, `noImplicitAny: false`).
- **Import Aliases**: Use `@/*` to reference the `src/` directory.
- **Component Exports**: Follow Vite patterns; certain hooks and variants are explicitly allowed for export in `eslint.config.js`.
- **Linting**: Enforced via ESLint with `typescript-eslint` and React-specific plugins.

## Agent Guidelines

- **Arbitrage Scout**: Use for researching DeFi patterns, gas optimization, and competitor strategy analysis.
- **Serena**: Background agent for continuous system maintenance, simulations, and proactive troubleshooting.
- **ScannerHarvester-X**: Specialized intelligence agent to extract, aggregate, and structure deep technical knowledge about market scanners, indicators, and signal engines. Results are stored in `scout-agent/data/knowledge_base/`.
- **Safety**: Always run simulations before modifying core contract logic and verify UI changes with Playwright.
