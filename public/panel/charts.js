// Graficos SVG leves (sem biblioteca): linha/area, barras agrupadas, rosca, barras horizontais e sparkline.
import { esc, html, num } from "./ui.js";

export const COLORS = {
  accent: "var(--p-accent)", cyan: "var(--p-cyan)", ok: "var(--p-ok)", warn: "var(--p-warn)",
  danger: "var(--p-danger)", info: "var(--p-info)", rose: "#ff6ac2", muted: "var(--p-muted)"
};
export const PALETTE = [COLORS.accent, COLORS.cyan, COLORS.rose, COLORS.warn, COLORS.ok, COLORS.info];

let uid = 0;

function niceMax(max) {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

function smooth(points) {
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function tipHtml(label, rows) {
  return `<b>${esc(label)}</b>${rows.map((r) => `<span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${r.color}"></i>${esc(r.name)}: <b style="display:inline">${esc(r.value)}</b></span><br>`).join("")}`;
}

// ------------------------------------------------------------------ linha / area
export function lineChart(el, { labels, series, format = num, height = 230, yTicks = 4, width = 640 }) {
  const W = width, H = height, L = 48, R = 12, T = 14, B = 28;
  const plotW = W - L - R, plotH = H - T - B;
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i) => L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => T + plotH - (v / max) * plotH;
  const id = `lg${(uid += 1)}`;
  const step = Math.ceil(n / 7);

  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (max / yTicks) * i, py = y(v);
    return `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${py}" y2="${py}"/><text class="axis" x="${L - 8}" y="${py + 4}" text-anchor="end">${esc(format(v, true))}</text>`;
  }).join("");
  const xl = labels.map((label, i) => (i % step === 0 || i === n - 1 ? `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>` : "")).join("");
  const paths = series.map((s, si) => {
    const pts = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
    const d = n > 1 ? smooth(pts) : `M${pts[0].x} ${pts[0].y}`;
    const area = si === 0 && n > 1 ? `<path d="${d} L${pts[n - 1].x} ${T + plotH} L${pts[0].x} ${T + plotH} Z" fill="url(#${id})"/>` : "";
    return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${si === 0 ? 2.6 : 2}" stroke-linecap="round" stroke-linejoin="round" ${si > 0 ? 'stroke-dasharray="5 4"' : ""}/>`;
  }).join("");

  el.classList.add("chart");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${series[0].color}" stop-opacity=".28"/><stop offset="1" stop-color="${series[0].color}" stop-opacity="0"/></linearGradient></defs>${grid}${xl}${paths}
    <g class="hover" opacity="0"><line x1="0" x2="0" y1="${T}" y2="${T + plotH}" stroke="${COLORS.muted}" stroke-dasharray="3 3"/>${series.map((s) => `<circle r="4.5" fill="var(--p-surface)" stroke="${s.color}" stroke-width="2.5"/>`).join("")}</g></svg><div class="chart-tip"></div>`;

  const svg = el.querySelector("svg"), tip = el.querySelector(".chart-tip"), hover = el.querySelector(".hover");
  const dots = [...hover.querySelectorAll("circle")], line = hover.querySelector("line");
  el.onpointermove = (event) => {
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / plotW) * (n - 1))));
    hover.setAttribute("opacity", "1");
    line.setAttribute("x1", x(i)); line.setAttribute("x2", x(i));
    series.forEach((s, si) => { dots[si].setAttribute("cx", x(i)); dots[si].setAttribute("cy", y(s.values[i])); });
    tip.innerHTML = tipHtml(labels[i], series.map((s) => ({ name: s.name, color: s.color, value: format(s.values[i]) })));
    const scale = rect.width / W;
    tip.style.left = `${Math.max(70, Math.min(rect.width - 70, x(i) * scale))}px`;
    tip.style.top = `${Math.max(46, y(Math.max(...series.map((s) => s.values[i]))) * scale - 10)}px`;
    tip.style.opacity = "1";
  };
  el.onpointerleave = () => { hover.setAttribute("opacity", "0"); tip.style.opacity = "0"; };
}

// ------------------------------------------------------------------ barras agrupadas
export function barChart(el, { labels, series, format = num, height = 230, yTicks = 4, width = 640 }) {
  const W = width, H = height, L = 52, R = 10, T = 14, B = 28;
  const plotW = W - L - R, plotH = H - T - B;
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const y = (v) => T + plotH - (v / max) * plotH;
  const group = plotW / n, bar = Math.min(26, (group * 0.72) / series.length), gap = 3;

  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (max / yTicks) * i, py = y(v);
    return `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${py}" y2="${py}"/><text class="axis" x="${L - 8}" y="${py + 4}" text-anchor="end">${esc(format(v, true))}</text>`;
  }).join("");
  const bars = labels.map((label, i) => {
    const gx = L + group * i + (group - (bar * series.length + gap * (series.length - 1))) / 2;
    return `<g class="g" data-i="${i}"><rect x="${L + group * i}" y="${T}" width="${group}" height="${plotH}" fill="transparent"/>${series.map((s, si) => {
      const h = Math.max(0, plotH - (y(s.values[i]) - T));
      return `<rect x="${gx + si * (bar + gap)}" y="${y(s.values[i])}" width="${bar}" height="${h}" rx="5" fill="${s.color}"/>`;
    }).join("")}<text class="axis" x="${L + group * i + group / 2}" y="${H - 8}" text-anchor="middle">${esc(label)}</text></g>`;
  }).join("");

  el.classList.add("chart");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}${bars}</svg><div class="chart-tip"></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".chart-tip");
  el.onpointermove = (event) => {
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - L) / group)));
    el.querySelectorAll(".g").forEach((g, gi) => { g.style.opacity = gi === i ? "1" : "0.55"; });
    tip.innerHTML = tipHtml(labels[i], series.map((s) => ({ name: s.name, color: s.color, value: format(s.values[i]) })));
    const scale = rect.width / W;
    tip.style.left = `${Math.max(80, Math.min(rect.width - 80, (L + group * i + group / 2) * scale))}px`;
    tip.style.top = `${Math.max(56, y(Math.max(...series.map((s) => s.values[i]))) * scale - 8)}px`;
    tip.style.opacity = "1";
  };
  el.onpointerleave = () => { el.querySelectorAll(".g").forEach((g) => { g.style.opacity = "1"; }); tip.style.opacity = "0"; };
}

