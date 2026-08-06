# Infrastructure & Configuration Security Audit — `prod/` (devnet)

**Target:** `prod/configs/devnet/{node1,node2}/**` — Docker Compose, Caddy, CometBFT v0.38 config/keys/genesis, and the ABCI app `config.toml`. Plus the ABCI `Dockerfile`/`.dockerignore`/`.env`.
**Companion:** Application/consensus audit in `report.md` (commit `a701f1b`). This report covers only the **infrastructure & configuration** surface the code audit excluded.
**Method:** Every file read end-to-end; config keys cross-checked against the parser (`abci/src/carmentis/config/types/NodeConfig.ts`) and against CometBFT v0.38 semantics; git/Docker packaging traced to find secret-exposure paths.

> **Scope note.** The `cometbft-abci-auditor` skill normally treats *infrastructure security* as out of scope and *assumes validator private keys are secure*. This audit was explicitly requested on the infra config, and several findings below are exactly the **violation of that key-secrecy assumption** by the way the configuration is packaged. Severities are rated on real-world impact, with that caveat noted.

---

## 1. Executive Summary

The configuration is a working 2-host devnet, but the way secrets and trust anchors are packaged is the dominant risk — not the CometBFT tuning itself.

- **CRITICAL — Live consensus signing keys, node identity keys, and the genesis issuer private key all sit in the `prod/` working tree, and `prod/` is *not* git-ignored.** Anyone who obtains them (a `git add`/push, the repo, or the Docker image) can equivocate as a validator, impersonate node identity, and control the genesis-allocated tokens. This breaks the core trust assumption the rest of the system relies on.
- **CRITICAL — Genesis ships with `app_hash: ""` and a single validator, while node2 bootstraps its entire state from node1 over plain RPC with no integrity anchor.** State origin is unauthenticated (config-level confirmation of `report.md` H-7).
- **HIGH — A real `PKMS_API_KEY` is baked into the published ABCI image** because `.dockerignore` doesn’t exclude `.env` and the Dockerfile does `COPY . /app`.
- **HIGH — RPC is exposed unauthenticated with `CORS *`, directly on a host port (bypassing Caddy TLS); the ABCI container runs as root; image build allows arbitrary dependency build scripts.**
- **MEDIUM — Multiple cross-node config inconsistencies and silently-ignored keys** (wrong TOML nesting swallowed by a permissive schema, a misplaced consensus key landing in `[mempool]`, divergent timeouts/snapshot cadence, `double_sign_check_height = 0` against reset `priv_validator_state.json`).

**Overall infra-config risk: CRITICAL**, driven entirely by secret packaging and unauthenticated trust anchors. The CometBFT consensus tuning itself is mostly reasonable.

---

## 2. Critical Findings

### C-1 — Validator/node/genesis private keys committed in the working tree (`prod/` is not git-ignored)

**Files:**
- `prod/configs/devnet/node1/cometbft/config/priv_validator_key.json` — validator consensus signing key (ed25519, address `454E…B4FE`, the **sole genesis validator**).
- `prod/configs/devnet/node2/cometbft/config/priv_validator_key.json` — second validator signing key (`F1AC…C952`).
- `prod/configs/devnet/node{1,2}/cometbft/config/node_key.json` — P2P node identity private keys.
- `prod/configs/devnet/node1/config.toml:5` — genesis issuer key in plaintext: `sk = 'SIG:SECP256K1:SK{45442c1a…d933cf3}'`.

**Root cause / exposure path:** the repo root `.gitignore` does **not** list `prod/`; `git check-ignore` confirms these files are **not** ignored, and `git status` shows `?? prod/` (untracked) — i.e. the next `git add -A` commits all of them. The `write-file-atomic-*` artifacts and live `addrbook` data in `node2/cometbft/config/` show this tree was copied wholesale from a *running* node, which is how the live keys ended up here.

**Impact (per audit priority order):**
1. **Consensus safety / equivocation:** node1 is the only genesis validator with 100% power. Whoever holds `node1`’s `priv_validator_key.json` *is* the chain — they can sign conflicting blocks (double-sign), unilaterally finalize, or halt it.
2. **Token control:** the genesis issuer key controls the genesis allocation / issuance authority.
3. **Identity spoofing:** `node_key.json` lets an attacker impersonate the node’s P2P identity (`82958a46…` is the advertised node ID).

This directly violates the auditor’s standing assumption that *validator private keys are secure*.

