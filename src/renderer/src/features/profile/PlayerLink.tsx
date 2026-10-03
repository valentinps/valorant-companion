import { PlayerName } from '../../components/ui'
import { useOpenProfile } from '../overlays/Overlays'

interface Props {
  puuid: string
  displayName: string | null
  isSelf: boolean
}

/**
 * A player name that opens their profile when clicked.
 * Players in streamer mode (displayName null) open a profile that keeps their name hidden.
 */
export function PlayerLink({ puuid, displayName, isSelf }: Props) {
  const openProfile = useOpenProfile()
  const slot = { displayName, isSelf }
  if (displayName === null) return <PlayerName slot={slot} onOpen={() => openProfile({ puuid, hidden: true })} />
  return <PlayerName slot={slot} onOpen={() => openProfile({ puuid, name: displayName })} />
}
