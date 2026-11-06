// Platform owner: the Primecom account(s) that may see battery engineering
// details (cell maker, pack build, supplier data requests and documents).
// Customer admins are "admin" in profiles too, so this is checked by email,
// not by role. Set PLATFORM_OWNER_EMAILS (comma-separated) in Railway to change it.

const OWNER_EMAILS = (process.env.PLATFORM_OWNER_EMAILS || 'mehmet@primecom.tech')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isOwner(user) {
  return !!user?.email && OWNER_EMAILS.includes(String(user.email).toLowerCase());
}

module.exports = { isOwner, OWNER_EMAILS };
