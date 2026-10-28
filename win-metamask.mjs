import { WIN_TOKEN, isEvmAddress } from './win-domain.mjs';

const normalize = (address) => {
  if (!isEvmAddress(address)) throw new Error('MetaMask did not return a valid account.');
  return address.toLowerCase();
};
export function createMetaMask({ host = globalThis.window, onChange = () => {} } = {}) {
  let provider = null,
    account = null,
    generation = 0;
  const discovered = new Set();
  const announce = (event) => {
    const detail = event.detail;
    if (detail?.info?.rdns === 'io.metamask' && detail.provider?.request) discovered.add(detail.provider);
  };
  host?.addEventListener('eip6963:announceProvider', announce);
  host?.dispatchEvent(new Event('eip6963:requestProvider'));
  const changed = () => {
    account = null;
    generation++;
    onChange(null);
  };
  function disconnect() {
    provider?.removeListener?.('accountsChanged', changed);
    provider?.removeListener?.('chainChanged', changed);
    provider?.removeListener?.('disconnect', changed);
    provider = null;
    changed();
  }
  async function connect() {
    const candidates = [...discovered, ...(host?.ethereum?.providers || []), host?.ethereum].filter(Boolean);
    const selected = candidates.find((p) => discovered.has(p) || (p.isMetaMask && !p.isBraveWallet));
    if (!selected?.request)
      throw new Error('Open this site in MetaMask’s browser or install the MetaMask extension, then connect again.');
    disconnect();
    const token = generation;
    // Re-request account permission on explicit connect/change-account clicks so
    // MetaMask opens its picker even when this site already has permission.
    try {
      await selected.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    } catch (error) {
      if (error.code === -32601 || error.code === 4200)
        throw new Error('Update MetaMask to choose an account when connecting.');
      throw error;
    }
    if (token !== generation) throw new Error('Connection canceled. Connect again.');
    const accounts = await selected.request({ method: 'eth_requestAccounts' });
    const address = normalize(accounts?.[0]);
    if (BigInt(await selected.request({ method: 'eth_chainId' })) !== 56n) {
      try {
        await selected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
      } catch (e) {
        if (e.code !== 4902) throw e;
        await selected.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0x38',
              chainName: 'BNB Smart Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: [WIN_TOKEN.rpc],
              blockExplorerUrls: ['https://bscscan.com'],
            },
          ],
        });
        await selected.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
      }
    }
    const current = await selected.request({ method: 'eth_accounts' });
    if (
      token !== generation ||
      normalize(current?.[0]) !== address ||
      BigInt(await selected.request({ method: 'eth_chainId' })) !== 56n
    )
      throw new Error('MetaMask account or network changed. Connect again.');
    provider = selected;
    account = address;
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) provider.on?.(event, changed);
    onChange(account);
    return account;
  }
  async function assertAccount(expected) {
    const selected = provider,
      token = generation;
    if (!selected || account !== normalize(expected))
      throw new Error('Connect the MetaMask account used for this transfer.');
    const accounts = await selected.request({ method: 'eth_accounts' });
    const chain = await selected.request({ method: 'eth_chainId' });
    if (token !== generation || selected !== provider || normalize(accounts?.[0]) !== account || BigInt(chain) !== 56n)
      throw new Error('MetaMask account or network changed. Reconnect and review again.');
    return selected;
  }
  return {
    connect,
    disconnect,
    assertAccount,
    address: () => account,
    destroy() {
      disconnect();
      host?.removeEventListener('eip6963:announceProvider', announce);
    },
  };
}

const validHash = (hash) => typeof hash === 'string' && /^0x[a-f0-9]{64}$/i.test(hash);
// Only explicit permission, user, method, and request-validation rejections prove
// that this call was not submitted. Transport/internal/pending errors do not.
const notSubmitted = new Set([4001, 4100, 4200, -32600, -32601, -32602]);
const errorText = (error) =>
  (typeof error?.message === 'string' && error.message.trim().slice(0, 600)) || 'No error details were returned.';
