---
gameId: 1-muscle-to-push-boulder
clientDir: client
buildCommand: npm run build
distDir: client/dist
# Crushed by your boulder is a death: Boxity's death screen, and a Respawn button
# (back to the lobby) once its countdown is over.
canDie: true
# Leaderboards, declared by the client and scored by the server.
hasScore: true
leaderboards:
  - { id: muscle, label: Strongest, mode: best, format: compact, reset: none }
  - { id: rebirths, label: Most Rebirths, mode: best, format: number, reset: weekly }
  - { id: wins, label: Most Wins, mode: sum, format: compact, reset: weekly }
roomSize: 8
notApplicable:
  rewardedAds: The game has no reward a player could earn by watching an ad.
  gems: Nothing is sold for Gems - every price is in Wins, earned in the game.
  playWithFriends: Hosted on Boxity and joining through its matchmaker, so Boxity's own private rooms seat invited friends together; the game makes no private rooms of its own for CrazyGames' instant join.
---

# +1 Muscle to Push Boulder on Boxity

Where each piece of the Boxity integration lives:

| Feature | Where |
| --- | --- |
| Environment (prod / stage / local), every Boxity URL | `client/src/bloxity/env.js`, `server/src/boxity.js` |
| Sign-in, avatar and proportions (the one `onUserChanged`) | `client/src/bloxity/BloxityProvider.jsx` |
| Emotes, leaderboards, settings, ad breaks, player events, chat, Escape menu, screen ads | `client/src/bloxity/platform.js` |
| Death screen | `client/src/bloxity/deathScreen.js`, `client/src/ui/hud/DeathCard.jsx` |
| Hair, masks, neck / chest / waist / hand / shoe items, custom characters | `client/src/game/avatarItems.js`, `client/src/game/PlayerAvatar.jsx` |
| Emote playback | `client/src/game/emotes.js`, `avatarRig.applyEmote` |
| Chat bubbles | `client/src/game/speechBubbles.js`, `client/src/game/ChatBubbles.jsx` |
| Matchmaker, ?roomId= joins, rejoining after signing in, room and friend reporting | `client/src/net/connection.js` |
| Token check, guest progress, room directory, leaderboard scores | `server/src/boxity.js`, `server/src/rooms/GameRoom.js`, `server/src/db.js` |
| Deploy to prod and stage | `.github/workflows/deploy.yml` |
