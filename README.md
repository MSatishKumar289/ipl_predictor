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

## Structure

- `src/app`: Expo Router screens
- `src/lib`: Firebase, auth, matches, and prediction data access
- `src/providers`: shared app providers
- `scripts/import-ipl-schedule-2026.js`: imports schedule data into Firestore
