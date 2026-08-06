I'll start by invoking the `cometbft-abci-auditor` skill to load the audit methodology, then perform a complete audit of the codebase.

Skill

I'll begin by exploring the codebase structure to build a complete understanding before auditing.

Let me focus on the source code, excluding node_modules.

This is a large codebase. Let me read the core consensus-critical files directly while dispatching parallel exploration agents for breadth. First, the central ABCI handler and the attached file.

Now the core state transition logic — `GlobalStateUpdater.ts` (the attached file) and `GlobalState.ts`.

Key files read. Let me now read the state, account, fees, database, and AppHash-computation layers in parallel.

Now the database layer, account manager, fees dispatcher, and AppHash components. Let me read several in parallel.

Confirmed: `indexVirtualBlockchain` writes directly to persistent `this.db` (not buffered), and it's called from `updateGlobalStateOnMicroblock` which runs in PrepareProposal/ProcessProposal. Let me verify whether the index feeds consensus, and read the account/fees/challenge/cache layers.

Let me check the validator power proto type, token scale constants, the token transfer handler, and the early-rejection service (used in CheckTx + PrepareProposal).

INITIAL_OFFER = 1e9 atomics (10,000 CMTS at 1e5 atomics/token), so total supply is far below 2^53 — bounding the JS-number precision risk. Let me read the token transfer handler, early-rejection service, and storage/commit layers.

Let me create a task list to track the audit, then continue reading the remaining consensus-relevant files.

The active `ChallengeManager` does a single 1024-byte read at a random offset without handling EOF (unlike the old commented version that looped with wraparound). Let me check `ChallengeFile`.

`readOrFail` does handle wraparound, so the challenge read is deterministic. Let me check storage write/cleaner (physical vs table purge consistency) and then dispatch parallel agents for the remaining breadth.

Storage cleaner is consensus-safe (physical deletion is gated by snapshot retention, table purge is the consensus operation). Now let me dispatch parallel agents to cover the remaining subsystems while I verify the CometBFT tx_results requirement.

Audit genesis & supply logic

Skill

The genesis audit confirms the snapshot-sync topology (only genesis node runs InitChain; others state-sync). Now let me dispatch the remaining subsystem audits and verify the CometBFT requirement in parallel.

Audit account lock/stake handlers

Audit snapshots & state-sync

Audit query handler & db tables

Fetch https://raw.githubusercontent.com/cometbft/cometbft/v0.38.0/state/execution.go

Skill

Skill

Skill

Excellent — the CometBFT check is confirmed (tx_results mismatch → `ApplyBlock` error → consensus panic → chain halt). Let me verify the two most important sub-agent halt claims directly (escrow daily-loop double-delete, and slashing on missing lock) by reading the handlers.

Confirmed: `updateExpiredEscrows` deletes **all** of a payee's expired escrows, but the driver loop in `GlobalStateUpdater.updateEscrowLocks` then calls `getEscrow(id)` on the already-deleted siblings and throws. That's an easily-triggered deterministic chain halt. Let me verify the slashing path and the state manager radix write.

Let me verify whether the VB index tables (written directly to persistent DB during PrepareProposal/ProcessProposal) are read by any consensus path, and confirm the `decided_last_commit` vote ordering source.

I now have a comprehensive picture. Let me confirm the protocol-index consensus read and finalize my analysis.

I have completed a thorough review of all consensus-critical paths. Let me record the key verified facts in memory-worthy task closure and produce the final report.

Now I'll produce the complete audit report.

---

# CometBFT v0.38 ABCI++ Security Audit — Carmentis Node

**Target:** `abci/` (NestJS ABCI++ application for CometBFT v0.38), commit `a701f1b`
**Scope:** Full application: ABCI handlers, state machine, account/token logic, database & persistence layer, snapshots/state-sync, genesis, validator-set updates, AppHash computation.
**Method:** Every ABCI++ handler traced CheckTx→Commit; state machine reconstructed; AppHash inputs traced; determinism, atomicity, monetary conservation and authorization examined; counterexamples constructed. The application relies heavily on `@cmts-dev/carmentis-sdk-core` (microblock parsing, `BalanceAvailability`, `CMTSToken`, consistency checking); SDK behavior is flagged where load-bearing.

---

## 1. Executive Summary

The application is a virtual-blockchain ledger where each CometBFT transaction is a signed "microblock". Account balances and virtual-blockchain states are committed into two order-independent Merkle radix trees whose roots, combined with a storage-challenge hash, form the AppHash.

