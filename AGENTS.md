# Repository instructions

- The user wants all changes delivered directly to `main`. Use the existing checkout and do not create feature branches unless the user explicitly requests one. Preserve remote changes and never force-push.
- Before pushing application changes, run the relevant tests and production build. The GitHub Actions workflow validates and deploys `main` to GitHub Pages.
- Preserve the documented Knihovny.cz API contract. Never call the live catalogue from the cloud environment; use the supplied fixture in tests. Do not introduce a proxy, backend, API key, or alternate bibliographic data provider. Cover images may come from Open Library Covers API, as authorized by the user; unavailable covers must be labelled and may be replaced with a local user-uploaded image. Keep existing library data under `folio.books.v1` across the Shelfless rename.
