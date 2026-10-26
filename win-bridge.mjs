import keccak from './external/keccak256.js';
import { Signature } from './external/noble-secp256k1.js';
import { WIN_TOKEN } from './win-domain.mjs';
export const FEE_RECIPIENT = '9fe734826be44b76f06d1d3262130dce45076a3c000000000000000000000000';
export const RESERVE = '6' + '0'.repeat(63);
const hex = (bytes) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
const bytes = (h) => {
  h = h.replace(/^0x/, '');
  if (!/^(?:[a-f0-9]{2})*$/i.test(h)) throw new Error('Invalid hexadecimal data');
  return Uint8Array.from(h.match(/../g) || [], (b) => parseInt(b, 16));
};
export const hashHex = (h) => '0x' + hex(keccak(bytes(h)));
const hashText = (text) => hex(keccak(new TextEncoder().encode(text)));
const word = (v) => {
  const h = typeof v === 'bigint' ? v.toString(16) : v.replace(/^0x/, '');
  if (!/^[a-f0-9]{1,64}$/i.test(h)) throw new Error('Invalid ABI value');
  return h.toLowerCase().padStart(64, '0');
};
export const encodeCall = (signature, ...args) => '0x' + hashText(signature).slice(0, 8) + args.map(word).join('');
export function quoteBridge(amount, direction) {
  if (typeof amount !== 'bigint' || amount <= 0n || amount > 10n ** 27n || !['in', 'out'].includes(direction))
    throw new Error('Invalid bridge amount or direction');
  const fee = (amount * 50n + 9999n) / 10000n;
  if (direction === 'in' && amount <= fee) throw new Error('Deposit must exceed the native fee');
  return {
    amount,
    fee,
    debit: direction === 'in' ? amount : amount + fee,
    receive: direction === 'in' ? amount - fee : amount,
  };
}
export function validateBridgeConfig(c, networkId) {
  if (c?.protocol !== 2 || c.networkId !== networkId || !c.configured || !c.enabled || !c.operational)
    throw new Error('Bridge is not deployed and enabled yet. Your existing WIN balances remain available.');
  if (
    c.referenceToken?.address !== WIN_TOKEN.address ||
    c.referenceToken.chainId !== 56 ||
    c.feeBps !== 50 ||
    c.feeRecipient !== FEE_RECIPIENT ||
    c.reserveAddress !== RESERVE ||
    c.threshold !== 2 ||
    c.exchangeRate !== '1:1'
  )
    throw new Error('Bridge protocol mismatch');
  if (
    !/^0x[a-f0-9]{40}$/.test(c.vaultAddress) ||
    !/^0x[a-f0-9]{64}$/.test(c.vaultCodeHash) ||
    c.operators?.length !== 3 ||
    new Set(c.operators).size !== 3 ||
    c.operators.some((a) => !/^0x[a-f0-9]{40}$/.test(a)) ||
    c.observerUrls?.length !== 3
  )
    throw new Error('Invalid bridge deployment');
  for (const value of c.observerUrls) {
    const u = new URL(value);
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname))
      )
    )
      throw new Error('Insecure bridge observer');
  }
  return c;
}
export async function verifyVault(c, rpc) {
  if (BigInt(await rpc('eth_chainId')) !== 56n) throw new Error('BNB mainnet required');
  const code = await rpc('eth_getCode', [c.vaultAddress, 'latest']);
  if (hashHex(code) !== c.vaultCodeHash) throw new Error('Vault bytecode does not match the configured deployment');
  const call = (sig, ...args) => rpc('eth_call', [{ to: c.vaultAddress, data: encodeCall(sig, ...args) }, 'latest']);
  if (
    (await call('token()')).toLowerCase() !== '0x' + word(WIN_TOKEN.address) ||
    (await call('networkId()')) !== '0x' + c.networkId ||
    BigInt(await call('feeBps()')) !== 50n
  )
    throw new Error('Vault token, network, or fee mismatch');
  for (let i = 0; i < 3; i++)
    if ((await call('operators(uint256)', BigInt(i))).toLowerCase() !== '0x' + word(c.operators[i]))
      throw new Error('Vault operator mismatch');
}
function digest(c, kind, v) {
  const domain = hashHex(
    hashText('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)') +
      hashText('WINBridge') +
      hashText('1') +
      word(56n) +
      word(c.vaultAddress) +
      word(c.networkId)
  );
  const type =
    kind === 'Deposit'
      ? 'Deposit(bytes32 id,bytes32 recipient,uint256 amount)'
      : 'Withdrawal(bytes32 id,address recipient,uint256 amount)';
  const body = hashHex(hashText(type) + word(v.id) + word(v.recipient) + word(BigInt(v.amount)));
  return hashHex('1901' + domain.slice(2) + body.slice(2));
}
export function verifyAttestation(c, kind, expected, result) {
  if (
    result?.networkId !== c.networkId ||
    result.vaultAddress !== c.vaultAddress ||
    result.value?.id !== expected.id ||
    result.value?.recipient !== expected.recipient ||
    result.value?.amount !== expected.amount ||
    !/^0x[a-f0-9]{130}$/i.test(result.signature)
  )
    throw new Error('Bridge attestation mismatch');
  const s = result.signature.slice(2),
    recovery = parseInt(s.slice(128), 16) - 27;
  if (![0, 1].includes(recovery)) throw new Error('Invalid signature recovery');
  const sig = Signature.fromCompact(s.slice(0, 128));
  if (sig.hasHighS()) throw new Error('Noncanonical bridge signature');
  const pub = sig
    .addRecoveryBit(recovery)
    .recoverPublicKey(bytes(digest(c, kind, expected)))
    .toRawBytes(false);
  const signer = '0x' + hex(keccak(pub.slice(1)).slice(-20));
  if (!c.operators.includes(signer) || result.operator !== signer) throw new Error('Unrecognized bridge operator');
  return signer;
}
export async function attest(c, kind, operation, fetcher = fetch) {
  const path = kind === 'Deposit' ? '/deposit' : '/withdraw';
  const body = kind === 'Deposit' ? { transactionHash: operation.depositHash } : { id: operation.id };
  const results = await Promise.allSettled(
    c.observerUrls.map(async (base) => {
      const r = await fetcher(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error('Waiting for finalized source transaction');
      return r.json();
    })
  );
  const groups = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    try {
      const r = result.value,
        v = r.value;
      const expected = {
        id: kind === 'Deposit' ? v.id : '0x' + operation.id,
        recipient: kind === 'Deposit' ? '0x' + operation.address : operation.evmAddress,
        amount: operation.amount,
      };
      if (!/^0x[a-f0-9]{64}$/.test(expected.id)) continue;
      const signer = verifyAttestation(c, kind, expected, r),
        key = JSON.stringify(expected);
      const group = groups.get(key) || { value: expected, signatures: new Map() };
      group.signatures.set(signer, r.signature);
      groups.set(key, group);
    } catch {
      /* An invalid operator response never counts toward quorum. */
    }
  }
  const agreed = [...groups.values()].find((g) => g.signatures.size >= 2);
  if (!agreed)
    throw new Error('Waiting for two operators to verify the finalized transaction. Use Continue to check again.');
  return { value: agreed.value, signatures: [...agreed.signatures.values()].slice(0, 2) };
}
export function releaseCall(id, recipient, amount, signatures) {
  if (signatures.length !== 2 || signatures.some((s) => !/^0x[a-f0-9]{130}$/i.test(s)))
    throw new Error('Two signatures required');
  // bytes[2] is dynamic: its element offsets are relative to the start of the array.
  const tail = signatures.map((s) => word(65n) + s.slice(2).padEnd(192, '0'));
  return (
    encodeCall('release(bytes32,address,uint256,bytes[2])', id, recipient, amount, 128n) +
    word(64n) +
    word(192n) +
    tail.join('')
  );
}
export async function finalizedReceipt(hash, rpc) {
  const r = await rpc('eth_getTransactionReceipt', [hash]);
  if (!r) return null;
  const f = await rpc('eth_getBlockByNumber', ['finalized', false]);
  if (!f || BigInt(r.blockNumber) > BigInt(f.number)) return null;
  const block = await rpc('eth_getBlockByNumber', [r.blockNumber, false]);
  if (block?.hash !== r.blockHash || r.transactionHash !== hash) throw new Error('BNB receipt is not canonical');
  if (BigInt(r.status) !== 1n) throw new Error('BNB transaction reverted. No bridge payout was completed.');
  return r;
}
export async function verifyOperatorsReady(c, fetcher = fetch) {
  const results = await Promise.allSettled(
    c.observerUrls.map(async (base) => {
      const response = await fetcher(base + '/health', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Operator unavailable');
      const r = await response.json();
      if (r.networkId !== c.networkId || r.vaultAddress !== c.vaultAddress || !c.operators.includes(r.operator))
        throw new Error('Operator deployment mismatch');
      return r.operator;
    })
  );
  if (new Set(results.filter((r) => r.status === 'fulfilled').map((r) => r.value)).size < 2)
    throw new Error('Two bridge operators must be online before starting a conversion.');
}