**Good news first — no confirmed AppHash divergence between honest validators.** The account and VB state are stored in radix trees keyed by hash, so the committed root is **independent of microblock processing order**; all consensus-relevant timestamps are derived from the block (`request.time`) or the signed microblock, not wall-clock; the storage challenge is seeded deterministically and reads files with deterministic wrap-around. I did not find a path where two honest nodes executing the *same* committed block produce different AppHashes.

**The dominant risk class is chain liveness (halts), not divergence.** Two independent, easily-triggered, fully-deterministic chain halts exist, plus several crash-recovery and persistence hazards:

1. **CRITICAL — Expired-escrow daily sweep halts the chain** when a single account is the payee of ≥2 escrows expiring on the same day. Deterministic across all validators → permanent halt at that day boundary. (§3.1)
2. **CRITICAL — `ProcessProposal` accepts every proposal unconditionally, while `FinalizeBlock` silently drops invalid txs from `tx_results`.** A proposer including one invalid microblock makes `len(tx_results) != len(txs)`; CometBFT v0.38 turns this into an `ApplyBlock` error → consensus panic on every node → halt. (§3.2)
3. **HIGH — Non-atomic commit + swallowed storage-write errors + non-idempotent block replay** create several crash-recovery paths to a single-node (or, at a day boundary, all-node) halt or stuck node. (§3.3, §6)
4. **HIGH — `PrepareProposal`/`ProcessProposal` mutate persistent state** (`indexVirtualBlockchain` writes directly to LevelDB), violating ABCI++ and corrupting the query index with non-committed objects. Does not affect AppHash. (§5, ABCI Compliance)

Monetary integrity is structurally sound (transfers debit and credit symmetrically, fee dispatch conserves atomics with a deterministic remainder pass, supply is fixed at genesis ≈ 1e9 atomics ≪ 2⁵³), with no path found to mint tokens from nowhere post-genesis. The main monetary caveats are latent (JS `number` balances) or operational (fees can silently accumulate if an enum comparison regresses).

**Overall risk: HIGH** — driven by trivially-triggerable deterministic halts, not by safety/divergence.

---

## 2. Consensus Divergence Report

**No divergence-class defect confirmed.** Rationale, with evidence:

- **Order-independent state roots.** `AccountStateManager.saveAccountState` (`accounts/AccountStateManager.ts:33`) and `GlobalState.storeVirtualBlockchainState` (`state/GlobalState.ts:272`) write into `RadixTree` keyed by `accountHash`/`vbId`. `RadixTree` (`RadixTree.ts`) is a hash-keyed radix trie; its root depends only on the *set* of (key,value) pairs, not insertion order. Therefore processing microblocks/daily-updates in any order yields the same `tokenRadixHash`/`vbRadixHash`.
- **Deterministic AppHash inputs.** `getRadixHashAndApplicationHash` (`state/GlobalState.ts:197`) = `sha256( sha256(vbRadix‖tokenRadix) ‖ storageChallenge(lastRadixHash) )`. The storage challenge (`challenge/ChallengeManager.ts`) seeds a SHA-256 PRNG with `lastRadixHash`, sorts data-file entries ascending by identifier (`ChallengeManager.ts:47`), and reads with deterministic EOF wrap-around (`ChallengeFile.readOrFail`, `challenge/ChallengeFile.ts:49`).
- **Deterministic time.** Block timestamp comes from `request.time` via `CometBFTUtils.convertDateInTimestamp`; per-tx timing uses the signed `microblock.getTimestamp()`. No `Date.now()`/`Math.random()` on a consensus path that feeds state (the only `Date.now()` is in the `@deprecated`, unused `AccountManager.transferToken`, `accounts/AccountManager.ts:119`, and in genesis-only microblock creation run solely by the genesis node).
- **Daily-update key order is deterministic per block.** The daily sweeps iterate `cachedDb.getKeys(...)` (`GlobalStateUpdater.ts:125,141,163,177`); at the point they run, the relevant table's cache is empty, so the order is LevelDB lexicographic = identical on all nodes processing the same block.

