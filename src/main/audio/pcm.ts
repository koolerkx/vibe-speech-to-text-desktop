export function toBuffer(chunk: ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return Buffer.from(chunk);
}
