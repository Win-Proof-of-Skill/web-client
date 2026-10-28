# WIN wallet changes and deployment handoff

## User-facing changes

- The login menu contains only **Restore from file**, **Help**, and **About**.
  Backup creation remains available after signing in. Manual lock and migration
  controls are removed; password encryption for saved wallets and backup files
  remains in place.
- File restore preserves the exact backup password, supports older backup JSON,
  handles usernames containing underscores, and does not clear the active wallet
  when no accounts were restored. A protected local wallet still requires its
  password before writing restored account data.
- Newly exported backups use `win-` for both single-account and all-account files.
  Restore does not depend on the filename, so `liberdus-` files remain supported.
- Chat, calls, Multichain and general EVM asset controls are retired. Existing
  contacts and native payment history remain available. BNB-chain WIN remains as
  the specific asset for funding and bridging. Shared legacy utility code and
  historical backup data have not been deleted.
- Native transfers and bridge conversions charge **0.5%**, rounded upward to an
  atomic unit. The existing fixed profile, contract and endorsement fees remain
  unchanged. These fees credit the native account
  `9fe734826be44b76f06d1d3262130dce45076a3c000000000000000000000000`.
- The bridge exchanges principal at **1 BNB WIN = 1 native WIN**. Depositing
  100 WIN receives 99.5 native WIN; withdrawing 100 WIN requires 100.5 native WIN.
  The review screen shows the WIN fee separately. BNB gas is additional.

## MetaMask wallet flow (2026-10-28)

Wallet now shows one spendable **WIN** balance and its estimated USD value.
The USD estimate uses the existing WIN network rate, not a new market-price feed.
Connect MetaMask with its browser extension or the MetaMask mobile browser.
The app requests account access and switches MetaMask to BNB Smart Chain (56).
The MetaMask address can differ from the app's signing address; connecting does
not replace or import the app's keys. No new wallet SDK or external scripts load.

- **Fund wallet:** enter WIN, review the 0.5% fee, then approve the exact token
  allowance and deposit in MetaMask. The existing bridge locks BNB-chain WIN and
  issues the corresponding native WIN in the background. A 100 WIN deposit adds
  99.5 WIN to the app balance. No initial native balance or reserve funding is
  required by the deposit-backed protocol.
- **Withdraw to MetaMask:** review the destination, amount and fee. The app signs
  the native withdrawal; after its committed record is verified, MetaMask signs
  the BNB release transaction. Withdrawing 100 WIN debits 100.5 WIN from the app
  and releases 100 WIN to the reviewed MetaMask account.
- Keep the transfer dialog open while confirmations finish. It advances each
  step automatically. **View transfers → Continue** resumes after closing or
  reloading. A canceled MetaMask prompt preserves the pending transfer. An
  interrupted response without a saved hash requires recovery using the exact
  transaction hash from MetaMask Activity, preventing a blind duplicate deposit.
- **Earlier deposits** retains access to WIN already sent to the app's old BNB
  receiving address. This path still needs BNB at that address for gas.

MetaMask needs BNB for gas; WIN cannot pay BNB network fees. Reviews keep the WIN
fee and BNB gas separate. Account/network changes invalidate a review, and
clearing the signed-in app account disconnects the local MetaMask session.

## Account selection and Receive (2026-10-28)