**Latent divergence risks (not currently exploitable) — track these:**
- **D-1 (MEDIUM):** `CachedLevelDb.getKeys` returns `[...cacheKeys(insertion order), ...committedKeys(sorted)]` (`database/CachedLevelDb.ts:110`), i.e. **not globally canonical**. Safe today only because the daily sweeps hit each table with an empty cache. If any consensus code ever calls `getKeys` on a table already written earlier in the same block and the result drives non-commutative state, ordering becomes cache-insertion-dependent. **Fix:** sort the merged key list lexicographically before returning.
- **D-2 (MEDIUM):** `NodeEncoder` uses `cbor-x` with no canonical/sorted-keys option (`NodeEncoder.ts`; SDK encoder `tagUint8Array:false`). Determinism currently rests on valibot `v.parse` normalizing key order before every encode, and on numeric schema fields. Several schemas use bare `v.number()` (e.g. `ChainInformation.lastBlockTimestamp`, `ValidatorNodeByAddress.votingPower`, `types/valibot/db/db.ts:10,107`), which would encode as a CBOR float (different bytes) if a non-integer ever lands there. **Fix:** make CBOR canonicalization explicit; constrain all numeric fields to non-negative integers like `BlockInformationSchema` already does.

---

## 3. Chain Halt Report

### 3.1 CRITICAL — Day-boundary halt: expired-escrow sweep double-deletes ESCROWS keys

**Location:** `state/GlobalStateUpdater.ts:136-155` (`updateEscrowLocks`) + `accounts/AccountEscrowHandler.ts:78-119` (`updateExpiredEscrows`).

**Execution path:**
- On the first block of each day, `updateGlobalStateOnBlock` → `updateEscrowLocks` iterates **every** key in the `ESCROWS` table:
  ```ts
  for (const id of escrowIdentifiers) {
      const escrow = await database.getEscrow(id);
      if (escrow == null) throw new Error(`Escrow ${id.toString()} not found`); // line 146
      await accountManager.updateExpiredEscrows(escrow.payeeAccount, escrow.payerAccount, currentBlockDayTs, blockHeight);
  }
  ```
- But `updateExpiredEscrows(payee,…)` loops over **all** of that payee's escrow locks and, for each expired one, deletes its ESCROWS row (`AccountEscrowHandler.ts:114 db.del(ESCROWS, lock.parameters.escrowIdentifier)`).

**Counterexample:** Account `P` is payee of escrows `E1` and `E2`, both expiring today.
- Iteration `id=E1`: `updateExpiredEscrows(P,…)` expires **and deletes both** `E1` and `E2`.
- Iteration `id=E2`: `getEscrow(E2)` returns `null` → `throw "Escrow … not found"`.

This throw is raised inside `updateGlobalStateOnBlock`, which is `await`-ed directly (not inside a try/catch) in `FinalizeBlock` (`AbciService.ts:920`), `ProcessProposal` (`:853`), and `PrepareProposal` (`:757`). It therefore propagates out of `FinalizeBlock` → CometBFT `ApplyBlock` error → consensus panic.

**Impact:** **Chain halt (liveness).** Deterministic: every validator processes the same first-block-of-day with the same expired escrows and crashes identically. The chain cannot advance past that day boundary. Triggerable by ordinary usage — e.g. one merchant receiving two escrowed payments of equal duration created the same day — i.e. an **unprivileged user can permanently halt the chain**.

**Fix:** Make `updateExpiredEscrows` operate on the single escrow identified by the iterated key (pass `escrowIdentifier` in), **or** make the driver loop skip already-deleted keys (`if (escrow == null) continue;`). Additionally, wrap day-boundary sweep bodies so a per-item anomaly logs-and-skips rather than throwing.

### 3.2 CRITICAL — `tx_results` length mismatch: ProcessProposal accepts everything, FinalizeBlock drops invalid txs

**Location:** `AbciService.ts:839-894` (`ProcessProposal` → always `ACCEPT`), `AbciService.ts:904-992` (`FinalizeBlock` appends a `tx_result` only when `localStateConsistentWithMicroblock.checked` and no throw).

**Execution path:**
- `ProcessProposal` builds a working state, processes txs, ignores the result, and **always** returns `ResponseProcessProposal_ProposalStatus.ACCEPT` (`:891-893`). It performs **no rejection** of invalid proposals.
- In `FinalizeBlock`, for each tx, a `tx_result` is pushed **only** inside the `if (checked) {…}` branch (`:947`). If a microblock fails `checkMicroblockLocalStateConsistency` or `updateGlobalStateOnMicroblock` throws (e.g. zero fees `GlobalStateUpdater.ts:349`, expired VB `:363`, nonexistent fees payer `:340`, insufficient funds `:369`, escrow auth failure), the error is caught and logged `fatal`, and **no `tx_result` is appended** (`:959-969`).

