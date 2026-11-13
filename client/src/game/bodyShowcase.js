import { create } from 'zustand'

/**
 * Your own avatar, once its body is merged, offered to the body shop so every body on
 * show there is you in it (BodyShop, avatarRig.bakeShowcase): the rig, your Bloxity
 * proportions, and a version that ticks with every new offer (a new outfit). Null rig
 * until then, or wearing a custom character - the shop shows plain statues instead.
 */
export const useShowcase = create(() => ({ rig: null, proportions: null, version: 0 }))

export const offerShowcase = (rig, proportions) => useShowcase.setState((s) => ({ rig, proportions, version: s.version + 1 }))
