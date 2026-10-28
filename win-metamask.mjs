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
export async function sendMetaMaskTransaction(op, step, to, data, { wallet, save, isCurrent = () => true }) {
  const provider = await wallet.assertAccount(op.externalAddress);
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
  const from = normalize(op.externalAddress);
  const call = { from, to, data, value: '0x0' };
  const [nonce, gas, price, balance] = await Promise.all([
    provider.request({ method: 'eth_getTransactionCount', params: [from, 'pending'] }),
    provider.request({ method: 'eth_estimateGas', params: [call] }),
    provider.request({ method: 'eth_gasPrice' }),
    provider.request({ method: 'eth_getBalance', params: [from, 'pending'] }),
  ]);
  const gasLimit = (BigInt(gas) * 12n) / 10n + 1n;
  if (BigInt(balance) < gasLimit * BigInt(price))
    throw new Error('Add BNB to your connected MetaMask account for the network fee.');
  await wallet.assertAccount(from);
  if (!isCurrent()) throw new Error('WIN account changed. Reopen the transfer.');
  // MetaMask broadcasts before returning its hash. Persist intent first; an ambiguous
  // response must be recovered, never silently retried as another deposit.
  op.walletRequests[step] = { ...call, nonce, status: 'requesting' };
  try {
    save(op);
  } catch (error) {
    delete op.walletRequests[step]; // Nothing has been requested from MetaMask yet.
    throw error;
  }
  try {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ ...call, nonce, gas: '0x' + gasLimit.toString(16), chainId: '0x38' }],
    });
    if (!validHash(hash)) throw new Error('MetaMask did not return a transaction hash. Check MetaMask Activity.');
    op.walletRequests[step].hash = hash.toLowerCase();
    op.walletRequests[step].status = 'submitted';
    op[step + 'Hash'] = hash.toLowerCase();
    save(op);
  } catch (error) {
    if (error.code === 4001) {
      delete op.walletRequests[step];
      save(op);
    }
    throw error;
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
  )
    throw new Error('That transaction does not match this MetaMask request.');
  request.hash = hash.toLowerCase();
  request.status = 'submitted';
  op[step + 'Hash'] = hash.toLowerCase();
  save(op);
}
