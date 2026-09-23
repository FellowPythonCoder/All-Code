FROM rust:1-bookworm AS engine
WORKDIR /work
COPY Extra/Source/src-tauri ./src-tauri
RUN cargo build --manifest-path src-tauri/Cargo.toml --release --no-default-features --features api --bin sreon-api
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=engine /work/src-tauri/target/release/sreon-api /usr/local/bin/sreon-api
COPY Extra/Source/integrations/sreon.mjs ./Extra/Source/integrations/sreon.mjs
COPY index.html ./index.html
COPY site ./site
ENV SREON_API=/usr/local/bin/sreon-api
ENV PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=25s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "site/start.mjs"]
