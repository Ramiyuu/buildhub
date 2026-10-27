// Gera public/admin/js/brasil-map.js a partir da malha oficial de UFs do IBGE (rodar so quando quiser atualizar o mapa).
//   node server/scripts/gen-map.js
const fs = require("fs");
const path = require("path");
const { REGION_OF_UF } = require("../lib/geo");

const URL_IBGE = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&intrarregiao=UF&qualidade=minima";
const UF_BY_CODE = { 11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF" };
const NAMES = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };

// Douglas-Peucker
function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const sq = (a, b, p) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0, index = 0;
    for (let i = first + 1; i < last; i += 1) {
      const d = sq(points[first], points[last], points[i]);
      if (d > max) { max = d; index = i; }
    }
    if (max > tolerance * tolerance) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

(async () => {
  const geo = await (await fetch(URL_IBGE)).json();
  const lon0 = -73.99, lon1 = -34.79, lat0 = -33.75, lat1 = 5.27;
  const k = Math.cos((-14 * Math.PI) / 180);
  const width = 600;
  const scale = width / ((lon1 - lon0) * k);
  const height = Math.round((lat1 - lat0) * scale);
  const px = ([lon, lat]) => [(lon - lon0) * k * scale, (lat1 - lat) * scale];

  const states = {};
  for (const feature of geo.features) {
    const uf = UF_BY_CODE[Number(feature.properties.codarea)];
    if (!uf) continue;
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    let d = "";
    let best = { area: -1, cx: 0, cy: 0 };
    for (const polygon of polygons) {
      polygon.forEach((ring, ringIndex) => {
        const pts = simplify(ring.map(px), 0.45);
        if (pts.length < 3) return;
        d += `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
        if (ringIndex === 0) {
          let a = 0, cx = 0, cy = 0;
          for (let i = 0; i < pts.length; i += 1) {
            const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
            const cross = x1 * y2 - x2 * y1;
            a += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
          }
          a /= 2;
          if (Math.abs(a) > best.area) best = { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
        }
      });
    }
    states[uf] = { name: NAMES[uf], region: REGION_OF_UF[uf], d, cx: Math.round(best.cx), cy: Math.round(best.cy) };
  }

  const ordered = Object.fromEntries(Object.keys(states).sort().map((uf) => [uf, states[uf]]));
  const out = `// Gerado por server/scripts/gen-map.js a partir da malha de UFs do IBGE. Nao edite a mao.\nexport const MAP_VIEWBOX = "0 0 ${width} ${height}";\nexport const STATES = ${JSON.stringify(ordered)};\n`;
  const target = path.join(__dirname, "..", "..", "public", "admin", "js", "brasil-map.js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  console.log(`${Object.keys(ordered).length} estados, ${Math.round(out.length / 1024)} KB, viewBox 0 0 ${width} ${height}`);
})().catch((error) => { console.error(error); process.exit(1); });
