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

## Voter register

The register searches all accessible matching database records before pagination. It displays 500 voters per page and fetches one extra row to determine whether another page exists. Names and phone numbers are searched on the server, including multiword names; WhatsApp/reach filters still apply only to the displayed page.

Voter rows load independently of the exact total. The count beneath the filters shows cumulative progress such as `500 / 200,000`, then `1,000 / 200,000`; totals up to 500 appear as one number. While counting, the list remains usable and the total is marked as pending. A failed count shows `total unavailable` and `Retry total` without hiding successfully loaded voters or presenting the result as empty.

Normal next/previous navigation uses saved row-ID cursors instead of scanning skipped rows. A direct request for a page without a known cursor falls back to an ordered offset. Exact totals may be reused for 30 seconds during pagination within the same active filters and agent session. First-page reloads recount; changing filters or sessions resets the saved state, and voter edits invalidate the cached count. Counts are never substituted with estimates or the current page length, except when the first page contains every matching row.

Search waits 250 ms after typing. Superseded row, count and dashboard-stat requests are cancelled. Temporary network/service failures retry once after 750 ms; permission, validation and database errors do not retry automatically. A row-loading failure shows a short message and Try again, distinct from a successful empty search. The displayed request duration measures when the row page is ready, excluding the subsequent background count.

Existing agent sessions and database row-level security remain required. No database functions, indexes or permissions are deployed by these client changes. Automated request tests cover shared filters for rows/counts, cursor bounds, early row delivery, count failures and cancellation; authenticated browser latency and visual checks must be verified separately.
