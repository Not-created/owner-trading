# Owner Trading — Phase 1–10 Independent Audit

Audit base: `owner-trading-PHASE-1-10-COMPLETE-FINAL.zip`

## Executive result

The current ZIP is **not yet production-final**. The previously reported "228 bugs" cannot be independently verified from the available files because that external audit report was not included. A raw count of 228 may include duplicated sub-findings, warnings, and test gaps. This audit instead records concrete defects that are reproducible or directly verifiable from the source.

The official vendored Kotak Neo SDK was checked against the supplied official source archive: **47/47 checked SDK files match; 0 mismatches**. The project pins SDK 3.0.7. Kotak's official repository currently lists v3.0.7 as the latest release.

## P0/P1 — fix before LIVE deployment

### 1. Kotak Scrip Cache is incompatible with `ProtectHome=true`
- `vendor/kotakneoapi/.../scrip_cache.py` defaults to `Path.home() / ".kotak_neo" / "scrip_cache"`.
- broker systemd unit uses `ProtectHome=true`.
- deploy.sh does **not** set `NEO_SCRIP_CACHE_DIR`.
- Result: clean deployments can fail on scrip/search metadata operations unless an external systemd drop-in workaround is already installed.
- Fix: use `/var/lib/owner-trading/scrip_cache`, export `NEO_SCRIP_CACHE_DIR` in broker.env, create/chown it, and add a deployment write/read test.

### 2. deploy.sh mutates the live runtime before the new version is proven
`rsync --delete` writes directly into `/opt/owner-trading` while services can still be running.
- Fix: stage a release in a new directory, install/build/test there, then perform a short controlled stop/migrate/switch/start. Keep the previous release for rollback.

### 3. Database migrations run while old services can still be running
`deploy.sh` performs backup/migration before the systemd restart section.
- This permits old processes to use the DB while schema changes are being applied.
- Fix: migration must happen during the controlled cutover window after old services are stopped, with backup already completed.

### 4. No atomic rollback after a failed deployment
If code sync succeeds but dependency install/build/migration/service startup later fails, the source tree can be a mixed/new state.
- Fix: versioned release directories + `current` symlink/atomic switch or a transactional restore path.

### 5. Deployment can auto-connect to Kotak despite README/.env comments saying startup does not log in
`main.py` loads persisted credentials and `_auto_connect_on_startup()` calls `broker_client.connect()`.
`deploy.sh` restarts the broker service.
- If encrypted credentials already exist, a deployment restart can authenticate automatically.
- Fix: deployment must start the service in an explicit `NO_AUTO_CONNECT_ON_DEPLOY=1` state, or preserve an owner-controlled auto-connect flag and make deployment never initiate authentication.

### 6. LIVE EXIT orders can be blocked by entry risk limits
`order_service._check_risk_limits()` applies max quantity, daily order count, max order value, daily loss and max-open-position checks before it knows whether the order is an EXIT.
- A protective exit can therefore be blocked by a limit intended to stop new exposure.
- Fix: split entry-risk gates from exposure-reduction gates. EXIT must retain broker/session/reconciliation/idempotency/safety validation but bypass entry-only limits.

### 7. EXIT request can become permanently stuck after crash/rejection
`record_exit_request()` creates `REQUESTED`; `has_pending_exit()` treats REQUESTED as pending forever.
`exit_engine` then marks any returned order as `SUBMITTED`, even if the order result is REJECTED/BLOCKED.
- Crash after recording the exit but before broker submission can leave a permanent REQUESTED exit.
- Rejected exit can be recorded as SUBMITTED.
- Fix: durable exit state machine: REQUESTED -> SUBMITTING -> SUBMITTED/UNKNOWN/REJECTED/CANCELLED/PARTIALLY_FILLED/COMPLETE, with startup recovery for REQUESTED/SUBMITTING and bounded retry rules.

### 8. Market BUY with MKT order is incorrectly blocked when instrument token is supplied
`broker_client.place_order()` tries `margin_required` using `req.price`/`trigger_price`. For MKT, both are normally absent, so it raises `LIVE BUY margin cannot be verified without a reference price.`
- Fix: obtain a fresh LTP from the local feed/cache and use that as the reference price for margin estimation, with strict freshness checks.

