import { WIN_TOKEN } from './win-domain.mjs';
import {
  RESERVE,
  BRIDGE_ACCOUNTING,
  bridgeBnbAddress,
  encodeCall,
  quoteBridge,
  verifyVault,
  verifyOperatorsReady,
  attest,
  releaseCall,
  finalizedReceipt,
} from './win-bridge.mjs';
export async function advanceBridge(op, c, api) {
  const current = () => {
    const s = api.session();
    if (
      s?.address !== op.address ||
      s?.evmAddress !== op.evmAddress ||
      s?.networkId !== op.networkId ||
      c.vaultAddress !== op.vaultAddress
    )
      throw new Error('Wallet or bridge deployment changed');
  };
  current();
  const bnbAddress = bridgeBnbAddress(op);
  if (!/^0x[a-f0-9]{40}$/.test(bnbAddress)) throw new Error('Invalid transfer wallet address');
  if (Object.values(op.walletRequests || {}).some((tx) => !tx.hash))
    throw new Error('Recover the interrupted MetaMask request from Activity before continuing.');
  for (const [step, tx] of Object.entries(op.walletRequests || {})) {
    if (!tx.hash) continue;
    try {
      await finalizedReceipt(tx.hash, api.rpc);
    } catch (error) {
      if (!error.message.includes('reverted')) throw error;
      delete op.walletRequests[step];
      delete op[step + 'Hash'];
      savedAfterRevert();
      return `The previous ${step} failed on BNB Chain. Continue to retry; your WIN will not be debited again.`;
    }
  }
  function savedAfterRevert() {
    current();
    api.save(op);
  }
  for (const [step, tx] of Object.entries(op.bnbTransactions || {})) {
    try {
      await finalizedReceipt(tx.hash, api.rpc);
    } catch (error) {
      if (!error.message.includes('reverted')) throw error;
      delete op.bnbTransactions[step];
      delete op[step + 'Hash'];
      api.save(op);
      return `The previous BNB ${step} reverted. Continue to retry; your WIN will not be debited again.`;
    }
  }
  await api.rebroadcast?.(op);
  current();
  await verifyVault(c, api.rpc);
  current();
  const amount = BigInt(op.amount),
    quote = quoteBridge(amount, op.direction);
  const saved = () => {
    current();
    api.save(op);
  };
  const nativeRecord = async () => {
    const kind = op.direction === 'in' ? 'bridge_deposit' : 'bridge_withdraw';
    const result = await api.read(`/bridge/v2/records/${kind}/${op.id}`);
    current();
    const r = result?.record;
    if (!r) return null;
    if (
      result.networkId !== op.networkId ||
      r.networkId !== op.networkId ||
      r.vaultAddress !== op.vaultAddress ||
      !r.completed ||
      r.accounting !== BRIDGE_ACCOUNTING ||
      String(r.nativeMinted) !== (op.direction === 'in' ? op.amount : '0') ||
      String(r.nativeBurned) !== (op.direction === 'out' ? op.amount : '0') ||
      r.operation !== kind ||
      r.eventId !== op.id ||
      r.from !== op.address ||
      r.recipient !== (op.direction === 'in' ? op.address : bnbAddress) ||
      String(r.amount) !== op.amount ||
      String(r.fee) !== quote.fee.toString()
    )
      throw new Error('Bridge record does not match this conversion');
    return r;
  };
  if (op.direction === 'in' && !op.depositHash) {
    await verifyOperatorsReady(c, api.fetch);
    current();
    if (op.approvalHash && !(await finalizedReceipt(op.approvalHash, api.rpc)))
      return 'Waiting for BNB approval finality';
    const allowance = BigInt(
      await api.rpc('eth_call', [
        { to: WIN_TOKEN.address, data: encodeCall('allowance(address,address)', bnbAddress, c.vaultAddress) },
        'latest',
      ])
    );
    current();
    if (allowance < amount) {
      if (op.approvalHash) throw new Error('Approval did not provide sufficient allowance');
      await api.sendBnb(
        op,
        'approval',
        WIN_TOKEN.address,
        encodeCall('approve(address,uint256)', c.vaultAddress, amount)
      );
      return 'Approval submitted. Waiting for confirmation…';
    }
    await api.sendBnb(op, 'deposit', c.vaultAddress, encodeCall('deposit(uint256,bytes32)', amount, op.address));
    return 'Funding submitted. Waiting for BNB confirmation…';
  }
  if (op.direction === 'in') {
    if (op.depositHash && op.id && (await nativeRecord())) {
      op.status = 'complete';
      op.nativeConfirmed = true;
      saved();
      return 'Funding complete. WIN is available in your app wallet.';
    }
    const proof = await attest(c, 'Deposit', op, api.fetch);
    current();
    op.id = proof.value.id.slice(2);
    saved();
    if (!(await nativeRecord())) {
      await api.sendNative(op, {
        type: 'bridge_deposit',
        to: RESERVE,
        id: op.id,
        amount,
        fee: quote.fee,
        signatures: proof.signatures,
      });
      return 'Adding WIN to your app wallet…';
    }
    op.status = 'complete';
    saved();
    return 'Funding complete. WIN is available in your app wallet; the fee has been paid.';
  }
  if (!(await nativeRecord())) {
    await verifyOperatorsReady(c, api.fetch);
    if (op.externalAddress) await api.assertExternal(op);
    current();
    await api.sendNative(op, {
      type: 'bridge_withdraw',
      to: RESERVE,
      id: op.id,
      recipient: bnbAddress,
      amount,
      fee: quote.fee,
    });
    return 'Withdrawal submitted. Waiting for WIN confirmation…';
  }
  op.nativeConfirmed = true;
  saved();
  if (!op.releaseHash) {
    const proof = await attest(c, 'Withdrawal', op, api.fetch);
    current();
    await api.sendBnb(op, 'release', c.vaultAddress, releaseCall('0x' + op.id, bnbAddress, amount, proof.signatures));
    return 'Withdrawal submitted to BNB Chain. Waiting for confirmation…';
  }
  if (!(await finalizedReceipt(op.releaseHash, api.rpc))) return 'Waiting for BNB release finality';
  const released = await api.rpc('eth_call', [
    { to: c.vaultAddress, data: encodeCall('released(bytes32)', '0x' + op.id) },
    'latest',
  ]);
  if (BigInt(released) !== 1n) throw new Error('Vault has not confirmed this withdrawal');
  op.status = 'complete';
  saved();
  return op.externalAddress
    ? 'Withdrawal complete. WIN is in your MetaMask wallet.'
    : 'Withdrawal complete. WIN received on BNB Chain.';
}
