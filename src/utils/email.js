// Email address checks for signup forms. Plain, dependency-free ESM so the
// same file can be copied to other sites (and run under `node --test`).

// Trim and lowercase an address. Use this both before validating and before
// storing, so what's checked is what's saved.
export function normalizeEmail(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

// Validate an address. Returns { valid, email } where `email` is the
// normalized address. Rejects: any whitespace, anything other than exactly one
// "@", an empty part before the "@", and a domain that doesn't have at least
// one dot with a final part of 2+ letters (empty labels like "a@.com" or
// "a@b..com" are rejected too). Length is capped at 320 to match the
// hva_signups CHECK.
export function validateEmail(raw) {
  const email = normalizeEmail(raw);
  const fail = { valid: false, email };
  if (email.length > 320 || /\s/.test(email)) return fail;
  const parts = email.split("@");
  if (parts.length !== 2) return fail;
  const [local, domain] = parts;
  if (!local) return fail;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !l)) return fail;
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return fail;
  return { valid: true, email };
}

export const COMMON_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "aol.com", "hotmail.com", "outlook.com", "icloud.com",
];

// Edit distance counting a swap of two neighbouring letters as one edit
// ("gmial" -> "gmail"), so single typos are distance 1.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// For a valid address whose domain is one typo away from a common provider
// ("name@hmail.com"), return the corrected address ("name@gmail.com");
// otherwise null. A suggestion only; never use it to block a submission.
export function suggestEmailFix(raw) {
  const { valid, email } = validateEmail(raw);
  if (!valid) return null;
  const at = email.indexOf("@");
  const domain = email.slice(at + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  const match = COMMON_EMAIL_DOMAINS.find((d) => editDistance(domain, d) === 1);
  return match ? `${email.slice(0, at)}@${match}` : null;
}
