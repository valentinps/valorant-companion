import { useCommand } from '../../api'
import { Countdown, ErrorNote, Loading, PageHeader } from '../../components/ui'
import type { Price, StoreItem } from '../../../../shared/types'

export function StorePage() {
  const store = useCommand('store.get', [], { intervalMs: 10 * 60_000 })
  const s = store.data

  return (
    <div className="page">
      <PageHeader
        title="Store"
        aside={
          s && (
            <div className="wallet">
              {s.wallet
                .filter((w) => w.amount > 0 || w.currency === 'Valorant Points')
                .map((w) => (
                  <PriceTag key={w.currency} price={w} />
                ))}
            </div>
          )
        }
      />
      <ErrorNote message={store.error} />
      {!s && store.loading && <Loading />}

      {s && (
        <>
          <h3 className="section-title">
            Daily offers
            <span className="muted">
              New offers in <Countdown endsAt={s.daily.refreshesAt} format="duration" />
            </span>
          </h3>
          <div className="store-grid">
            {s.daily.items.map((item) => (
              <StoreCard key={item.offerId} item={item} />
            ))}
          </div>

          {s.nightMarket && (
            <>
              <h3 className="section-title">
                Night market
                <span className="muted">
                  Ends in <Countdown endsAt={s.nightMarket.endsAt} format="duration" />
                </span>
              </h3>
              <div className="store-grid">
                {s.nightMarket.items.map((item) => (
                  <StoreCard key={item.offerId} item={item} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function StoreCard({ item }: { item: StoreItem }) {
  return (
    <article className="store-card" style={{ '--rarity': item.rarityColor ?? 'var(--line)' } as React.CSSProperties}>
      <div className="store-art">{item.icon && <img src={item.icon} alt="" loading="lazy" />}</div>
      <div className="store-info">
        <h4>{item.name}</h4>
        <div className="store-price">
          {item.discountedPrice ? (
            <>
              <s className="muted">{item.price.amount.toLocaleString()}</s>
              <PriceTag price={item.discountedPrice} />
              <span className="discount">-{item.discountPercent}%</span>
            </>
          ) : (
            <PriceTag price={item.price} />
          )}
        </div>
      </div>
    </article>
  )
}

function PriceTag({ price }: { price: Price }) {
  return (
    <span className="price" title={price.currency}>
      {price.icon && <img src={price.icon} alt={price.currency} />}
      {price.amount.toLocaleString()}
    </span>
  )
}
