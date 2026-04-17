/**
 * Utility to infer company name and internal/external status from email domains.
 */

// Common personal/generic email providers — not a company
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com', 'aim.com',
  'zoho.com',
  'tutanota.com',
]);

/**
 * Extract the domain part of an email address.
 */
export function getDomain(email: string): string | null {
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Infer a company name from an email domain.
 * Returns null for personal/generic email providers.
 * e.g. "stripe.com" → "Stripe", "openai.com" → "Openai"
 */
export function getCompanyFromEmail(email: string): string | null {
  const domain = getDomain(email);
  if (!domain) return null;
  if (GENERIC_DOMAINS.has(domain)) return null;

  // Take the part before the TLD: "stripe.com" → "stripe", "company.co.uk" → "company"
  const parts = domain.split('.');
  // Handle multi-part TLDs like .co.uk, .com.br
  const name = parts.length >= 3 && parts[parts.length - 2].length <= 3
    ? parts[parts.length - 3]
    : parts[0];

  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Check if a contact is internal (same domain as the owner).
 */
export function isInternalContact(ownerEmail: string, contactEmail: string): boolean {
  const ownerDomain = getDomain(ownerEmail);
  const contactDomain = getDomain(contactEmail);
  if (!ownerDomain || !contactDomain) return false;
  // Personal email providers are never "internal"
  if (GENERIC_DOMAINS.has(ownerDomain)) return false;
  return ownerDomain === contactDomain;
}
