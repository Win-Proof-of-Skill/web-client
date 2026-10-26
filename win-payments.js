// Exact amounts and receipt interpretation shared by the WIN payment screens.
// This module has no network or wallet-key access.
(function (root) {
  const scale = 10n ** 18n;
  const protectedAddresses = new Set(['1', '2', '3', '4', '5'].map((prefix) => prefix + '0'.repeat(63)));
  function parseAtomic(value) {
    if (typeof value !== 'string' || !/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(value.trim())) {
      throw new Error('Enter a decimal amount with at most 18 decimal places.');
    }
    const [whole, fraction = ''] = value.trim().split('.');
    return BigInt(whole || '0') * scale + BigInt(fraction.padEnd(18, '0'));
  }
  function formatAtomic(amount) {
    if (typeof amount !== 'bigint') throw new Error('Atomic amounts must be bigint.');
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const fraction = (absolute % scale).toString().padStart(18, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${absolute / scale}${fraction ? '.' + fraction : ''}`;
  }
  function convertAmount(amount, price, toUsd) {
    const value = parseAtomic(amount);
    const rate = parseAtomic(price);
    if (rate <= 0n) throw new Error('WIN conversion rate is unavailable.');
    return formatAtomic(toUsd ? value * rate / scale : value * scale / rate);
  }
  function receiptStatus(receipt, txid, networkId) {
    if (!receipt || receipt.txId !== txid || receipt.networkId !== networkId || receipt.type !== 'transfer') return 'unknown';
    if (receipt.success === true) return 'confirmed';
    if (receipt.success === false) return 'failed';
    return 'unknown';
  }
  root.WinPayments = Object.freeze({
    parseAtomic, formatAtomic, convertAmount, receiptStatus,
    isProtectedAddress: (address) => protectedAddresses.has(address),
  });
})(globalThis);
