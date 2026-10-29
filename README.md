# Apex Grand Prix

A browser racing game in the style of modern Formula 1, built with three.js: eleven fictional teams, eight circuits,
career mode, free-play Grand Prix and time trial, with touch, keyboard and gamepad controls.

**Play / install:** https://4wscott.github.io/Apex-gp/ — on iPhone open it in Safari and choose Share → Add to Home Screen;
on Android use Chrome's Install app. The installed app works offline and picks up new versions on its next launch.

## Layout

| Path | What it is |
| --- | --- |
| `src/` | Game source: `data.js` (teams, tracks), `sim.js` (physics, AI, race), `gfx.js` (cars, scenery), `audio.js` (sound, input), `career.js`, `game.js` (app, menus, HUD), `shell.html` (page and styles) |
| `assets/` | Bundled CC0 assets: HDRI skies (`hdri.js`, Poly Haven) and photo textures (`photo.js`, Poly Haven and ambientCG), plus `make_photo.py` that produces it |
| `pwa/` | App manifest, offline worker and icons |
| `build.js` | Joins everything into `index.html` and the installable app in `site/` |
| `test/` | Node and Playwright checks |

## Build

```
node build.js
```

Pushing to `main` builds and deploys `site/` to GitHub Pages through `.github/workflows/pages.yml`.
