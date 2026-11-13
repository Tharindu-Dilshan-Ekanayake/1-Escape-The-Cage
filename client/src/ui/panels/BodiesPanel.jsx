import { BODIES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { bodyIndex } from '@shared/logic'

import { bodyLook } from '../../game/bodies'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import { sfx } from '../../audio/sfx'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/** A badge in the body's own colour (a rainbow for the Rainbow Body) with a flexing arm on it. */
function BodyBadge({ id, size }) {
  const look = bodyLook(id)
  const background =
    id === 'rainbow'
      ? GRADIENTS.rainbow
      : `radial-gradient(circle at 35% 30%, #ffffff 0%, ${look.color} 38%, ${look.color} 70%, rgba(0,0,0,0.55) 100%)`
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: u(size),
        height: u(size),
        background,
        border: `${u(4)} solid #0b0d12`,
        boxShadow: look.glow > 0.2 ? `0 0 ${u(18 * look.glow)} ${look.color}` : undefined,
      }}
    >
      <Icon name="muscle" size={u(size * 0.78)} />
    </div>
  )
}

/** One tier's card: its badge, name and multiplier, and buy, wear or worn. */
function BodyCard({ index }) {
  const body = BODIES[index]
  const owned = useGame((s) => s.profile.ownedBodies.includes(body.id))
  const worn = useGame((s) => s.profile.equippedBody === body.id)
  const unlocked = useGame((s) => index === 0 || s.profile.ownedBodies.includes(BODIES[index - 1].id))
  const afford = useGame((s) => s.profile.wins >= body.cost)

  let button
  if (worn) {
    button = (
      <ChunkyButton gradient={GRADIENTS.goldButton} title="Wearing" radius={8} style={{ width: '100%', height: u(66) }}>
        <span style={{ fontSize: u(32) }}>
          <StrokeText stroke={u(7)}>Wearing</StrokeText>
        </span>
      </ChunkyButton>
    )
  } else if (owned) {
    button = (
      <ChunkyButton gradient={GRADIENTS.blueButton} onClick={() => actions.equipBody(body.id)} title="Wear" radius={8} style={{ width: '100%', height: u(66) }}>
        <span style={{ fontSize: u(34) }}>
          <StrokeText stroke={u(7)}>Wear</StrokeText>
        </span>
      </ChunkyButton>
    )
  } else if (!unlocked) {
    button = (
      <ChunkyButton gradient={GRADIENTS.greyButton} title="Buy the body before this one first" radius={8} disabled style={{ width: '100%', height: u(66) }}>
        <span style={{ fontSize: u(30) }}>
          <StrokeText stroke={u(7)}>Locked</StrokeText>
        </span>
      </ChunkyButton>
    )
  } else {
    const purchase = () => {
      if (!afford) {
        sfx.error()
        return
      }
      actions.buyBody(body.id)
    }
    button = (
      <ChunkyButton gradient={GRADIENTS.greenButton} onClick={purchase} title={`Buy ${body.name}`} radius={8} style={{ width: '100%', height: u(66) }}>
        <Price amount={body.cost} size={32} afford={afford} />
      </ChunkyButton>
    )
  }

  return (
    <div
      className="flex flex-col items-center"
      style={{
        gap: u(6),
        padding: u(10),
        borderRadius: u(10),
        border: `${u(4)} solid ${worn ? '#ffd21f' : '#0b0d12'}`,
        background: 'linear-gradient(180deg, rgba(40,48,70,0.92), rgba(24,28,40,0.92))',
        opacity: unlocked || owned ? 1 : 0.55,
      }}
    >
      {body.tag && (
        <span style={{ fontSize: u(26), marginBottom: u(-6) }}>
          <StrokeText stroke={u(6)} gradient={GRADIENTS.rainbow}>
            {body.tag}
          </StrokeText>
        </span>
      )}
      <BodyBadge id={body.id} size={104} />
      <span className="whitespace-nowrap text-center" style={{ fontSize: u(28) }}>
        <StrokeText stroke={u(6)}>{body.name}</StrokeText>
      </span>
      <span className="whitespace-nowrap text-center" style={{ fontSize: u(22), marginTop: u(-6) }}>
        <StrokeText stroke={u(5)} gradient={GRADIENTS.blueButton}>
          {bodyLook(body.id).type}
        </StrokeText>
      </span>
      <span className="flex items-center" style={{ fontSize: u(34), gap: u(4) }}>
        <Icon name="muscle" size={u(40)} />
        <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
          {`x${formatNumber(body.power)}`}
        </StrokeText>
      </span>
      {button}
    </div>
  )
}

/**
 * The Bodies panel: every bodybuilder body, bought in order with Wins. Each
 * multiplies every lift, and your avatar becomes it - chest, abs, arms and legs, and
 * from Bronze on in metal, gems and glowing stuff (the body shop's pads sell the same).
 */
export function BodiesPanel() {
  const worn = useGame((s) => s.profile.equippedBody)
  const next = useGame((s) => BODIES.find((a) => !s.profile.ownedBodies.includes(a.id)) ?? null)
  return (
    <Panel title="Bodies" icon="muscle" width={1180}>
      <div className="flex items-center justify-center" style={{ gap: u(14), marginBottom: u(14) }}>
        <BodyBadge id={worn} size={84} />
        <span style={{ fontSize: u(34) }}>
          <StrokeText stroke={u(7)}>
            {next ? `Next: ${next.name} - x${formatNumber(next.power)} Strength!` : 'You have every body!'}
          </StrokeText>
        </span>
      </div>
      <div className="grid grid-cols-4" style={{ gap: u(12) }}>
        {BODIES.map((body) => (
          <BodyCard key={body.id} index={bodyIndex(body.id)} />
        ))}
      </div>
    </Panel>
  )
}

export default BodiesPanel