**Fix:**
- Treat these as **compromised**: rotate the validator consensus keys, node keys, and the genesis issuer key; if the chain has any value, the genesis validator key rotation means a coordinated key change / re-genesis.
- Remove keys from the repo tree. Add `prod/**/priv_validator_key.json`, `prod/**/node_key.json`, `prod/**/*config.toml`, `prod/**/priv_validator_state.json` (and ideally all of `prod/configs/**/cometbft/`) to `.gitignore`. Provide `*.example` templates only.
- Deliver keys at runtime via a secrets manager / mounted secret (the codebase already supports `SIG:PKMS:…` and `path`/`env` key sources — use them instead of inline `sk`).
- Scrub git history if any of these were ever committed.

### C-2 — Empty genesis `app_hash` + single validator + unauthenticated state bootstrap

**Files:** `prod/configs/devnet/node{1,2}/cometbft/config/genesis.json`, `prod/configs/devnet/node2/config.toml:23-24`.

- `genesis.json`: `app_hash: ""`, `initial_height: "2"`, and a **single** validator (`454E…B4FE`, power `1000000000000`). node2’s validator key is **not** in the genesis set.
- `node2/config.toml`: `[genesis_snapshot] rpc_endpoint = "https://node1.server1.devnet.carmentis.io"` — node2 fetches its initial state snapshot from node1 over RPC.

**Impact:**
- With an **empty `app_hash`** there is no trusted anchor to compare the bootstrapped state against. The application-side genesis-snapshot import (`report.md` H-7) already lacks integrity verification; the config confirms there is also nothing in `genesis.json` to verify against. A malicious or compromised node1 RPC endpoint — or a MITM on that HTTPS call if cert validation is ever relaxed — can feed node2 an **arbitrary initial ledger** (balances, validator set), and node2 has no way to detect it.
- **Single-validator genesis = no BFT.** node1 alone holds 100% voting power: it can rewrite or halt the chain unilaterally, and if node1 is down the chain cannot make progress (2/3 of a 1-validator set is node1). The “consortium” fault-tolerance property does not hold at genesis.

**Fix:**
- Pin the expected post-genesis `app_hash` in `genesis.json` (or distribute a signed genesis-snapshot hash out of band) and verify it before import; reject on mismatch.
- Include all intended consortium validators in the genesis `validators` set (or document and gate the validator-onboarding flow) so no single node holds 100% power.
- Distribute `genesis.json` from a signed, version-controlled source rather than copying it between live nodes.

---

## 3. High Findings

### H-1 — `PKMS_API_KEY` leaks into the published Docker image

**Files:** `abci/.env:3` (`PKMS_API_KEY=pkms_FMcJ…1Ux8`), `abci/.dockerignore`, `abci/Dockerfile:6` (`COPY . /app`).

`.dockerignore` excludes `config.toml`, `.cometbft`, `keys.json`, etc. but **not `.env`**. The Dockerfile copies the whole build context, so the real PKMS API key is embedded in `ghcr.io/carmentis/node/abci:devnet`. Anyone who can `docker pull` the image (it’s on GHCR) can `docker history`/extract the layer and recover the key. `.gitignore` keeps `.env` out of git, which gives a false sense of safety — the image is the leak channel.

**Fix:** add `.env` (and `*.env`) to `.dockerignore`; rotate the PKMS key; inject runtime secrets via env/secret mounts, never via `COPY . /app`. Prefer a multi-stage build that copies only build outputs into the final image.

### H-2 — Unauthenticated RPC: `CORS *`, host-published port, TLS bypass

**Files:** `prod/configs/devnet/node{1,2}/cometbft/config/config.toml` (`cors_allowed_origins = ["*"]`), `docker-compose.yml` (publishes `26657:26657`; cometbft started with `--rpc.laddr tcp://0.0.0.0:26657`), `Caddyfile` (HTTPS proxy to `:26657`).

- Port **26657 is published directly on the host’s `0.0.0.0`**, so the RPC is reachable in plaintext HTTP bypassing Caddy’s TLS, in addition to the public HTTPS endpoint.
- `cors_allowed_origins = ["*"]` lets any website issue RPC calls from a visitor’s browser (tx broadcast, mempool/info disclosure, subscriptions).
- No auth or rate-limiting in front of the RPC. `unsafe = false` mitigates the most dangerous endpoints (`/dial_peers`, `/unsafe_flush_mempool`), but tx flooding and information disclosure remain.

**Fix:** don’t publish 26657 to the host — bind it to `127.0.0.1` (or the compose network only) and let Caddy be the sole ingress; restrict `cors_allowed_origins` to the known dapp origins; add rate-limiting / method allow-listing at Caddy; keep `unsafe = false`.

### H-3 — ABCI container runs as root

**Files:** `abci/Dockerfile` (no `USER`; `node:22-slim` defaults to root), vs `docker-compose.yml` `node-cometbft` which sets `user: "1000"`.