// ------------------------------------------------------------------ rosca
export function donut(el, items, { format = num, center = "total" } = {}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const r = 48, C = 2 * Math.PI * r;
  let offset = 0;
  const segs = items.map((item, i) => {
    const len = (item.value / total) * C;
    const seg = `<circle class="seg" data-i="${i}" cx="60" cy="60" r="${r}" fill="none" stroke="${item.color || PALETTE[i % PALETTE.length]}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 1.5)} ${C - Math.max(0, len - 1.5)}" stroke-dashoffset="${-offset}" style="transition:opacity .15s"/>`;
    offset += len;
    return seg;
  }).join("");
  el.classList.add("donut-wrap");
  el.innerHTML = `<svg viewBox="0 0 120 120" role="img"><g transform="rotate(-90 60 60)">${segs}</g><text x="60" y="58" text-anchor="middle" font-size="17" font-weight="800" fill="var(--p-text)" id="dn${uid}">${esc(format(total))}</text><text x="60" y="73" text-anchor="middle" font-size="8.5" fill="var(--p-muted)" data-sub>${esc(center)}</text></svg>
    <div class="legend">${items.map((item, i) => `<span data-i="${i}"><i style="background:${item.color || PALETTE[i % PALETTE.length]}"></i>${esc(item.label)} <b>${Math.round((item.value / total) * 100)}%</b></span>`).join("")}</div>`;
  const main = el.querySelector("text"), sub = el.querySelector("[data-sub]");
  const focus = (i) => {
    el.querySelectorAll(".seg").forEach((s, si) => { s.style.opacity = i === null || si === i ? "1" : "0.3"; });
    main.textContent = i === null ? format(total) : format(items[i].value);
    sub.textContent = i === null ? center : items[i].label;
  };
  el.querySelectorAll("[data-i]").forEach((node) => {
    node.addEventListener("pointerenter", () => focus(Number(node.dataset.i)));
    node.addEventListener("pointerleave", () => focus(null));
  });
}

// ------------------------------------------------------------------ barras horizontais (retorna html)
export function hbars(items, { format = num, color = COLORS.accent, max } = {}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return html`<div class="hbars">${items.map((item) => html`<div class="hbar"><div class="top"><span>${item.label}</span><span class="muted">${format(item.value)}</span></div><div class="progress"><i style="width:${(item.value / top) * 100}%;background:${item.color || color}"></i></div></div>`)}</div>`;
}

// ------------------------------------------------------------------ sparkline (retorna svg em texto)
export function sparkline(values, color = COLORS.accent) {
  if (values.length < 2) return "";
  const W = 96, H = 34, max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => ({ x: (i / (values.length - 1)) * W, y: H - 3 - ((v - min) / span) * (H - 8) }));
  const d = smooth(pts);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W} ${H} L0 ${H} Z" fill="${color}" opacity=".13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}
