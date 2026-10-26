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
  The review screen shows the native fee separately. BNB gas is additional.

## Deployment status

The client and server implementation, vault contract, operator service and PM2
configuration are present. **The bridge is disabled and has not been deployed.**
The server's `src/config/bridge-v2.json` intentionally has no deployments.

Follow [the server deployment guide](../../server/bridge/README.md) to deploy the
vault, configure three independent operators and trusted native gateways, fund
the reserve with existing native coins, upgrade validators together, and perform
a controlled round trip. Two operator signatures are required. The design trusts
those operators and native gateways; it does not verify a BNB light client or
native consensus certificates. No real coins were moved during development.

The public gateway currently configured in `network.js` is HTTP-only and remains
blocked by the client's HTTPS policy. Supply the deployed HTTPS/WSS gateway
before using it publicly. No HTTPS endpoint was provided during this task.

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

## Remaining review and publication steps

Client and server implementation changes still need separate commits. The test
commit is local only; no branches were pushed and no PRs were created. Publish
the topic branches, open and cross-link the client and companion PRs (companion
base `main`), link the server dependency, and complete review. Keep dependent
tests unmerged until the client features reach client main; rerun the focused
tests against that exact main revision before merging the companion PR. Verify
remote publication and final integration separately.
