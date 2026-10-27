import { WIN_TOKEN, parseAmount, formatUnits } from './win-domain.mjs';
import { validateBridgeConfig, quoteBridge, verifyVault, verifyOperatorsReady, encodeCall } from './win-bridge.mjs';
import { advanceBridge } from './win-bridge-flow.mjs';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
export function createBridgeUI(api) {
  const dialog = document.getElementById('winBridgeDialog'),
    body = dialog.querySelector('.win-dialog-body'),
    status = dialog.querySelector('[role=status]');
  let busy = false,
    reviewed = null;
  const getConfig = async () => validateBridgeConfig(await api.read('/bridge/v2/status'), api.session()?.networkId);
  const same = (s) => {
    if (api.session()?.address !== s?.address || api.session()?.networkId !== s?.networkId)
      throw new Error('Wallet changed. Reopen the bridge.');
  };
  function history() {
    return api
      .operations()
      .filter((o) => o.address === api.session()?.address && o.networkId === api.session()?.networkId)
      .map(
        (o) =>
          `<div class="win-row"><div><strong>${esc(formatUnits(o.amount))} WIN · ${
            o.direction === 'in' ? 'BNB → native' : 'Native → BNB'
          }</strong><p>${esc(
            o.status === 'complete' ? 'Completed' : o.status === 'canceled' ? 'Canceled' : 'Pending conversion'
          )}</p><small>Reference ${esc(o.id)}</small>${
            o.depositHash
              ? `<p><a href="https://bscscan.com/tx/${esc(
                  o.depositHash
                )}" target="_blank" rel="noopener noreferrer">BNB deposit ↗</a></p>`
              : ''
          }</div>${
            o.status !== 'pending'
              ? ''
              : `<button class="win-button secondary" data-bridge-continue="${esc(o.localId)}">Continue</button>${
                  !o.nativeTx && !Object.keys(o.bnbTransactions || {}).length
                    ? `<button class="win-link-button" data-bridge-cancel="${esc(o.localId)}">Cancel draft</button>`
                    : ''
                }`
          }</div>`
      )
      .join('');
  }
  async function open() {
    reviewed = null;
    status.textContent = '';
    body.innerHTML = '<p>Loading bridge configuration…</p>';
    if (!dialog.open) dialog.showModal();
    try {
      const initial = api.session();
      if (!initial) throw new Error('Sign in to your WIN wallet first.');
      const c = await getConfig();
      same(initial);
      body.innerHTML = `<p>1 BNB-chain WIN = 1 native WIN. A separate 0.5% fee is paid in native WIN.</p><p>Deposits lock WIN on BNB Chain and issue matching native WIN. You do not need native WIN to make your first deposit. Withdrawals burn native WIN before releasing WIN on BNB Chain.</p><form id="winBridgeForm"><label class="win-field">Convert<select name="direction"><option value="in">BNB WIN → native WIN</option><option value="out">Native WIN → BNB WIN</option></select></label><label class="win-field">WIN amount<input name="amount" inputmode="decimal" required autocomplete="off" placeholder="100"></label><p class="win-help">BNB gas is paid from this wallet’s BNB address. Deposits receive the converted amount minus the native fee. Withdrawals debit the converted amount plus the native fee.</p><button class="win-button">Review conversion</button></form><div id="winBridgeReview"></div><p class="win-help">Outstanding native WIN backed by deposits: ${esc(
        formatUnits(c.nativeOutstanding)
      )}. This bridge requires two of three operator signatures; completion can be delayed while operators or a network are unavailable.</p><h3>Your conversions</h3>${history()}`;
    } catch (e) {
      body.innerHTML = `<p>${esc(e.message)}</p><h3>Your conversions</h3>${history()}`;
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
      status.textContent = e.message;
    } finally {
      busy = false;
      inputs.forEach((b) => (b.disabled = false));
      dialog.removeAttribute('aria-busy');
    }
  }
  dialog.querySelector('[data-bridge-close]').onclick = () => {
    if (!busy) dialog.close();
  };
  dialog.addEventListener('cancel', (e) => {
    if (busy) e.preventDefault();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-win-bridge]')) {
      e.preventDefault();
      void guard(open);
    }
  });
  dialog.addEventListener('submit', (e) => {
    if (e.target.id !== 'winBridgeForm') return;
    e.preventDefault();
    const values = new FormData(e.target);
    void guard(async () => {
      reviewed = null;
      const s = api.session(),
        c = await getConfig(),
        direction = values.get('direction'),
        q = quoteBridge(parseAmount(values.get('amount')), direction);
      same(s);
      await verifyVault(c, api.rpc);
      await verifyOperatorsReady(c, api.fetch);
      same(s);
      if (direction === 'in') {
        const b = BigInt(
          await api.rpc('eth_call', [
            { to: WIN_TOKEN.address, data: encodeCall('balanceOf(address)', s.evmAddress) },
            'latest',
          ])
        );
        if (b < q.amount) throw new Error('Insufficient WIN on BNB Chain in this wallet.');
      } else {
        const b = await api.read('/account/' + s.address + '/balance');
        const liquidity = BigInt(
          await api.rpc('eth_call', [
            { to: WIN_TOKEN.address, data: encodeCall('balanceOf(address)', c.vaultAddress) },
            'latest',
          ])
        );
        if (
          typeof b?.balance !== 'bigint' ||
          b.balance < q.debit ||
          liquidity < q.amount ||
          BigInt(c.backedWithdrawalCapacity ?? '0') < q.amount
        )
          throw new Error('Insufficient native WIN including fee, or BNB vault liquidity.');
      }
      same(s);
      reviewed = { s, c, direction, q };
      document.getElementById('winBridgeReview').innerHTML = `<div class="win-review"><p>Convert <strong>${esc(
        formatUnits(q.amount)
      )} WIN</strong></p><p>Fee: ${esc(formatUnits(q.fee))} native WIN (0.5%)</p><p>You receive: <strong>${esc(
        formatUnits(q.receive)
      )} ${direction === 'in' ? 'native' : 'BNB-chain'} WIN</strong></p><p>Wallet debit: ${esc(formatUnits(q.debit))} ${
        direction === 'in' ? 'BNB-chain' : 'native'
      } WIN. BNB gas is confirmed separately before each BNB transaction.</p><p class="win-help">Native fee recipient: <code>${esc(
        c.feeRecipient
      )}</code></p><button class="win-button" data-bridge-confirm>Confirm conversion</button></div>`;
    });
  });
  dialog.addEventListener('input', () => {
    reviewed = null;
    document.getElementById('winBridgeReview')?.replaceChildren();
  });
  dialog.addEventListener('click', (e) => {
    const cancel = e.target.closest('[data-bridge-cancel]');
    if (cancel) {
      void guard(async () => {
        const op = api.operations().find((o) => o.localId === cancel.dataset.bridgeCancel);
        if (!op || op.nativeTx || Object.keys(op.bnbTransactions || {}).length)
          throw new Error('A submitted conversion cannot be canceled.');
        op.status = 'canceled';
        api.save(op);
        await open();
      });
      return;
    }
    const resume = e.target.closest('[data-bridge-continue]'),
      confirm = e.target.closest('[data-bridge-confirm]');
    if (!resume && !confirm) return;
    void guard(async () => {
      let op;
      if (confirm) {
        if (!reviewed) throw new Error('Review the conversion first.');
        const { s, c, direction, q } = reviewed;
        same(s);
        if (api.operations().some((o) => o.status === 'pending'))
          throw new Error('Finish your pending conversion before starting another.');
        const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join(
          ''
        );
        op = {
          localId: id,
          id,
          address: s.address,
          evmAddress: s.evmAddress,
          networkId: s.networkId,
          vaultAddress: c.vaultAddress,
          direction,
          amount: q.amount.toString(),
          status: 'pending',
          createdAt: Date.now(),
        };
        api.save(op);
        reviewed = null;
      } else op = api.operations().find((o) => o.localId === resume.dataset.bridgeContinue);
      if (!op) throw new Error('Conversion record is unavailable.');
      const message = await advanceBridge(op, await getConfig(), api);
      await open();
      status.textContent = message;
    });
  });
  return { open };
}
