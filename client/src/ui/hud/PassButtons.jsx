import { SHOP } from '@shared/balance'

import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import FitBox from './FitBox'
import GiftTimer from './GiftTimer'
import { Price } from './parts'
import { GRADIENTS, u } from './style'

/** X2 WINS only shows where there's room for it (it's in the Store too). */
const PASSES = [
  { product: 'muscleX2', label: 'X2 STRENGTH', icon: 'muscle' },
  { product: 'winsX2', label: 'X2 WINS', icon: 'trophy' },
]

/** Rainbow rays turning slowly behind a pass's icon. */
const RAYS = 'repeating-conic-gradient(from 0deg, #ff3b5c 0deg 10deg, #ffe53b 10deg 20deg, #4ef05a 20deg 30deg, #2fc6ff 30deg 40deg, #b45cff 40deg 50deg, transparent 50deg 60deg)'

/** One pass, as in the reference: a big icon on rainbow rays, its name tilted, the price or OWNED under it. */
function PassButton({ product, label, icon, className = '' }) {
  const item = SHOP[product]
  const owned = useGame((s) => Boolean(s.profile.passes[product]))
  const afford = useGame((s) => s.profile.wins >= item.price)
  return (
    <button
      type="button"
      onClick={() => buy(product)}
      disabled={owned}
      title={item.name}
      className={`pp-btn pointer-events-auto relative flex flex-col items-center ${className}`}
      style={{ width: u(230) }}
    >
      <span className="relative flex items-center justify-center" style={{ width: u(170), height: u(150) }}>
        {!owned && (
          <span
            className="pp-spin absolute rounded-full"
            style={{ width: u(170), height: u(170), background: RAYS, opacity: 0.75, maskImage: 'radial-gradient(circle, #000 30%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, #000 30%, transparent 70%)' }}
          />
        )}
        <Icon name={icon} size={u(150)} className="relative" />
      </span>
      <span className="whitespace-nowrap" style={{ fontSize: u(40), marginTop: u(-30), transform: 'rotate(8deg)' }}>
        <StrokeText stroke={u(10)} gradient={GRADIENTS.rainbow}>
          {label}
        </StrokeText>
      </span>
      <span className="flex items-center" style={{ transform: 'rotate(8deg)', gap: u(8), marginTop: u(-2) }}>
        {owned ? (
          <span style={{ fontSize: u(34) }}>
            <StrokeText stroke={u(8)} fill="#7dff4a">
              OWNED
            </StrokeText>
          </span>
        ) : (
          <>
            <span style={{ fontSize: u(34) }}>
              <StrokeText stroke={u(8)} fill="#7dff4a">
                ONLY
              </StrokeText>
            </span>
            <Price amount={item.price} size={34} afford={afford} />
          </>
        )}
      </span>
    </button>
  )
}

/** How big the right-hand column is against the reference: smaller, so it crowds the view less. */
const COLUMN_SCALE = 0.66

/**
 * Down the right-hand side, as in the reference: the FREE GIFT, then the x2 passes -
 * under the top bar, in far enough that the labels (wider than the buttons) stay on
 * screen, and shrunk if need be to end `maxHeight` CSS pixels down, short of the touch
 * controls.
 */
export function PassButtons({ maxHeight = Infinity }) {
  return (
    <FitBox
      className="pointer-events-none absolute"
      maxHeight={maxHeight}
      maxScale={COLUMN_SCALE}
      origin="top right"
      style={{ right: `calc(env(safe-area-inset-right, 0px) + 6px + ${u(30)})`, top: 'calc(var(--hud-top) + var(--top-clear, 0px) + var(--topbar-height))' }}
    >
      <div className="flex flex-col items-center" style={{ gap: u(18) }}>
        <GiftTimer />
        {PASSES.map((pass) => (
          <PassButton key={pass.product} {...pass} />
        ))}
      </div>
    </FitBox>
  )
}

export default PassButtons
