// WIN application network. Replace the legacy public HTTP/WS endpoints with HTTPS/WSS before deployment.
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
      "web": "https://162.35.97.118:3030",
      "ws": "wss://162.35.97.118:3031"
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
