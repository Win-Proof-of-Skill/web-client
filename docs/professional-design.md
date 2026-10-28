# WIN professional pages

Client version: `2026.1028.0009`.

This redesign changes only the web client. It keeps the WIN logo and emerald palette, with a desktop navigation bar, left workspace rail, readable content cards, larger type and full-length scrolling. On smaller screens the navigation becomes a compact two-row header and the content uses the available width. Messaging remains retired.

## Pages and retained actions

- `#/profiles`: searchable public profiles and My profiles.
- `#/profiles/<profile-id>`: individual profile, CV, proof score, endorsements, PDF export, profile ID and edit actions.
- `#/contracts`: public contracts, with a separate My contracts & approvals tab. Public results paginate.
- `#/contracts/<contract-id>`: complete record, edit, sign/request approval, and eligible hiring-party approval/rejection.
- `#/contacts`: the local contact book, including the + form and existing contact actions.
- `#/wallet`: existing balance, MetaMask, funding, withdrawal, send, receive and history flows.
- `#/statistics`: public profile, contract, endorsement and skill counts, plus profiles per skill.

Hash routes require no web-server rewrite rules. A profile/contract link is restored after signing in; this release does not introduce an unauthenticated login bypass. Browser Back and Forward work between pages. Editing and signature review remain dialogs. Public records, fees, signatures and wallet handling use the existing APIs.

The redesign also repairs an existing endorsement form reference to an out-of-scope duration variable so its original validity control can reach signature review. Closing a profile edit restores the original profile context for PDF export. Stale page loads cannot replace a newer page.

## Statistics

Totals come from existing directory responses. Contracts and endorsements include all published records, including completed, expired and revoked records. Each profile counts once per registered skill, even if duplicate skill references occur. Registered skills with zero profiles are included.

Profiles and skills are scanned with pagination, up to 10,000 records each. Incomplete, inconsistent, capped or failed scans do not produce a claimed complete distribution. Available totals remain visible and missing results are labeled unavailable. Counts are read at refresh time; separate directories are not an atomic network snapshot. No server endpoint, database or scoring change was added.

## Deployment

Publish the client changes first. This working tree includes the preceding contract-type/contacts feature work; preserve it when committing. No changes to the server were made for this redesign, and this release requires no server rebuild, validator restart, bridge deployment or Caddy configuration change. Keep the already configured gateway in `network.js`.

On the VPS, use `pm2 describe win-wallet` to identify the served client directory. It must contain `index.html`, `app.js`, and `version.html`. In that directory, after checking and preserving any local modifications:

```bash
git status --short
git pull --ff-only
```

After a successful pull:

```bash
pm2 restart win-wallet
curl --fail --silent --show-error --max-time 15 \
  https://wallet.win-pskill.com/version.html
```

The response should be `2026.1028.0009`. Reload the browser and accept the update. Deploy the complete client including `win-professional.css`, `win-navigation.mjs`, and `win-statistics.mjs`; the reload list includes them. No npm install or client build is needed.

## Validation and review handoff

Client base: `412171e673bc65611702b7a5b4f664ae8c2891e5` on `codex/win-bridge-wallet`, plus existing feature changes and this redesign. Prior local changes were preserved. The four previously modified server source/test files were hashed before and after; all hashes are unchanged.

Companion: `/tmp/win-professional-tests`, branch `codex/professional-pages-tests`, based on published main `2fc3036c11900073e0616cf9ddcdf3cf233904e3` from `Liberdus/client-testing`. Shared main still lacks its documented AGENTS.md, local-tests/README.md and runner, so focused tests run directly.

New companion files in `local-tests/tests/`: `win-statistics.test.mjs`, `win-navigation.test.mjs`, `win-professional-ui.test.mjs`, `win-footer-pages.test.mjs`, `win-browser-harness.mjs`, and `win-ui-fixture.mjs`.

- 14 statistics cases: exact counts, pagination, deduplication, zero-use skills, partial failures, stale requests, inconsistent data and escaping.
- 6 route cases: allowed routes, invalid IDs, history, signed-out links and resumption.
- 8 workspace browser cases: page links, history, editing, PDF export after canceling edits, endorsements, contracts, approvals, partial stats and responsive layout.
- 2 real Footer browser cases: actual navigation controller integration and wallet dialog/navigation layout.
- 13 existing workspace cases covering money precision, metadata fees, wallet funding validation and PDF behavior.
- Syntax and whitespace checks passed. Desktop/tablet/mobile layouts visually checked at 1440, 1024 and 390px, including Send, Receive, Settings and welcome screens.

Tests use synthetic data and no live wallet or transaction. The real Footer is tested with synthetic account/service boundaries; full production account initialization and live gateway connectivity are outside these offline checks.

Commands (all client tests use `WEB_CLIENT_ROOT=/home/m_dev/win/web-client`):

```bash
node /tmp/win-professional-tests/local-tests/tests/win-statistics.test.mjs
node /tmp/win-professional-tests/local-tests/tests/win-navigation.test.mjs
node /tmp/win-workspace-tests/local-tests/tests/win-workspace.test.mjs
```

Browser tests additionally use `PLAYWRIGHT_MODULE=/home/m_dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` and `PLAYWRIGHT_BROWSERS_PATH=/tmp/win-metamask-browsers`:

```bash
node --test /tmp/win-professional-tests/local-tests/tests/win-professional-ui.test.mjs /tmp/win-professional-tests/local-tests/tests/win-footer-pages.test.mjs
```

The companion commit attempt was blocked by the unavailable SSH signing-key prompt (`ssh-askpass` missing). Test files remain saved and staged on the topic branch; no new companion commit was created.

Pending: separate client and companion commits, topic pushes, linked PRs (companion targeting main), review and deployment. Tests depending on new client features must remain on their topic branch until those features reach client main, then be rerun against that revision before companion merge and verification. Nothing has been pushed or deployed by this task.
