# React + Vite

## Movie lifecycle metadata

Movie records live under `markets/{market}/movies/{movie-id}`. Keep the existing
date-keyed report snapshots in place and add these sibling fields to each movie
record:

```json
{
  "name": "Example Movie",
  "lifecycleStatus": "coming_soon",
  "releaseDate": "2026-12-18",
  "2026-12-18": {
    "master_shows_data": {}
  }
}
```

Use the same fields under both `markets/usa/movies` and `markets/india/movies`.
`lifecycleStatus` is required for an explicit shelf and must be one of
`coming_soon`, `now_playing`, or `ended`. Set it to `now_playing` when the
movie releases and to `ended` when it leaves its active run. `releaseDate` is
optional, uses `YYYY-MM-DD`, and is displayed on the movie card (upcoming
titles are sorted by this date).

Do not move or rename the existing date-keyed sales snapshots. The app treats
only `YYYY-MM-DD` child keys as report dates, so lifecycle fields remain movie
metadata rather than appearing in the date selector. Until a movie has a
date-keyed report, it appears in its lifecycle shelf but its report card is
not clickable. Movies without `lifecycleStatus` continue to use the existing
legacy archive list as a fallback; all other unclassified movies default to
`now_playing`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
