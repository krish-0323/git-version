# Google Sign-In + Business Profile API (Auth Test)

Minimal Node.js/Express backend that:
1. Signs users in with Google (OAuth2 + OpenID Connect)
2. Requests Google Business Profile API access (`business.manage` scope) in the same consent flow
3. Returns `{ status: "success" }` or `{ status: "error" }` — no database, tokens are only kept in-memory session for now

## 1. Google Cloud Console setup

1. Go to https://console.cloud.google.com/ and create (or select) a project.
2. **Enable APIs**: APIs & Services → Library → enable:
   - "My Business Account Management API" (and other Business Profile APIs you plan to use, e.g. My Business Business Information API)
3. **Configure OAuth consent screen**: APIs & Services → OAuth consent screen.
   - User type: External (unless you're on Workspace and want Internal)
   - Add scope `https://www.googleapis.com/auth/business.manage`
   - Add your own Google account as a test user (required while app is in "Testing" status)
   - Note: Business Profile API access typically requires your account/business to actually have a Business Profile, and in production Google may require verification for this scope.
4. **Create credentials**: APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.
   - Authorized redirect URI: `http://localhost:5000/auth/google/callback`
   - Copy the generated Client ID and Client Secret.

## 2. Project setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your Client ID, Client Secret, and a random session secret.

## 3. Run it

```bash
npm start
# or, for auto-reload during development:
npm run dev
```

Visit `http://localhost:5000` → click "Sign in with Google" → approve consent → you'll get redirected to the callback route, which responds with JSON:

```json
{
  "status": "success",
  "message": "Auth successful",
  "user": { "googleId": "...", "email": "...", "name": "...", "picture": "..." }
}
```

If something goes wrong (bad code, denied consent, invalid token), you'll get:

```json
{ "status": "error", "message": "Auth failed", "details": "..." }
```

## 4. Routes

| Route | Purpose |
|---|---|
| `GET /` | Simple test page with sign-in link |
| `GET /auth/google` | Redirects to Google's consent screen |
| `GET /auth/google/callback` | Exchanges code for tokens, verifies identity, returns success/error JSON |
| `GET /api/business/accounts` | Example authenticated call to the Business Profile Account Management API |
| `GET /auth/logout` | Clears session |

## 5. Next steps (when you're ready)

- Swap `express-session`'s in-memory store for a persistent one (e.g. `connect-pg-simple` with your NeonDB) so sessions survive server restarts.
- Persist `access_token` / `refresh_token` per user in your database instead of session memory, and add refresh-token logic for long-lived Business Profile API access.
- Add CSRF protection (`state` parameter) to the OAuth flow before going to production.
