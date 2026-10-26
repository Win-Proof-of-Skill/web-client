# Connect the HTTPS wallet to the local WIN proxy

## Confirmed cause

On 2026-10-26 the published wallet at `https://wallet.win-pskill.com` served
`network.js` pointing to `https://162.35.97.118:3030` and
`wss://162.35.97.118:3031`. A read-only request to the proxy's HTTP
`/network/parameters` returned 200 with WIN protocol JSON. The HTTPS connection
to port 3030 timed out. The wallet's public response identifies Caddy. Initially,
`https://wallet.win-pskill.com/api/network/parameters` returned 404.

After the owner added the Caddy routes, the HTTPS API returned 200 with WIN
protocol JSON. However, `/` and `/network.js` both returned 200 with empty bodies.
The supplied wallet site block lacks a fallback website handler. The owner
confirmed PM2 serves the wallet; its listening port still needs to be identified
with `ss -ltnp` on the VPS, then restored as the catch-all reverse-proxy target.

The old login toast said the gateway was down for any failed username lookup,
including certificate, connection, timeout and response errors. It now says the
gateway could not be reached. No wallet data or authentication rules changed.

## Apply on the server

Use the existing Caddy HTTPS site to forward API and WebSocket requests to the
local proxy. Caddy's HTTP/WS connections to loopback stay inside the server.
Visitors connect only through HTTPS/WSS on the wallet domain.

1. Copy `deployment/wallet-gateway.caddy` to
   `/etc/caddy/wallet-gateway.caddy` on the server.
2. Add this import **inside the existing** `wallet.win-pskill.com` site block in
   your Caddyfile, before its fallback website handler:

   ```caddyfile
   wallet.win-pskill.com {
       import /etc/caddy/wallet-gateway.caddy

       # REQUIRED: retain the existing website handler here.
       # For a PM2-served wallet, use the actual wallet port (not 3030/3031):
       # handle {
       #     reverse_proxy 127.0.0.1:ACTUAL_WALLET_PORT
       # }
   }
   ```

   This is an insertion example, not a complete site configuration. The comments
   serve no files: retain or restore the real website handler. Use `ss -ltnp` on
   the VPS to identify the PM2 wallet port before replacing `ACTUAL_WALLET_PORT`.
   The imported routes strip `/api` or `/ws`
   before forwarding. A request for `/api/network/parameters` reaches the proxy
   as `/network/parameters`. Caddy handles WebSocket upgrades automatically.
3. Validate and reload the actual Caddyfile (adjust the path if it differs):

   ```sh
   sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   sudo systemctl reload caddy
   ```

   If Caddy runs in Docker or under another process manager, use that deployment's
   validation/reload procedure. Container loopback is the container itself; use
   the proxy's internal service address when the two processes do not share a
   network namespace. Do not disable certificate verification.
4. Check the HTTPS route before deploying the updated client:

   ```sh
   curl --fail --max-time 15 https://wallet.win-pskill.com/api/network/parameters
   ```

   Expect protocol JSON with WIN and the client's network ID, not an HTML page.
   Also check `https://wallet.win-pskill.com/` returns the wallet HTML and
   `https://wallet.win-pskill.com/network.js` returns nonempty JavaScript; a 200
   response with no content means the fallback website handler is missing.
5. Deploy the updated `network.js`, `app.js`, and `version.html` together, then
   reload the wallet. The configured endpoints are now:

   ```json
   {
     "web": "https://wallet.win-pskill.com/api",
     "ws": "wss://wallet.win-pskill.com/ws"
   }
   ```

An HTTP-only proxy can keep its TLS setting disabled behind Caddy. Replacing
`http` with `https` on port 3030 does not enable TLS. Browser-side `localhost`
would refer to the visitor's computer, not the server.

The proxy response inspected during diagnosis still advertised the earlier
fixed `transferFee` protocol instead of `transferFeeBps: 50` and the configured
fee recipient. Deploy the matching updated WIN server before using the new
transfer-fee or bridge features. The bridge also needs its separate vault,
operator and reserve configuration; see [the bridge handoff](win-bridge-wallet.md).

## Validation and status

The two focused companion tests demonstrate the old IP/port routing failure and
exercise the actual username lookup with the corrected API prefix. The existing
24 security tests cover HTTPS enforcement and wallet protections. No live
transactions are part of these checks.

The companion tests live in `/tmp/win-https-gateway-tests` on
`codex/win-https-gateway-tests`, committed locally at
`a3392f295065f7514b07faee253434301eaaa7f5`, based on published companion main
`2fc3036c11900073e0616cf9ddcdf3cf233904e3`. Shared runner/instructions are missing
from that revision, so tests run directly with Node. The tested client base is
`11471eb3860081c063f9124f82898a7c7ac09bf0` plus this task's uncommitted changes.
Both new tests failed against the base revision and passed after the fix; all
24 existing security tests passed before and after. Syntax and whitespace checks
also passed. The test topic branch has not been pushed.

```sh
WEB_CLIENT_ROOT=/home/m_dev/win/web-client node /tmp/win-https-gateway-tests/local-tests/tests/win-https-gateway.test.mjs
WEB_CLIENT_ROOT=/home/m_dev/win/web-client node /tmp/win-security-tests/local-tests/tests/win-security.test.mjs
node --check app.js
node --check network.js
git diff --check
```

The owner supplied the live Caddy block in the conversation; Caddy is not
installed in this workspace. The public API route is now verified, but the PM2
wallet fallback, server-side validation and reload remain to be completed. The
wallet is not restored yet. Client commit, topic pushes,
cross-linked client/companion PRs, review, and revalidation against client main
before merging dependent tests also remain pending.

References: [Caddy path-prefix handling](https://caddyserver.com/docs/caddyfile/directives/handle_path),
[Caddy reverse proxy and WebSockets](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
