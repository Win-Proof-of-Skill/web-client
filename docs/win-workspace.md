# WIN proof-of-skill workspace

The client now opens the WIN profile directory after wallet sign-in. The emerald
and white identity, geometric seal, welcome screen, responsive directory,
contracts workspace, wallet panels, and exported profiles follow the WIN logo.
Existing account creation, encrypted account storage and backups
remain the account boundary. Messaging is retired. The workspace receives public identity only;
`app.js` retains signing access.

## Available flows

- Create an app wallet and copy its WIN public address from Wallet.
- Connect MetaMask to fund the spendable WIN balance from BNB Smart Chain or
  withdraw WIN back to MetaMask. The token is
  `0x8a27363dd26f78b09014338e106b16055fcb9799`, chain ID 56, 18 decimals.
  The bridge handles native issuance/burning in the background; the UI shows one
  WIN balance and estimated USD. See the [wallet handoff](win-bridge-wallet.md)
  for fees, pending transfers, and deployment requirements.
- Create and update person, company, organization, government, university, or
  school profiles. Add registered skills to person profiles; existing CV fields
  are retained on edits and shown in profile details.
- Search by name, professional title, industry, work-history title, or registered
  skill name. Explore all profiles or filter to profiles controlled by the wallet.
- View the exact committed proof score, work records, and skill endorsements.
- Download a paginated profile PDF containing public profile details, score,
  contracts, endorsements, record IDs, network, and export date. It is generated
  locally. The bundled DejaVu font supports many scripts; unsupported characters
  produce an explicit error instead of corrupting the document.
- Create new or historical work contracts, record outcomes, edit uncredited
  terms, sign approval requests, and approve or reject exact terms as an eligible
  hiring-profile controller. Compensation describes the agreement; it does not
  pay salaries or create escrow.
- Register skills and sign time-limited endorsements. Endorsements require an
  existing claimed skill, an independent subject, and control of the endorsing
  profile. Duplicate live endorsements are rejected. They provide evidence;
  aggregate scores continue to use the established contract-outcome protocol.

## Deployment and funding

Deploy the changed client and the matching `win/server` code. Every validator
must support the same transaction types. The server exposes `proofOfSkill`
fee rules in `/network/parameters`, and paginated `/profiles`, `/contracts`,
`/skills`, and `/endorsements` directories. Existing record-by-ID endpoints remain.
New registries are created lazily; a missing registry returns an empty directory.
Exceptions and malformed registry state remain errors.

The gateway in `network.js` must point to that upgraded network. An HTTPS client
requires HTTPS/WSS endpoints; the checkout uses the wallet's HTTPS/WSS routes.

Funding and withdrawals require the existing operational deposit-backed bridge.
No initial native balance or prefunded native reserve is needed. MetaMask pays
BNB gas and approves the exact token allowance before a vault deposit. Pending
operations remain in the encrypted app account and can be resumed after reload.
The [wallet handoff](win-bridge-wallet.md) is the current funding reference.

## Original workspace validation and review record

Tested client base: `9bbe785f3e04ed4e94674cddb8ea1b6129a3506d` plus this working tree.
Tested server base: `face5925069917f23d370637778dc18c88788087` plus this working tree.
Both checkouts already contained changes before this task; they were preserved.

Companion repository: `Liberdus/client-testing`, published `main` base
`2fc3036c11900073e0616cf9ddcdf3cf233904e3`. Its published branch does not contain the
AGENTS.md, local-tests/README.md, or offline runner described in the client guide.
That setup is unavailable; no alternative shared branch was substituted.
Focused tests and the synthetic browser fixture are in the isolated topic
worktree `/tmp/win-workspace-tests`, branch `codex/win-workspace-tests`:

- `local-tests/tests/win-workspace.test.mjs`
- `local-tests/tests/win-ui-fixture.mjs`
- `local-tests/tests/win-ui-preview.py`

Run focused client tests directly with Node 20.19+:

```sh
WEB_CLIENT_ROOT=/home/m_dev/win/web-client node /tmp/win-workspace-tests/local-tests/tests/win-workspace.test.mjs
```

Result: 13 passing tests covering exact amounts, calldata, fee sizing, receipt
binding, profile preservation, funding failures, and PDF generation/pagination.

From `/home/m_dev/win/server`:

```sh
./node_modules/.bin/jest --runInBand --coverage=false --silent test/proofOfSkill
./node_modules/.bin/tsc --noEmit
```

Result: 49 tests passed; type checking passed. The pre-change baseline was
39 passing tests. New tests are in `test/proofOfSkill/directory.test.ts`.
The fresh-network directory test failed with HTTP 503 before its fix and passed
with an empty HTTP 200 directory afterward. No known baseline failures.

Manual browser checks used synthetic accounts, with no real transaction signing:
profile creation and review, title/skill search, profile details, endorsement
review, contract creation, employer approval and request-hash binding, offline
recovery, wallet addresses, funding review, direct PDF download, and desktop/phone
layouts at 390 px width. A long Unicode profile PDF was generated and both pages
were rendered and visually inspected. Real WIN funding and native validator
consensus were not exercised end to end.

Remaining publication steps: commit the task's client/server changes on topic
branches; push the companion topic branch; create and cross-link client and
companion PRs; review them; deploy the compatible server/client; perform a
user-approved live funding smoke test. Keep dependent companion tests unmerged
until the required client features are on main, then rerun against that revision
before merging the companion PR. No topic branch was pushed by this task.

## Vendored PDF assets

PDF assets load only when exporting, and are refreshed with other versioned
assets: pdf-lib 1.17.1 (MIT), @pdf-lib/fontkit 1.1.1 (MIT, a local ES-module adapter
around its UMD distribution), and DejaVu Sans. Attribution and font licenses are
alongside the files in `external/` and `fonts/`.

Companion commit status: the local commit attempt was blocked by the configured
SSH commit signer (the private key was not unlocked and no askpass program was
available). The four companion files remain staged on `codex/win-workspace-tests`;
no new companion commit exists. Unlock the configured signing key and commit
before pushing/opening its PR. Commit signing was not disabled.
