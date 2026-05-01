const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
    let crc = 0xffffffff;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32BE(d.length);
    const crcBuf = Buffer.concat([t, d]);
    const crc = Buffer.allocUnsafe(4);
    crc.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, t, d, crc]);
}

function createPNG(width, height, r, g, b) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrData = Buffer.allocUnsafe(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 2; // color type: RGB
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace

    const raw = [];
    for (let y = 0; y < height; y++) {
        raw.push(0); // filter byte
        for (let x = 0; x < width; x++) raw.push(r, g, b);
    }
    const compressed = zlib.deflateSync(Buffer.from(raw), { level: 9 });

    const idat = chunk('IDAT', compressed);
    const iend = chunk('IEND', Buffer.alloc(0));

    return Buffer.concat([sig, chunk('IHDR', ihdrData), idat, iend]);
}

const publicDir = path.join(__dirname, '..', 'public');
const sizes = [192, 512];
const purple = [45, 27, 105];   // royal-800 rgb
const gold = [245, 158, 11];    // gold-500 rgb

sizes.forEach(size => {
    const icon = createPNG(size, size, ...purple);
    fs.writeFileSync(path.join(publicDir, `icon-${size}.png`), icon);
    console.log(`Created icon-${size}.png`);
});

// 192 with gold center
const gold192 = createPNG(192, 192, ...gold);
fs.writeFileSync(path.join(publicDir, 'icon-192-gold-center.png'), gold192);
console.log('Created icon-192-gold-center.png');