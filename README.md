# Valorant Companion

A Windows desktop companion for VALORANT: profile and rank, recent matches with RR changes, party and queue controls,
agent select (see your team, pick and lock your agent), the live match roster, the daily store / night market,
a friends list with live activity (invite, ask to join), and clickable player profiles with stats computed from
Riot's match data (win rate, K/D, ACS, ADR, headshot %, top agents), saved players to keep track of anyone's rank
and stats (stored in `saved-players.json` in the app's data folder), and a match view for any finished match
(scoreboard with first kills, multi-kills and premades, round-by-round timeline with kill feed, spike events and economy).

It talks to the same unofficial API the game client uses, authenticated by borrowing the session of the Riot Client
running on your PC. You never enter a password.

> **Unofficial.** These endpoints aren't supported by Riot and can change with any patch.
> Riot bans instalock tools, so agent lock only ever happens when you click **Lock in**. Keep it that way.
> The app also respects streamer mode (hidden names stay hidden). The live roster shows every player's
> rank, enemies included. Opponents whose names are visible can be opened like any other player.

## Phone remote

Open **Phone** in the app, turn on remote access and scan the QR code. The phone gets this same UI in its browser,
with nothing to install; use *Add to Home Screen* for an app icon. Two connection modes:

- **Anywhere** (default): a free Cloudflare quick tunnel gives an `https://….trycloudflare.com` link that works on any
  Wi-Fi or mobile data, through any firewall. The PC only makes outgoing connections and the local server only listens
  on 127.0.0.1. `cloudflared` is downloaded once from Cloudflare's GitHub releases into the app's data folder
  (`tools/`). The link changes each time the app starts, so scan again after a restart.
- **Home network only**: the phone connects straight to `http://<pc-ip>:47800`. No third party, but routers, phone
  VPNs and firewalls can block it.

Either way, every request needs the pairing key from the QR code; **Unpair all phones** changes it. Code is in
`src/main/remote/` (server, tunnel) and `src/renderer/src/remoteApi.ts` (the phone's stand-in for IPC: HTTP for
commands, a WebSocket for live events).

## Run

```sh
npm install
npm run dev        # app with hot reload
npm run smoke      # headless, read-only check of the backend against your running Riot Client
npm run typecheck
npm run build      # production bundle in out/, run with `npm start`
```

## How it works

```
Riot Client (local API + WebSocket)  ─┐
pd / glz / shared.a.pvp.net          ─┼─ main process (Node) ──IPC──► renderer (React UI)
valorant-api.com (names, icons)      ─┘
```

| Layer | Folder | Job |
| --- | --- | --- |
| Connection | `src/main/core/` | lockfile → tokens → region/shard/client version (`session.ts`); executes endpoint definitions with the right host and headers (`apiClient.ts`) |
| Endpoints | `src/main/endpoints/` | One declarative, typed definition per Riot endpoint, grouped by area |
| Game state | `src/main/state/` | Detects menus / agent select / in-game from presence and relays live change events from the WebSocket |
| Static data | `src/main/static/` | Agent, map, rank, skin and currency names and icons, cached per game version |
| Services | `src/main/services/` | Turn raw Riot responses into display-ready view models |
| IPC contract | `src/shared/ipc.ts` | The typed list of commands the UI can call |
| Features | `src/renderer/src/features/` | One folder per page, registered in `registry.tsx` |

The backend (`src/main/backend.ts`) has no Electron code, so you can drive it from a plain script (see `scripts/smoke.ts`).

## Adding a feature (example: "friends online")

1. **Endpoint.** Add it to `src/main/endpoints/local.ts`. `getFriends` already exists:
   ```ts
   export const getFriends = endpoint<void, { friends: RawFriend[] }>({
     host: 'local', method: 'GET', path: () => '/chat/v4/friends'
   })
   ```
2. **Service.** Create `src/main/services/friends.ts` and call `ctx.api.call(Local.getFriends)`. Return a view model you
   define in `src/shared/types.ts`. Add the service to `Services` in `backend.ts`.
3. **Command.** Add `'friends.list': () => FriendView[]` to `Commands` in `src/shared/ipc.ts`. TypeScript will flag
   `handlers.ts` until you add the matching handler.
4. **Page.** Create `src/renderer/src/features/friends/FriendsPage.tsx` and fetch with
   `useCommand('friends.list', [], { intervalMs: 10_000 })`. Register it in `features/registry.tsx`.

For data that changes during agent select, a party or a match, pass `refreshOn: ['pregame' | 'party' | 'coregame']`
to `useCommand` so the page refreshes the moment Riot pushes a change.

## Endpoint reference

Community docs: <https://valapidocs.techchrism.me>. Endpoints already defined here:

- **Local:** presences, region/locale, friends
- **Player (pd):** names, MMR, competitive updates, match history, match details, account XP
- **Store (pd):** storefront (v3, `POST`), wallet, owned items
- **Pre-game (glz):** player, match, select, lock, quit (quit isn't wired to the UI)
- **Core-game (glz):** player, match
- **Party (glz):** player, party, set ready, change queue, join/leave queue, open/close party, invite by Riot ID,
  request to join