The ABCI process runs as root and has the CometBFT key material and ABCI storage volume-mounted (`./cometbft:/cometbft`, `./abci:/abci`). A compromise of the Node.js process (or a dependency) gets root in-container and read access to validator keys.

**Fix:** add a non-root `USER` to the ABCI Dockerfile and align file ownership; apply `read_only`/`cap_drop`/`no-new-privileges` in compose where possible.

### H-4 — Build runs arbitrary dependency scripts (`--dangerously-allow-all-builds`)

**File:** `abci/Dockerfile:9` — `pnpm install --frozen-lockfile --dangerously-allow-all-builds`.

This disables pnpm’s build-script allow-listing, so every transitive dependency’s `postinstall`/build script executes at image-build time. A single compromised dependency achieves code execution in the build and ships in the image (supply-chain). `--frozen-lockfile` helps pin versions but does not stop malicious scripts in pinned versions.

**Fix:** drop the flag; explicitly allow-list the packages that genuinely need build scripts (`pnpm.onlyBuiltDependencies`). Pair with lockfile/dependency review.

---

## 4. Medium Findings

### M-1 — Silently-ignored / misparsed config keys (permissive schema masks mistakes)

- **REST query port nesting is wrong.** Both prod `config.toml` use `[abci.rest.query] port = 26659`, but the parser expects `abci.query.rest.port` (`NodeConfig.ts:83-91`). valibot `v.object` ignores unknown keys, so `[abci.rest.query]` is **silently dropped** and the REST query port falls back to undefined. (Low blast radius today because the port isn’t published in compose, but the config is dead.)
- **`min_microblock_gas_price_in_atomics` uses `v.fallback(v.number(), 0)`** (`NodeConfig.ts:92`). The prod files use the correct key and a consistent value (`100` on both nodes), so this is fine *now*. But any typo or per-node drift would silently fall back to **0** (accept zero-gas txs). The local `abci/config.toml` already shows the failure mode — it uses the stale key `min_microblock_gas_in_atomic_accepted`, which the parser ignores, falling back to 0. This is CheckTx/mempool-only (node-local, not a consensus-divergence path), but it is a silent policy bypass.

**Fix:** make the config schema **strict** (reject unknown keys) or validate-and-warn on unrecognized keys; fail fast instead of `fallback` for security-relevant values like min gas price.

### M-2 — Cross-validator timing/cadence inconsistencies

- **`create_empty_blocks_interval`**: node1 `30s` vs node2 `0s` (`[consensus]`). Additionally node2 has a **stray `create_empty_blocks_interval = "30s"` at line 358 that lands inside `[mempool]`** (it appears before the `[statesync]` header), so it is an unknown mempool key — misparsed/ignored, not the consensus value.
- **`timeout_commit`**: node1 `1s` vs node2 `500ms`.
- **`addr_book_strict`**: node1 `true` vs node2 `false`; **`proxy_app`**: node1 `tcp://127.0.0.1:26658` (only works because the compose `--proxy_app node-abci:26658` flag overrides it) vs node2 `tcp://node-abci:26658`.

These are local parameters (not consensus-safety), but divergent block cadence/timeouts across validators is a known foot-gun and should be standardized. The misplaced TOML key and the node1 `127.0.0.1` proxy_app indicate hand-edited, drift-prone configs.

**Fix:** template the CometBFT config from one source with per-node overrides only for `moniker`/`external_address`/`persistent_peers`; keep `timeout_*` and `create_empty_blocks_interval` identical across validators; move the stray key into `[consensus]`.

### M-3 — `double_sign_check_height = 0` with reset `priv_validator_state.json`

Both nodes set `double_sign_check_height = 0` (no restart equivocation guard), and both `cometbft/data/priv_validator_state.json` are reset to `{"height":"0","round":0,"step":0}` while the chain’s `initial_height` is `2`. Restarting a validator against a stale/reset state file with no double-sign check is precisely the configuration that allows **accidental double-signing** on restart. (`report.md` notes the app also lacks idempotent replay — H-5.)

**Fix:** set `double_sign_check_height` to a small positive value on validators; never ship/restore a reset `priv_validator_state.json` onto a node that has already signed; back up and restore the real state file with the data dir.

### M-4 — Divergent snapshot cadence + unverified snapshots

`node1/config.toml`: `snapshot_block_period = 200, max_snapshots = 3`; `node2/config.toml`: `snapshot_block_period = 50, max_snapshots = 10`. Combined with the app’s unverified snapshot apply path (`report.md` H-7/H-8), nodes produce/serve snapshots on very different schedules, widening the window where a syncing node trusts an unverified peer snapshot. `statesync.enable = false` in both CometBFT configs limits CometBFT-native state-sync, but the app’s own genesis-snapshot path (C-2) is the live risk.

