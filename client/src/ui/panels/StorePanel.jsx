import { SHOP } from '@shared/balance'

import { buy } from '../../net/shop'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import PetIcon from '../PetIcon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const SECTIONS = [
  { title: 'Passes', items: ['muscleX2', 'winsX2', 'muscleX3', 'winsX3', 'vip'] },
  { title: 'Potions', items: ['potionsMuscle', 'potionsWins'] },
  { title: 'Eggs', items: ['eggsSunset', 'eggsUnicorn', 'eggsDemon'] },
  { title: 'Train Zones', items: ['zoneVeryOp', 'zoneBest'] },
  { title: 'Auras', items: ['auraLightning', 'auraGalaxy', 'auraWater', 'auraFire', 'auraRainbow'] },
  { title: 'Specials', items: ['sphinx'] },
]

const ICONS = {
  muscleX2: 'muscle',
  winsX2: 'trophy',
  muscleX3: 'muscle',
  winsX3: 'trophy',
  vip: 'starGold',
  potionsMuscle: 'potionMuscle',
  potionsWins: 'potionWins',
  eggsSunset: 'egg:sunset',
  eggsUnicorn: 'egg:unicorn',
  eggsDemon: 'egg:demon',
  zoneVeryOp: 'dumbbell',
  zoneBest: 'dumbbell',
  auraLightning: 'aura:lightning',
  auraGalaxy: 'aura:galaxy',
  auraWater: 'aura:water',
  auraFire: 'aura:fire',
  auraRainbow: 'aura:rainbow',
}

const BLURBS = {
  muscleX2: 'Double every Muscle gain, forever',
  winsX2: 'Double the Wins from every push, forever',
  muscleX3: 'Triple every Muscle gain, forever',
  winsX3: 'Triple the Wins from every push, forever',
  vip: 'x1.5 Muscle and x1.5 Wins, forever',
  potionsMuscle: 'Three x2 Muscle potions, cheaper',
  potionsWins: 'Three x2 Wins potions, cheaper',
  eggsSunset: 'Three Sunset Eggs to hatch',
  eggsUnicorn: 'Three Unicorn Eggs to hatch',
  eggsDemon: 'Three Demon Eggs to hatch',
  zoneVeryOp: 'Unlocks the 30X Frost Gym',
  zoneBest: 'Unlocks the 60X Galaxy Gym',
  auraLightning: 'x1.25 Wins, and it crackles',
  auraGalaxy: 'x1.5 Wins, and it sparkles',
  auraWater: 'x2 Wins, and it splashes',
  auraFire: 'x3 Wins, and it blazes',
  auraRainbow: 'x5 Wins, in every colour',
  sphinx: 'Limited: x150 Muscle pet',
}

/** Everything Wins can buy besides dumbbells, eggs and Muscle packs, grouped, with what it does. */
export function StorePanel() {
  const passes = useGame((s) => s.profile.passes)
  const wins = useGame((s) => s.profile.wins)
  return (
    <Panel title="STORE" width={1080}>
      <div className="flex flex-col" style={{ gap: u(18) }}>
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: u(40), marginBottom: u(8) }}>
              <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
                {section.title}
              </StrokeText>
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${u(200)}, 1fr))`, gap: u(12) }}>
              {section.items.map((id) => {
                const product = SHOP[id]
                const owned = product.kind === 'pass' && passes[id]
                return (
                  <div
                    key={id}
                    className="flex flex-col items-center text-center"
                    style={{ padding: u(10), borderRadius: u(8), border: `${u(5)} solid #111`, background: owned ? GRADIENTS.greyButton : GRADIENTS.rewardCard }}
                  >
                    {id === 'sphinx' ? <PetIcon id="sphinx" size={u(96)} /> : <Icon name={ICONS[id]} size={u(96)} />}
                    <span style={{ fontSize: u(product.name.length > 12 ? 24 : 30), lineHeight: 1.1 }}>
                      <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
                        {product.name}
                      </StrokeText>
                    </span>
                    <span className="whitespace-normal" style={{ fontSize: u(18), minHeight: u(44), margin: `${u(4)} 0` }}>
                      <span style={{ color: '#5a3a10' }}>{BLURBS[id]}</span>
                    </span>
                    <ChunkyButton
                      gradient={owned ? GRADIENTS.greyButton : GRADIENTS.greenButton}
                      disabled={owned}
                      onClick={() => buy(id)}
                      className="w-full"
                      style={{ height: u(58) }}
                    >
                      {owned ? (
                        <span style={{ fontSize: u(30) }}>
                          <StrokeText stroke={u(6)}>Owned</StrokeText>
                        </span>
                      ) : (
                        <Price amount={product.price} size={32} afford={wins >= product.price} />
                      )}
                    </ChunkyButton>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default StorePanel
