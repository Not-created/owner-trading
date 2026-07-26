# Enterprise AI Trading Platform — PRD

## Vision
Long-term, production-grade single-operator AI trading terminal. Modular, plugin-based,
zero-trust, no placeholder code, upgradeable across many years without rewrites.

## Personas
- **Platform Owner (NS4039)**: sole operator. Super admin. Manages AI providers, broker plugins,
  security posture, audit stream, and personal profile.

## Core requirements (static)
- Clean architecture, SOLID, module pattern, dependency injection, event-driven.
- Universal Broker Engine as a plugin system (Alpaca plugin registered; others via BrokerPluginBase).
- Universal AI Core (OpenAI + Claude + Gemini pluggable, replaceable, failover).
- Universal Market Data (Yahoo Finance provider live, plugin-style).
- Plugin/Module registry, Settings engine, Event bus, Service layer.
- Auth: single-user JWT, sessions, brute-force lockout, encrypted secrets, security headers,
  optional TOTP 2FA with trusted-device bypass and backup codes.
- Roles: super_admin / admin / developer / user with declarative permission matrix.
- Structured, searchable audit logs in MongoDB.
- **AI Developer inside Owner Control** — read-only project inspector + AI-assisted planner.
  Every destructive action gated by an Approval record; nothing runs automatically.

## Implementation status (2026-02)
### Backend
- `core/` — config, database, logging_service, security (Fernet + bcrypt),
  events, permissions, error handling.
- `modules/auth/` — login, refresh, sessions, brute-force protection, change-password,
  login-history, **TOTP 2FA + trusted devices**.
- `modules/users/`, `modules/roles/`.
- `modules/ai_core/` — abstract `AIProviderBase`, registry, OpenAI/Claude/Gemini, chat,
  health check, usage tracking, failover; **prompt presets** (seeded starters).
- `modules/broker_core/` — abstract `BrokerPluginBase`, registry, encrypted accounts,
  connect/disconnect/health, primary selection.
- `modules/broker_plugins/alpaca.py` — **first real broker plugin** (paper + live).
- `modules/market_data/` — abstract MarketDataProvider + Yahoo Finance (yfinance).
- `modules/plugins/`, `modules/settings/`, `modules/logs/`.
- `modules/ai_developer/` — read-only project inspector (`project-map`, `modules`,
  `dependencies`, `db-schema`, `file`, `search`, `snapshot`, `health`), AI-assisted `ask`,
  and approval workflow (`approvals`, `approvals/{id}/decide`).

### Frontend
- Dark Bloomberg terminal aesthetic. IBM Plex Sans + JetBrains Mono + Space Grotesk.
- **Top-bar live ticker** (Yahoo quotes; auto-refresh 20s) across all authed pages.
- Pages: Login, Command Center, **Owner Control (Overview, Modules, DB Schema, AI Developer,
  Approvals)**, AI Core (providers + presets + live chat), Brokers (plugins list, add-account
  modal, connect/disconnect/primary), Plugins, Settings, Profile (identity, password, **2FA**,
  trusted devices, sessions, history), Roles matrix, Audit Logs.
- ProtectedRoute, sonner toasts, complete data-testid coverage.

## Prioritized backlog
- **P0**: Approval execution engine (write_file, git_commit, deploy) with sandbox + rollback.
- **P1**: Alpaca positions/orders read + basic order placement UI.
- **P1**: Trading module (positions, P&L, order routing) — depends on broker plugin.
- **P2**: Additional broker plugins (IBKR, Zerodha), market-data providers with fallback.
- **P2**: WebSocket streaming for ticker + AI Developer live diff review.

## Endpoints inventory
Auth (incl. 2FA) · Users · Roles · AI Core · AI Presets · AI Developer · Brokers · Market ·
Plugins · Settings · Logs · Health.
Credentials at `/app/memory/test_credentials.md`.
