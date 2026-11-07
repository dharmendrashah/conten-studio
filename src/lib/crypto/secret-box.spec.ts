import { decryptSecret, encryptSecret, loadEncryptionKey } from "./secret-box";

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

describe("encryptSecret / decryptSecret", () => {
  it("round-trips the plaintext", () => {
    const payload = encryptSecret("sk-test-123456", KEY);
    expect(decryptSecret(payload, KEY)).toBe("sk-test-123456");
  });

  it("never contains the plaintext", () => {
    const payload = encryptSecret("sk-test-123456", KEY);
    expect(payload).not.toContain("sk-test-123456");
  });

  it("uses a fresh IV, so equal inputs give different payloads", () => {
    expect(encryptSecret("same", KEY)).not.toBe(encryptSecret("same", KEY));
  });

  it("rejects decryption with the wrong key", () => {
    const payload = encryptSecret("sk-test-123456", KEY);
    expect(() => decryptSecret(payload, OTHER_KEY)).toThrow();
  });

  it("rejects a tampered payload", () => {
    const payload = encryptSecret("sk-test-123456", KEY);
    const bytes = Buffer.from(payload, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => decryptSecret(bytes.toString("base64"), KEY)).toThrow();
  });
});

describe("loadEncryptionKey", () => {
  it("returns a 32-byte key from base64", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") };
    expect(loadEncryptionKey(env)).toHaveLength(32);
  });

  it("throws when the variable is missing", () => {
    expect(() => loadEncryptionKey({})).toThrow("SETTINGS_ENCRYPTION_KEY");
  });

  it("throws when the key is not 32 bytes", () => {
    const env = { SETTINGS_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") };
    expect(() => loadEncryptionKey(env)).toThrow("SETTINGS_ENCRYPTION_KEY");
  });
});
