import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { runtime } from './runtime'

/**
 * One lift: the curl and its sound straight away, the "+N" when the authority answers.
 * Every click, tap, the LIFT button and Auto Lift come through here.
 */
export function lift() {
  runtime.player.liftedAt = performance.now()
  sfx.lift()
  actions.lift()
}
