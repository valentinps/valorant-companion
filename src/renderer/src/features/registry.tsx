import type { ComponentType } from 'react'
import type { AppStatus, GamePhase } from '../../../shared/types'
import { AgentIcon, BookmarkIcon, FriendsIcon, LiveIcon, PartyIcon, PhoneIcon, ProfileIcon, StoreIcon } from '../components/icons'
import { AgentSelectPage } from './agent-select/AgentSelectPage'
import { FriendsPage } from './friends/FriendsPage'
import { LiveMatchPage } from './live/LiveMatchPage'
import { OverviewPage } from './overview/OverviewPage'
import { PartyPage } from './party/PartyPage'
import { RemotePage } from './remote/RemotePage'
import { SavedPage } from './saved/SavedPage'
import { StorePage } from './store/StorePage'

export interface Feature {
  id: string
  label: string
  icon: ComponentType
  page: ComponentType
  /** Switch to this page automatically when the game enters this phase. */
  focusOn?: GamePhase
  /** Show a "live" marker in the rail when true. */
  isActive?: (status: AppStatus) => boolean
  /** Only shown in the desktop window, never on a paired phone. */
  desktopOnly?: boolean
}

/**
 * Every page in the app, in rail order.
 * Adding a feature = create a folder under features/ and add one entry here.
 */
export const FEATURES: Feature[] = [
  { id: 'overview', label: 'Overview', icon: ProfileIcon, page: OverviewPage, focusOn: 'MENUS' },
  { id: 'party', label: 'Party', icon: PartyIcon, page: PartyPage },
  { id: 'friends', label: 'Friends', icon: FriendsIcon, page: FriendsPage },
  { id: 'saved', label: 'Saved', icon: BookmarkIcon, page: SavedPage },
  {
    id: 'agent-select',
    label: 'Agent select',
    icon: AgentIcon,
    page: AgentSelectPage,
    focusOn: 'PREGAME',
    isActive: (s) => s.phase === 'PREGAME'
  },
  {
    id: 'live',
    label: 'Live match',
    icon: LiveIcon,
    page: LiveMatchPage,
    focusOn: 'INGAME',
    isActive: (s) => s.phase === 'INGAME'
  },
  { id: 'store', label: 'Store', icon: StoreIcon, page: StorePage },
  { id: 'remote', label: 'Phone', icon: PhoneIcon, page: RemotePage, desktopOnly: true }
]
