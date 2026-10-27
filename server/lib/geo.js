const crypto = require("crypto");
const geoip = require("geoip-lite");
const config = require("../config");

const REGION_OF_UF = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul"
};

function normalizeIp(ip) {
  let value = String(ip || "").trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value;
}

function clientIp(req) {
  if (config.trustCloudflare) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.length < 64) return normalizeIp(cf);
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress);
}

function isPrivate(ip) {
  return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)
    || ip === "::1" || /^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip) || ip === "";
}

// { country, region, city } ou null. Cloudflare (se confiavel) informa o pais; a regiao vem do banco GeoIP local.
function lookup(req, ip) {
  let country = null;
  if (config.trustCloudflare) {
    const header = req.headers["cf-ipcountry"];
    if (typeof header === "string" && /^[A-Za-z]{2}$/.test(header)) country = header.toUpperCase();
  }
  const found = geoip.lookup(ip);
  if (!country && found) country = found.country;
  if (!country) return null;
  const region = found && found.country === country && REGION_OF_UF[found.region] ? found.region : null;
  return { country, region, city: found && found.country === country ? found.city || null : null };
}

function maskIp(ip) {
  const value = normalizeIp(ip);
  if (value.includes(":")) return `${value.split(":").slice(0, 3).join(":")}::`;
  const parts = value.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : "desconhecido";
}

// Hash diario do visitante: conta visitantes unicos sem guardar IP (LGPD).
function visitorHash(ip, userAgent) {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHmac("sha256", config.sessionSecret).update(`${day}|${ip}|${userAgent || ""}`).digest("hex").slice(0, 20);
}

function ipHash(ip) {
  return crypto.createHmac("sha256", config.sessionSecret).update(`ip|${ip}`).digest("hex").slice(0, 24);
}

function parseUserAgent(ua = "") {
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Outro";
  return { device, browser };
}

const isBot = (ua = "") => !ua || /bot|crawl|spider|slurp|headless|lighthouse|curl|wget|python-requests|httpclient|monitor|uptime/i.test(ua);

module.exports = { REGION_OF_UF, clientIp, isPrivate, lookup, maskIp, visitorHash, ipHash, parseUserAgent, isBot };
