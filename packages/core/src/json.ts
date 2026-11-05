type JsonRecord = Record<string, unknown>;
const BIGINT_TAG = '$craftaibBigInt';
const BYTES_TAG = '$craftaibBytes';

export function stringifyEngineJson(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry === 'bigint') return { [BIGINT_TAG]: entry.toString() };
    if (entry instanceof Uint8Array) return { [BYTES_TAG]: Array.from(entry) };
    return entry;
  }, space);
}

export function parseEngineJson(json: string): unknown {
  return JSON.parse(json, (_key, entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const tagged = entry as JsonRecord;
    if (Object.hasOwn(tagged, BYTES_TAG)) {
      const bytes = tagged[BYTES_TAG];
      if (Object.keys(tagged).length !== 1 || !Array.isArray(bytes) || bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('Invalid byte metadata in project file.');
      return new Uint8Array(bytes);
    }
    if (!Object.hasOwn(entry, BIGINT_TAG)) return entry;
    if (Object.keys(tagged).length !== 1 || typeof tagged[BIGINT_TAG] !== 'string' || !/^-?\d+$/.test(tagged[BIGINT_TAG])) throw new Error('Invalid integer metadata in project file.');
    return BigInt(tagged[BIGINT_TAG]);
  });
}
