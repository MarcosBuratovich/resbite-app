# Resbite

Private development repository for the Resbite mobile app: React Native, Expo, TypeScript and Supabase. iPhone first, with Android planned. This is an initial foundation, not a tester-ready release.

## Start on your Mac

1. Clone this repository and open its folder in Codex or your editor.
2. Install Node 22.13+ and Xcode 26.4+ with its iOS components.
3. In `mobile`, run `npm ci`.
4. Copy `mobile/.env.example` to `mobile/.env.local`. Add the existing Resbite Supabase project URL and publishable key from the dashboard (project ref `ewcsgvhuojxdpaspwsrx`). Do not use a service-role key. Local environment files are intentionally not stored in GitHub.
5. Run `npm run check` inside `mobile`.
6. Connect Apple signing and a development iPhone before running `npx expo run:ios --device`.

The existing hosted Supabase database is shared across computers. Do not create another project or reapply the initial migration manually. Tester access remains closed until approved emails are supplied.

## Project contents

- [Mobile app and run instructions](mobile/README.md)
- [Implementation status and remaining work](docs/implementation-status.md)
- [Product knowledge base](START-HERE.md)
- [Backend schema and contracts](supabase/README.md)
- [Activity artwork provenance](mobile/content/asset-provenance.json)

Selected app artwork and fonts are included. The original 3.6 GB agency source archive is retained on the Linux machine and is not needed to build the app. Links into `source-materials/` in the knowledge base require that separate archive; its audit inventory/provenance is included here.

The Expo scaffold licence and individual font licences retain their original notices; they do not establish licence rights for the original agency artwork.