**Verified CometBFT behavior (v0.38 `state/execution.go`):**
```go
if len(block.Data.Txs) != len(abciResponse.TxResults) { // ApplyBlock
    return state, fmt.Errorf("expected tx results length to match size of transactions in block. Expected %d, got %d", ...)
}
```
`ApplyBlock` returns this error; the consensus state machine converts it to a panic (`finalizeCommit` panics on `ApplyBlock` error). Deterministic across all nodes.

**Counterexample / trigger:** A malicious *or buggy* proposer proposes a block containing one invalid microblock (e.g. gas price 0, or fees-payer with insufficient balance). Because `ProcessProposal` accepts unconditionally, all validators accept the proposal; in `FinalizeBlock` they all drop that tx from `tx_results`; `len(tx_results) = N-1 ≠ N` → **all nodes panic → chain halt.** Even with honest proposers, any divergence between `PrepareProposal` validation (run on `workingState`) and `FinalizeBlock` validation (run on the real state, after `clearCaches`) can drop a tx and halt.

**Impact:** **Chain halt.** Also an ABCI++ correctness violation (`ProcessProposal` must reject invalid proposals; `FinalizeBlock` must return exactly one result per tx).

**Fix:** (1) In `FinalizeBlock`, push a `tx_result` with a non-zero `code` for **every** tx (including rejected/erroring ones) so the count always equals `request.txs.length`. (2) Make `ProcessProposal` actually validate and return `REJECT` when a proposed block contains a microblock that `FinalizeBlock` would not be able to apply, so invalid blocks never get committed. The two must be consistent.

### 3.3 HIGH — Misbehavior slashing halts if the offender has no staking lock

**Location:** `GlobalStateUpdater.ts:84-104` (misbehavior loop) → `accountManager.setSlashing` → `AccountSlashingHandler.setSlashing` (`accounts/AccountSlashingHandler.ts:12-23`) → SDK `BalanceAvailability.setSlashing`.

A misbehaving validator's account whose node-staking lock no longer exists (e.g. it fully unstaked, or was already slashed) causes the SDK `setSlashing` to throw (it resolves the staking lock or fails). This runs in `updateGlobalStateOnBlock`, **outside** any try/catch → propagates out of `FinalizeBlock` → halt. Trigger: a validator double-signs after unstaking. **Fix:** guard `setSlashing` with a presence check (skip-and-log if no staking lock).

### 3.4 HIGH — Fee dispatch halts on an unknown committing validator

**Location:** `GlobalStateUpdater.ts:644-708` (`dispatchFeesAmongValidators`): `if (nodeByAddress == undefined) throw new Error('Invalid validator address');` (`:680`).

If any address in `request.decided_last_commit.votes` is absent from `VALIDATOR_NODE_BY_ADDRESS`, this throw (inside `finalizeBlockApproval`, outside try/catch) halts the chain. Address registration happens in `finalizeBlockApproval`'s validator-update loop (`:494`) and at genesis (`storeInitialValidatorSet`), so it is normally covered — but it is a fragile single-point halt with no defensive skip. **Fix:** log-and-skip unknown voters instead of throwing.

### 3.5 MEDIUM — `getProtocolVirtualBlockchainIdentifier` throws on 0/>1 entries

`AbstractLevelDb.ts:46-70` throws if the `PROTOCOL_INDEX` table doesn't have exactly one entry. It's read on consensus paths via `getProtocolState` (staking, VN-approval authorization). Corruption of that index (see §5) would halt consensus. **Fix:** tolerate and recover, or guarantee exactly-one by construction.

### 3.6 MEDIUM — Snapshot apply path crashes on malformed chunks (state-sync DoS)

A syncing node accepts any offered snapshot (`OfferSnapshot` → `ACCEPT`, `AbciService.ts:1089`) and applies chunks with unguarded throws on attacker-controlled offsets/sizes (`SnapshotDataCopyManager.copyBufferToFile` size check; `SnapshotsManager.importDbFile` truncated-record throws). The gRPC controller does not wrap handlers, so the throw crashes the node. A single malicious peer can crash any node attempting state-sync. **Fix:** wrap snapshot handlers; translate failures to `REJECT_SNAPSHOT`; validate decoded offsets/sizes.

---

## 4. Monetary Integrity Report

