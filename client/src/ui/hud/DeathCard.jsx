import { formatNumber } from '@shared/format'

import { pressRespawn } from '../../bloxity/deathScreen'
import { STAGES } from '../../game/push/course'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/**
 * Crushed: the game's own death card, in the middle of the screen (Boxity keeps the
 * edges for its ads): what that boulder needs, and a Respawn button that unlocks when
 * Boxity's countdown is over - the number on it until then. It stays up until Respawn
 * is clicked (no key does it: a jump while you're down mustn't respawn you). Respawning
 * takes you back to the lobby.
 */
export function DeathCard() {
  const death = useGame((s) => s.death)
  const ready = death?.seconds === 0

  if (!death) return null
  const stage = STAGES[death.stage]
  return (
    <div className="pp-death pointer-events-none absolute left-1/2 top-[38%] flex flex-col items-center text-center" style={{ gap: u(10) }}>
      <span style={{ fontSize: u(120) }}>
        <StrokeText stroke={u(20)} gradient={GRADIENTS.priceShort}>
          CRUSHED!
        </StrokeText>
      </span>
      {stage && (
        <span className="flex items-center" style={{ fontSize: u(44), gap: u(8) }}>
          <StrokeText stroke={u(9)}>{`The ${stage.boulder} needs`}</StrokeText>
          <Icon name="muscle" size={u(56)} />
          <StrokeText stroke={u(9)} gradient={GRADIENTS.gold}>
            {formatNumber(death.need)}
          </StrokeText>
        </span>
      )}
      <span style={{ fontSize: u(36) }}>
        <StrokeText stroke={u(8)}>Train more and try again!</StrokeText>
      </span>
      <ChunkyButton
        gradient={ready ? GRADIENTS.greenButton : GRADIENTS.greyButton}
        disabled={!ready}
        onClick={() => pressRespawn()}
        title="Respawn"
        radius={16}
        className="pointer-events-auto"
        style={{ minWidth: u(300), height: u(96), marginTop: u(12) }}
      >
        <span style={{ fontSize: u(48) }}>
          <StrokeText stroke={u(9)}>{ready ? 'Respawn' : `Respawn in ${death.seconds}`}</StrokeText>
        </span>
      </ChunkyButton>
    </div>
  )
}

export default DeathCard
