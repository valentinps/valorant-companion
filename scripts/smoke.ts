// Headless check of the backend against the running Riot Client. Read-only: it never
// selects agents, changes the party or queues. Run with `npm run smoke`.
import { createBackend } from '../src/main/backend'

async function step(name: string, fn: () => unknown): Promise<void> {
  try {
    const result = await fn()
    console.log(`✔ ${name}`)
    console.dir(result, { depth: 4, maxArrayLength: 6 })
  } catch (err) {
    console.log(`✘ ${name}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main(): Promise<void> {
  const { handlers, tracker, ctx } = createBackend()

  const status = await new Promise<ReturnType<typeof handlers['status.get']>>((resolve) => {
    tracker.once('status', resolve)
    tracker.start()
  })
  console.log('Status:', { ...status, player: status.player ? `${status.player.gameName}#${status.player.tagLine}` : null })
  if (status.phase === 'DISCONNECTED') {
    tracker.stop()
    return
  }

  // Give the presence poll a moment to report the real phase.
  await new Promise((r) => setTimeout(r, 1500))
  console.log('Phase:', tracker.status.phase)

  await step('static data', async () => (await ctx.assets.agents()).length + ' agents')
  await step('profile.get', () => handlers['profile.get']())
  await step('matches.recent', () => handlers['matches.recent'](3))
  await step('store.get', async () => {
    const s = await handlers['store.get']()
    return { wallet: s.wallet, daily: s.daily.items.map((i) => `${i.name} (${i.price.amount})`), nightMarket: !!s.nightMarket }
  })
  await step('party.get', () => handlers['party.get']())
  await step('pregame.get', () => handlers['pregame.get']())
  await step('live.get', () => handlers['live.get']())
  await step('players.profile (you)', async () => {
    const p = await handlers['players.profile'](tracker.status.player!.puuid, null, 5)
    return { rank: p.rank?.name, stats: p.stats, topAgents: p.topAgents.map((a) => a.agent.name) }
  })
  await step('friends.list', async () => {
    const friends = await handlers['friends.list']()
    const byStatus: Record<string, number> = {}
    for (const f of friends) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1
    return byStatus
  })

  tracker.stop()
}

void main()