### 9. Manual LIVE order can omit instrument token and bypass broker margin check
The UI allows instrument token to be omitted. The broker margin check is conditional on `instrument_token`.
- Fix: require authoritative `exchange_segment + instrument_token + trading_symbol` for LIVE orders and verify the token/symbol pair against the synced scrip master.

### 10. Quantity validation silently truncates fractional values
`int(1.5)` becomes `1` in `order_service._validate()` and strategy sizing.
- Fix: require a true positive integer before conversion; reject `1.5`, `NaN`, infinity, booleans, etc.

### 11. Numeric validation accepts NaN/Infinity in several paths
`float('nan')` and `float('inf')` pass simple `< 0` checks.
- Fix: require `math.isfinite()` for all user strategy/order/risk numeric inputs.

### 12. Candle engine only receives throttled ticks from WebSocket manager
`websocket_manager._on_market_message()` returns before calling `candle_engine.on_tick()` when the 1-second persistence throttle has not elapsed.
- Therefore candle OHLC can miss valid intrasecond highs/lows.
- Fix: feed every valid market tick to the candle engine; throttle only DB market-tick persistence.

### 13. Candle timestamps use server arrival time, not Kotak feed time
SFeed messages contain `last_trade_time`/`last_update_time`, but `_on_market_message()` calls `candle_engine.on_tick()` without a timestamp.
- Network delay near a candle boundary can place a tick in the wrong candle.
- Fix: convert the SFeed event timestamp to timezone-aware datetime and pass it to candle engine.

### 14. Candle bucket alignment is midnight-based for all intraday timeframes
`CandleEngine._bucket()` buckets 30m/1h from midnight. NSE cash continuous session starts at 09:15, so 30m/1h bars can be session-misaligned.
- Fix: use exchange/session-aware anchors (09:15 for NSE cash intraday bars) and keep daily bars separate.

### 15. Exit engine performs work for every market tick across all open positions
Every tick creates an exit task, and `evaluate_position()` calls `db.list_algo_positions()` rather than selecting only positions for that token.
- At large subscriptions this scales poorly.
- Fix: index open positions by `(exchange_segment, instrument_token)` and dispatch protective-exit checks only for matching positions.

### 16. Strategy exit evaluation is repeated on ticks even when the completed candle has not changed
The protective tick path can repeatedly run candle-history queries for the same position/candle.
- Fix: evaluate candle-based strategy exits only once per completed candle; keep stop/target/trailing tick checks on every tick.

### 17. Candle runtime-state persistence is too write-heavy at scale
Runtime state is persisted approximately every 5 seconds for every required timeframe/instrument. With thousands of subscriptions this can become hundreds/thousands of SQLite writes per second.
- Fix: batch runtime-state writes and/or persist only active strategy instruments, with a bounded flush queue.

### 18. Market tick persistence is still one SQLite write per instrument per second
At 3000 subscriptions this can approach 3000 writes/sec.
- Fix: maintain in-memory latest-tick state and batch flush to SQLite, while keeping the in-memory path authoritative for protective exits and fresh-LTP checks.

## P1 — strategy/backtest correctness

### 19. RSI is not standard Wilder RSI and returns 100 on flat data
The implementation uses simple average gains/losses and returns 100 when average loss is zero, including the flat-market case.
- Fix: implement standard Wilder RSI; flat/no-change should not be treated as overbought.

### 20. ATR is simple-average TR, not standard Wilder ATR
This can differ materially from common TradingView-style ATR values.
- Fix: Wilder smoothing or explicitly label the indicator as a custom ATR.

### 21. ADX implementation is simplified and not standard Wilder ADX
- Fix: use standard Wilder DM/TR smoothing and ADX smoothing, and add reference-vector tests.

### 22. VWAP is cumulative over the supplied candle window, not session-reset VWAP
A strategy can therefore compare against multi-day VWAP instead of the current trading-session VWAP.
- Fix: reset VWAP at each exchange session boundary.

### 23. Backtest equity curve is wrong for partial exits
When a trade is partially exited, the trade list splits the position into multiple exit trades. The equity reconstruction marks only the first open trade quantity before the exit, not the remaining quantity.
- This can understate equity and distort drawdown/Sharpe/Sortino during partial-exit periods.
- Fix: reconstruct portfolio state from position quantity, not from the first trade record only.

### 24. CAGR uses first/last trade times instead of the requested backtest period
A strategy with no trades during the first/last portion of the requested window can receive an overstated CAGR period.
- Fix: CAGR should use requested start/end dates (or explicitly document a trade-active-period CAGR as a separate metric).

