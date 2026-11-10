/** Bangladeshi mobile numbers. One canonical form is stored and compared: E.164, "+8801712345678". */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAsciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/**
 * Accepts "01712-345678", "1712345678", "+880 1712 345678", "8801712345678" and the same in Bangla digits.
 * Returns "+8801712345678", or null when it is not a Bangladeshi mobile number (01[3-9] and 8 more digits).
 */
export function normalizePhone(input: string): string | null {
  const digits = toAsciiDigits(input).replace(/\D/g, '');
  let national = digits;
  if (national.startsWith('880')) national = national.slice(3);
  else if (national.startsWith('0')) national = national.slice(1);
  return /^1[3-9]\d{8}$/.test(national) ? `+880${national}` : null;
}

/** "+8801712345678" -> "+880 1712-345678", how people read a number. */
export function formatPhone(e164: string): string {
  const m = /^\+880(1\d{3})(\d{6})$/.exec(e164);
  return m ? `+880 ${m[1]}-${m[2]}` : e164;
}

/** "+8801712345678" -> "+880 17XX-XXX678": what a cashier sees (privacy, NF-08). */
export function maskPhone(e164: string): string {
  const m = /^\+880(1\d)(\d{2})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+880 ${m[1]}XX-XXX${m[4]}` : e164.replace(/\d(?=\d{3})/g, 'X');
}

/** Digits a cashier typed to find a customer: the last few digits or a whole number. Null when too short to be safe. */
export function phoneSearchDigits(input: string): string | null {
  const digits = toAsciiDigits(input).replace(/\D/g, '');
  return digits.length >= 4 ? digits : null;
}