**Fix:** standardize snapshot cadence; verify snapshot content hashes on import (app-side).

### M-5 — `max_gas = "-1"` (unbounded) in genesis consensus params

`genesis.json` sets `consensus_params.block.max_gas = "-1"`. There is no consensus-level gas ceiling; DoS protection rests entirely on `max_microblocks_per_block = 50` and `max_bytes ≈ 3.77 MB`. If the app-side microblock cap regresses, there is no consensus backstop.

**Fix:** consider a finite `max_gas` aligned with the app’s per-block work budget as defense-in-depth.

### M-6 — Live runtime artifacts and host details committed

`node2/cometbft/config/` contains five `write-file-atomic-*` temp files (leftover from CometBFT’s atomic writes of the address book) holding live peer data, real server IPs (`54.38.190.49`, `57.131.21.163`) and node IDs. This both confirms the tree was lifted from a running node (see C-1) and leaks topology/IP info.

**Fix:** never copy a live node’s data/config dir into source control; remove the temp files; regenerate clean configs from templates.

---

## 5. Low Findings

- **L-1 — `vote_extensions_enable_height = "0"` (disabled).** Correct today and consistent with the no-op `ExtendVote`/`VerifyVoteExtension` (`report.md` LOW-3). Document the coupling: if anyone enables vote extensions by editing genesis, the accept-everything `VerifyVoteExtension` becomes a real vulnerability.
- **L-2 — Dockerfile `EXPOSE 3000`** doesn’t match the actual ABCI ports (`26658` gRPC, `26659` REST). Cosmetic/misleading.
- **L-3 — Inconsistent container names** (`node-caddy` in node1 vs `caddy` in node2) and `depends_on` without health conditions — Caddy can start before the upstreams are ready.
- **L-4 — Genesis voting power must stay integer.** `genesis.json` power is `"1000000000000"` (a safe integer < 2⁵³). Tie-in with `report.md` MED-2 and the attached `db.ts` — `ValidatorNodeByAddressSchema.votingPower` (`db.ts:107`) and `ChainInformationSchema.lastBlockTimestamp` (`db.ts:10`) are bare `v.number()` (no `v.integer()`, unlike `BlockInformationSchema`). A non-integer voting power would CBOR-encode as a float and **diverge the AppHash**. Genesis is the input to that value, so genesis power values must remain integers; ideally tighten the schema to `v.pipe(v.number(), v.integer(), v.minValue(0))`.

---

## 6. ABCI / CometBFT Config Compliance Summary

| Area | Status | Note |
|------|--------|------|
| Genesis integrity (`app_hash`) | ❌ | Empty; no trust anchor for bootstrap (C-2) |
| Validator set decentralization | ❌ | Single genesis validator, 100% power (C-2) |
| Key handling | ❌ | Private keys in repo tree, not git-ignored (C-1) |
| Secret packaging (image) | ❌ | `.env`/`PKMS_API_KEY` baked into image (H-1) |
| RPC exposure | ⚠️ | `CORS *`, host-published, TLS-bypass port (H-2); `unsafe=false` ✅ |
| Container hardening | ⚠️ | ABCI as root (H-3); build runs all scripts (H-4) |
| Config consistency across nodes | ⚠️ | Timeouts, cadence, nesting, misplaced keys (M-1/M-2) |
| Equivocation protection | ⚠️ | `double_sign_check_height = 0` + reset state (M-3) |
| Vote extensions | ✅* | Disabled; safe only while disabled (L-1) |
| Statesync | ✅ | Disabled in CometBFT; app-path snapshot trust is the real gap (M-4) |

---

## 7. Recommended Fix Priority

1. **C-1:** Treat all `prod/` keys as compromised — rotate, remove from the tree, `.gitignore` them, deliver via secrets at runtime, scrub history.
2. **C-2:** Pin/verify genesis `app_hash` (or a signed snapshot hash); put all consortium validators in the genesis set.
3. **H-1:** Exclude `.env` from the image, rotate `PKMS_API_KEY`, switch to runtime secret injection + multi-stage build.
4. **H-2/H-3/H-4:** Stop host-publishing 26657, restrict CORS, add Caddy rate-limit; run ABCI as non-root; drop `--dangerously-allow-all-builds`.
5. **M-1…M-6:** Template configs from one source; make the config schema strict/fail-fast; standardize timeouts/cadence; fix the misplaced `[mempool]` key and the `abci.rest.query` nesting; set `double_sign_check_height > 0`; never commit live data dirs; remove temp files.
6. **L-1…L-4:** Document vote-extension coupling; fix `EXPOSE`/naming; tighten integer schemas for consensus-critical numeric fields.
