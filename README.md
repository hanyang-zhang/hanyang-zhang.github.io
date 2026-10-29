# hanyang-personal

Hanyang Zhang's personal homepage: a frosted-glass page floating over a living
3D forest (three.js), with a flock of egrets that scatter from the cursor.
Built with Astro, so it ships as a static site.

## Run it

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
```

## Change the content

Everything on the page — bio, news, research, publications, projects,
background, contact — lives in [`src/data/profile.ts`](src/data/profile.ts).
Add or edit entries there; the page template doesn't need to change.

## Where things are

| Path | What |
| --- | --- |
| `src/pages/index.astro` | Page layout and styles |
| `src/styles/global.css` | Colours (day and night), fonts |
| `src/components/Meadow.astro` | Mounts the 3D background |
| `src/scripts/meadow.ts` | 3D engine: camera, pointer, scroll, day/night, and the list of styles |
| `src/scripts/worlds/canopy.ts` | Default scene: forest canopy, cloud shadows, egrets |
| `src/scripts/worlds/grass.ts` | Grass meadow scenes (`meadow`, `ghibli`, `pixel`) |
| `src/scripts/worlds/voxel.ts` | Minecraft-style scene |
| `src/scripts/worlds/shared.ts` | Shared uniforms, wind and fog shader code |

## Background styles

The default is `canopy`. Others can be previewed with a query string:
`?style=meadow`, `?style=ghibli`, `?style=pixel`, `?style=minecraft`.
To add a new one, write a world in `src/scripts/worlds/` and register it in
`STYLES` in `src/scripts/meadow.ts`.

The scene pauses when the tab is hidden and renders a single still frame for
visitors who prefer reduced motion.
