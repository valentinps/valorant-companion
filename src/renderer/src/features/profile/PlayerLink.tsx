import { PlayerName } from '../../components/ui'
import { useOpenProfile } from '../overlays/Overlays'

interface Props {
  puuid: string
  displayName: string | null
  isSelf: boolean
}

/**
 * A player name that opens their profile when clicked.
 * Players in streamer mode (displayName null) stay anonymous and unclickable.
 * Only use this for yourself, friends, party members and teammates, not opponents.
 */
export function PlayerLink({ puuid, displayName, isSelf }: Props) {
  const openProfile = useOpenProfile()
  const slot = { displayName, isSelf }
  if (displayName === null) return <PlayerName slot={slot} />
  return <PlayerName slot={slot} onOpen={() => openProfile({ puuid, name: displayName })} />
}