function walletError(error, step, phase) {
  const code = Number.isSafeInteger(error?.code) ? error.code : undefined;
  const help = {
    4001: 'Request canceled. Choose Continue when ready.',
    4100: 'Use Change account to reconnect the funding account, then choose Continue.',
    4200: 'Update MetaMask and reconnect before continuing.',
    [-32601]: 'Update MetaMask and reconnect before continuing.',
    [-32600]: 'The wallet rejected the request format. No transaction hash is needed for this attempt.',
    [-32602]: 'The wallet rejected the request parameters. No transaction hash is needed for this attempt.',
    [-32002]: 'Open MetaMask and check for a pending request before doing anything else.',
  }[code];
  return {
    step,
    phase,
    ...(code === undefined ? {} : { code }),
    message: `MetaMask${code === undefined ? '' : ` (${code})`}: ${errorText(error)}${help ? ` ${help}` : ''}`,
  };
}
export async function sendMetaMaskTransaction(
  op,
  step,
  to,
  data,
  { wallet, save, isCurrent = () => true, onStatus = () => {} }
) {
  if (!isCurrent()) throw new Error('WIN account changed. Reopen the transfer.');
  op.walletRequests ??= {};
  const previous = op.walletRequests[step];
  if (previous?.hash) {
    op[step + 'Hash'] = previous.hash;
    return;
  }
  if (previous)
    throw new Error(
      'This MetaMask request has no saved transaction hash. Recover it from MetaMask Activity before trying again.'
    );
  function fail(error, phase) {
    const detail = walletError(error, step, phase);
    const next = { ...op, walletError: detail };
    if (phase === 'request' && notSubmitted.has(detail.code)) {
      next.walletRequests = { ...op.walletRequests };
      delete next.walletRequests[step];
    }
    // Commit cleanup before removing the recovery barrier from the live object.
    try {
      save(next);
    } catch (storageError) {
      throw new Error(
        `${detail.message} Could not save the result: ${errorText(storageError)} The saved request has been kept.`
      );
    }
    Object.assign(op, next);
    throw Object.assign(new Error(detail.message), detail.code === undefined ? {} : { code: detail.code });
  }
  let provider, call, nonce, gasLimit;
  onStatus('Checking MetaMask account and BNB network fees…');
  try {
    provider = await wallet.assertAccount(op.externalAddress);
    const from = normalize(op.externalAddress);
    call = { from, to, data, value: '0x0' };
    const [pendingNonce, gas, price, balance] = await Promise.all([
      provider.request({ method: 'eth_getTransactionCount', params: [from, 'pending'] }),
      provider.request({ method: 'eth_estimateGas', params: [call] }),
      provider.request({ method: 'eth_gasPrice' }),
      provider.request({ method: 'eth_getBalance', params: [from, 'pending'] }),
    ]);
    nonce = pendingNonce;
    gasLimit = (BigInt(gas) * 12n) / 10n + 1n;
    if (BigInt(balance) < gasLimit * BigInt(price))
      throw new Error('Add BNB to your connected MetaMask account for the network fee.');
    await wallet.assertAccount(from);
    if (!isCurrent()) throw new Error('WIN account changed. Reopen the transfer.');
  } catch (error) {
    fail(error, 'preparation');
  }
  // MetaMask broadcasts before returning its hash. Persist intent first; an ambiguous
  // response must be recovered, never silently retried as another deposit.
  op.walletRequests[step] = { ...call, nonce, status: 'requesting' };
  try {
    save(op);
  } catch (error) {
    delete op.walletRequests[step]; // Nothing has been requested from MetaMask yet.
    throw error;
  }
  const label = { approval: 'WIN approval', deposit: 'WIN funding', release: 'WIN withdrawal' }[step] || 'transaction';
  onStatus(`Open MetaMask to confirm ${label}. If no popup appears, open the MetaMask extension or app.`);
  let hash;
  try {
    hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ ...call, nonce, gas: '0x' + gasLimit.toString(16), chainId: '0x38' }],
    });
    if (!validHash(hash)) throw new Error('MetaMask did not return a transaction hash. Check MetaMask Activity.');
  } catch (error) {
    fail(error, 'request');
  }
  // Saving a returned hash is separate from the provider rejection handler:
  // a storage error must never erase a transaction that MetaMask submitted.
  op.walletRequests[step].hash = hash.toLowerCase();
  op.walletRequests[step].status = 'submitted';
  op[step + 'Hash'] = hash.toLowerCase();
  delete op.walletError;
  try {
    save(op);
  } catch (error) {
    throw new Error(
      `MetaMask submitted ${hash}, but the app could not save it: ${errorText(
        error
      )} Keep this hash for recovery; do not make another payment.`
    );
  }
}

export async function recoverMetaMaskTransaction(op, step, hash, { rpc, save }) {
  const request = op.walletRequests?.[step];
  if (!request || request.hash || !validHash(hash))
    throw new Error('Enter the transaction hash from MetaMask Activity.');
  if (BigInt(await rpc('eth_chainId')) !== 56n) throw new Error('BNB Smart Chain is required.');
  const tx = await rpc('eth_getTransactionByHash', [hash]);
  if (
    !tx ||
    tx.hash?.toLowerCase() !== hash.toLowerCase() ||
    tx.from?.toLowerCase() !== request.from ||
    tx.to?.toLowerCase() !== request.to.toLowerCase() ||
    (tx.input || tx.data)?.toLowerCase() !== request.data.toLowerCase() ||
    BigInt(tx.value) !== 0n ||
    BigInt(tx.nonce) !== BigInt(request.nonce)
  ) {
    if (tx?.to?.toLowerCase() === WIN_TOKEN.address && /^0xa9059cbb[a-f0-9]{128}$/i.test(tx.input || tx.data || ''))
      throw new Error(
        'This is a direct WIN transfer, not a bridge transaction. Use the approval, deposit, or withdrawal hash requested by this recovery step in MetaMask Activity.'
      );
    throw new Error('That transaction does not match this MetaMask request.');
  }
  request.hash = hash.toLowerCase();
  request.status = 'submitted';
  op[step + 'Hash'] = hash.toLowerCase();
  if (op.walletError?.step === step) delete op.walletError;
  save(op);
}
