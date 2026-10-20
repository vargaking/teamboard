// No look-alike characters (0/O, 1/l/I) so the password can be read out or typed from a screenshot.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Cryptographically random password (default 12 chars), uniform over ALPHABET. */
export function generatePassword(length = 12): string {
  const out: string[] = [];
  const max = 256 - (256 % ALPHABET.length); // rejection sampling: avoid modulo bias
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < max && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join('');
}

export const MIN_PASSWORD_LENGTH = 8;
