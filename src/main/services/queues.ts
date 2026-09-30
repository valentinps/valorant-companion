// Display names for queue IDs. Unknown IDs fall back to a title-cased ID.
const QUEUE_NAMES: Record<string, string> = {
  competitive: 'Competitive',
  unrated: 'Unrated',
  swiftplay: 'Swiftplay',
  spikerush: 'Spike Rush',
  deathmatch: 'Deathmatch',
  hurm: 'Team Deathmatch',
  ggteam: 'Escalation',
  onefa: 'Replication',
  snowball: 'Snowball Fight',
  premier: 'Premier',
  newmap: 'New Map',
  skirmish: 'Skirmish',
  '': 'Custom Game'
}

export function queueName(queueId: string | null | undefined): string {
  const id = queueId ?? ''
  return QUEUE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}
