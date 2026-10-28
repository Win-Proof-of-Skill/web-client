import { WIN_TOKEN, parseAmount, formatUnits } from './win-domain.mjs';
import { validateBridgeConfig, quoteBridge, verifyVault, verifyOperatorsReady, encodeCall } from './win-bridge.mjs';
import { advanceBridge } from './win-bridge-flow.mjs';
import { createMetaMask, recoverMetaMaskTransaction } from './win-metamask.mjs';
import { escapeText as esc } from './win-security.mjs';

export function createBridgeUI(api) {
  const dialog = document.getElementById('winBridgeDialog');
  const body = dialog.querySelector('.win-dialog-body');
  const status = dialog.querySelector('[role=status]');
  let busy = false,
    reviewed = null,
    direction = 'in',
    source = 'metamask',
    timer = null,
    run = 0;
  const stop = () => {
    run++;
    clearTimeout(timer);
    timer = null;
  };
  const wallet =
    api.wallet ||
    createMetaMask({
      onChange: () => {
        reviewed = null;
        document.getElementById('winBridgeReview')?.replaceChildren();
        stop();
        renderConnection();
      },
    });
  function renderConnection() {
    const address = wallet.address();
    const field = document.getElementById('winMetaMaskAddress');
    if (field) field.textContent = address || 'No wallet connected';
    const connect = document.querySelector('[data-win-connect-metamask]');
    if (connect) connect.textContent = address ? 'Reconnect MetaMask' : 'Connect MetaMask';
    const disconnect = document.querySelector('[data-win-disconnect-metamask]');
    if (disconnect) disconnect.hidden = !address;
  }
  const same = (s) => {
    if (!s || api.session()?.address !== s.address || api.session()?.networkId !== s.networkId)
      throw new Error('WIN account changed. Reopen the transfer.');
  };
  const getConfig = async () => validateBridgeConfig(await api.read('/bridge/v2/status'), api.session()?.networkId);
  const operations = () =>
    api.operations().filter((o) => o.address === api.session()?.address && o.networkId === api.session()?.networkId);
  const canCancel = (o) =>
    !o.nativeTx &&
    !o.depositHash &&
    !o.releaseHash &&
    !o.approvalHash &&
    !Object.keys(o.bnbTransactions || {}).length &&
    !Object.keys(o.walletRequests || {}).length;
  function history() {
    return (
      operations()
        .map((o) => {
          const unknown = Object.entries(o.walletRequests || {}).find(([, tx]) => !tx.hash);
          const link = o.releaseHash || o.depositHash;
          return `<div class="win-row"><div><strong>${esc(formatUnits(o.amount))} WIN · ${
            o.direction === 'in' ? 'Funding' : 'Withdrawal'
          }</strong>
        <p>${esc(o.status === 'complete' ? 'Completed' : o.status === 'canceled' ? 'Canceled' : 'Pending')}</p>
        ${
          o.externalAddress
            ? `<small>MetaMask: ${esc(o.externalAddress)}</small>`
            : '<small>Earlier wallet transfer</small>'
        }
        ${
          link
            ? `<p><a href="https://bscscan.com/tx/${esc(
                link
              )}" target="_blank" rel="noopener noreferrer">View BNB transaction ↗</a></p>`
            : ''
        }
        ${
          unknown
            ? `<form data-win-recover="${esc(o.localId)}" data-step="${esc(
                unknown[0]
              )}"><label class="win-field">Transaction hash from MetaMask Activity<input name="hash" required pattern="0x[a-fA-F0-9]{64}" autocomplete="off"></label><p class="win-help">The wallet response was interrupted. Recover the existing transaction before retrying.</p><button class="win-button secondary">Recover transaction</button></form>`
            : ''
        }</div>
        ${
          o.status === 'pending' && !unknown
            ? `<button class="win-button secondary" data-bridge-continue="${esc(o.localId)}">Continue</button>${
                canCancel(o)
                  ? `<button class="win-link-button" data-bridge-cancel="${esc(o.localId)}">Cancel draft</button>`
                  : ''
              }`
            : ''
        }</div>`;
        })
        .join('') || '<p>No transfers yet.</p>'
    );
  }
  function renderHistory() {
    const list = document.getElementById('winBridgeTransfers');
    if (list) list.innerHTML = history();
  }
  async function open(next = 'in', fundingSource = 'metamask') {
    stop();
    reviewed = null;
    direction = next;
    source = fundingSource;
    status.textContent = '';
    dialog.querySelector('h2').textContent =
      next === 'out' ? 'Withdraw to MetaMask' : next === 'history' ? 'Your WIN transfers' : 'Fund your WIN wallet';
    body.innerHTML = '<p>Loading…</p>';
    if (!dialog.open) dialog.showModal();
    try {
      const s = api.session();
      same(s);
      if (next !== 'history') {
        await getConfig();
        same(s);
      }
      const address = fundingSource === 'app' ? s.evmAddress : wallet.address();
      body.innerHTML = `${
        next === 'history'
          ? ''
          : `<p>${
              next === 'out'
                ? 'Send WIN from your app balance to MetaMask on BNB Smart Chain.'
                : 'Add WIN to your app balance. Your funds become available automatically after confirmation.'
            }</p>
        <p class="win-help">0.5% WIN fee. BNB network fees are separate and paid by ${
          fundingSource === 'app' ? 'this wallet' : 'MetaMask'
        }.</p>
        <p>${
          fundingSource === 'app'
            ? 'Earlier receiving address'
            : next === 'out'
            ? 'Destination in MetaMask'
            : 'Funding from MetaMask'
        }: <code class="win-address">${esc(address || 'Connect MetaMask to continue')}</code></p>
        ${
          !address
            ? '<button class="win-button" data-bridge-connect>Connect MetaMask</button>'
            : `<form id="winBridgeForm"><label class="win-field">Amount in WIN<input name="amount" inputmode="decimal" required autocomplete="off" placeholder="100"></label><button class="win-button">Review ${
                next === 'out' ? 'withdrawal' : 'funding'
              }</button></form><div id="winBridgeReview"></div>`
        }`
      }
        <h3>Your transfers</h3><div id="winBridgeTransfers">${history()}</div>`;
    } catch (error) {
      body.innerHTML = `<p>${esc(
        error.message
      )}</p><h3>Your transfers</h3><div id="winBridgeTransfers">${history()}</div>`;
    }
  }
  async function guard(fn) {
    if (busy) return;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    const inputs = [...dialog.querySelectorAll('button,input,select')];
    inputs.forEach((b) => (b.disabled = true));
    try {
      status.textContent = '';
      await fn();
    } catch (e) {
      const message =
        e.code === 4001
          ? 'MetaMask request canceled. You can try again; any pending transfer remains saved.'
          : e.message;
      status.textContent = message;
      const notice = document.getElementById('winWalletStatus');
      if (notice) notice.textContent = message;
      renderHistory();
    } finally {
      busy = false;
      inputs.forEach((b) => (b.disabled = false));
      dialog.removeAttribute('aria-busy');
    }
  }
  async function progress(op) {
    stop();
    const token = run;
    async function tick() {
      if (token !== run) return;
      same({ address: op.address, networkId: op.networkId });
      let message;
      try {
        message = await advanceBridge(op, await getConfig(), {
          ...api,
          assertExternal: async (o) => {
            await wallet.assertAccount(o.externalAddress);
            if (BigInt(await api.rpc('eth_getBalance', [o.externalAddress, 'pending'])) === 0n)
              throw new Error('Add BNB to MetaMask for the network fee before withdrawing.');
          },
        });
      } catch (e) {
        if (!e.message.includes('Waiting for two operators')) throw e;
        message = 'Waiting for confirmation. Your transfer is saved.';
      }
      if (token !== run) return;
      status.textContent = message;
      const notice = document.getElementById('winWalletStatus');
      if (notice) notice.textContent = message;
      renderHistory();
      if (op.status === 'complete') {
        stop();
        await api.refresh?.();
        return;
      }
      if (/reverted|failed on BNB/.test(message)) return;
      timer = setTimeout(() => {
        if (token === run) void guard(tick);
      }, api.pollInterval ?? 4000);
    }
    await tick();
  }
  dialog.querySelector('[data-bridge-close]').onclick = () => {
    if (!busy) {
      stop();
      dialog.close();
    }
  };
  dialog.addEventListener('cancel', (e) => {
    if (busy) e.preventDefault();
    else stop();
  });
  document.addEventListener('click', (e) => {
    const connect = e.target.closest('[data-win-connect-metamask]');
    const disconnect = e.target.closest('[data-win-disconnect-metamask]');
    const trigger = e.target.closest(
      '[data-win-fund],[data-win-withdraw],[data-win-transfers],[data-win-fund-existing],[data-open-win-bridge]'
    );
    if (!connect && !disconnect && !trigger) return;
    e.preventDefault();
    if (disconnect) {
      wallet.disconnect();
      renderConnection();
      return;
    }
    void guard(async () => {
      if (connect) {
        await wallet.connect();
        renderConnection();
        document.getElementById('winWalletStatus').textContent = 'MetaMask connected on BNB Smart Chain.';
        return;
      }
      const next = trigger.hasAttribute('data-win-withdraw')
        ? 'out'
        : trigger.hasAttribute('data-win-transfers')
        ? 'history'
        : 'in';
      await open(next, trigger.hasAttribute('data-win-fund-existing') ? 'app' : 'metamask');
    });
  });
  dialog.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.winRecover) {
      e.preventDefault();
      void guard(async () => {
        const op = operations().find((o) => o.localId === form.dataset.winRecover);
        if (!op) throw new Error('Transfer is unavailable.');
        await recoverMetaMaskTransaction(op, form.dataset.step, new FormData(form).get('hash').trim(), api);
        renderHistory();
        await progress(op);
      });
      return;
    }
    if (form.id !== 'winBridgeForm') return;
    e.preventDefault();
    const data = new FormData(form);
    void guard(async () => {
      reviewed = null;
      const s = api.session(),
        c = await getConfig(),
        q = quoteBridge(parseAmount(data.get('amount')), direction);
      same(s);
      const address = source === 'app' ? s.evmAddress : wallet.address();
      if (source !== 'app') await wallet.assertAccount(address);
      await verifyVault(c, api.rpc);
      await verifyOperatorsReady(c, api.fetch);
      same(s);
      if (BigInt(await api.rpc('eth_getBalance', [address, 'pending'])) === 0n)
        throw new Error(`Add BNB to ${source === 'app' ? 'this wallet' : 'MetaMask'} for the network fee.`);
      if (direction === 'in') {
        const balance = BigInt(
          await api.rpc('eth_call', [
            { to: WIN_TOKEN.address, data: encodeCall('balanceOf(address)', address) },
            'latest',
          ])
        );
        if (balance < q.amount) throw new Error('Insufficient WIN in the funding wallet.');
      } else {
        const balance = await api.read('/account/' + s.address + '/balance');
        const locked = BigInt(
          await api.rpc('eth_call', [
            { to: WIN_TOKEN.address, data: encodeCall('balanceOf(address)', c.vaultAddress) },
            'latest',
          ])
        );
        if (
          typeof balance?.balance !== 'bigint' ||
          balance.balance < q.debit ||
          locked < q.amount ||
          BigInt(c.backedWithdrawalCapacity) < q.amount
        )
          throw new Error('Insufficient available WIN, including the fee, for this withdrawal.');
      }
      same(s);
      if (source !== 'app') await wallet.assertAccount(address);
      reviewed = { s, c, q, direction, address, source };
      document.getElementById('winBridgeReview').innerHTML = `<div class="win-review"><p>${
        direction === 'in' ? 'Add' : 'Withdraw'
      } <strong>${esc(formatUnits(q.amount))} WIN</strong></p>
        <p>Fee: ${esc(formatUnits(q.fee))} WIN (0.5%)</p><p>${
        direction === 'in' ? 'Added to your app balance' : 'Received in MetaMask'
      }: <strong>${esc(formatUnits(q.receive))} WIN</strong></p>
        <p>${direction === 'in' ? 'Funding wallet debit' : 'App balance debit'}: ${esc(formatUnits(q.debit))} WIN</p>
        <p>${direction === 'in' ? 'From' : 'To'}: <code class="win-address">${esc(address)}</code></p>
        <p class="win-help">${
          source === 'app' ? 'This wallet' : 'MetaMask'
        } confirms the BNB network fee. Keep this window open while confirmations finish.</p><button class="win-button" data-bridge-confirm>Confirm ${
        direction === 'in' ? 'funding' : 'withdrawal'
      }</button></div>`;
    });
  });
  dialog.addEventListener('input', () => {
    reviewed = null;
    document.getElementById('winBridgeReview')?.replaceChildren();
  });
  dialog.addEventListener('click', (e) => {
    const connect = e.target.closest('[data-bridge-connect]'),
      cancel = e.target.closest('[data-bridge-cancel]'),
      resume = e.target.closest('[data-bridge-continue]'),
      confirm = e.target.closest('[data-bridge-confirm]');
    if (!connect && !cancel && !resume && !confirm) return;
    void guard(async () => {
      if (connect) {
        await wallet.connect();
        renderConnection();
        await open(direction, source);
        return;
      }
      if (cancel) {
        const op = operations().find((o) => o.localId === cancel.dataset.bridgeCancel);
        if (!op || !canCancel(op)) throw new Error('A submitted transfer cannot be canceled.');
        op.status = 'canceled';
        api.save(op);
        renderHistory();
        return;
      }
      let op;
      if (confirm) {
        if (!reviewed) throw new Error('Review this transfer again.');
        const r = reviewed;
        same(r.s);
        if (r.source !== 'app') await wallet.assertAccount(r.address);
        if (operations().some((o) => o.status === 'pending'))
          throw new Error('Finish your pending transfer before starting another.');
        const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(
          ''
        );
        op = {
          localId: id,
          id,
          address: r.s.address,
          evmAddress: r.s.evmAddress,
          networkId: r.s.networkId,
          vaultAddress: r.c.vaultAddress,
          direction: r.direction,
          amount: r.q.amount.toString(),
          status: 'pending',
          createdAt: Date.now(),
          ...(r.source === 'metamask' ? { externalAddress: r.address } : {}),
        };
        api.save(op);
        reviewed = null;
        document.getElementById('winBridgeReview')?.replaceChildren();
      } else op = operations().find((o) => o.localId === resume.dataset.bridgeContinue);
      if (!op) throw new Error('Transfer is unavailable.');
      if (op.externalAddress && !wallet.address() && !(op.direction === 'in' && op.depositHash)) {
        await wallet.connect();
        renderConnection();
      }
      await progress(op);
    });
  });
  renderConnection();
  return {
    open,
    wallet,
    reset() {
      stop();
      reviewed = null;
      wallet.disconnect();
      dialog.close();
      renderConnection();
      const notice = document.getElementById('winWalletStatus');
      if (notice) notice.textContent = '';
    },
  };
}
