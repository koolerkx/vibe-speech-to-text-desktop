import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 256;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const center = (SIZE - 1) / 2;
  const radius = SIZE / 2 - 1;
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  let offset = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < SIZE; x++) {
      const inside = (x - center) ** 2 + (y - center) ** 2 <= radius ** 2;
      raw[offset++] = inside ? 0x3b : 0;
      raw[offset++] = inside ? 0x82 : 0;
      raw[offset++] = inside ? 0xf6 : 0;
      raw[offset++] = inside ? 0xff : 0;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = resolve(__dirname, '..', 'resources');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon.png'), buildPng());
console.log('wrote resources/icon.png');
