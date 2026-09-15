const path  = require('path');
const http  = require('http');
const https = require('https');
const fsp   = require('fs/promises');
const fs    = require('fs');

function fix(value) {
  return String(value).padStart(2, 0);
}

/**
 * @param { Array } data 
 * @param { string } color 
 * @returns { string }
 */
function write(data, color = '\x1b[0m') {
  const date = new Date();
  const hr   = date.getHours();
  const min  = date.getMinutes();
  const sec  = date.getSeconds();
  process.stdout.write(`${color}\x1b[1m${fix(hr)}:${fix(min)}:${fix(sec)}\x1b[22m ${data.join('')}\x1b[0m\n`)
  return data.join('');
}

/**
 * Log anything the ***modern*** way
 * @param { ...any } data
 * @returns { string }
 */
function log(...data) {
  return write(data);
}

/**
 * Error anything the ***modern*** way
 * @param { ...any } data
 * @returns { string }
 */
function err(...data) {
  return write(data, '\x1b[38;2;255;0;0m');
}

/**
 * Warn anything the ***modern*** way
 * @param { ...any } data
 * @returns { string }
 */
function warn(...data) {
  return write(data, '\x1b[38;2;255;255;0m');
}

function download(fileURL, output = './') {
  output = path.resolve(__dirname, output);
  const tmpOut  = `./node_download-${crypto.randomUUID()}`;
  const file    = fs.createWriteStream(tmpOut);
  const handler = fileURL.startsWith('https') ? https : http;
  return new Promise(r => {
    handler.get(fileURL, async res => {
      const s = res.statusCode;
      if (!(s >= 200 && s < 300)) {
        await fsp.unlink(tmpOut);
        return r(false);
      }
      res.pipe(file);
      file.once('finish', async () => {
        file.close();
        await fsp.rename(tmpOut, output, () => {});
        return r(true);
      });
    }).once('error', () => {
      fs.unlink(tmpOut, () => {r(false)});
    });
  });
}

async function writable(path) {
  try {
    await fsp.access(path, fsp.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function readable(path) {
  try {
    await fsp.access(path, fsp.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = { log, err, warn, download, writable, readable }