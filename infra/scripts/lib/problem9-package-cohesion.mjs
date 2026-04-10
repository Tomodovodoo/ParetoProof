export function hasExpectedCanonicalModules(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }

  const actualEntries = Object.entries(actual).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );
  const expectedEntries = Object.entries(expected).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(([actualKey, actualValue], index) => {
      const [expectedKey, expectedValue] = expectedEntries[index];
      return actualKey === expectedKey && actualValue === expectedValue;
    })
  );
}
