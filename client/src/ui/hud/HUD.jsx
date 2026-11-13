import { useClearTop } from '../../bloxity/reserved'
import { useGame } from '../../store/game'
import { hudLayout, useScreen } from '../screen'
import EggPanel from './EggPanel'
import InteractPrompt from './InteractPrompt'
import LeftMenu from './LeftMenu'
import LevelBar from './LevelBar'
import CageHud from './CageHud'
import PassButtons from './PassButtons'
import RebirthNotice from './RebirthNotice'
import TopBar from './TopBar'
import TopCenter from './TopCenter'

/**
 * The heads-up display: the menu tiles on the left with Wins, Strength and rebirths
 * right under them, the level bar and its Strength packs along the bottom between them
 * and the touch controls, sound, leaderboards and your name tag in the top-right corner
 * with the FREE GIFT and the x2 passes below them; in the cages, their own break bar,
 * room chip and banners (CageHud). One plan places it all for the screen, upright or
 * sideways (screen.hudLayout), so nothing sits on anything else.
 *
 * The root ignores pointer events so the canvas and joystick underneath keep working;
 * only the buttons themselves opt back in. While a panel is open the HUD steps aside,
 * as in the reference.
 */
/** Boxity's toolbar alone (not its chat), for the left-hand column on a sideways screen. */
const TOOLBAR = ['toolbar']

export function HUD() {
  const panelOpen = useGame((s) => s.panel !== null)
  const screen = useScreen()
  const clearLeft = useClearTop(0, 0.3)
  const clearToolbar = useClearTop(0, 0.3, TOOLBAR)
  const layout = hudLayout(screen, clearLeft, clearToolbar)
  // The top-right corner, right up top - below Boxity's own toolbar only where it spans
  // the top (an upright phone), never down past its chat feed on the left. Upright, the
  // name tag has the corner to itself and the buttons go under it, so it all fits
  // beside the chat.
  const stacked = screen.portrait
  const span = (stacked ? 230 : 430) * screen.px + 20
  const topClear = useClearTop(Math.max(0, 1 - span / screen.w), 1)
  const topbar = (stacked ? 156 : 86) * screen.px
  const style = {
    '--top-clear': `${topClear}px`,
    '--topbar-height': `${topbar}px`,
    '--level-center': `${layout.level.center}px`,
    '--level-bottom': `${layout.level.bottom}px`,
    '--level-top': `${layout.level.top}px`,
    '--level-scale': layout.level.scale,
  }
  // The passes run down the right from under the top bar to just over the touch controls.
  const passesTop = 10 + topClear + topbar
  const passesRoom = screen.h - passesTop - (layout.controls ? layout.controls.height + 12 : 12)
  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-20 select-none" style={style}>
      <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: panelOpen ? 0 : 1, visibility: panelOpen ? 'hidden' : 'visible' }}>
        <PassButtons maxHeight={passesRoom} />
        <TopBar stacked={stacked} />
        <LeftMenu column={layout.column} />
        <LevelBar />
        <TopCenter />
        <RebirthNotice />
        <InteractPrompt />
        <EggPanel />
        <CageHud />
      </div>
    </div>
  )
}

export default HUD
