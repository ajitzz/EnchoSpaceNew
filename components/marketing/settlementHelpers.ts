/** Decimal currency input including a verified zero; arithmetic never passes through Number. */
export function settlementMinor(value: string): string {
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter an exact nonnegative amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > 9223372036854775807n) throw new Error('Amount exceeds the supported range.');
  return amount.toString();
}

export async function verifySettlementBytes(bytes: ArrayBuffer, expectedHash: string): Promise<void> {
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error('The evidence document has an invalid size.');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || actual !== expectedHash) throw new Error('The downloaded document does not match the reviewed evidence fingerprint.');
}
