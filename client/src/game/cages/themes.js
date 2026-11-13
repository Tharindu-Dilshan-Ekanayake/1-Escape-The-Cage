import { STYLE } from '../materials'

/**
 * Each cage's look: its bars (`bars` colour in `barStyle`), the floor of the room behind
 * it (`floor` in `floorStyle`), and an `accent` - the glow on its room's corner posts,
 * the WIN pad's rim and the HUD's name colours. World 1's cages first, then Shadow
 * Prison's. Every look is drawn by the shared toy shader: no textures.
 */
export const CAGE_THEMES = {
  bamboo: { bars: '#a8cf45', barStyle: STYLE.BARS, floor: '#d7b47c', floorStyle: STYLE.TILES, accent: '#e8ff7a' },
  brick: { bars: '#c0573d', barStyle: STYLE.BARS, floor: '#dcd3c8', floorStyle: STYLE.TILES, accent: '#ff9a6a' },
  rusty: { bars: '#a4532c', barStyle: STYLE.BARS, floor: '#6e5f57', floorStyle: STYLE.PLATE, accent: '#ffa54a' },
  steel: { bars: '#b4bfcb', barStyle: STYLE.BARS, floor: '#5d6874', floorStyle: STYLE.PLATE, accent: '#7fd8ff' },
  frost: { bars: '#a9e5ff', barStyle: STYLE.BARS, floor: '#eaf8ff', floorStyle: STYLE.TILES, accent: '#c6f6ff' },
  jungle: { bars: '#4f8f3a', barStyle: STYLE.BARS, floor: '#62b44c', floorStyle: STYLE.STUDS, accent: '#a6ff4f' },
  candy: { bars: '#ff6fc2', barStyle: STYLE.STRIPES, floor: '#ffd8ef', floorStyle: STYLE.TILES, accent: '#ff5fb8' },
  lava: { bars: '#4c4044', barStyle: STYLE.BARS, floor: '#ff6a2a', floorStyle: STYLE.LAVA, accent: '#ff4a1c' },
  crystal: { bars: '#8f72ff', barStyle: STYLE.BARS, floor: '#4b3696', floorStyle: STYLE.TILES, accent: '#c69bff' },
  toxic: { bars: '#78c42c', barStyle: STYLE.BARS, floor: '#55663a', floorStyle: STYLE.TILES, accent: '#9dff3a' },
  gold: { bars: '#ffc61a', barStyle: STYLE.BARS, floor: '#fff1c4', floorStyle: STYLE.TILES, accent: '#ffe066' },
  neon: { bars: '#ff3fd0', barStyle: STYLE.GLOW, floor: '#1f2140', floorStyle: STYLE.TILES, accent: '#2fe8ff' },
  diamond: { bars: '#c8f7ff', barStyle: STYLE.BARS, floor: '#e9fbff', floorStyle: STYLE.TILES, accent: '#8fe9ff' },
  galaxy: { bars: '#5034c8', barStyle: STYLE.GALAXY, floor: '#2a1a5a', floorStyle: STYLE.GALAXY, accent: '#ff7ad9' },
  obsidian: { bars: '#2e2738', barStyle: STYLE.BARS, floor: '#1b1722', floorStyle: STYLE.TILES, accent: '#a46bff' },
  bone: { bars: '#eee4cf', barStyle: STYLE.BARS, floor: '#5a5048', floorStyle: STYLE.TILES, accent: '#fff2c0' },
  cursed: { bars: '#4d2c5e', barStyle: STYLE.BARS, floor: '#2a1a33', floorStyle: STYLE.TILES, accent: '#9dff5a' },
  blood: { bars: '#8f1224', barStyle: STYLE.BARS, floor: '#3a0b13', floorStyle: STYLE.TILES, accent: '#ff3b4a' },
  void: { bars: '#1a1030', barStyle: STYLE.GALAXY, floor: '#0c0718', floorStyle: STYLE.GALAXY, accent: '#b066ff' },
  storm: { bars: '#5c6c8c', barStyle: STYLE.BARS, floor: '#2a3346', floorStyle: STYLE.ROAD, accent: '#fff07a' },
  hellfire: { bars: '#ff3b1e', barStyle: STYLE.LAVA, floor: '#ff5a1c', floorStyle: STYLE.LAVA, accent: '#ff8a1e' },
  celestial: { bars: '#fff6c4', barStyle: STYLE.BARS, floor: '#ffffff', floorStyle: STYLE.TILES, accent: '#ffd23f' },
  cosmic: { bars: '#3d1c70', barStyle: STYLE.GALAXY, floor: '#1a1040', floorStyle: STYLE.GALAXY, accent: '#7fe0ff' },
  titan: { bars: '#ffffff', barStyle: STYLE.RAINBOW, floor: '#2a1a5a', floorStyle: STYLE.GALAXY, accent: '#ffd21f' },
}

const FALLBACK = CAGE_THEMES.steel
export const cageTheme = (id) => CAGE_THEMES[id] ?? FALLBACK

/** A cage's name as a top-to-bottom text gradient: white into its accent. */
export const cageGradient = (id) => ['#ffffff', cageTheme(id).accent, cageTheme(id).accent]

/** Each world's sky (and stars), by world index; World 1's is the scene's own. */
export const WORLD_SKIES = [null, { sky: ['#1a1050', '#8a6ad8'], stars: true }]
