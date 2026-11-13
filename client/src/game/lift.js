import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { hitCage } from './cages/cageControl'
import { runtime } from './runtime'

/**
 * One tap: at a cage's bars, a heave pulling them apart (see cageControl.hitCage);
 * anywhere else a lift - the curl and its sound straight away, the "+N" when the
 * authority answers. Every click, tap, key press and the LIFT / PULL button comes
 * through here.
 */
export function lift() {
  if (hitCage()) return
  runtime.player.liftedAt = performance.now()
  sfx.lift()
  actions.lift()
}