**Token flow graph (atomics, integers):** issuance (genesis only, `BK_SENT_ISSUANCE`, payer=null) → balances → transfers/escrow/vesting (symmetric debit+credit, `AccountTokenTransferHandler.tokenTransfer`, both `update()` legs run) → tx fees to `ACCOUNT_BLOCK_FEES` → dispatched to validators in `finalizeBlockApproval`. Slashing moves locked tokens; expired escrow/vesting return to payer/owner.

**Conservation findings:**
- **No mint-from-nowhere post-genesis.** `handleTokenIssuance` is genesis-only (`GlobalStateUpdater.ts:256`, guarded; comment "SHOULD not be called except for genesis"). Total supply is fixed at `INITIAL_OFFER` ≈ 1e9 atomics.
- **Fee dispatch conserves atomics.** `FeesDispatcher.dispatch` (`accounts/FeesDispatcher.ts`) floors proportional shares then distributes the remainder one atomic at a time deterministically by `blockHeight` — `Σ shares == feesInAtomics`. No creation/loss.
- **Transfers conserve.** Both payer and payee legs execute; balance check is `spendable < total` (equality allowed). Escrow/vesting move tokens between locked/spendable without changing totals.

**Monetary caveats:**
- **M-1 (MEDIUM, latent):** Balances and amounts are JS `number` throughout (`AccountState.balance`, `Transfer.amountAsAtomics`, `GlobalStateUpdater.totalFees`, voting power). Safe *today* because supply ≪ 2⁵³, but a CRITICAL-class precision/divergence risk if supply or any intermediate (`feesInAtomics * power` in `FeesDispatcher.ts:15`) ever approaches 2⁵³. **Fix:** move atomics to `bigint`; assert `Number.isSafeInteger` at boundaries.
- **M-2 (MEDIUM):** Validator power lookups read `getEscrow`/locks and depend on SDK invariants; no post-mutation assertion that `balance ≥ 0` and `Σ locks ≤ balance`. **Fix:** assert these invariants after each `saveAccountState`.
- **M-3 (MEDIUM):** Fee dispatch only counts votes where `vote.block_id_flag.toString() == 'BLOCK_ID_FLAG_COMMIT'` (`GlobalStateUpdater.ts:670`) — a fragile string comparison against a proto enum. If the decoded enum is numeric, **no** validator is credited and the fees account grows unboundedly (tokens stranded, not lost). **Fix:** compare against the numeric enum `BlockIDFlag.BLOCK_ID_FLAG_COMMIT`.
- **M-4 (LOW):** `FeesDispatcher` remainder loop runs `feesInAtomics` iterations if `totalValidationPowers == 0` (all committing validators have 0 stake) — O(fees) work, a DoS edge. **Fix:** guard the zero-power case.

---

## 5. Critical Findings (summary table)

| ID | Title | Severity | Location | Class |
|----|-------|----------|----------|-------|
| C-1 | Expired-escrow daily sweep double-deletes ESCROWS → throw → halt | **CRITICAL** | `GlobalStateUpdater.ts:136-155` + `AccountEscrowHandler.ts:78-119` | Chain halt (liveness), unprivileged trigger |
| C-2 | `ProcessProposal` accepts all + `FinalizeBlock` tx_results count mismatch → consensus panic | **CRITICAL** | `AbciService.ts:839-894`, `:904-992` | Chain halt + ABCI++ violation |

---

## 6. High Findings

