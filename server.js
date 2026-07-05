require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 5002;

// ---------------------------------------------------------------------------
// Session (temporary, in-memory — fine for testing, swap for a store + DB later)
// ---------------------------------------------------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // set true when served over HTTPS in production
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

// ---------------------------------------------------------------------------
// OAuth2 client
// ---------------------------------------------------------------------------
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Scopes: basic profile/login + Google Business Profile management.
// Add more Business Profile-related scopes here if you need them later, e.g.:
//   'https://www.googleapis.com/auth/business.manage' covers most Business Profile APIs
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/business.manage',
];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Simple landing page with a "Sign in with Google" link, just for manual testing
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.send(`
      <h2>Signed in as ${req.session.user.email}</h2>
      <p>Auth successful. You can now call Business Profile APIs using the stored tokens.</p>
      <a href="/auth/logout">Logout</a>
    `);
  }
  res.send(`<a href="/auth/google">Sign in with Google</a>`);
});

// Step 1: redirect user to Google's consent screen
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // needed to get a refresh_token
    prompt: 'consent', // forces refresh_token on every login while testing
    scope: SCOPES,
  });
  res.redirect(url);
});

// Step 2: Google redirects back here with a ?code=...
app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ status: 'error', message: `Google returned an error: ${error}` });
  }

  if (!code) {
    return res.status(400).json({ status: 'error', message: 'Missing authorization code' });
  }

  try {
    // Exchange the authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify the ID token and pull basic profile info
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // Store in session for this test (swap for DB persistence later)
    req.session.user = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
    req.session.tokens = tokens; // { access_token, refresh_token, expiry_date, ... }

    return res.status(200).json({
      status: 'success',
      message: 'Auth successful',
      user: req.session.user,
    });
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    return res.status(401).json({
      status: 'error',
      message: 'Auth failed',
      details: err.message,
    });
  }
});

// Quick check route to confirm session + call a Business Profile API
// (Account Management API: lists the Business Profile accounts the user can access)
app.get('/api/business/accounts', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }

  oauth2Client.setCredentials(req.session.tokens);

  try {
    // Business Profile Account Management API — not in the default googleapis
    // discovery bundle, so we call it via a plain authenticated request.
    const response = await oauth2Client.request({
      url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    });
    res.status(200).json({ status: 'success', data: response.data });
  } catch (err) {
    console.error('Business API error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch business accounts', details: err.message });
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
