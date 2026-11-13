import { BODIES, MAX_EQUIPPED_PETS, TUTORIAL } from '@shared/balance'
import { dailyStatus, isMaxLevel } from '@shared/logic'

import { useBloxityStore } from '../../bloxity/store'
import { useGame } from '../../store/game'
import useNow from '../useNow'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import StatsPanel from './StatsPanel'
import { AlertBadge, ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** The tiles' faces: deep, slightly purple-tinted squares, as in the reference. */
const TILE = 'linear-gradient(180deg, #8e7fd6 0%, #5a4aa8 55%, #3d2f80 100%)'
const TILE_RED = 'linear-gradient(180deg, #e8768a 0%, #b8344f 55%, #8a1f35 100%)'

/** A tile's size, and its label's: small enough that the longest ("Settings") fits inside. */
const TILE_SIZE = { width: 110, height: 104 }
const LABEL_SIZE = 20

function MenuTile({ icon, label, onClick, alert, top, pointer, red }) {
  return (
    <ChunkyButton gradient={red ? TILE_RED : TILE} onClick={onClick} title={label} radius={10} border={4} className="flex-col" style={{ width: u(TILE_SIZE.width), height: u(TILE_SIZE.height) }}>
      <Icon name={icon} size={u(66)} style={{ marginTop: u(-18) }} />
      <span className="absolute inset-x-0 overflow-hidden whitespace-nowrap text-center" style={{ bottom: u(5), fontSize: u(LABEL_SIZE), lineHeight: 1.1 }}>
        <StrokeText stroke={u(5)}>{label}</StrokeText>
      </span>
      {top && (
        <span className="absolute" style={{ top: u(3), right: u(4), fontSize: u(17), lineHeight: 1, transform: 'rotate(10deg)' }}>
          <StrokeText stroke={u(4)} gradient={GRADIENTS.priceShort} className="italic">
            {top}
          </StrokeText>
        </span>
      )}
      {alert && <AlertBadge size={30} style={{ top: u(-8), right: u(-8) }} />}
      {pointer && <Icon name="arrowDown" size={u(64)} className="pp-bounce absolute" style={{ top: u(-92) }} />}
    </ChunkyButton>
  )
}

/**
 * The left-hand column: the menu - Bodies, Pets, Store, Gifts, Rebirth, Items and
 * Settings, two to a row - with Wins, Strength and rebirths right under it, so the two
 * never meet. `column` places it (its `top` and the `scale` that fits it in:
 * screen.hudLayout, which keeps the level bar clear of it too).
 */
export function LeftMenu({ column }) {
  const togglePanel = useGame((s) => s.togglePanel)
  const canRebirth = useGame((s) => isMaxLevel(s.profile))
  const petAlert = useGame((s) => s.profile.equippedPets.length < Math.min(MAX_EQUIPPED_PETS, s.profile.pets.length))
  const itemAlert = useGame((s) => Object.values(s.profile.items).some((n) => n > 0))
  // The next body is affordable: the most important thing to buy, so the tile says so.
  const bodyAlert = useGame((s) => {
    const next = BODIES.find((b) => !s.profile.ownedBodies.includes(b.id))
    return Boolean(next && s.profile.wins >= next.cost)
  })
  const profile = useGame((s) => s.profile)
  const tutorialBodies = useGame((s) => TUTORIAL[s.profile.tutorialStep]?.target === 'bodies')
  const now = useNow(10000)
  const giftAlert = dailyStatus(profile, now).some((d) => d.state === 'ready')
  // Inside Boxity its menu has the settings, and its toolbar and chat take the top-left.
  const embedded = useBloxityStore((s) => s.embedded)
  const { top, scale } = column

  return (
    <div
      className="pointer-events-none absolute flex flex-col"
      style={{ left: `calc(env(safe-area-inset-left, 0px) + ${u(16)})`, top, gap: u(18), transform: `scale(${Math.max(0.5, scale)})`, transformOrigin: 'top left' }}
    >
      <div className="grid grid-cols-2" style={{ gap: u(14) }}>
        <MenuTile icon="muscle" label="Bodies" alert={bodyAlert} pointer={tutorialBodies} onClick={() => togglePanel('bodies')} />
        <MenuTile icon="pets" label="Pets" alert={petAlert} onClick={() => togglePanel('pets')} />
        <MenuTile icon="store" label="Store" top="SALE!" red onClick={() => togglePanel('store')} />
        <MenuTile icon="gift" label="Gifts" alert={giftAlert} onClick={() => togglePanel('daily')} />
        <MenuTile icon="rebirth" label="Rebirth" alert={canRebirth} red onClick={() => togglePanel('rebirth')} />
        <MenuTile icon="items" label="Items" alert={itemAlert} onClick={() => togglePanel('items')} />
        {!embedded && <MenuTile icon="gear" label="Settings" onClick={() => togglePanel('settings')} />}
      </div>
      <StatsPanel />
    </div>
  )
}

export default LeftMenu
