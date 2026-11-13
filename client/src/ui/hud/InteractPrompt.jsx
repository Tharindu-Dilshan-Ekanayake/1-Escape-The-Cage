import { useEffect } from 'react'

import { BODIES, SHOP, TRAIN_ZONES, WORLD_PORTALS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isZoneUnlocked, worldUnlocked } from '@shared/logic'

import { padState } from '../../game/labels/lobbyLabels'
import { actions } from '../../net/actions'
import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

/**
 * What standing on the current spot lets you do, if anything, in a word or two:
 * { action, price?, run } - `price` in Wins, shown with a trophy. One at a time.
 */
function usePrompt() {
  const pad = useGame((s) => s.zone.pad)
  const owned = useGame((s) => s.profile.ownedBodies)
  const equipped = useGame((s) => s.profile.equippedBody)
  const atFreeReward = useGame((s) => s.zone.freeReward)
  const freeTaken = useGame((s) => s.session.freeRewardTaken)
  const zoneNear = useGame((s) => s.zone.trainZoneNear)
  const zoneLocked = useGame((s) => s.zone.trainZoneNear >= 0 && !isZoneUnlocked(s.profile, s.zone.trainZoneNear))
  const atSphinx = useGame((s) => s.zone.sphinx)
  const atPortal = useGame((s) => s.zone.portal)
  const world = useGame((s) => s.profile.world)
  const canEnter = useGame((s) => (s.zone.portal ? worldUnlocked(s.profile, WORLD_PORTALS[s.zone.portal].world) : false))
  const atAuras = useGame((s) => s.zone.auras)
  const atPotions = useGame((s) => s.zone.potions)
  const openPanel = useGame((s) => s.openPanel)

  // A world portal: walking in is what takes you.
  if (atPortal) {
    const portal = WORLD_PORTALS[atPortal]
    if (world === portal.world) return { action: 'Back to World 1', run: null }
    return canEnter ? { action: `Enter ${portal.name}`, run: null } : { action: 'Need', price: portal.wins, run: null }
  }

  if (atSphinx) return { action: 'Buy', price: SHOP.sphinx.price, run: () => buy('sphinx') }
  if (atAuras) return { action: 'Auras', run: () => openPanel('auras') }
  if (atPotions) return { action: 'Potions', run: () => openPanel('items') }

  if (zoneLocked) {
    const zone = TRAIN_ZONES[zoneNear]
    if (zone.product) return { action: 'Unlock', price: SHOP[zone.product].price, run: () => buy(zone.product) }
    return { action: `${zone.rebirths} ${zone.rebirths === 1 ? 'Rebirth' : 'Rebirths'} needed`, run: null }
  }

  if (atFreeReward) return freeTaken ? { action: 'Come back later', run: null } : { action: 'Claim', run: () => actions.claimFreeReward() }

  if (pad >= 0) {
    const body = BODIES[pad]
    const state = padState({ ownedBodies: owned, equippedBody: equipped }, pad)
    if (state === 'equipped') return { action: 'Wearing', run: null }
    if (state === 'owned') return { action: 'Wear', run: () => actions.equipBody(body.id) }
    if (state === 'locked') return { action: 'Locked', run: null }
    return { action: 'Buy', price: body.cost, run: () => actions.buyBody(body.id) }
  }
  return null
}

const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

/**
 * Proximity prompt: a small pill in the middle of the screen, under your character - the
 * key to press and a word or two. E on keyboard; tap it on touch screens.
 */
export function InteractPrompt() {
  const prompt = usePrompt()
  const busy = useGame((s) => Boolean(s.panel))
  const run = !busy ? prompt?.run : null

  useEffect(() => {
    if (!run) return undefined
    const onDown = (e) => {
      if (e.code === 'KeyE' && !e.repeat) run()
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [run])

  if (!prompt || busy) return null
  return (
    <button
      type="button"
      onClick={() => prompt.run?.()}
      className="pp-btn pointer-events-auto absolute flex items-center"
      style={{
        left: '50%',
        bottom: `max(32%, calc(var(--level-top, 0px) + ${u(90)}))`,
        transform: 'translateX(-50%)',
        gap: u(12),
        padding: `${u(8)} ${u(24)} ${u(8)} ${u(prompt.run ? 8 : 24)}`,
        borderRadius: u(999),
        background: 'rgba(16, 20, 30, 0.7)',
        boxShadow: `0 ${u(4)} ${u(14)} rgba(0, 0, 0, 0.3)`,
      }}
    >
      {prompt.run && (
        <span
          className="relative flex items-center justify-center rounded-full"
          style={{ width: u(52), height: u(52), border: `${u(3)} solid #fff`, background: 'rgba(255, 255, 255, 0.12)', fontSize: touch ? u(17) : u(28), color: '#fff' }}
        >
          {/* No E key on a phone: the pill itself is what you tap. */}
          {touch ? 'TAP' : 'E'}
        </span>
      )}
      <span className="flex items-center whitespace-nowrap" style={{ fontSize: u(34), gap: u(8) }}>
        <StrokeText stroke={u(8)}>{prompt.action}</StrokeText>
        {prompt.price != null && (
          <>
            <Icon name="trophy" size={u(38)} />
            <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
              {formatNumber(prompt.price)}
            </StrokeText>
          </>
        )}
      </span>
    </button>
  )
}

export default InteractPrompt
