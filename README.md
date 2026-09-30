# Valorant Companion

A Windows desktop companion for VALORANT: profile and rank, recent matches with RR changes, party and queue controls,
agent select (see your team, pick and lock your agent), the live match roster, the daily store / night market,
a friends list with live activity (invite, ask to join), and clickable player profiles with stats computed from
Riot's match data (win rate, K/D, ACS, ADR, headshot %, top agents), and a match view for any finished match
(scoreboard with first kills, multi-kills and premades, round-by-round timeline with kill feed, spike events and economy).

It talks to the same unofficial API the game client uses, authenticated by borrowing the session of the Riot Client
running on your PC. You never enter a password.

> **Unofficial.** These endpoints aren't supported by Riot and can change with any patch.
> Riot bans instalock tools, so agent lock only ever happens when you click **Lock in**. Keep it that way.
> The app also respects streamer mode (hidden names stay hidden), and doesn't show enemy ranks
> or open opponents' profiles during a match.

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
