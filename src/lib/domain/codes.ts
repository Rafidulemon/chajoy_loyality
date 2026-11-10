/**
 * Voucher codes look like "CJ-4F7K-92QH": the customer shows them under the QR and the cashier can type them (CA-12).
 * The alphabet leaves out I, O, 0 and 1 so a code read out loud or typed from a screen is not mistaken.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * "cj 4f7k 92qh" -> "CJ-4F7K-92QH". Returns null when the input cannot be a voucher code.
 * Typing O for 0 or I/L for 1 cannot be fixed safely (the alphabet has no 0, 1, O or I), so those are rejected.
 */
export function normalizeVoucherCode(input: string): string | null {
  // A voucher's QR encodes "chajoy:voucher:<code>", so text read from the QR works the same as a typed code.
  const key = input.replace(/^\s*chajoy:voucher:/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^CJ([A-Z0-9]{4})([A-Z0-9]{4})$/.exec(key);
  if (!m) return null;
  const body = m[1] + m[2];
  for (const ch of body) if (!CODE_ALPHABET.includes(ch)) return null;
  return `CJ-${m[1]}-${m[2]}`;
}
