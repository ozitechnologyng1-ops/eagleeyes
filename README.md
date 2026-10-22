# Eagle Eye Vite+ evaluation copy

This is the Vite+ evaluation copy of Eagle Eye, a React and TypeScript election management frontend. It contains state branding for Lagos and Ogun and connects to an existing Supabase backend. Do not use this copy to modify production data or deploy it as a replacement for the original application.

## Stack

React 19, TypeScript, Vite+ 1.2.0, Tailwind CSS 4, Supabase JavaScript client, and Vitest through Vite+.

## Setup and commands

Install Node.js and pnpm, then run `pnpm install` in this directory. The project uses `pnpm-lock.yaml` and the Vite+ catalog in `pnpm-workspace.yaml`.

| Task                         | Command                        |
| ---------------------------- | ------------------------------ |
| Local development            | `pnpm exec vp dev --port 5174` |
| Format, lint, and type check | `pnpm exec vp check`           |
| Tests                        | `pnpm exec vp test`            |
| Production bundle            | `pnpm exec vp build`           |

On Windows, `node_modules\\.bin\\vp.cmd` can be used if `vp` is not on `PATH`.

Configure `VITE_CLIENT_BRAND` as `lagos` or `ogun` to override hostname branding. Otherwise the hostname selects the state, with default Eagle Eye branding for unknown hosts. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` select the Supabase project; use only a public/publishable client key. Do not place service-role keys or private API secrets in `VITE_` variables. The current SMS and image-scanning flows still need a server-side credential review before production use.

See [migration findings](docs/MIGRATION.md) and [test coverage](docs/TESTING.md) for current results and limits. The repository includes Vercel and Netlify routing configuration, but this evaluation copy has not been deployed.
