/**
 * A PIN is 6 digits. People pick 123456 and 000000, and those are the first guesses of anyone trying, so they are refused
 * for a chosen PIN, and never generated. (The lockout after five wrong tries is the real protection; this removes the easy ones.)
 */
export function isWeakPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return true;
  const d = [...pin].map(Number);
  if (new Set(d).size === 1) return true; // 000000, 111111
  if (d.every((x, i) => i === 0 || x === d[i - 1] + 1)) return true; // 123456
  if (d.every((x, i) => i === 0 || x === d[i - 1] - 1)) return true; // 654321
  if (pin.slice(0, 3) === pin.slice(3)) return true; // 123123
  if (/^(\d\d)\1\1$/.test(pin)) return true; // 121212
  return false;
}
