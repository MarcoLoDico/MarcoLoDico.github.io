# Personal Website

Live at https://marcolodico.github.io/

An interactive globe in the style of a maps app: filter by category (Experience, Projects,
Education, Other work), search everything, and open any place for details. Every view has
a shareable URL, e.g. `/?place=shopify` or `/?category=projects`.

Built with React, TypeScript, Vite, and [MapLibre GL](https://maplibre.org/) using free
[OpenFreeMap](https://openfreemap.org/) tiles (no API key needed).

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run lint       # ESLint with type-checked rules
npm run typecheck
```

## Editing content

- `src/content/places.ts` — everything on the map: roles, projects, education, and their locations.
- `src/content/profile.ts` — name, bio, social links, and skills.
- `src/content/categories.ts` — category names, colours, and icons.

Places that share a location are fanned out around it automatically, so several projects can
point at the same site.

## Deploying

```sh
npm run deploy
```

Builds to `dist/` and publishes it to the `gh-pages` branch, which GitHub Pages serves.