**Connect MetaMask** and **Change account** explicitly request account permission
so MetaMask presents its account picker, including for previously connected sites.
Canceling leaves the app disconnected instead of silently reusing an old account.
The selected account remains bound to transfer reviews and pending operations.
The implementation uses the injected provider's
[`wallet_requestPermissions`](https://docs.metamask.io/metamask-connect/evm/reference/json-rpc-api/wallet_requestPermissions/)
before reading the approved accounts.

**Receive** now contains only the WIN app address, its copy button, and a QR code.
The displayed, copied, and QR-encoded values are the same canonical WIN account
address (64 lowercase hexadecimal characters). Amount, memo, unit toggle, and
old username/payment links are removed from Receive. This is the app address;
BNB-chain funding still uses **Fund wallet** and the vault deposit flow.

The app scanner accepts the new address QR, verifies its account and username
mapping on the current network, and fills the recipient only. It continues to
accept old payment QR codes. Edited/closed forms ignore stale lookups, and a
changed recipient mapping cannot replace the reviewed destination.

Client tested: `codex/win-bridge-wallet` at
`f6914eaea5e4b70f94f723edf85d0e2ee7a2a08d` plus these working-tree changes and
the preserved recovery fix; version `2026.1028.0003` (`ad`). **29 tests passed**:
12 connector/storage, six address-QR, four existing bridge UI, three Receive
browser, one simulated funding/export browser round trip, and three existing
recovery browser cases. New picker, Receive, and scanner regressions failed
before their respective fixes. Syntax and whitespace checks passed. QR images
were decoded at original and displayed sizes; the mobile layout was inspected.
No live MetaMask extension or real transfer was tested. Server unchanged.

Companion files and exact commands:
`/tmp/win-account-receive-tests/local-tests/WALLET-ACCOUNT-RECEIVE.md`, branch
`codex/wallet-account-receive-tests`, based on published main
`2fc3036c11900073e0616cf9ddcdf3cf233904e3`. The shared main still lacks its
instructions and offline runner, so shared-runner setup remains unavailable;
focused suites ran directly. The companion commit failed because the SSH
signing key is locked and ssh-askpass is unavailable; its five files remain
staged with no new commit ID. Signing was not bypassed. Client/test commits,
pushes, linked PRs, review, and deployment remain pending. Rerun against merged client main before merging
the dependent companion tests.

## Deployment requirements

This wallet change is client-only. It uses the existing `deposit-backed-v1`
bridge endpoints, vault and operators; no server change or vault redeployment
is required. Publish all changed client assets, including `win-metamask.mjs` and
`version.html` (`2026.1028.0003`). The normal version refresh includes the new
module. The checkout already uses HTTPS/WSS gateway routes.

The deployed network must report a configured, enabled, operational bridge at
`/bridge/v2/status`, support deposit-backed issuance/burning, and have two
matching operators online. The client checks vault code, token, network, fees,
operator identities and signatures before progressing. Deployment readiness is
checked at runtime; no production services were changed or real coins moved in
this task. See the [server guide](../../server/bridge/README.md) for bridge setup.

## Old transaction recovery fix (2026-10-28)

Recovery now captures the entered hash before disabling form controls. Disabled
inputs are omitted from browser FormData, which previously caused the null
`trim` error even when a valid hash had been entered. Missing values now reach
the normal validation message. Recovery verifies the existing transaction and
preserves its pending operation; it does not create another deposit.

Three focused Chromium regressions failed before the fix and passed afterward:
old pending entry recovery, missing input, and rejection of a different
transaction destination. Client base: `f6914eaea5e4b70f94f723edf85d0e2ee7a2a08d`
plus this fix; version `2026.1028.0002` (`ac`). Server unchanged.

Companion tests and commands are in
`/tmp/win-metamask-recovery-tests/local-tests/RECOVERY-FORM.md`, branch
`codex/metamask-recovery-form-tests`, based on published main `2fc3036`.
The shared runner remains unavailable. The test commit was blocked by the locked
SSH signing key and missing ssh-askpass; its two files remain staged. Client
commit, topic pushes, linked PRs, review and deployment remain pending. Rerun
against merged client main before integrating the dependent companion test.

## MetaMask validation and publication

Client tested: branch `codex/win-bridge-wallet`, base
`74cf845d46aec4a87c1f8d72f4192e0c5518c0af` plus the current changes.
The server working tree was unchanged. **24 focused tests passed**, including an
offline Chromium round trip using the actual wallet markup, balance renderer,
MetaMask connector and bridge controller. Checks include both destinations,
fees, zero-prefunding deposits, canceled prompts, ambiguous-hash recovery,
storage-write failures and rollback,
account changes, old transfer compatibility, operator quorum, and mobile width.
Syntax checks and `git diff --check` also passed. No live MetaMask extension or
mainnet transaction was tested; browser approvals and network responses were
simulated. Node's pre-existing module-type warning is non-failing.

Companion worktree: `/tmp/win-metamask-wallet-tests`, branch
`codex/metamask-wallet-tests`, based on published `main` at
`2fc3036c11900073e0616cf9ddcdf3cf233904e3`. Files:

- `local-tests/tests/win-metamask.test.mjs`
- `local-tests/tests/win-wallet-ui.test.mjs`
- `local-tests/tests/win-bridge-protocol.test.mjs`
- `local-tests/tests/win-wallet-browser.test.mjs`

The shared branch still lacks `AGENTS.md`, `local-tests/README.md` and its offline
runner. That setup is unavailable; these tests were run directly, not through
an alternative shared branch. The companion `local-tests/METAMASK.md` records
commands and dependencies. The previous deposit-backed suite passed all 10 tests
at the client base before these behavior changes.

The companion commit attempt failed because the configured SSH signing key is
locked and `ssh-askpass` is unavailable. Tests remain staged on the topic branch;
no new test commit exists and signing was not bypassed. Client changes also
remain uncommitted.

Client/test publication, linked PRs targeting companion `main`, review and client
deployment remain pending. Keep the companion changes on their topic branch
until the client feature reaches client main, then rerun against that exact
revision before merging the tests. The older records below describe earlier
iterations and are retained for reference.

## Validation record: 2026-10-26

Implementation tested in these working trees, with uncommitted changes:

| Repository | Branch | Base revision |
| --- | --- | --- |
| Client | `codex/win-bridge-wallet` | `2336c1bf5a34047daa5141594d64e5a053381be4` |
| Server | `codex/win-bridge-fees` | `e09f0a357884fc6c934d3a2d32bb2f5dbaf9cc3b` |

Companion tests are committed locally on `codex/win-bridge-wallet-tests` at
`80cd1021c730a18ce75e640a6559686e1a08264f`, in
`/tmp/win-bridge-wallet-tests`. The isolated worktree started from published
`Liberdus/client-testing` main at `2fc3036c11900073e0616cf9ddcdf3cf233904e3`.
That shared revision lacks `AGENTS.md`, `local-tests/README.md` and the shared
runner, so shared-runner setup was unavailable. Focused suites were run directly.

| Check | Result |
| --- | --- |
| New wallet/menu/restore/filename suite | 10 passed |
| New bridge signature/ABI/resume suite | 6 passed |
| Existing feature topic suite | 13 passed |
| Existing security topic suite | 24 passed |
| Server proof-of-skill/payment/bridge suites | 54 passed |
| Compiled vault and operator tests on a local EVM | 3 passed |
| Server TypeScript, client syntax, whitespace checks | Passed |

Commands used (adjust paths if moving checkouts):

```sh
export WEB_CLIENT_ROOT=/home/m_dev/win/web-client
export WIN_SERVER_ROOT=/home/m_dev/win/server
node /tmp/win-bridge-wallet-tests/local-tests/tests/win-bridge-wallet.test.mjs
node /tmp/win-bridge-wallet-tests/local-tests/tests/win-bridge-protocol.test.mjs
node /tmp/win-workspace-tests/local-tests/tests/win-workspace.test.mjs
node /tmp/win-security-tests/local-tests/tests/win-security.test.mjs
node --check "$WEB_CLIENT_ROOT/app.js"
cd "$WIN_SERVER_ROOT"
./node_modules/.bin/jest test/proofOfSkill --runInBand --coverage=false
npm --prefix bridge test
./node_modules/.bin/tsc --noEmit
git diff --check
git -C "$WEB_CLIENT_ROOT" diff --check
```

Existing feature tests were read from their existing topic worktree, which has
uncommitted work based on `2fc3036c11900073e0616cf9ddcdf3cf233904e3`; that worktree
was preserved. Existing security tests are at
`2129dbd60296b132f295aab58e4d7152880132db`. The new companion files are
`local-tests/tests/win-bridge-wallet.test.mjs`,
`local-tests/tests/win-bridge-protocol.test.mjs`, and the synthetic browser fixture
`local-tests/tests/win-wallet-preview.py`.

The focused restore test failed against the old `app.js` because it trimmed a
password containing spaces, then passed with the fix. The companion README has
the reproducible command. No known focused-test failures remain; Node's existing
module-type warning is non-failing. This is not a full production security audit.

Browser checks confirmed the actual three-item login menu and direct file-restore
form. The synthetic wallet preview confirmed both fee review screens and the
absence of Multichain/EVM controls. It cannot submit transactions. No deployed
BNB/native-network or multi-validator end-to-end test has been performed.

## Historical review and publication notes (2026-10-26)

Client and server implementation changes still need separate commits. The test
commit is local only; no branches were pushed and no PRs were created. Publish
the topic branches, open and cross-link the client and companion PRs (companion
base `main`), link the server dependency, and complete review. Keep dependent
tests unmerged until the client features reach client main; rerun the focused
tests against that exact main revision before merging the companion PR. Verify
remote publication and final integration separately.