| ID | Title | Location | Notes |
|----|-------|----------|-------|
| H-1 | **`PrepareProposal`/`ProcessProposal` mutate persistent state.** `GlobalState.indexVirtualBlockchain` (`state/GlobalState.ts:301-309`) writes via `this.db.indexVirtualBlockchain` (`database/LevelDb.ts:274`, immediate `putRaw`, **not** buffered) and is called from `updateGlobalStateOnMicroblock` (`GlobalStateUpdater.ts:451`) during proposal phases. Index entries for VBs in rejected/uncommitted proposals persist permanently. | `state/GlobalState.ts:301`, `GlobalStateUpdater.ts:249,451` | ABCI++ violation. Does **not** affect AppHash (indexes excluded from radix), but corrupts the queryable object index (`getObjectList`) and is non-atomic vs. Commit. The same call also bypasses the atomic batch in `FinalizeBlock`. **Fix:** route index writes through the cached/buffered DB and commit them atomically in `Commit`. |
| H-2 | **Misbehavior slashing halt** (no staking lock) | `GlobalStateUpdater.ts:84-104`, `AccountSlashingHandler.ts:12` | §3.3 |
| H-3 | **Unknown-validator fee-dispatch halt** | `GlobalStateUpdater.ts:680` | §3.4 |
| H-4 | **Non-atomic commit + swallowed storage errors.** `GlobalState.commit` (`state/GlobalState.ts:245-248`) commits the DB batch **then** flushes storage; `Storage.writeTransactions` (`storage/Storage.ts:209-211`) **catches and swallows all errors** (incl. the size-mismatch "PANIC"). A failed/partial flush leaves DB ahead of disk; the next storage challenge's `checkSizeOrFail` (`challenge/ChallengeFile.ts:33`) throws in `FinalizeBlock` → node halt. | `state/GlobalState.ts:245`, `storage/Storage.ts:175-212` | Persistence/recovery. **Fix:** order storage-before-DB (or use a write-ahead marker), and never swallow write errors — fail loudly and abort Commit. |
| H-5 | **Non-idempotent block replay.** `updateGlobalStateOnBlock` throws `duplicate block at height N` (`GlobalStateUpdater.ts:69-75`) if `getBlockContent(N)` exists. If CometBFT replays the last committed block after a crash between DB commit and CometBFT recording the commit, `FinalizeBlock(N)` throws → node cannot restart. | `GlobalStateUpdater.ts:61-76` | Crash recovery. **Fix:** make replay of the last block idempotent (detect already-applied height and return the stored result/AppHash). |
| H-6 | **Snapshot import is non-atomic.** `SnapshotsManager.importDbFile` calls `db.clear()` then repopulates in batches; a crash mid-import leaves a truncated DB and a garbage AppHash. | `SnapshotsManager.ts` (`importDbFile`) | **Fix:** stage into a temp DB and atomically swap after a full hash-verified import. |
| H-7 | **Snapshot/state-sync verification gap.** `OfferSnapshot` ACCEPTs unconditionally and `ApplySnapshotChunk` never verifies chunks against the advertised snapshot hash. CometBFT's post-restore AppHash-vs-header check mitigates *state injection* for normal state-sync, but the **genesis bootstrap** path (`initChainAsNode` → `searchGenesisSnapshotChunksFromGenesisNode`, `AbciService.ts:332-404`) imports an RPC-fetched snapshot with **no integrity check** and returns a self-derived AppHash from `InitChain` (no trusted header to compare against unless `genesis.json` pins `app_hash`). | `AbciService.ts:1089-1127`, `:332-404`, `SnapshotsManager.loadReceivedChunk` | **Fix:** recompute and compare snapshot hash on apply; anchor the genesis snapshot hash in the genesis doc and verify before importing; reject on mismatch. |
| H-8 | **Snapshot-apply DoS** (unguarded throws on malformed chunks) | `SnapshotDataCopyManager`, `SnapshotsManager.importDbFile`, `GrpcAbciController` (no try/catch) | §3.6 |

---

## 7. Medium Findings

