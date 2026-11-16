# Fast Track (working title)

A card-and-peg race game for 2 to 6 players, playable in a browser against bots or with friends in a private room.

`index.html` is the whole game in one file. Open it in a browser, or host it on GitHub Pages (below).

## Put it on GitHub Pages so friends can play

1. Sign in at github.com and create a new **public** repository, for example `fasttrack`.
2. On the new repository's page choose **uploading an existing file**, drag in everything from this folder, and commit.
   Only `index.html` is needed for the game; the rest is source.
3. Go to **Settings > Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick branch `main` and folder `/ (root)`, and save.
4. After a minute or two the game is live at `https://YOUR-USERNAME.github.io/fasttrack/`.

## What's in the game

- Home screen with a self-playing board that cycles through the color themes.
- Play against bots, pass and play on one device, or invite friends to a private room.
- Individual play or teams (two against two, three teams of two, or two teams of three).
- House rules when you set up a game, and an optional turn timer for rooms.
- Hints, sound and vibration, symbols on pegs for color-blind players, eight themes plus your own colors.
- Win and bump totals kept on the device.

With a game server connected (see `SETUP.md`): accounts with guest, email, Apple and Google sign-in, friends and
invites, quick match with strangers, My games, play-at-your-own-pace rooms, turn notifications, and account deletion.
Without a server the page still works: rooms connect browser to browser and those extra buttons stay hidden.

## Playing with friends

1. Open the page, press **New game**, enter your name and choose **Invite friends to a private room**.
2. Press **Copy invite link** and send it (or read out the six-character code).
3. Friends open the link, enter a name and press **Join room**. They appear in your list.
4. Press **Start game** when everyone is in. Empty seats are played by bots. Nobody can join after you start.

How it works: the host's browser runs the game and guests connect directly to it (WebRTC, via the PeerJS library).
The free public PeerJS service is used only to introduce the browsers by room code. Things to know:

- The host must keep the page open. If the host leaves, the game ends.
- If a guest drops, a bot plays their seat; they can rejoin with the same link from the same browser.
- GitHub Pages needs nothing special: the page only has to be served over https, which Pages does.
- Some pairs of networks (mobile data, office or school Wi-Fi, VPNs, iCloud Private Relay) will not connect directly.
  The game then falls back to a free shared relay, which is best-effort and sometimes unavailable. If someone cannot
  connect, switch between Wi-Fi and mobile data, or add your own relay in `EXTRA_ICE_SERVERS` in `preview/template.html`
  and rebuild.
- Open the invite link in Safari or Chrome itself. Browsers built into apps (Messages previews, Instagram, Facebook)
  often block these connections.
- There is no random matchmaking or sign-in yet. Those need a game server, which is the next step.

## Source layout

- `SETUP.md`: the checklist of accounts, keys and settings needed to go live.
- `server/`: the game server (`server.mjs`), its storage (`db.mjs`), a Dockerfile and `.env.example`.
- `app/`: the iOS and Android shell (Capacitor) that wraps `index.html`.
- `legal/`: privacy policy draft and the account-deletion web page the stores ask for.
- `preview/server_test.py`: end-to-end test of the server with real browsers.

- `engine/src/engine.ts`: the rules engine (pure TypeScript, shared by any client or server).
- `engine/test/engine.test.ts`: rule tests and simulated full games.
- `preview/template.html`: the web client. `preview/build.mjs` bundles the engine and PeerJS into `index.html`.
- `preview/net_test.py`, `preview/peer_server.cjs`: a two-browser host-and-guest test using a local signalling server.
- `preview/ui_test.py`: drives the home screen, a team game, hints, pass and play, and menu/resume in a browser.

## Build and test

```
npm install
node preview/build.mjs          # rebuilds index.html and dist/index.html
npx esbuild engine/test/engine.test.ts --bundle --platform=node --outfile=build/test.js
node build/test.js               # rule tests
```

## Before publishing to an app store

"Fast Track" is a working title. Clear the name with a trademark search or attorney first; it is set in one place (`GAME_NAME` in `preview/template.html`).
