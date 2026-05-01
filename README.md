# IPL Predictor

Expo + Firebase app for private IPL match predictions, admin match management, leaderboard tracking, and user betting history.

## Commands

```bash
npm install
npm run start
npm run web
npm run android
npm run ios
npm run import-ipl-schedule-2026
```

## Environment

Create a `.env` file with:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_APP_VERSION` (example: `1.0.0`)

## Release Checklist (Web Version Prompt)

Before every web release on Vercel:

1. Bump `EXPO_PUBLIC_APP_VERSION` in Vercel environment variables.
2. Update [`public/app-version.json`](public/app-version.json):
   - `latestVersion`: newest released version
   - `minRequiredVersion`: minimum version allowed without force refresh
   - `message`: optional prompt message
3. Commit and deploy.
4. Verify in browser:
   - Open `/app-version.json` and confirm new values are served.
   - Open app with an older build/session and check update modal behavior.

Rollout behavior:

- `current < minRequiredVersion` => **force refresh** popup.
- `current < latestVersion` => **soft update** popup (user can press Later).
- `current >= latestVersion` => no popup.

## Structure

- `src/app`: Expo Router screens
- `src/lib`: Firebase, auth, matches, and prediction data access
- `src/providers`: shared app providers
- `scripts/import-ipl-schedule-2026.js`: imports schedule data into Firestore
