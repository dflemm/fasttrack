# Fast Track (working title)

A card-and-peg race game for 2 to 6 players, playable in a browser against bots or with friends in a private room.

`index.html` is the whole game in one file. Open it in a browser, or host it on GitHub Pages (below).

## Put it on GitHub Pages so friends can play

1. Sign in at github.com and create a new **public** repository, for example `fasttrack`.
2. On the new repository's page choose **uploading an existing file**, drag in everything from this folder, and commit.
   Only `index.html` is needed for the game; the rest is source.
3. Go to **Settings > Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick branch `main` and folder `/ (root)`, and save.
4. After a minute or two the game is live at `https://YOUR-USERNAME.github.io/fasttrack/`.

## Playing with friends

1. Open the page, press **New game**, enter your name and choose **Invite friends to a private room**.
2. Press **Copy invite link** and send it (or read out the five-character code).
3. Friends open the link, enter a name and press **Join room**. They appear in your list.
4. Press **Start game** when everyone is in. Empty seats are played by bots. Nobody can join after you start.

How it works: the host's browser runs the game and guests connect directly to it (WebRTC, via the PeerJS library).
The free public PeerJS service is used only to introduce the browsers by room code. Things to know:

- The host must keep the page open. If the host leaves, the game ends.
- If a guest drops, a bot plays their seat; they can rejoin with the same link from the same browser.
- A few networks (some workplaces, some mobile carriers) block direct connections. If someone cannot connect, try Wi-Fi.
- There is no random matchmaking or sign-in yet. Those need a game server, which is the next step.

## Source layout

- `engine/src/engine.ts`: the rules engine (pure TypeScript, shared by any client or server).
- `engine/test/engine.test.ts`: rule tests and simulated full games.
- `preview/template.html`: the web client. `preview/build.mjs` bundles the engine and PeerJS into `index.html`.
- `preview/net_test.py`, `preview/peer_server.cjs`: a two-browser host-and-guest test using a local signalling server.

## Build and test

```
npm install
node preview/build.mjs          # rebuilds index.html and dist/index.html
npx esbuild engine/test/engine.test.ts --bundle --platform=node --outfile=build/test.js
node build/test.js               # rule tests
```

## Before publishing to an app store

"Fast Track" is a working title. Clear the name with a trademark search or attorney first; it is set in one place (`GAME_NAME` in `preview/template.html`).
