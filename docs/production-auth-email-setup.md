# Production authentication and email setup

## Google sign-in

1. In Google Cloud Console, create an OAuth client ID for a **Web application** and configure the OAuth consent screen.
2. Add these authorized JavaScript origins:
   - `https://urqrprint.shop`
   - `https://www.urqrprint.shop`
   - `http://localhost:5173` (local development only)
3. Add the same client ID to the Vercel project as `VITE_GOOGLE_CLIENT_ID` and to the Render API as `GOOGLE_CLIENT_ID`.
4. Redeploy both projects. The API verifies the signed ID token, issuer, audience, expiry, verified email, and one-time nonce. Google sign-up requires the shop details and Terms/Privacy consent; returning Google sign-in requires an existing account with that email.

The Google client ID is public by design. Never put a Google OAuth client secret in the browser or Vercel client environment.

## Account email delivery

The API can send account OTP and password-reset emails through Gmail API OAuth or SMTP. For the Gmail API path, configure these Render variables:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `EMAIL_FROM`

The Gmail OAuth grant should use only `https://www.googleapis.com/auth/gmail.send`. `EMAIL_FROM` must match the authorized Gmail sender. SMTP can be used instead with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`.

After configuring the values, redeploy the API and check `https://printly-api.onrender.com/api/health`. It reports only whether Google sign-in and mail variables are configured; it does not expose credentials or prove that a message was delivered. Complete the verification below using an inbox you control.

## Verification checklist

1. Register using an inbox you control and confirm the six-digit OTP arrives and expires as expected.
2. Sign in with the verified email and password, then use **Forgot your password** and confirm the reset message arrives.
3. Sign out, use Google sign-up with a new test email and complete shop details and Terms/Privacy consent.
4. Sign out and use Google sign-in for that account; confirm it opens the correct shop dashboard.
5. Try a wrong, expired, or replayed Google credential and confirm the API rejects it.
6. Check Render logs for provider errors, and make sure no OTP, reset token, OAuth token, or password is logged.

For a custom-domain sender, also configure the sender provider's SPF and DKIM records and verify DMARC reporting before relying on email delivery at scale.