### 25. Strategy sizing accepts non-integer fixed quantities
`position_sizing.quantity` accepts numeric values such as 1.5 and later truncates.
- Fix: fixed quantity must be an integer and preferably aligned to the instrument lot size.

### 26. `max_positions` and `time_exit_bars` also use integer coercion without strict integer validation
- Fix: strict integer schema validation.

### 27. Unknown/malformed candle timezone can fall back to allowing a session trade
`_bar_in_cash_session()` returns `True` on parse errors.
- Fix: malformed timestamps should be rejected from strategy execution/backtest rather than treated as tradable.

### 28. Active scanner globally gates every armed strategy
`algo_engine` checks all active scanners and requires a match whenever any active scanner exists, even if a strategy has no explicit scanner binding.
- Fix: scanner binding must be explicit per strategy, or scanners must remain informational only.

## P1/P2 — authentication / persistence / recovery

### 29. Website login does not regenerate the Express session ID after authentication
`req.session.authenticated=true` is set directly.
- Fix: regenerate the session ID on successful login, then set authenticated state and save.

### 30. Broker session TTL is an undocumented 8-hour assumption
`session.py` uses `ASSUMED_SESSION_TTL_SECONDS = 8h`, while its own comment states Kotak does not publish a fixed TTL.
- This can cause unnecessary reconnects or false expiry.
- Fix: treat TTL as advisory only; broker-reported session/auth errors should be authoritative. If an observed TTL is used, make it configurable and non-destructive.

### 31. Explicit owner Disconnect is not persisted as an auto-connect preference
A normal service restart always attempts startup auto-connect when credentials exist.
- Fix: persist `auto_connect_enabled` and respect an explicit owner Disconnect across restarts unless the owner enables recovery.

## P2 — deployment/reproducibility/packaging

### 32. No package-lock files are shipped
The deployment falls back to `npm install`, so transitive versions can drift between deployments.
- Fix: generate and commit `backend/package-lock.json` and `frontend/package-lock.json`, then deploy with `npm ci` only.

### 33. Python runtime dependencies are not fully locked
The official SDK is vendored, but its transitive dependencies and `cryptography` remain ranged.
- Fix: ship a tested constraints/lock file or a controlled dependency snapshot without changing the official SDK source.

### 34. Deployment backup is DB-only
A DB backup alone is not a complete disaster-recovery bundle because encrypted Kotak credentials, encryption key, password hash, and environment configuration are outside the DB.
- Fix: create a secure root-only backup bundle of persistent application state/config, encrypted at rest, with a documented restore procedure. Never put credentials into the source ZIP.

### 35. Final ZIP contains generated `__pycache__` and `.pytest_cache` artifacts
- Fix: clean generated caches before packaging and add them to ignore/exclusion rules.

### 36. Deployment health check does not verify the actual Kotak scrip-cache write path
- Fix: after systemd start, execute a service-user cache write/read/delete probe using the configured `NEO_SCRIP_CACHE_DIR`.

### 37. First-time non-interactive deployment can block on the password prompt
`deploy.sh` expects interactive `read` input for the initial 8-character password.
- Fix: support an explicit secure non-interactive password input mechanism, while keeping interactive mode as default.

## Existing items verified as NOT the problem

- Dark/Light theme files were not changed by the Phase 1–10 delta from the supplied v3 base.
- Vendored official Kotak SDK: 47/47 files matched the supplied official archive; no vendor mismatch.
- Python compilation: PASS.
- Shell syntax checks: PASS.
- Backend JS syntax checks: PASS.
- Existing Python test suite: PASS in the audit environment.
- Historical timestamp parser now accepts the previously failing `+0530` / ISO variants.
- Historical chunking limits are bounded according to the project's documented Kotak interval limits.

## Recommended fix order

1. Deployment/cache + release staging/rollback.
2. Exit safety/state-machine recovery.
3. Market tick/candle timestamp + every-tick candle feed + SQLite batching.
4. LIVE order token/margin/strict numeric validation.
5. Strategy indicator correctness + scanner binding.
6. Backtest partial-exit equity/CAGR fixes.
7. Session regeneration + broker session/restart policy.
8. Lock dependencies and clean packaging.
9. Add regression tests for every finding.
10. Only then run a fresh VPS dry-run; do not connect to Kotak or send a LIVE order during deployment.
