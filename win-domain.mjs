// Shared protocol helpers. No wallet secrets or network side effects.
export const WIN_TOKEN = Object.freeze({
  chainId: '0x38',
  address: '0x8a27363dd26f78b09014338e106b16055fcb9799',
  decimals: 18,
  rpc: 'https://bsc-dataseed.bnbchain.org',
});
export const REGISTRIES = Object.freeze(
  Object.fromEntries(
    ['profile', 'contract', 'endorsement', 'score', 'skill'].map((type, i) => [
      type,
      String(i + 1) + '0'.repeat(63),
    ])
  )
);
export const isId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isEvmAddress = (value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
export const controls = (profile, address) =>
  Boolean(address && (profile.owner === address || profile.managers?.includes(address)));
export function parseAmount(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value.trim()))
    throw new Error('Enter a positive WIN amount with up to 18 decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error('WIN amount is outside the supported range.');
  return amount;
}
export function formatUnits(value, decimals = 18) {
  const amount = BigInt(value),
    scale = 10n ** BigInt(decimals);
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${amount < 0n ? '-' : ''}${absolute / scale}${fraction ? '.' + fraction : ''}`;
}
export function transferData(to, amount) {
  if (
    !isEvmAddress(to) ||
    /^0x0{40}$/i.test(to) ||
    typeof amount !== 'bigint' ||
    amount <= 0n ||
    amount >= 2n ** 256n
  )
    throw new Error('Invalid token transfer.');
  return '0xa9059cbb' + to.slice(2).toLowerCase().padStart(64, '0') + amount.toString(16).padStart(64, '0');
}
export function objectFee(tx, rules, stringify) {
  if (!rules || rules.rulesVersion !== 10)
    throw new Error('This server does not expose compatible WIN profile rules. Update the WIN server.');
  if (tx.type === 'contract') return BigInt(rules.contractFee);
  if (tx.type === 'endorsement') return BigInt(rules.endorsementFee);
  const { fee, sign, ...body } = tx;
  const bytes = new TextEncoder().encode(stringify(body)).length;
  return BigInt(rules.baseFee) + BigInt(rules.feePerKiB) * ((BigInt(bytes) + 1023n) / 1024n);
}
export function receiptState(receipt, txId, networkId, type) {
  if (!receipt || receipt.txId !== txId || receipt.networkId !== networkId || receipt.type !== type)
    return 'pending';
  return receipt.success === true ? 'confirmed' : receipt.success === false ? 'failed' : 'pending';
}
export function tokenReceiptState(receipt, deposit) {
  if (!receipt || receipt.transactionHash?.toLowerCase() !== deposit.hash.toLowerCase()) return 'pending';
  if (receipt.status === '0x0') return 'failed';
  if (receipt.status !== '0x1') return 'pending';
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const found = receipt.logs?.some(
    (log) =>
      log.address?.toLowerCase() === WIN_TOKEN.address &&
      log.topics?.[0]?.toLowerCase() === transferTopic &&
      log.topics?.[1]?.toLowerCase() === '0x' + deposit.from.slice(2).toLowerCase().padStart(64, '0') &&
      log.topics?.[2]?.toLowerCase() === '0x' + deposit.to.slice(2).toLowerCase().padStart(64, '0') &&
      /^0x[0-9a-f]+$/i.test(log.data) &&
      BigInt(log.data) === BigInt(deposit.amount)
  );
  return found ? 'confirmed' : 'unverified';
}
export function profileContent(profile) {
  return Object.fromEntries(
    ['type', 'displayName', 'summary', 'avatarUrl', 'coverImageUrl', 'contact', 'details']
      .filter((key) => profile[key] !== undefined)
      .map((key) => [key, structuredClone(profile[key])])
  );
}
export function contractContent(record) {
  return Object.fromEntries(
    [
      'origin',
      'title',
      'publicDescription',
      'encryptedDescription',
      'workerProfileId',
      'hiringProfileIds',
      'skillIds',
      'terms',
      'compensation',
      'workStatus',
      'periodOutcomes',
      'evidence',
      'cancellationReason',
    ]
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, structuredClone(record[key])])
  );
}
