export function createApiFormBody(
  values: Record<string, string | null | undefined>
) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) {
      continue;
    }

    body.set(key, value);
  }

  return body;
}