- **MED-1 — `getKeys` non-canonical ordering** (`database/CachedLevelDb.ts:110`): latent divergence; sort before returning. (§2 D-1)
- **MED-2 — CBOR not explicitly canonical + loose numeric schemas** (`NodeEncoder.ts`, `types/valibot/db/db.ts:10,107,12`): latent divergence; enforce canonical encoding and integer-only numeric fields. (§2 D-2)
- **MED-3 — `convertDateInTimestamp` returns 0 on undefined `request.time`** (`CometBFTUtils.ts:34-40`): silently substitutes epoch 0 on a consensus path, which would mass-mis-trigger day-boundary vesting/escrow/slashing and persist a bogus `lastBlockTimestamp`. **Fix:** throw (CometBFT always sets time) and/or enforce monotonicity.
- **MED-4 — JS `number` for balances/amounts/power** (M-1): move to `bigint`.
- **MED-5 — Staking-lock index leak after full slash:** `AccountSlashingHandler.applyNodeSlashing` never deletes the `ACCOUNTS_WITH_STAKING_LOCKS` entry when the lock reaches 0 (unlike the unstake handler), so the daily sweep set grows unboundedly → progressively slower `FinalizeBlock` and a trigger for H-2. **Fix:** delete the index entry when no staking lock remains.
- **MED-6 — Fragile `block_id_flag` comparison** (M-3): fees may silently never be distributed.
- **MED-7 — `getRawBlockContent` chunking bug + unbounded load** (`ABCIQueryHandler.ts:192-232`): `parts.push(currentPart); currentPart.length = 0;` pushes by reference then clears it (all parts become empty/identical); also loads the whole block regardless of requested `partIndex`. Query-path only (read-only, errors caught) — no consensus impact, but broken results + DoS. **Fix:** push copies; bound work by `partIndex`.
- **MED-8 — Unbounded query ranges / interface signature mismatch:** `getKeys(tableId)` has an optional/absent `limit` across `DbInterface`/`AbstractLevelDb`; `getAccountUpdates`/`getVirtualBlockchainUpdate` walk unbounded ranges. DoS on query nodes. **Fix:** mandatory caps.
- **MED-9 — User-controlled microblock timestamp drives unstake/escrow timing** (`GlobalStateUpdater.ts:851,878`; code's own TODO at `:841`): deterministic (no divergence) but lets a user shorten unstaking delay / shift escrow expiry. **Fix:** use the block timestamp for delay computation.
- **MED-10 — `InitChain` external network dependency:** non-genesis nodes fetch the genesis snapshot over RPC during `InitChain` (`AbciService.ts:388-404`, `NetworkProvider.getGenesisSnapshot`). Bootstrapping depends on the genesis node being reachable; combine with H-7.

---

## 8. Low Findings

- **LOW-1 — Genesis non-reproducibility:** genesis microblocks embed `Date.now()` + 24 random bytes (SDK), so re-running genesis yields a different AppHash. Genesis node only; other nodes copy the snapshot, so no divergence — but genesis isn't independently auditable. (Genesis agent finding D1.)
- **LOW-2 — `PersistentMerkleTree` invariants** (`persistentMerkleTree/PersistentMerkleTree.ts`): append-only/size invariant unenforced (`addLeaf` requires gap-free sequential indices; `getNode` throws on missing nodes); `verifyProof` crashes on malformed proofs instead of returning false; `sizeToHeight` bounded to 2³² via `Math.clz32`. Not currently wired into AppHash — **confirm** before relying on it in consensus; if it ever backs the VB radix, the throw-on-missing behavior escalates to CRITICAL.
- **LOW-3 — Vote extensions are no-ops** (`ExtendVote`/`VerifyVoteExtension` return empty/accept). Correct **only because** vote extensions are disabled (the `vote_extensions_enable_height` config is commented out in `createInitChainResponse`, `AbciService.ts:455-491`). If ever enabled, `VerifyVoteExtension` accepting everything becomes a real issue.
- **LOW-4 — `hasSomethingToCommit()` hard-coded `true`** (`state/GlobalState.ts:234`): `Commit` always runs; minor.
- **LOW-5 — `hasEnoughTokensToPublish` strict `>`** (`GlobalStateUpdater.ts:367`): an account cannot spend its exact balance on fees; off-by-one, not a security issue.
- **LOW-6 — `console.log` / debug noise on consensus paths** (`GlobalStateUpdater.ts:350-352`, `AbciService.ts:1050`): remove.
- **LOW-7 — `@deprecated AccountManager.transferToken` uses `Date.now()`** (`accounts/AccountManager.ts:119`): ensure it is never reachable from consensus; delete it.
- **LOW-8 — `CometBFTPublicKeyConverter`** (`CometBFTPublicKeyConverter.ts:4-6`): `sha256(pubkey)[:20]` is correct for ed25519 (matches CometBFT v0.38) but assumes ed25519 and does not length-check the key. Add a 32-byte assertion.

---

## 9. ABCI++ Compliance Assessment

| Handler | Status | Notes |
|---------|--------|-------|
| **Info** | OK | Returns `last_block_height` + `last_block_app_hash` from committed state. Sets `isCatchingUp=false` (used only to gate local snapshot creation). |
| **InitChain** | OK w/ risks | Genesis path builds state; non-genesis path state-syncs via **RPC network call** (MED-10) with **no integrity check** (H-7). Clears DB/storage/snapshots first. |
| **CheckTx** | OK | Parses microblock, early-reject cache, min gas price, signature & consistency checks. Uses wall-clock `referenceTimestamp` — acceptable (mempool admission, not consensus). Fully wrapped in try/catch; invalid txs rejected, never crash. |
| **PrepareProposal** | **VIOLATION** | Mutates persistent state via `indexVirtualBlockchain` (H-1). Can throw out of the handler at a day boundary (C-1). Gas-descending sort is proposer-local (fine). |
| **ProcessProposal** | **VIOLATION** | Always returns `ACCEPT` — performs **no validation/rejection** (C-2 root cause). Also mutates state via `indexVirtualBlockchain` (H-1). |
| **FinalizeBlock** | **VIOLATION** | `tx_results` count can ≠ `txs` count (C-2). Day-boundary sweep can throw (C-1, H-2, H-3). Otherwise performs the real state transition correctly. |
| **Commit** | Partial | DB batch is atomic, but storage flush is **separate, after** the DB and **swallows errors** (H-4); also drives local snapshot creation/pruning. |
| **ExtendVote** | OK* | No-op; correct only while vote extensions are disabled (LOW-3). |
| **VerifyVoteExtension** | OK* | Accepts unconditionally; safe only while disabled (LOW-3). |

The core ABCI++ contract is violated in three ways: proposal-phase state mutation (H-1), unconditional `ProcessProposal` acceptance (C-2), and `FinalizeBlock` not returning one result per tx (C-2).

---

## 10. Recommended Fixes (priority order)

1. **C-1:** In `updateEscrowLocks`, `if (escrow == null) continue;` and/or make `updateExpiredEscrows` process only the iterated escrow id. Make all day-boundary sweeps non-throwing.
2. **C-2:** Always append one `tx_result` per tx in `FinalizeBlock` (non-zero `code` for rejected); make `ProcessProposal` reject blocks containing microblocks that `FinalizeBlock` would not apply. Keep the two validators identical.
3. **H-4 / H-5 / H-6:** Make persistence crash-safe: storage-before-DB (or WAL marker), never swallow storage write errors, make last-block replay idempotent, and make snapshot import atomic (stage + swap).
4. **H-1:** Buffer index writes through `CachedLevelDb` and commit them atomically in `Commit`; never write persistent state during Prepare/Process.
5. **H-2 / H-3 / 3.5:** Replace consensus-path throws (slashing without lock, unknown voter, protocol-index cardinality) with log-and-skip / guaranteed invariants.
6. **H-7 / H-8 / MED-10:** Verify snapshot/genesis-snapshot content against an anchored hash; wrap snapshot handlers; reject (don't crash) on malformed input; pin the genesis snapshot hash in `genesis.json`.
7. **MED-1 / MED-2 / MED-3:** Canonicalize `getKeys` ordering and CBOR encoding; constrain numeric schemas to integers; remove the `undefined→0` timestamp fallback (throw / enforce monotonicity).
8. **MED-4:** Migrate atomic amounts and voting power to `bigint` with `isSafeInteger` assertions.
9. **MED-5 / MED-6 / MED-9:** Clean up staking-lock index after slashing; fix the `block_id_flag` comparison; use block timestamp for unstake/escrow timing.
10. Address LOW items (vote-extension no-ops if ever enabling extensions, dead code, debug logging, key-length checks).

---

## 11. Overall Risk Rating

**HIGH.**

- **Safety (divergence):** No confirmed AppHash divergence between honest validators — the order-independent radix design and block-derived timing are genuine strengths. Residual divergence risks (MED-1, MED-2, MED-3) are latent and fixable.
- **Liveness (halts):** The decisive risk. **C-1** is an unprivileged, deterministic, full-chain halt reachable through ordinary escrow usage, and **C-2** is a proposer-triggerable deterministic halt that also breaks the ABCI++ contract. Several further crash-recovery/persistence paths (H-4, H-5, H-6) can wedge nodes.
- **Monetary integrity:** Structurally conservative; no mint-from-nowhere found post-genesis. Caveats are latent (JS `number`) or operational (stranded fees).
- **Protocol security:** Authorization for escrow settlement, validator approval, and slashing cancellation is correctly gated (`isAccountIdAllowedToWriteOnVirtualBlockchain`, `GlobalStateUpdater.ts:530`), and fees are paid only by a signature-verified payer. The main protocol-level gaps are the unverified state-sync/genesis-snapshot trust (H-7) and the ABCI proposal-phase mutation (H-1).

The chain should not be considered production-safe until **C-1** and **C-2** are fixed; both are deterministic halts, and C-1 requires no privileges to trigger.

---

I traced all nine ABCI++ handlers end-to-end, reconstructed the state machine, and verified the central CometBFT v0.38 requirement against upstream source. The two CRITICAL halts (C-1, C-2) are the headline items — both are deterministic and easy to trigger, with C-1 reachable by any ordinary user creating two escrows to the same payee. If useful, I can write minimal reproductions or draft the patches for C-1 and C-2.