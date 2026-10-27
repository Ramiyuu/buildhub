const crypto = require("crypto");

// scrypt (nativo do Node, sem dependencia). Formato: scrypt:N:r:p:salt:hash (base64url).
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 96 * 1024 * 1024;

// No maximo 3 hashes ao mesmo tempo: limita a memoria (32 MB cada) mesmo sob ataque de login.
let running = 0;
const waiting = [];
function acquire() {
  if (running < 3) { running += 1; return Promise.resolve(); }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running -= 1;
}

function derive(password, salt, n, r, p, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: n, r, p, maxmem: MAXMEM }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

async function hashPassword(password) {
  await acquire();
  try {
    const salt = crypto.randomBytes(16);
    const key = await derive(password.normalize("NFKC"), salt, N, R, P, KEYLEN);
    return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join(":");
  } finally {
    release();
  }
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  await acquire();
  try {
    const key = await derive(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), Number(n), Number(r), Number(p), expected.length);
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  } finally {
    release();
  }
}

// Hash falso para igualar o tempo de resposta quando o e-mail nao existe.
let dummy;
async function dummyVerify(password) {
  dummy = dummy || (await hashPassword(crypto.randomBytes(8).toString("hex")));
  await verifyPassword(password, dummy);
  return false;
}

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?-_+=";

// Senha aleatoria com pelo menos 1 de cada classe (sem caracteres ambiguos como 0/O, 1/l/I).
function generatePassword(length = 16) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (password.length > 128) return "A senha pode ter no máximo 128 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  return null;
}

module.exports = { hashPassword, verifyPassword, dummyVerify, generatePassword, passwordProblem };
