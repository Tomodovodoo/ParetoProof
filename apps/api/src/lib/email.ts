export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeOptionalEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}
