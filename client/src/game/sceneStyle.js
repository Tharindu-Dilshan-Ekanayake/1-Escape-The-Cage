/**
 * The scene's whole look in one place: a bright toy-brick world with a saturated blue
 * sky, a light-blue studded baseplate with lime lawns and orange dirt patches, grey
 * voxel mountains all round and terracotta cliffs either side of the canyon of cages.
 *
 * Colours are sRGB hex, exactly as you would pick them in an image editor.
 *
 * Light intensities are three.js physical units: a light of intensity PI (~3.14)
 * lights a surface facing it to its full texture colour. The hemisphere fill plus the
 * sun add up to just over that on the ground, which is what keeps the colours vivid;
 * shadowed ground only gets the fill, so shadows read as a softer, darker shade.
 */

export const SKY = {
  /** Straight up. */
  top: '#2f8ff2',
  /** At eye level. Fog uses the same colour so distant ground melts into the sky. */
  horizon: '#a6d6fb',
  /** Lower = the deep blue reaches further down towards the horizon. */
  exponent: 0.35,
}

export const FOG = {
  color: SKY.horizon,
}

export const CLOUDS = {
  /** Sunlit tops. */
  top: '#ffffff',
  /** Undersides, a cool blue-grey. */
  bottom: '#d6e5f5',
}

/**
 * Every surface colour in the lobby, for each world (the lobby is rebuilt in its own
 * world's colours: see applyLobbyTheme). World 1 is sunny toy bricks; World 2, the Shadow
 * Prison, the same lobby at night in violet stone.
 */
const LOBBY_PALETTES = [
  {
    /** The baseplate: light blue studs, as in the reference. */
    plaza: '#a4cdee',
    apron: '#d7e4f0',
    apronEdge: '#eef5fb',
    shopFloor: '#aab4bf',
    /** The avenues: bricks in two shades, a darker kerb, and the edges of the runner up each one's middle (ground.js RUNNERS). */
    path: '#f4e8cc',
    pathAlt: '#eadab5',
    pathEdge: '#c9a877',
    runnerEdge: '#fff4d6',
    /** Grey voxel mountains, and the terracotta cliffs either side of the cages. */
    rock: ['#9a9fa6', '#8a8f96', '#a9adb2'],
    cliff: '#c4774a',
    trunk: '#7c4d29',
    leaves: ['#2fc53a', '#3ad646', '#27b134'],
    /** The caps of grassy blocks: hills and cliffs (materials.GRASS_COLOR). */
    grass: '#4fd93a',
  },
  {
    plaza: '#2b2742',
    apron: '#3f3a5e',
    apronEdge: '#5a547f',
    shopFloor: '#3b3753',
    path: '#4d4769',
    pathAlt: '#443e5f',
    pathEdge: '#6c5d9c',
    runnerEdge: '#d39bff',
    rock: ['#4b4559', '#3f3a4e', '#58516b'],
    cliff: '#4e2a66',
    trunk: '#2a2036',
    leaves: ['#7b35e6', '#9450ff', '#6326c4'],
    grass: '#4a2f86',
  },
]

/** The palette the lobby is being built in: world 1's until applyLobbyTheme says otherwise. */
export const PALETTE = { ...LOBBY_PALETTES[0] }

/** Switches PALETTE to world `world`'s colours (before the lobby is built: see World). */
export function applyLobbyTheme(world) {
  Object.assign(PALETTE, LOBBY_PALETTES[world] ?? LOBBY_PALETTES[0])
}

export const LIGHTS = {
  /** Fill from above (sky) and below (bounce off the grass). */
  hemiSky: '#ffffff',
  hemiGround: '#b9cba6',
  hemiIntensity: 2.1,

  sunColor: '#fff6e8',
  sunIntensity: 1.65,
  /**
   * Direction *towards* the sun: high and a little to the left, behind the default
   * camera, so the side of the character you look at is lit and its shadow falls
   * beside it where you can see it, not hidden behind its back.
   */
  sunDirection: [-0.35, 0.9, 0.25],
  /** 1 = shadows get no sunlight at all; lower = lighter shadows. */
  shadowIntensity: 0.7,
  /** Blur radius of shadow edges, in shadow-map texels. */
  shadowSoftness: 3,
}

/** World 2's lobby is under a violet night sky: a cool moonlight instead of the sun. */
export const NIGHT_LIGHTS = {
  hemiSky: '#c9bcff',
  hemiGround: '#3b2c5c',
  hemiIntensity: 1.7,
  sunColor: '#d9ccff',
  sunIntensity: 1.35,
}
