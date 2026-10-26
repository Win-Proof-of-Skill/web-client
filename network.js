// WIN application network. Caddy forwards these public HTTPS/WSS routes to the local proxy.
// Install deployment/wallet-gateway.caddy in the wallet site's Caddy block before deploying this config.
// Local development may use HTTP/WS only when both the app and gateway are on loopback.
// Keep netid/netids aligned with the selected gateway; do not mix development and public networks.
const network = {
  "name": "WIN",
  "netid": "79c84dc9448c0069b6866af47d0f6746f0c4b60c4c66f8c9a675765d1c75c971",
  "netids": [
    "79c84dc9448c0069b6866af47d0f6746f0c4b60c4c66f8c9a675765d1c75c971"
  ],
  "gateways": [
    {
      "web": "https://wallet.win-pskill.com/api",
      "ws": "wss://wallet.win-pskill.com/ws"
    }
  ],
  "payment": {
    "transferFeeBps": 50,
    "feeRecipient": "9fe734826be44b76f06d1d3262130dce45076a3c000000000000000000000000"
  },
  "bridges": [],
  "faucetUrl": "",
  "faucetAddress": [],
  "farmUrl": "",
  "validatorUrl": "",
  "attachmentServerUrl": "",
  "bridgeUrl": "",
  "app_version": {
    "ios": "2025.1211.1145",
    "android": "2025.1211.1145"
  },
  "googleDrive": {
    "oauthServerUrl": "",
    "backupFolder": "WIN_backup"
  }
};
