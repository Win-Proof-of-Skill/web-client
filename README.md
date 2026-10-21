# Win Proof of Skill Web Client

**Website:** [win-pskill.com](https://win-pskill.com)

The web client for the Win Proof of Skill (WIN-PSKILL) network: a transparent, end-to-end encrypted web application with a decentralized backend that prioritizes user privacy and security.

## Fork Notice

This project is a **fork of [Liberdus](https://github.com/Liberdus/liberdus)**, the secure texting web client built on the Shardus distributed ledger framework. We are grateful to the Liberdus team for the foundation this project builds on, including the client architecture and encryption design described below.

Win Proof of Skill is an independent project and is not affiliated with or endorsed by the Liberdus team. Original copyright and license notices from upstream are retained.

- Upstream project: [Liberdus/liberdus](https://github.com/Liberdus/liberdus)
- Upstream proxy server: [Liberdus/liberdus-proxy](https://github.com/Liberdus/liberdus-proxy)
- Upstream network server: [Liberdus/server](https://github.com/Liberdus/server)

## Overview

The client implements end-to-end encryption to keep conversations private. It is fully transparent: users can inspect the actual code running on their device through the About page in the app. Each message is encrypted independently using both classical encryption (ECDH) and post-quantum encryption (ML-KEM-1024).

Instead of a centralized backend run by a company, the network uses a blockchain operated by decentralized nodes, which anyone can join using a standard computer.

## Features

- Independent end-to-end double encryption for all messages, with both classical and post-quantum cryptography
- Web-based interface accessible from any modern browser
- No download or installation required
- No frameworks: pure HTML, JavaScript, and CSS for complete transparency
- Self-contained application with viewable source code on device
- Decentralized backend of community-operated nodes
- Open-source and community-driven development

## Demo

Live site: [win-pskill.com](https://win-pskill.com)

## Development Setup

### Prerequisites

- Git
- Node.js and npm (for development tools)
- A local HTTP server (such as Python's `http.server`, Node.js `http-server`, or any other of your choice)

### Installation

1. Clone this repository:

   ```bash
   git clone <YOUR-WIN-PSKILL-WEB-CLIENT-REPO-URL> win-pskill-web-client
   cd win-pskill-web-client
   ```

2. Install development dependencies (for linting and formatting):

   ```bash
   npm install
   ```

3. Start a local HTTP server in the cloned repository folder.

   Using Python:

   ```bash
   python -m http.server
   ```

   Or using Node.js `http-server`:

   ```bash
   npx http-server
   ```

4. *(Optional)* Run a local proxy server (similar to an RPC server in Ethereum). This is not required, since you can configure the client to use an existing remote proxy server. To set up your own, see [liberdus-proxy](https://github.com/Liberdus/liberdus-proxy) or your Win Proof of Skill proxy repository.

5. *(Optional)* Run a local network of validator and archive nodes. This is not required if you configure the web client to use a remote proxy server. To set up your own local network, see the Win Proof of Skill server repository (a fork of [Liberdus/server](https://github.com/Liberdus/server)).

6. Configure the `network.js` file. If you are running your own proxy server, see `network.js_loc` for how the `gateways` field should be set. If you are using the default proxy server, no changes are needed.

7. Open the application in your browser at `http://localhost:8000` (or whichever port your HTTP server uses).

## Architecture

The application consists of four main components:

1. **Web Client**: Pure HTML, JS, and CSS files that run in the browser and handle encryption and decryption of messages
2. **Proxy Server**: Manages message routing and delivery without ever having access to the unencrypted content; works like RPC servers in Ethereum
3. **Validator Nodes**: Provide redundant, sharded storage of the application state, and consensus on new transactions that change the state
4. **Archive Servers**: Provide long-term storage of transaction history

## Contributing

We welcome contributions from the community! To contribute:

1. Fork the repository using the `Fork` button at the top right of the repository page
2. Clone your fork: `git clone https://github.com/your-username/repo-name.git`
3. Create a new branch: `git checkout -b my-new-branch`
4. Make your changes
5. Test thoroughly
6. Commit your changes: `git add .` then `git commit -am 'Add some feature'`
7. Push to the branch: `git push origin my-new-branch`
8. Submit a pull request: from your fork, click `Compare & pull request`

If a fix or feature is relevant to the shared codebase, please consider contributing it upstream to [Liberdus/liberdus](https://github.com/Liberdus/liberdus) as well.

### Code Style

The project has ESLint and Prettier configured, but they are not currently enforced. Try to keep your code style consistent with the existing code. In the future, linting and formatting rules will be applied automatically on save in VS Code.

**VS Code setup** (can be skipped for now):

- Install the ESLint and Prettier extensions
- The project includes VS Code settings that format your code on save

**Manual commands** (can be skipped for now):

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix

# Format code with Prettier
npm run format

# Check if code is properly formatted
npm run format:check
```

**Git blame and linting:**

To preserve meaningful git blame history, this project uses `.git-blame-ignore-revs` to ignore linting and formatting setup commits. Git is configured to ignore these commits automatically:

```bash
# View blame ignoring linting setup commits (automatic)
git blame <filename>

# Manual usage if needed
git blame --ignore-revs-file .git-blame-ignore-revs <filename>
```

## Security

Security is our top priority. If you discover a security vulnerability, please report it responsibly by emailing **<YOUR-SECURITY-EMAIL>** instead of opening a public issue.

## Contact

- Website: [win-pskill.com](https://win-pskill.com)
- Community: <YOUR-COMMUNITY-LINK>

## License

This project inherits the license of the upstream Liberdus repository. See the `LICENSE` file for details.
