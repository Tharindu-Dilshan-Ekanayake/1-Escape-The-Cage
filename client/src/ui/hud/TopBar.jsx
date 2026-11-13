import { useEffect, useState } from 'react'

import { isMuted, onMutedChange, setMuted } from '../../audio/sfx'
import { useBloxityStore } from '../../bloxity/store'
import { useGame } from '../../store/game'
import AuthHUD from '../AuthHUD'
import Icon from '../Icon'
import { AlertBadge, ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

function RoundButton({ icon, label, onClick, alert, iconSize = 38 }) {
  return (
    <ChunkyButton gradient={GRADIENTS.slate} onClick={onClick} title={label} radius={32} style={{ width: u(64), height: u(64) }}>
      <Icon name={icon} size={u(iconSize)} />
      {alert && <AlertBadge size={26} style={{ top: u(-8), right: u(-8) }} />}
    </ChunkyButton>
  )
}

/** Turns the music and sound effects on and off (remembered on this device). */
function SoundButton() {
  const [muted, setMutedState] = useState(isMuted)
  useEffect(() => onMutedChange(setMutedState), [])
  return <RoundButton icon={muted ? 'soundOff' : 'sound'} label={muted ? 'Sound: off' : 'Sound: on'} onClick={() => setMuted(!muted)} iconSize={36} />
}

/**
 * The very top-right corner, upright or sideways: your name tag right in the corner, with
 * sound and leaderboards beside it - or, `stacked` (an upright phone), in a row under it.
 * (Daily rewards are the Gifts tile on the left.) As high as it goes: under Boxity's
 * toolbar only where that spans the top (--top-clear, worked out by HUD).
 */
export function TopBar({ stacked = false }) {
  const openPanel = useGame((s) => s.openPanel)
  // Inside Boxity its trophy button has the leaderboards.
  const embedded = useBloxityStore((s) => s.embedded)
  const buttons = (
    <>
      <SoundButton />
      {!embedded && <RoundButton icon="star" label="Leaderboards" onClick={() => openPanel('leaderboards')} iconSize={34} />}
    </>
  )

  return (
    <div
      className={`pointer-events-none absolute flex ${stacked ? 'flex-col items-end' : 'items-center'}`}
      style={{ right: 'calc(env(safe-area-inset-right, 0px) + 10px)', top: 'calc(var(--hud-top) + var(--top-clear, 0px))', gap: u(12) }}
    >
      {stacked ? (
        <>
          <AuthHUD />
          <div className="flex items-center" style={{ gap: u(12) }}>
            {buttons}
          </div>
        </>
      ) : (
        <>
          {buttons}
          <AuthHUD />
        </>
      )}
    </div>
  )
}

export default TopBar
