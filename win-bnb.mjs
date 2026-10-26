import { WIN_TOKEN, isEvmAddress, transferData, tokenReceiptState } from './win-domain.mjs';
export async function bnbRpc(method, params = []) {
  const response = await fetch(WIN_TOKEN.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('BNB Chain is unavailable. Try refreshing again.');
  const data = await response.json();
  if (data.error || data.result === undefined)
    throw new Error(data.error?.message || 'Invalid BNB Chain response.');
  return data.result;
}
export async function tokenBalance(address, rpc = bnbRpc) {
  if (!isEvmAddress(address)) throw new Error('Invalid wallet address.');
  if (BigInt(await rpc('eth_chainId')) !== 56n) throw new Error('RPC is not BNB Chain mainnet.');
  const result = await rpc('eth_call', [
    { to: WIN_TOKEN.address, data: '0x70a08231' + address.slice(2).padStart(64, '0') },
    'latest',
  ]);
  if (!/^0x[0-9a-f]{64}$/i.test(result)) throw new Error('Unable to read the WIN token balance.');
  return BigInt(result);
}
export async function connectBnb(provider) {
  if (!provider?.request)
    throw new Error(
      'Open this page in a wallet browser or install a BNB-compatible browser wallet. You can also send WIN directly to the displayed BNB address.'
    );
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (BigInt(await provider.request({ method: 'eth_chainId' })) !== 56n) {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: WIN_TOKEN.chainId }],
    });
  }
  const current = await provider.request({ method: 'eth_accounts' });
  if (
    !isEvmAddress(current[0]) ||
    current[0]?.toLowerCase() !== accounts[0]?.toLowerCase() ||
    BigInt(await provider.request({ method: 'eth_chainId' })) !== 56n
  )
    throw new Error('Wallet account or network changed. Connect again.');
  return current[0];
}
export async function fundBnb(provider, from, to, amount, isCurrent = () => true) {
  const data = transferData(to, amount);
  if (from.toLowerCase() === to.toLowerCase())
    throw new Error('Choose a source wallet different from the receiving WIN wallet.');
  const rpc = (method, params = []) => provider.request({ method, params });
  const balance = await tokenBalance(from, rpc);
  if (balance < amount) throw new Error('The connected source wallet has insufficient WIN.');
  const simulated = await rpc('eth_call', [{ from, to: WIN_TOKEN.address, data, value: '0x0' }, 'latest']);
  if (simulated !== '0x' && (!/^0x[0-9a-f]{64}$/i.test(simulated) || BigInt(simulated) !== 1n))
    throw new Error('The WIN token rejected this transfer.');
  const accounts = await rpc('eth_accounts');
  if (
    !isCurrent() ||
    accounts[0]?.toLowerCase() !== from.toLowerCase() ||
    BigInt(await rpc('eth_chainId')) !== 56n
  )
    throw new Error('Wallet changed before submission. Review the deposit again.');
  const hash = await rpc('eth_sendTransaction', [
    { from, to: WIN_TOKEN.address, data, value: '0x0', chainId: WIN_TOKEN.chainId },
  ]);
  if (!/^0x[0-9a-f]{64}$/i.test(hash))
    throw new Error('The wallet returned an invalid transaction hash. Check its activity before retrying.');
  return { hash, from, to, amount: amount.toString(), status: 'pending', createdAt: Date.now() };
}
export async function checkDeposit(deposit, rpc = bnbRpc) {
  if (BigInt(await rpc('eth_chainId')) !== 56n) throw new Error('RPC is not BNB Chain mainnet.');
  const receipt = await rpc('eth_getTransactionReceipt', [deposit.hash]);
  const status = tokenReceiptState(receipt, deposit);
  if (status !== 'confirmed') return status;
  const tip = BigInt(await rpc('eth_blockNumber'));
  return tip >= BigInt(receipt.blockNumber) + 1n ? 'confirmed' : 'pending';
}
