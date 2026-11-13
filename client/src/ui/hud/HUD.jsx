import { useGame } from '../../store/game'
import EggPanel from './EggPanel'
import InteractPrompt from './InteractPrompt'
import LeftMenu from './LeftMenu'
import LevelBar from './LevelBar'
import PassButtons from './PassButtons'
import PushHud from './PushHud'
import RebirthNotice from './RebirthNotice'
import StatsPanel from './StatsPanel'
import TopBar from './TopBar'
import TopCenter from './TopCenter'

/**
 * The heads-up display, laid out like the reference: the menu tiles on the left, Wins
 * and Muscle bottom-left, the level bar and its Muscle packs bottom-centre,
 * the FREE GIFT and the x2 passes on the right, and sound, leaderboards and your name
 * tag top-right. Up the mountain it clears out for the push's own HUD.
 *
 * The root ignores pointer events so the canvas and joystick underneath keep working;
 * only the buttons themselves opt back in. While a panel is open the HUD steps aside,
 * as in the reference.
 */
export function HUD() {
  const panelOpen = useGame((s) => s.panel !== null)
  const pushing = useGame((s) => s.pushing)
  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-20 select-none">
      <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: panelOpen ? 0 : 1, visibility: panelOpen ? 'hidden' : 'visible' }}>
        <StatsPanel />
        <PassButtons />
        {/* Hidden, not unmounted, while pushing: remounting them at the start of a push
            cost a visible hitch on slow phones. */}
        <div className="contents" style={{ visibility: pushing ? 'hidden' : 'visible' }}>
          <TopBar />
          <LeftMenu />
          <LevelBar />
          <TopCenter />
          <RebirthNotice />
        </div>
        <InteractPrompt />
        <EggPanel />
        <PushHud />
      </div>
    </div>
  )
}

export default HUD
