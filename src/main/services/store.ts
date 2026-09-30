import type { Price, StoreItem, StoreView } from '../../shared/types'
import { Store } from '../endpoints'
import type { StoreOffer } from '../endpoints/store'
import type { StaticData } from '../static/staticData'
import type { ServiceContext } from './context'

export class StoreService {
  constructor(private readonly ctx: ServiceContext) {}

  async get(): Promise<StoreView> {
    const { api, assets, session } = this.ctx
    const { puuid } = session.requireInfo()
    const [front, wallet] = await Promise.all([
      api.call(Store.getStorefront, { puuid }),
      api.call(Store.getWallet, { puuid })
    ])
    const now = Date.now()

    const daily = await Promise.all(
      front.SkinsPanelLayout.SingleItemStoreOffers.map((offer) => toItem(offer, offer.Cost, assets))
    )

    const bonus = front.BonusStore
    const nightMarket = bonus
      ? {
          items: await Promise.all(
            bonus.BonusStoreOffers.map(async (b) => ({
              ...(await toItem(b.Offer, b.Offer.Cost, assets)),
              discountedPrice: await toPrice(b.DiscountCosts, assets),
              discountPercent: b.DiscountPercent
            }))
          ),
          endsAt: now + bonus.BonusStoreRemainingDurationInSeconds * 1000
        }
      : null

    return {
      wallet: await Promise.all(
        Object.entries(wallet.Balances).map(async ([id, amount]) => {
          const currency = await assets.currency(id)
          return { currency: currency.name, amount, icon: currency.icon }
        })
      ),
      daily: {
        items: daily,
        refreshesAt: now + front.SkinsPanelLayout.SingleItemOffersRemainingDurationInSeconds * 1000
      },
      nightMarket
    }
  }
}

async function toItem(offer: StoreOffer, cost: Record<string, number>, assets: StaticData): Promise<StoreItem> {
  const itemId = offer.Rewards[0]?.ItemID ?? offer.OfferID
  const skin = await assets.skinLevel(itemId)
  return {
    offerId: offer.OfferID,
    name: skin?.name ?? 'Unknown item',
    icon: skin?.icon ?? null,
    price: await toPrice(cost, assets),
    rarityColor: skin?.rarityColor ?? null
  }
}

async function toPrice(cost: Record<string, number>, assets: StaticData): Promise<Price> {
  const [currencyId, amount] = Object.entries(cost)[0] ?? ['', 0]
  const currency = await assets.currency(currencyId)
  return { currency: currency.name, amount, icon: currency.icon }
}
