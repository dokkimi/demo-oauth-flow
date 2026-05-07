# OAuth Demo — Dokkimi

A NestJS API with a standard OAuth authorization code flow, demonstrating how [Dokkimi](https://dokkimi.com) mocks external auth providers for integration testing. **There is no frontend app** — Dokkimi tests play the role of the client.

## Quick Start

```bash
# Install dependencies
yarn install

# Build the Docker image (used by Dokkimi tests)
docker build -t demo-oauth-flow:latest .

# Run all Dokkimi tests
dokkimi run .dokkimi --ci

# Run a single test definition
dokkimi run .dokkimi/definitions/oauth-redirect-flow.json
```

## How OAuth Works (and What We Test)

In a real app, a frontend handles the browser redirect dance with the OAuth provider. Our API never sees any of that. It handles two things:

1. **Build the redirect URL** — tell the frontend where to send the user
2. **Handle the callback** — exchange the authorization code for a token, fetch user info, create the user

```
┌──────────┐         ┌──────────┐         ┌─────────────┐         ┌──────────┐
│  Browser  │         │ Frontend │         │   OAuth     │         │ Our API  │
│ (Client)  │         │   App    │         │  Provider   │         │ (NestJS) │
└─────┬─────┘         └─────┬────┘         └──────┬──────┘         └─────┬────┘
      │                     │                     │                      │
      │  1. Click "Sign In" │                     │                      │
      │────────────────────>│                     │                      │
      │                     │  2. GET /auth/login  │                      │
      │                     │─────────────────────────────────────────-->│
      │                     │  302 → provider.com/authorize?client_id=… │
      │                     │<──────────────────────────────────────────│
      │                     │                     │                      │
      │  3. Redirect to provider                  │                      │
      │──────────────────────────────────────────>│                      │
      │  4. User logs in                          │                      │
      │<──────────────────────────────────────────│                      │
      │     302 → /auth/callback?code=abc         │                      │
      │                     │                     │                      │
      ╔═════════════════════╪═════════════════════╪══════════════════════╗
      ║  SERVER-SIDE (what our API handles)       │                      ║
      ║                     │                     │                      ║
      ║  5. GET /auth/callback?code=abc           │                      ║
      ║  ──────────────────────────────────────────────────────────────>║
      ║                     │                     │                      ║
      ║                     │                     │  6. POST /oauth/token║
      ║                     │                     │  { code, secret }    ║
      ║                     │                     │<─────────────────────║
      ║                     │                     │  { access_token }    ║
      ║                     │                     │─────────────────────>║
      ║                     │                     │                      ║
      ║                     │                     │  7. GET /userinfo    ║
      ║                     │                     │  Bearer access_token ║
      ║                     │                     │<─────────────────────║
      ║                     │                     │  { sub, email, name }║
      ║                     │                     │─────────────────────>║
      ║                     │                     │                      ║
      ║  8. { token, user }                       │                      ║
      ║  <─────────────────────────────────────────────────────────────║
      ╚═════════════════════╪═════════════════════╪══════════════════════╝

```

Steps 1–4 are the browser/frontend dance — we don't have a frontend, so our tests skip these.

Steps 5–8 are what our API does. Dokkimi mocks **steps 6 and 7** (the token exchange and userinfo fetch) so we can test the entire server-side flow without a real OAuth provider.

```
┌─────────────────────────────────────────────┐
│          WHAT DOKKIMI MOCKS                 │
│                                             │
│  POST auth.provider.com/oauth/token         │
│    → returns { access_token: "mock_..." }   │
│                                             │
│  GET  auth.provider.com/userinfo            │
│    → returns { sub, email, name }           │
│                                             │
│  No OAuth provider account needed.          │
│  No network dependency.                     │
│  Zero code changes in the service.          │
└─────────────────────────────────────────────┘
```

## The App

| Endpoint                      | Auth | Description                                                               |
| ----------------------------- | ---- | ------------------------------------------------------------------------- |
| `GET /health`                 | No   | Health check                                                              |
| `GET /api/posts`              | No   | List published posts (public feed)                                        |
| `GET /api/posts/:id`          | No   | Get a single post                                                         |
| `GET /auth/login`             | No   | Builds OAuth authorize URL and returns 302 redirect                       |
| `GET /auth/callback?code=...` | No   | Exchanges code for token, fetches userinfo, creates user, returns session |
| `GET /api/profile`            | Yes  | Get your profile (requires session token from callback)                   |
| `POST /api/profile/posts`     | Yes  | Create a new post                                                         |

## What the Dokkimi Tests Demonstrate

### 1. `public-endpoints.json` — No mocking needed

- Health check
- Public feed returns only published posts (drafts excluded)
- DB query to verify total post count independently of the API
- Console log assertions

### 2. `single-post-endpoints.json` — Individual post access

- Fetch a published post by ID — verifies title, author, published flag
- Fetch a draft post by ID — drafts are accessible by direct ID (the public feed is what hides them)
- Non-existent post returns 404

### 3. `oauth-redirect-flow.json` — Testing each OAuth endpoint

- **`GET /auth/login`** — verifies the 302 redirect URL contains the correct `client_id`, `redirect_uri`, `response_type=code`, and `scope`
- **`GET /auth/callback?code=...`** — the mocking showcase:
  - Mocks the **token exchange** (`POST /oauth/token`) and asserts the service sent the correct `grant_type`, `code`, `client_id`, and `client_secret`
  - Mocks the **userinfo fetch** (`GET /userinfo`) and asserts the service passed the correct `Bearer` token
  - Verifies the user was created in the **database**
  - Asserts on **console logs** through the entire flow (code exchange, token success, userinfo fetch, user creation)
- **`GET /auth/callback` with no code** — verifies 401 rejection
- **Idempotent login** — two logins with different authorization codes create only one user

### 4. `oauth-failure-cases.json` — When the provider says no

- Uses a **different mock configuration** — the token endpoint returns a 400 `invalid_grant` instead of a 200
- Verifies the service returns 500 gracefully
- Asserts the **userinfo endpoint was never called** (token exchange failed first, so the flow short-circuited)
- DB assertion confirms **no user was created** despite the callback being hit
- Console log assertions verify error logging

This is the key insight: you test failure scenarios by swapping in different mocks in a separate definition file. Each definition gets its own environment with its own mock configuration.

### 5. `oauth-userinfo-failure.json` — Token succeeds, userinfo fails

- Token exchange returns 200, but userinfo returns 401
- Verifies the service still returns 500 gracefully
- Asserts both outbound calls happened (token succeeded, userinfo was attempted)
- DB assertion confirms no user was created despite the token exchange succeeding
- Console log assertions verify the token success and userinfo failure are both logged

### 6. `authenticated-flow.json` — End-to-end with session tokens

- Calls the OAuth callback (with mocks) to get a session token
- Uses that token to access protected endpoints
- Creates a post, verifies it in the **DB** and **public feed** in parallel
- Tests rejection for missing token, invalid token
- DB assertions confirm no data written by rejected requests

### 7. `profile-posts-visibility.json` — Profile accumulates posts

- New user starts with zero posts in their profile
- Creates two posts, verifies the profile shows exactly 2
- Public feed shows all 4 published posts (2 seed + 2 new) in parallel
- DB query confirms ownership — Bob owns exactly 2 posts

## Key Dokkimi Features Used

| Feature                     | Where                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| **Mock external APIs**      | Token exchange + userinfo endpoints mocked                               |
| **Traffic interception**    | Assert the service sent correct credentials to the OAuth provider        |
| **DB seeding**              | `init-files/schema.sql` creates tables + seed data                       |
| **DB assertions**           | Verify users/posts written correctly, independent of API                 |
| **Console log assertions**  | Verify logging through the OAuth flow                                    |
| **Variable extraction**     | Extract session token from callback, use in later authenticated requests |
| **Shared fragments + $ref** | Service, DB, and both OAuth mocks shared across test files               |
| **Parallel steps**          | DB verification and public feed check run simultaneously                 |

## File Structure

```
.
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── prisma.service.ts
│   ├── health.controller.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts        # OAuth flow: token exchange, userinfo, session tokens
│   │   ├── auth.controller.ts     # /auth/login (redirect) + /auth/callback
│   │   └── auth.guard.ts          # Session token validation for protected routes
│   ├── posts/                     # Public endpoints (no auth)
│   │   ├── posts.module.ts
│   │   ├── posts.controller.ts
│   │   └── posts.service.ts
│   └── profile/                   # Authenticated endpoints
│       ├── profile.module.ts
│       ├── profile.controller.ts
│       └── profile.service.ts
├── prisma/
│   └── schema.prisma
├── .dokkimi/
│   ├── shared/
│   │   ├── api-service.json          # Service definition
│   │   ├── postgres-db.json          # Database definition
│   │   ├── mock-oauth-token.json     # POST /oauth/token mock
│   │   └── mock-oauth-userinfo.json  # GET /userinfo mock
│   ├── init-files/
│   │   └── schema.sql
│   └── definitions/
│       ├── public-endpoints.json         # Unauthenticated routes
│       ├── single-post-endpoints.json    # Individual post access by ID
│       ├── oauth-redirect-flow.json      # OAuth endpoint testing (the mocking showcase)
│       ├── oauth-failure-cases.json      # Provider rejects the code (different mock config)
│       ├── oauth-userinfo-failure.json   # Token succeeds, userinfo fails
│       ├── authenticated-flow.json       # Full flow with session tokens
│       └── profile-posts-visibility.json # Profile accumulates posts over time
├── .github/
│   └── workflows/
│       └── ci.yml              # Build → Dokkimi tests → publish Docker image
├── Dockerfile
├── package.json
└── yarn.lock
```
