FROM rust:1.81-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY src src
COPY contracts contracts
COPY tests tests
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/mev-scanner /usr/local/bin/mev-scanner
COPY .env.example /app/.env.example
EXPOSE 9090
CMD ["mev-scanner"]
