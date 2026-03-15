export const trustedLocalCodexContainerHome = "/run/paretoproof/codex-home";
export const trustedLocalCodexContainerAuthJsonPath = `${trustedLocalCodexContainerHome}/auth.json`;

export function linuxMountInfoListsMountPoint(
  mountInfoText: string,
  mountPoint: string
): boolean {
  return mountInfoText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .some((line) => {
      const separatorIndex = line.indexOf(" - ");

      if (separatorIndex === -1) {
        return false;
      }

      const leftFields = line.slice(0, separatorIndex).split(" ");
      const encodedMountPoint = leftFields[4];

      if (!encodedMountPoint) {
        return false;
      }

      return decodeLinuxMountInfoField(encodedMountPoint) === mountPoint;
    });
}

function decodeLinuxMountInfoField(value: string): string {
  return value.replace(/\\([0-7]{3})/gu, (_match, octalDigits: string) =>
    String.fromCharCode(Number.parseInt(octalDigits, 8))
  );
}
