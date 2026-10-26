# Restore an existing backup file

Choose **Menu → Restore from file**, select the backup, and click **Restore
Account**. WIN and older Liberdus JSON backups are supported; the filename prefix
does not affect import.

- **File Password** is the optional password chosen when exporting the file.
- **Original Wallet Password**, when requested, is the wallet password from the
  device that created the backup. It may differ from the file password.
- If this browser needs a wallet password set or unlocked, that dialog appears
  above Restore. Completing it resumes the import with the same file. Canceling
  leaves the selected file available for retry.
- Existing accounts are kept unless **Overwrite existing accounts** is selected.
- After a successful import, **Account restored** shows the count. Click
  **Continue to sign in** to reload with the restored accounts available.

Restore preserves each account's original network ID. If a backup is from another
network, the result explains that its accounts are saved locally but will not
appear in the current network's sign-in list. Restore does not create on-chain
accounts, move funds between networks, or require the gateway to read the file.

## Fix and verification

The restore panel appeared later in the HTML than the password dialogs. With
equal stacking priority it covered the required password prompt, making Restore
appear unresponsive. Password dialogs now stack above the form. Successful
restore now has an explicit completion panel rather than a sticky toast whose
dismissal was required to continue.

Version `2026.1026.0005` must deploy `app.js`, `index.html`, `styles.css`, and
`version.html` together. This working-tree fix has not been deployed by the agent.

Tested client branch `codex/win-bridge-wallet`, base
`85e0f6e5d4f7d345c1c5012e4f6053e7efeeb867` plus this task's uncommitted changes.
All **40 focused tests passed**: 6 new restore tests, 10 existing wallet/menu
tests and 24 security tests. Syntax and whitespace checks passed. Browser checks
reproduced the covered prompt before the fix, verified it appeared above Restore
afterward, verified cancellation kept the file selected, and checked the visible
success panel using a synthetic backup in the offline preview. No real wallet
backup or password was used.

```sh
export WEB_CLIENT_ROOT=/home/m_dev/win/web-client
node /tmp/win-file-restore-tests/local-tests/tests/win-file-restore.test.mjs
node /tmp/win-bridge-wallet-tests/local-tests/tests/win-bridge-wallet.test.mjs
node /tmp/win-security-tests/local-tests/tests/win-security.test.mjs
node --check app.js
git diff --check
```

New companion files are `local-tests/tests/win-file-restore.test.mjs` and
`local-tests/tests/win-restore-preview.py`, on `codex/win-file-restore-tests` in
`/tmp/win-file-restore-tests`. Its README records before/after evidence. Test
commit `fffa4efda38adab76ead9a39551148ff6f82faa5` is saved locally only (not pushed).
Published companion main `2fc3036c11900073e0616cf9ddcdf3cf233904e3` has no shared runner or
instructions, so the focused suites ran directly. Existing wallet tests are at
`80cd1021c730a18ce75e640a6559686e1a08264f`; existing security tests are at
`2129dbd60296b132f295aab58e4d7152880132db`. No known focused-test failures remain.

Client commit, topic pushes, linked client/companion PRs, review and deployment
remain pending. The companion PR should target `main`, link the client PR, and
remain unmerged until its client features land; revalidate against client main
before merging tests. Local test commits do not publish or integrate them.
