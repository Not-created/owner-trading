# Enterprise AI Trading Platform — PRD

## Vision
Long-term, production-grade single-operator AI trading terminal. Modular, plugin-based,
zero-trust, no placeholder code, upgradeable across many years without rewrites.

## Personas
- **Platform Owner (NS4039)**: sole operator. Super admin. Manages AI providers, broker plugins,
  security posture, audit stream, and personal profile.

## Core requirements (static)
- Clean architecture, SOLID, repository/module pattern, dependency injection, event-driven.
- Universal Broker Engine as a plugin system (no hardcoded broker).
- Universal AI Core (OpenAI + Claude + Gemini pluggable, replaceable, with failover).
- Plugin/Module registry, Settings engine, Internal API framework, Event bus, Service layer.
- Auth: single-user JWT, sessions, brute-force lockout, encrypted secrets, security headers.
- Roles: super_admin / admin / developer / user with a declarative permission matrix.
- Structured, searchable audit logs in MongoDB.

## Implementation (2026-02, milestones 1A+1B+1C complete)
### Backend (`/app/backend`)
- `core/` — config engine, database, logging_service (Mongo audit store), security (Fernet + bcrypt),
  events bus, permissions matrix, error handling with typed codes.
- `modules/auth/` — login, logout, /me, refresh, change-password, sessions, login-history,
  brute-force protection, JWT (access 15m + refresh 7d), httpOnly cookies.
- `modules/users/` — profile management.
- `modules/roles/` — RBAC matrix endpoint.
- `modules/ai_core/` — abstract `AIProviderBase`, registry, OpenAI/Claude/Gemini providers via
  `emergentintegrations`, chat, health-check, usage tracking, failover.
- `modules/broker_core/` — abstract `BrokerPluginBase`, registry, account lifecycle with
  Fernet-encrypted credentials, primary broker selection, connect/disconnect/health.
- `modules/plugins/` — generic plugin registry (install/enable/disable/uninstall).
- `modules/settings/` — persisted key/value store with per-key upsert endpoints.
- `modules/logs/` — searchable audit log endpoints with level/category filters.
- Security headers middleware, explicit CORS from `FRONTEND_URL`.

### Frontend (`/app/frontend`)
- Dark Bloomberg/terminal aesthetic (`#0A0A0C` base, `#007AFF` accent, JetBrains Mono for data).
- Login page (single-user, no sign-up), Command Center, AI Providers, Brokers, Plugins,
  Settings (4 tabs), Profile (identity/password/sessions/history), Roles matrix, Audit Logs.
- AuthContext with httpOnly cookies, `withCredentials: true` throughout.
- Sonner toast, Lucide icons, dark shadcn theme, custom scrollbars, terminal cursor.

## Prioritized backlog (P0/P1/P2)
- **P0 (Part 2)**: real broker plugins (Zerodha, IBKR, Alpaca…), order routing, positions,
  P&L, market data feed, strategy runner.
- **P1**: 2FA (TOTP) enablement UI, password reset via email, per-role custom permission edits,
  encrypted API-key vault UI for AI providers.
- **P2**: theme editor with live preview, log retention policy, remote-config sync,
  export/download logs, in-app AI Developer console.

## Endpoints inventory
Auth · Users · Roles · AI · Brokers · Plugins · Settings · Logs · Health.
See `/app/memory/test_credentials.md` for full auth list.
