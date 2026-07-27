# Test Credentials

Single-user platform. Only the owner can sign in — there is **no public registration**.

## Owner (Super Admin)
- **Username**: `NS4039`
- **Password**: `40394039`
- **Email**: `ns4039@platform.local`
- **Role**: `super_admin`

Log in with username `NS4039` **or** email `ns4039@platform.local`.

## Auth Endpoints
- POST /api/auth/login  {login, password, remember_device}
- POST /api/auth/logout
- POST /api/auth/logout-all
- GET  /api/auth/me
- POST /api/auth/refresh
- POST /api/auth/change-password
- GET  /api/auth/sessions
- DELETE /api/auth/sessions/{id}
- GET  /api/auth/login-history

## Session model
- Access token TTL: 15 min (httpOnly, secure, samesite=none)
- Refresh token TTL: 7 days (30 days if remember_device=true)
- Brute-force lockout: 5 failed attempts / 15 min window
