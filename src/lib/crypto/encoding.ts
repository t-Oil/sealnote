const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function stringToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function bytesToString(value: Uint8Array): string {
  return textDecoder.decode(value);
}

export function bytesToBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}
