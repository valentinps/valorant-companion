// Store, wallet and owned items on the PD host.
import { endpoint } from '../core/endpoint'

export interface StoreOffer {
  OfferID: string
  IsDirectPurchase: boolean
  StartDate: string
  Cost: Record<string, number>
  Rewards: { ItemTypeID: string; ItemID: string; Quantity: number }[]
}

export interface StorefrontResponse {
  SkinsPanelLayout: {
    SingleItemOffers: string[]
    SingleItemStoreOffers: StoreOffer[]
    SingleItemOffersRemainingDurationInSeconds: number
  }
  BonusStore?: {
    BonusStoreOffers: {
      BonusOfferID: string
      Offer: StoreOffer
      DiscountPercent: number
      DiscountCosts: Record<string, number>
      IsSeen: boolean
    }[]
    BonusStoreRemainingDurationInSeconds: number
  }
}

/** Daily shop, bundles and night market. Riot changed this to a POST with an empty body in v3. */
export const getStorefront = endpoint<{ puuid: string }, StorefrontResponse>({
  host: 'pd',
  method: 'POST',
  path: (p) => `/store/v3/storefront/${p.puuid}`,
  body: () => ({})
})

export const getWallet = endpoint<{ puuid: string }, { Balances: Record<string, number> }>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/store/v1/wallet/${p.puuid}`
})

/** Well-known item type IDs for getOwnedItems. */
export const ItemType = {
  Agents: '01bb38e1-da47-4e6a-9b3d-945fe4655707',
  Contracts: 'f85cb6f7-33e5-4dc8-b609-ec7212301948',
  Sprays: 'd5f120f8-ff8c-4aac-92ea-f2b5acbe9475',
  GunBuddies: 'dd3bf334-87f3-40bd-b043-682a57a8dc3a',
  Cards: '3f296c07-64c3-494c-923b-fe692a4fa1bd',
  Skins: 'e7c63390-eda7-46e0-bb7a-a6abdacd2433',
  SkinVariants: '3ad1b2b2-acdb-4524-852f-954a76ddae0a',
  Titles: 'de7caa6b-adf7-4588-bbd1-143831e786c6'
} as const

export const getOwnedItems = endpoint<
  { puuid: string; itemTypeId: string },
  { ItemTypeID: string; Entitlements: { TypeID: string; ItemID: string }[] }
>({
  host: 'pd',
  method: 'GET',
  path: (p) => `/store/v1/entitlements/${p.puuid}/${p.itemTypeId}`
})
