# WIN client security

The client escapes untrusted contact names, search matches, file names, account
labels, and transaction labels before rendering HTML. Public WIN responses also
validate record IDs, revisions, scores, page cursors, and the collection shapes
used by the interface. Search only includes public contact fields, never avatar
keys or arbitrary sender metadata.

`index.html` includes a Content Security Policy that disallows inline scripts,
inline event handlers, dynamic code evaluation, embedded objects, and base URL
changes. The existing interface still requires inline styles. Scripts, workers,
fonts, and PDF libraries load from the app's own origin.

## Wallet passwords

Creating, restoring, migrating, or signing into an unprotected wallet first opens
password setup. New passwords must have at least 12 characters. Existing locked
accounts remain compatible with their existing password. Password removal is no
longer offered.

Account saves require an unlocked encryption key; failure never falls back to
plaintext. Password setup and changes prepare and verify every account before
writing, including orphaned account entries. On a storage error, successful writes
are rolled back. Browser termination or persistent storage failure during a
multi-record update cannot be made atomic with localStorage; keep account backups.
Restores validate and re-encrypt account data even when the backup uses the same
password marker. Signing out clears the in-memory encryption key.

The existing password derivation and authenticated encryption format are retained
for backup compatibility. This protects stored accounts while locked; it cannot
protect an unlocked wallet from malicious code running in the same origin. These
fixes address the identified vulnerabilities and are not a complete security audit.

## Development and deployment

Public app and gateway connections require HTTPS and WSS. HTTP/WS is permitted
only when both the app and gateway are on loopback (`localhost`, `127.0.0.1`, or
`[::1]`). For local development, configure the local gateway and its actual
`netid`/`netids` in `network.js`; a local app does not make a public HTTP gateway
safe. The currently configured public IP endpoints are legacy HTTP/WS addresses
and will be rejected until secure endpoints are configured. No deployment address
has been supplied yet.

Username availability checks time out after 10 seconds and report connection
failures. Creating a username still needs a reachable gateway on the configured
network.

Before public deployment, terminate TLS with a valid certificate for the app and
gateway. Serve the policy from `index.html` as a `Content-Security-Policy` response
header as well, remove its loopback connection exceptions for production, and add
`frame-ancestors 'none'` to that header. The latter cannot be enforced through the
HTML meta policy. Set `X-Content-Type-Options: nosniff`, `Referrer-Policy:
no-referrer`, and `X-Frame-Options: DENY`. Serve only public client assets, without
repository metadata, environment files, backups, or account data. Revalidate the
deployed gateway and browser flows before using real funds.
