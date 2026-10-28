# Contract types and contacts deployment

This release adds Employee, Student and Internship contracts. Student is available only when every selected hiring profile is a university or school, and validators enforce the same rule. Choose the institution first to unlock Student. Existing contracts with no contract type continue to display as Employee without rewriting their records or signatures.

The profile CV and exported PDF group Employee records under Experience, Student records under Education, and Internship records under Internships. Existing manually entered education is retained. The type is part of the signed contract terms; editing uncredited contracts clears previous approvals as before. Fees, compensation behavior and scoring formulas are unchanged.

Contacts now has a + button for a WIN wallet address and a local display name. IDs may be 40 hexadecimal characters or the equivalent 64-character address ending in 24 zeros, with an optional 0x prefix. This is a wallet address, not a public profile record ID. Adding a contact does not send a transaction or notify that person. The Tolled contact heading is replaced with Contacts.

## Release prerequisites

These changes are local until committed and pushed. Publish the server and client changes to the branches checked out on the VPS before running `git pull`. Client version is `2026.1028.0008`. The client also depends on the preceding duration/memo changes currently staged in the working tree. Do not deploy only a subset of these files.

Both client and server repositories need updating. No new packages, database reset, bridge deployment, operator restart, proxy change or Caddy change is required for this release. All native validators must run the same updated server before using the new contract types.

## 1. Update the native server

Your server checkout is `/root/apps/server`. Check its branch and working tree first:

```bash
cd /root/apps/server
git branch --show-current
git status --short
```

If it reports local modifications, preserve and reconcile them before pulling; do not reset them. After the matching server changes are published and the checkout is clean, run this block. It stops on any error. The network stop waits for a shutdown checkpoint, which can take up to four minutes; the backup may also take time depending on ledger size.

```bash
(
  set -e
  cd /root/apps/server
  git pull --ff-only
  npm run compile
  npm run local:stop
  umask 077
  tar --exclude='instances-local/.pm2/*.sock' \
    -czf "/root/win-network-backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
    -C /root/apps/server instances-local
  npm run local:start
)
```

Keep `instances-local`, its manifest, keys and databases. Do not use `pm2 restart all` or delete the instances directory. The local-network command handles its own PM2 namespace and restores the saved network.

Allow the validators to form, then check:

```bash
cd /root/apps/server
npm run local:check
curl --fail --silent --show-error --max-time 15 \
  https://wallet.win-pskill.com/api/bridge/v2/status
```

Proceed when the native network is healthy and the bridge status is operational as it was before. PM2's `online` status alone does not establish readiness. If startup/check fails, inspect the local service logs and retain the data; do not reset the network or repeatedly restart it.

## 2. Update the wallet

Identify where PM2 serves the wallet:

```bash
pm2 describe win-wallet
```

Use the client repository containing `index.html`, `app.js`, `network.js` and `version.html`. Check PM2's working directory and script arguments; the served folder may be passed as an argument. Replace the path below with that actual client directory, and check local modifications as above before pulling.

```bash
cd /path/to/your/web-client
git status --short
git branch --show-current
git pull --ff-only
```

Only after the pull succeeds:

```bash
pm2 restart win-wallet
curl --fail --silent --show-error --max-time 15 \
  https://wallet.win-pskill.com/version.html
```

The response should be `2026.1028.0008`. Reload the browser and accept the wallet update. Deploy all client files, including the new `win-contract-types.mjs` and `win-contacts.mjs`; preserve your gateway settings in `network.js`. No client build or new dependency installation is needed.

## 3. Verify without spending funds

- Open Create contract: Employee and Internship are available; Student appears after choosing school/university hiring profile IDs.
- Open an existing contract: it still shows its terms and approval history, with Employee as the default type if none was stored.
- Open a profile and export its PDF: Education and Internships have their own sections.
- Open Contacts, use +, enter a WIN wallet address and name, then reload to confirm it was saved.
- A real contract submission uses the existing network fee. Previewing forms and exporting a PDF do not submit transactions.

## Validation and publication status

Client base: `136a4542b724fc1baf30a566fd9950110d934981`, branch `codex/win-bridge-wallet`, plus the staged prior duration/memo work and this release's working-tree changes.
Server base: `78a7e710c33e8a6fa563a029dd29a15e702baeb2`, branch `codex/win-bridge-fees`, plus this release's working-tree changes.

Companion tests: `/tmp/win-contract-types-tests`, branch `codex/contract-types-contacts-tests`, from published main `2fc3036c11900073e0616cf9ddcdf3cf233904e3`. Files in `local-tests/tests/`: `contract-types.test.mjs`, `contract-types-ui.test.mjs`, `contacts-ui.test.mjs`, and `win-ui-fixture.mjs`. Shared main lacks its documented AGENTS.md, local-tests/README.md and runner; tests were run directly. No live account or payment was used.

Checks:

- Server domain baseline: 21 passed; updated suite: 27 passed.
- Server TypeScript check and production build passed.
- New client browser tests: 6 passed (contract selection/review/CV plus contacts input/save/duplicate/session/storage/XSS checks).
- Contract type compatibility and PDF text grouping: 2 passed. Both rendered PDF pages visually inspected.
- Existing contract-duration browser tests: 3 passed.
- Existing workspace suite: 13 passed.

Commands, using `WEB_CLIENT_ROOT=/home/m_dev/win/web-client` for client tests:

```bash
node /tmp/win-contract-types-tests/local-tests/tests/contract-types.test.mjs
node /tmp/win-workspace-tests/local-tests/tests/win-workspace.test.mjs
```

Browser suites use `PLAYWRIGHT_MODULE=/home/m_dev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` and `PLAYWRIGHT_BROWSERS_PATH=/tmp/win-metamask-browsers`:

```bash
node --test /tmp/win-contract-types-tests/local-tests/tests/contract-types-ui.test.mjs /tmp/win-contract-types-tests/local-tests/tests/contacts-ui.test.mjs
node /tmp/win-contract-form-tests/local-tests/tests/win-contract-form.test.mjs
```

In the server checkout:

```bash
node node_modules/jest/bin/jest.js --runInBand --coverage=false test/proofOfSkill/behavior.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run compile
```

The companion commit attempt failed because the configured SSH signing key could not be unlocked and `ssh-askpass` is unavailable. Tests are saved and staged locally, with no new companion commit.

Publication still requires separate client, server and companion commits, topic pushes, linked client/companion PRs with companion targeting main, and review. Keep dependent tests on the topic branch until the client features reach main; rerun against that revision before merging and verifying companion integration. No PR has been created, and no VPS deployment has been performed.
