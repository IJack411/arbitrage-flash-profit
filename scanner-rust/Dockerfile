# ── Build stage ────────────────────────────────────────────────────────────────
FROM rust:1.78-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Cache dependencies by copying manifest files first
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs
RUN cargo build --release 2>/dev/null || true

# Copy the real source code and build
COPY src ./src
COPY contracts ./contracts
RUN touch src/main.rs && cargo build --release

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN useradd -m -u 1000 scanner
USER scanner

WORKDIR /app

# Copy binary and ABI files
COPY --from=builder /build/target/release/mev-scanner ./mev-scanner
COPY contracts ./contracts

# Prometheus metrics port
EXPOSE 9090

ENTRYPOINT ["./mev-scanner"]
