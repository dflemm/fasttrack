# Setup checklist

Everything here is something only you can do: create an account, generate a key, or paste a value.
Work top to bottom. Each step says where the value goes.

There are three places values go:

- **Server settings**: environment variables on your host. The full list with comments is in `server/.env.example`.
- **Game page settings**: three lines near the top of the script in `preview/template.html`
  (`SERVER_URL`, `GOOGLE_CLIENT_ID`, `APPLE_SERVICE_ID`). After changing them run `node preview/build.mjs`.
- **App settings**: `app/capacitor.config.json`.

## 1. Put the server online

1. Pick a host that runs Node 22 (or a Docker container), supports WebSockets, gives you HTTPS, and offers a
   **persistent disk**. Render, Fly.io and Railway are examples.
2. Deploy this repository. With Docker, use `server/Dockerfile`. Without Docker: run `npm install` in `server/`,
   then `npm start`.
3. Attach a persistent disk and point `DB_FILE` at it (for example `/data/fasttrack.db`). Without this,
   accounts are lost on every redeploy.
4. Server settings to enter:
   - `SESSION_SECRET`: 40 or more random characters. Keep it private.
   - `ALLOWED_ORIGINS`: your web address plus `capacitor://localhost,https://localhost` for the phone apps.
5. Open `https://YOUR-SERVER/health`. You should see `{"ok":true,...}`.
6. Game page settings: set `SERVER_URL` to `https://YOUR-SERVER`, rebuild, and upload `index.html` to GitHub.

The home screen now shows Quick match, My games, and Account and friends. Rooms no longer depend on
browser-to-browser connections.

**Scaling.** One server instance holds live games in memory and accounts in one database file, which is
enough for several thousand people playing at once. Past that you move the database to Postgres
(only `server/db.mjs` changes) and run several instances. Take backups of the database file from day one.

## 2. Email sign-in

1. Sign up with an email sending service and verify the address or domain you will send from.
2. Server settings: `SMTP_URL` and `MAIL_FROM`.

Until this is set, codes are only printed in the server log, so nobody can sign in by email.

## 3. Sign in with Apple (you already have the developer account)

In the Apple Developer site, under Certificates, Identifiers & Profiles:

1. **App ID**: create one with your bundle ID (for example `com.yourname.fasttrack`). Turn on
   **Sign in with Apple** and **Push Notifications**.
2. **Services ID** (for the web version and Android): create one (for example `com.yourname.fasttrack.web`),
   enable Sign in with Apple on it, and add your web address as a domain and return URL.
3. **Key**: create one with **Sign in with Apple** and **Apple Push Notifications service** enabled.
   Download the `.p8` file (you can only download it once) and note the **Key ID**. Your **Team ID** is on
   the Membership page.
4. Server settings:
   - `APPLE_CLIENT_IDS`: bundle ID and Services ID, comma separated
   - `APPLE_TEAM_ID`, `APPLE_KEY_ID`
   - `APPLE_PRIVATE_KEY`: the contents of the `.p8` file on one line, with `\n` where the line breaks were
   - `APPLE_BUNDLE_ID`: the bundle ID (used for notifications)
5. Game page settings: `APPLE_SERVICE_ID` = the Services ID.
6. App settings: `appId` in `app/capacitor.config.json` = the bundle ID.

## 4. Google sign-in

1. Create a Google Cloud project and set up the OAuth consent screen.
2. Create three OAuth client IDs: **Web application** (add your web address as an authorized origin),
   **iOS** (your bundle ID), and **Android** (package name plus the SHA-1 of your signing key).
3. Server settings: `GOOGLE_CLIENT_IDS` = all three, comma separated.
4. Game page settings: `GOOGLE_CLIENT_ID` = the **Web application** one.
5. iOS needs the reversed iOS client ID added as a URL scheme in Xcode; the social login plugin's guide
   shows where.

## 5. Android notifications

1. Create a Firebase project and add an Android app with your package name.
2. Download `google-services.json` and put it in `app/android/app/` (after step 6 creates that folder).
3. In Firebase project settings, Service accounts, generate a new private key.
4. Server settings: `FCM_SERVICE_ACCOUNT` = that JSON file's contents on one line.

## 6. Build the phone apps

You need a Mac with Xcode for iOS, and Android Studio for Android.

```
node preview/build.mjs       # in the repository root, after the game page settings are filled in
cd app
npm install
npx cap add ios
npx cap add android
npm run ios                  # opens Xcode
npm run android              # opens Android Studio
```

The app icon and launch screen artwork (the board seen from above) are in `app/assets/`. Capacitor's assets
tool turns them into every size both stores need: in `app/`, run `npx @capacitor/assets generate` after adding
the platforms. If its options have changed, check that tool's README.

In Xcode: choose your team, then add the **Sign in with Apple** and **Push Notifications** capabilities.
Run on your phone, then Archive and upload to TestFlight.

In Android Studio: build a signed app bundle and upload it to a closed testing track in Play Console.

## 7. Store listings

- Create the Google Play developer account. A new personal account must run a closed test with
  12 testers for 14 days before it can publish.
- Both stores need a privacy policy at a public address. `legal/privacy-policy-template.md` is a starting
  draft; have a lawyer review it, especially if children may play.
- Google also needs a web page where someone can ask for account deletion. `legal/delete-account.html` is
  ready to host; put your contact email in it.
- Fill in the data-collection forms: the game collects a display name and, for signed-in players, an email
  address or an Apple/Google account identifier, plus a notification token.
- Clear the name "Fast Track" with a trademark search or attorney before submitting.
- Screenshots, icon, description and age rating.

## What has and has not been tested

Tested here with real browsers against a local server: guest accounts, email sign-in (in test mode, where
the code is shown instead of emailed), rooms, invites by code, rejoining, quick match, friends, My games,
at-your-own-pace rooms, and account deletion.

Written but not testable without your accounts: Google and Apple sign-in, sending real email,
notifications on iOS and Android, and the iOS and Android builds themselves. Expect some fixing when you
first run these with real keys.
