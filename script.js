/* =====================================================================
   ForgeSight - script.js
   All the behavior of the dashboard lives here.

   HOW TO READ THIS FILE (top to bottom)
   1.  Helpers            - tiny reusable functions
   2.  Demo data          - fictional systems and alerts
   3.  App state          - one object that remembers filters, selections...
   4.  Small UI pieces    - toast messages, tooltip, badges, stat cards
   5.  Chart builders     - line chart, donut, bars (all pure SVG/HTML)
   6.  Page: Overview
   7.  Page: Systems Monitoring (+ system popup)
   8.  Page: Security Alerts
   9.  Page: Alert Details
   10. Page: Analytics
   11. Global search
   12. Router            - shows the right page when the URL "#hash" changes
   13. Event listeners   - clicks, typing, keyboard shortcuts
   14. Live simulation   - numbers that move every 2 seconds
   15. Start the app
   ===================================================================== */

"use strict";


/* =====================================================================
   1. HELPERS
   ===================================================================== */

// $("#id") finds one element. $$(".class") finds all matching elements.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

// Makes text safe to place inside HTML (prevents accidental HTML injection).
function esc(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (c) => map[c]);
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A "seeded" random generator: same seed -> same numbers every time.
// We use it so the demo data looks consistent instead of jumping around.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a list of numbers that drift up and down (a "random walk").
function walk(rng, count, start, step, min, max) {
  const out = [];
  let value = start;
  for (let i = 0; i < count; i++) {
    value = clamp(value + (rng() - 0.5) * 2 * step, min, max);
    out.push(value);
  }
  return out;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();

function timeAgo(ts) {
  const minutes = Math.floor(Math.max(0, Date.now() - ts) / MIN);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " h ago";
  return Math.floor(hours / 24) + " d ago";
}

function formatDateTime(ts) {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Icons used inside JavaScript-generated HTML (paths from a simple line-icon style).
const ICONS = {
  server: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><line x1="7" y1="7" x2="7.01" y2="7"/><line x1="7" y1="17" x2="7.01" y2="17"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14 9 11"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
};
const icon = (name) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;


/* =====================================================================
   2. DEMO DATA  (100% fictional)
   ===================================================================== */

const SITES = ["Northbay Plant", "Harbor Terminal", "Ridgeline Works", "Delta Utilities"];
const SITE_COLORS = ["#ffb020", "#38e1ff", "#34d399", "#a78bfa"];
const NETWORK_BASE = [480, 620, 350, 540]; // fake Mbps per site

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_COLORS = { critical: "#ff4d5e", high: "#ff8a3d", medium: "#ffc933", low: "#4cc9a0" };
const STATUS_ORDER = { critical: 0, warning: 1, offline: 2, online: 3 };
const STATUS_COLORS = { online: "#34d399", warning: "#ffc933", critical: "#ff4d5e", offline: "#5d6879" };

const CATEGORIES = [
  "Unauthorized Access",
  "Malware Signature",
  "Protocol Anomaly",
  "Firmware Integrity",
  "Network Scan",
  "Configuration Change",
  "Credential Abuse",
];

// Suggested response steps for each alert category.
const PLAYBOOKS = {
  "Unauthorized Access": [
    "Isolate the source host from the control network",
    "Verify the command with the on-duty operator",
    "Review recent write operations on the target controller",
    "Rotate credentials for affected accounts",
  ],
  "Malware Signature": [
    "Quarantine the affected workstation",
    "Capture a memory and disk image for analysis",
    "Scan connected engineering assets for the same signature",
    "Block the indicators at the network boundary",
  ],
  "Protocol Anomaly": [
    "Capture packets for the affected conversation",
    "Compare traffic against the protocol baseline",
    "Confirm the controller state with the operator",
    "Add a deep-inspection rule for the pattern",
  ],
  "Firmware Integrity": [
    "Compare the running hash with the vendor release",
    "Disable remote firmware updates on the device",
    "Schedule a verified reflash in the next window",
    "Review who accessed the device in the last 30 days",
  ],
  "Network Scan": [
    "Identify the scanning host and its owner",
    "Check whether a discovery job is scheduled",
    "Tighten segmentation rules for the scanned segment",
    "Monitor for follow-up connection attempts",
  ],
  "Configuration Change": [
    "Match the change against open change tickets",
    "Restore the last approved configuration if unplanned",
    "Confirm safety limits with the process engineer",
    "Enable change approval alerts for this device",
  ],
  "Credential Abuse": [
    "Lock the targeted account temporarily",
    "Check authentication logs for the source host",
    "Enforce multi-factor authentication on the HMI",
    "Reset the credentials and notify the account owner",
  ],
};

// Small helper that turns a row of values into a system object.
function makeSystem(id, name, site, type, status, health, load, temp, uptimeDays, firmware, ip, protocol) {
  return { id, name, site, type, status, health, load, temp, uptimeDays, firmware, ip, protocol, baseLoad: load, baseTemp: temp };
}

const SYSTEMS = [
  makeSystem("SYS-101", "Compressor Station C-12", "Northbay Plant", "Compressor", "warning", 78, 82, 71, 142, "v4.2.1", "10.20.1.12", "Modbus/TCP"),
  makeSystem("SYS-102", "Boiler Control Unit B-04", "Northbay Plant", "Boiler", "online", 94, 64, 58, 311, "v3.9.0", "10.20.1.24", "OPC UA"),
  makeSystem("SYS-103", "Packaging Line PL-07", "Northbay Plant", "Production line", "online", 97, 71, 44, 87, "v2.8.5", "10.20.2.7", "EtherNet/IP"),
  makeSystem("SYS-104", "Turbine Controller T-01", "Ridgeline Works", "Turbine", "critical", 52, 91, 88, 23, "v5.0.2", "10.30.4.1", "DNP3"),
  makeSystem("SYS-105", "Cooling Loop CL-09", "Ridgeline Works", "Cooling", "online", 91, 55, 31, 204, "v3.1.4", "10.30.4.9", "Modbus/TCP"),
  makeSystem("SYS-106", "Conveyor Drive CD-15", "Ridgeline Works", "Drive", "online", 96, 68, 49, 168, "v1.7.3", "10.30.5.15", "PROFINET"),
  makeSystem("SYS-107", "Water Treatment WT-02", "Delta Utilities", "Treatment", "warning", 81, 59, 36, 96, "v6.1.0", "10.50.1.2", "S7comm"),
  makeSystem("SYS-108", "Chemical Dosing CD-08", "Delta Utilities", "Dosing", "online", 93, 47, 33, 255, "v2.4.8", "10.50.1.8", "OPC UA"),
  makeSystem("SYS-109", "Pump Station PS-11", "Delta Utilities", "Pump", "offline", 0, 0, 22, 0, "v3.3.3", "10.50.2.11", "Modbus/TCP"),
  makeSystem("SYS-110", "Substation Gateway SG-03", "Harbor Terminal", "Gateway", "critical", 47, 88, 79, 12, "v7.2.0", "10.40.2.8", "IEC 61850"),
  makeSystem("SYS-111", "Robotic Cell RC-21", "Harbor Terminal", "Robotics", "online", 98, 73, 52, 119, "v4.0.6", "10.40.3.21", "EtherNet/IP"),
  makeSystem("SYS-112", "Grid Edge Router GR-05", "Harbor Terminal", "Network", "warning", 74, 66, 61, 64, "v1.9.2", "10.40.6.5", "MQTT"),
];

const ANALYSTS = ["Amira K.", "Daniel O.", "Priya S.", "Marco T."];

// One row per alert:
// [id, minutes ago, severity, status, category, systemId, title, source IP, protocol, confidence %, description]
const ALERT_ROWS = [
  ["ALT-2051", 6, "critical", "open", "Unauthorized Access", "SYS-104", "Unauthorized write to turbine speed setpoint", "10.30.9.44", "DNP3", 96,
    "A DNP3 write request changed the turbine speed setpoint. The sending host is not on the approved engineering workstation list."],
  ["ALT-2050", 14, "critical", "open", "Firmware Integrity", "SYS-110", "Firmware hash mismatch on substation gateway", "10.40.2.8", "IEC 61850", 91,
    "The running firmware image on the substation gateway does not match the signed vendor hash recorded at commissioning."],
  ["ALT-2049", 27, "high", "investigating", "Protocol Anomaly", "SYS-101", "Malformed Modbus function code sequence", "10.20.7.31", "Modbus/TCP", 84,
    "A burst of Modbus requests used an invalid function code sequence, a pattern often seen when tools fuzz or misprobe a controller."],
  ["ALT-2048", 41, "high", "open", "Credential Abuse", "SYS-107", "Repeated failed logins on HMI operator account", "10.50.1.77", "HTTPS", 88,
    "Eleven failed logins against the local HMI operator account were recorded within four minutes from a single workstation."],
  ["ALT-2047", 58, "medium", "open", "Network Scan", "SYS-112", "Port sweep detected on edge network segment", "10.40.6.201", "TCP/IP", 79,
    "One host probed 240 ports across the edge network segment in under a minute. No successful connections were observed."],
  ["ALT-2046", 85, "high", "investigating", "Malware Signature", "SYS-103", "Known dropper signature in engineering laptop traffic", "10.20.2.90", "SMB", 93,
    "Engineering laptop traffic matched a signature for a known dropper family while transferring project files over SMB."],
  ["ALT-2045", 130, "medium", "open", "Configuration Change", "SYS-102", "Safety limit threshold modified outside change window", "10.20.1.5", "OPC UA", 82,
    "A safety limit threshold on the boiler controller was edited outside the approved maintenance window."],
  ["ALT-2044", 190, "low", "resolved", "Network Scan", "SYS-105", "Low-rate ICMP sweep from monitoring subnet", "10.30.1.15", "ICMP", 71,
    "A slow ICMP sweep came from the monitoring subnet. It matches a scheduled asset discovery job."],
  ["ALT-2043", 260, "medium", "investigating", "Protocol Anomaly", "SYS-108", "OPC UA security policy downgrade before recipe read", "10.50.3.12", "OPC UA", 77,
    "An OPC UA session negotiated a weaker security policy before reading dosing recipes from the controller."],
  ["ALT-2042", 340, "critical", "investigating", "Malware Signature", "SYS-104", "Remote-access tool signature on turbine engineering host", "10.30.9.12", "TCP/IP", 95,
    "A memory-resident process matching a known remote-access tool was detected on the turbine engineering host."],
  ["ALT-2041", 480, "low", "resolved", "Configuration Change", "SYS-106", "Configuration backup restored without ticket", "10.30.5.2", "PROFINET", 68,
    "A configuration backup was restored on the conveyor drive without a linked change ticket. Verified as planned maintenance."],
  ["ALT-2040", 720, "high", "resolved", "Unauthorized Access", "SYS-109", "Remote session from unrecognized VPN endpoint", "172.16.40.9", "RDP", 90,
    "A remote session reached the pump station controller from an unrecognized VPN endpoint. Access was revoked and credentials rotated."],
  ["ALT-2039", 1000, "medium", "resolved", "Credential Abuse", "SYS-111", "Service account used from two sites within minutes", "10.40.3.50", "HTTPS", 74,
    "A service account authenticated from two sites within minutes. Confirmed as a misconfigured automation job."],
  ["ALT-2038", 1500, "low", "open", "Network Scan", "SYS-103", "Periodic port scan from contractor laptop", "10.20.8.140", "TCP/IP", 66,
    "A contractor laptop on the packaging line network runs a low-volume port scan at regular intervals."],
  ["ALT-2037", 2100, "high", "resolved", "Firmware Integrity", "SYS-107", "Controller firmware differs from approved baseline", "10.50.1.2", "S7comm", 86,
    "Controller firmware did not match the approved baseline after a vendor visit. It was reflashed to the approved image."],
  ["ALT-2036", 2900, "medium", "resolved", "Protocol Anomaly", "SYS-112", "Duplicate MQTT client IDs causing reconnect loops", "10.40.6.77", "MQTT", 73,
    "Duplicate MQTT client IDs caused repeated reconnects on the grid edge router. The client configuration was corrected."],
];

// Turn each row into a full alert object with a timeline and checklist.
const ALERTS = ALERT_ROWS.map((row, index) => {
  const [id, minutesAgo, severity, status, category, systemId, title, sourceIp, protocol, confidence, description] = row;
  const createdAt = NOW - minutesAgo * MIN;
  const assignee = status === "open" ? "" : ANALYSTS[index % ANALYSTS.length];

  const timeline = [
    { time: createdAt, text: "Detection rule fired: " + category, kind: "detect" },
    { time: createdAt + 40 * 1000, text: "Correlated with " + (3 + (index % 5)) + " related network events", kind: "info" },
  ];
  if (status !== "open") {
    timeline.push({ time: createdAt + 6 * MIN, text: "Assigned to " + assignee + " and moved to Investigating", kind: "status" });
  }
  if (status === "resolved") {
    timeline.push({ time: createdAt + 55 * MIN, text: "Marked as resolved after verification", kind: "resolve" });
  }

  const actions = PLAYBOOKS[category].map((text, i) => ({
    text,
    done: status === "resolved" ? true : status === "investigating" && i === 0,
  }));

  return { id, createdAt, severity, status, category, systemId, title, sourceIp, protocol, confidence, description, assignee, escalated: false, timeline, actions };
});


/* =====================================================================
   3. APP STATE  (the app's memory)
   ===================================================================== */

const state = {
  page: "overview",
  systems: SYSTEMS,
  alerts: ALERTS,
  selectedAlertId: null,

  // Filters for the Systems page
  sys: { search: "", status: "all", site: "all", sort: "status", view: "grid" },
  // Filters for the Alerts page
  al: { search: "", severity: "all", status: "all", category: "all", sort: "newest" },

  telemetryMetric: "load",
  telemetry: {},
  analytics: { range: 14, seed: 7 },
};

const findAlert = (id) => state.alerts.find((a) => a.id === id);
const findSystem = (id) => state.systems.find((s) => s.id === id);
const systemName = (id) => (findSystem(id) ? findSystem(id).name : "Unknown system");
const activeAlerts = () => state.alerts.filter((a) => a.status !== "resolved");
const average = (list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : 0);

function sortAlerts(list, mode) {
  const copy = list.slice();
  if (mode === "oldest") return copy.sort((a, b) => a.createdAt - b.createdAt);
  if (mode === "severity") {
    return copy.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt - a.createdAt);
  }
  return copy.sort((a, b) => b.createdAt - a.createdAt);
}

// Navigate to a hash, and make sure the page refreshes even if the hash is unchanged.
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}


/* =====================================================================
   4. SMALL UI PIECES
   ===================================================================== */

// ----- Toast messages (little pop-ups in the corner) -----
function toast(message, type = "info") {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ----- Tooltip (follows the mouse over anything with a data-tip attribute) -----
const tipEl = $("#tooltip");

function showTip(html, x, y) {
  if (!html) return hideTip();
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  let left = x + 16;
  let top = y + 16;
  if (left + w > window.innerWidth - 8) left = x - w - 16;
  if (top + h > window.innerHeight - 8) top = y - h - 16;
  tipEl.style.left = Math.max(8, left) + "px";
  tipEl.style.top = Math.max(8, top) + "px";
}
function hideTip() {
  tipEl.hidden = true;
}

// ----- Sidebar badges and the bell counter -----
function setBadge(selector, count) {
  const el = $(selector);
  el.textContent = count;
  el.hidden = count === 0;
}
function updateBadges() {
  const active = activeAlerts();
  setBadge("#navAlertsBadge", active.length);
  setBadge("#bellCount", active.filter((a) => a.severity === "critical").length);
  setBadge("#navSystemsBadge", state.systems.filter((s) => s.status !== "online").length);
}

// ----- Badges used in tables and lists -----
const sevBadge = (sev) => `<span class="badge sev-${sev}"><span class="dot ${sev}"></span>${cap(sev)}</span>`;
const alertStatusPill = (st) => `<span class="status-pill st-${st}">${cap(st)}</span>`;
const sysStatusPill = (st) => `<span class="status-pill st-${st}"><span class="dot ${st}"></span>${cap(st)}</span>`;

// ----- Stat cards (the big numbers at the top of pages) -----
function sparkline(values, color) {
  const w = 96;
  const h = 32;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => [i * (w / (values.length - 1)), h - 3 - ((v - min) / span) * (h - 6)]);
  const d = smoothPath(points);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d} L${w},${h} L0,${h} Z" fill="${color}" opacity="0.12"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function statCard(c, index) {
  const delta = c.delta ? `<span class="delta ${c.deltaGood ? "good" : "bad"}">${c.delta}</span> ` : "";
  return `
    <article class="stat-card tone-${c.tone}" style="--i:${index}">
      <div class="stat-top"><span class="stat-label">${c.label}</span><span class="stat-ico">${icon(c.icon)}</span></div>
      <div class="stat-value"><span class="count" data-to="${c.value}" data-dec="${c.dec || 0}">0</span>${c.suffix ? `<small>${c.suffix}</small>` : ""}</div>
      <div class="stat-foot"><span class="stat-note">${delta}${c.note || ""}</span>${c.spark ? sparkline(c.spark, c.color) : ""}</div>
    </article>`;
}

// Numbers count up from 0 when a card appears.
function animateCounts(root = document) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $$(".count", root).forEach((el) => {
    const to = parseFloat(el.dataset.to);
    const dec = parseInt(el.dataset.dec || "0", 10);
    if (reduced) {
      el.textContent = to.toFixed(dec);
      return;
    }
    const start = performance.now();
    const duration = 900;
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(dec);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// Fixed sparkline data so the cards look the same every visit.
const SPARKS = {
  online: walk(seededRandom(11), 14, 9, 1.2, 5, 12),
  alerts: walk(seededRandom(23), 14, 8, 2, 3, 14),
  critical: walk(seededRandom(37), 14, 2, 1.2, 0, 6),
  health: walk(seededRandom(41), 14, 82, 3, 70, 95),
};


/* =====================================================================
   5. CHART BUILDERS  (no libraries, just SVG and HTML)
   ===================================================================== */

// Turns a list of [x, y] points into a smooth curved SVG path.
function smoothPath(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

let chartCounter = 0;

/*
  lineChart(element, options)
  options: series [{name, color, values, area}], xLabels, min, max, unit, height, decimals, animate
*/
function lineChart(el, o) {
  const uid = ++chartCounter;
  const w = Math.max(280, el.clientWidth || 600);
  const h = o.height || 260;
  const m = { t: 12, r: 16, b: 28, l: 46 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;
  const n = o.series[0].values.length;
  const decimals = o.decimals || 0;
  const animate = o.animate !== false;

  const all = o.series.flatMap((s) => s.values);
  let min = o.min !== undefined ? o.min : Math.max(0, Math.floor(Math.min(...all) * 0.9));
  let max = o.max !== undefined ? o.max : Math.ceil(Math.max(...all) * 1.1);
  if (max === min) max = min + 1;

  const x = (i) => m.l + (n === 1 ? 0 : (i * iw) / (n - 1));
  const y = (v) => m.t + ih - ((v - min) / (max - min)) * ih;

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(o.label || "Line chart")}"><defs>`;
  o.series.forEach((s, i) => {
    svg += `<linearGradient id="lg${uid}-${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.color}" stop-opacity="0.3"/><stop offset="100%" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
  });
  svg += "</defs>";

  // Horizontal grid lines + y-axis labels
  for (let i = 0; i <= 4; i++) {
    const value = min + ((max - min) * i) / 4;
    const yy = y(value);
    svg += `<line class="grid-line" x1="${m.l}" x2="${w - m.r}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text class="axis-text" x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${Math.round(value)}</text>`;
  }

  // X-axis labels (5 evenly spaced)
  if (o.xLabels) {
    const seen = new Set();
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
      const i = Math.round(f * (n - 1));
      if (seen.has(i)) return;
      seen.add(i);
      const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      svg += `<text class="axis-text" x="${x(i)}" y="${h - 6}" text-anchor="${anchor}">${esc(o.xLabels[i])}</text>`;
    });
  }

  // The lines (and optional filled areas)
  o.series.forEach((s, i) => {
    const pts = s.values.map((v, k) => [x(k), y(v)]);
    const d = smoothPath(pts);
    if (s.area) {
      svg += `<path class="area-path ${animate ? "" : "no-anim"}" d="${d} L${x(n - 1)},${m.t + ih} L${x(0)},${m.t + ih} Z" fill="url(#lg${uid}-${i})"/>`;
    }
    svg += `<path class="line-path ${animate ? "" : "no-anim"}" d="${d}" stroke="${s.color}"/>`;
  });

  // Hover helpers: a vertical line, one dot per series, and an invisible catcher rectangle
  svg += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}"/>`;
  o.series.forEach((s) => {
    svg += `<circle class="hover-dot" r="4.5" fill="${s.color}"/>`;
  });
  svg += `<rect class="hit" data-tip="" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/></svg>`;

  el.innerHTML = svg;

  const svgEl = $("svg", el);
  const hit = $(".hit", el);
  const cross = $(".cross", el);
  const dots = $$(".hover-dot", el);

  hit.addEventListener("pointermove", (e) => {
    const rect = svgEl.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (w / rect.width);
    const i = clamp(Math.round(((px - m.l) / iw) * (n - 1)), 0, n - 1);
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.style.opacity = 1;
    dots.forEach((dot, k) => {
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(o.series[k].values[i]));
      dot.style.opacity = 1;
    });
    let html = o.xLabels ? `<div class="tt-title">${esc(o.xLabels[i])}</div>` : "";
    o.series.forEach((s) => {
      html += `<div class="tt-row"><i style="background:${s.color}"></i>${esc(s.name)} <b>${s.values[i].toFixed(decimals)}${esc(o.unit || "")}</b></div>`;
    });
    hit.dataset.tip = html; // the global tooltip listener will display this
  });
  hit.addEventListener("pointerleave", () => {
    cross.style.opacity = 0;
    dots.forEach((dot) => (dot.style.opacity = 0));
    hit.dataset.tip = "";
  });
}

// Donut chart: segments = [{label, value, color}]
function donut(el, segments, centerValue, centerLabel) {
  const R = 70;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let offset = 0;

  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const len = (s.value / total) * C;
      const gap = segments.length > 1 ? 3 : 0;
      const tip = `<div class="tt-row"><i style="background:${s.color}"></i>${esc(s.label)} <b>${s.value} (${Math.round((s.value / total) * 100)}%)</b></div>`;
      const arc = `<circle class="donut-seg" cx="95" cy="95" r="${R}" stroke="${s.color}"
        stroke-dasharray="${Math.max(len - gap, 0.5)} ${C}" stroke-dashoffset="${-offset}"
        style="animation-delay:${i * 120}ms" data-tip="${esc(tip)}"/>`;
      offset += len;
      return arc;
    })
    .join("");

  const legend = segments
    .map((s) => `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${esc(s.label)} <b>${s.value}</b></span>`)
    .join("");

  el.innerHTML = `
    <div class="donut">
      <div class="donut-box">
        <svg viewBox="0 0 190 190" role="img" aria-label="Donut chart"><circle class="donut-track" cx="95" cy="95" r="${R}"/>${arcs}</svg>
        <div class="donut-center"><b>${centerValue}</b><span>${esc(centerLabel)}</span></div>
      </div>
      <div class="legend">${legend}</div>
    </div>`;
}

// Horizontal bars: items = [{label, value}]
function hBars(el, items) {
  const max = Math.max(...items.map((i) => i.value), 1);
  el.innerHTML = items
    .map(
      (item, i) => `
      <div class="hbar-row">
        <span class="hbar-label" title="${esc(item.label)}">${esc(item.label)}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(item.value / max) * 100}%;--i:${i}"></div></div>
        <span class="hbar-val">${item.value}</span>
      </div>`
    )
    .join("");
}

// Vertical bars: items = [{label, value}]
function vBars(el, items, unit) {
  const max = Math.max(...items.map((i) => i.value), 1);
  el.innerHTML =
    '<div class="vbars">' +
    items
      .map((item, i) => {
        const tip = `<div class="tt-title">${esc(item.label)}</div><b>${item.value}${esc(unit)}</b>`;
        return `
        <div class="vbar">
          <span class="vbar-val">${item.value}</span>
          <div class="vbar-col"><div class="vbar-fill" style="height:${(item.value / max) * 100}%;--i:${i}" data-tip="${esc(tip)}"></div></div>
          <span class="vbar-label">${esc(item.label)}</span>
        </div>`;
      })
      .join("") +
    "</div>";
}


/* =====================================================================
   6. PAGE: OVERVIEW
   ===================================================================== */

const METRICS = {
  load: { label: "Load", unit: "%", min: 20, max: 100 },
  temp: { label: "Temperature", unit: "°C", min: 20, max: 100 },
  network: { label: "Network", unit: " Mbps", min: 0, max: 1000 },
};

// Average value for one site and one metric, based on its systems.
function siteValue(siteIndex, metric) {
  if (metric === "network") return NETWORK_BASE[siteIndex];
  const running = state.systems.filter((s) => s.site === SITES[siteIndex] && s.status !== "offline");
  return average(running.map((s) => (metric === "load" ? s.load : s.temp)));
}

function initTelemetry() {
  const rng = seededRandom(99);
  Object.keys(METRICS).forEach((key) => {
    const m = METRICS[key];
    const step = key === "network" ? 45 : 3;
    state.telemetry[key] = SITES.map((site, k) => walk(rng, 40, siteValue(k, key), step, m.min + 5, m.max - 5));
  });
}

function tickTelemetry() {
  Object.keys(METRICS).forEach((key) => {
    const m = METRICS[key];
    const noise = key === "network" ? 70 : 4;
    state.telemetry[key].forEach((arr, k) => {
      const last = arr[arr.length - 1];
      const target = siteValue(k, key);
      const next = clamp(last + (target - last) * 0.2 + (Math.random() - 0.5) * noise, m.min + 5, m.max - 5);
      arr.push(next);
      arr.shift();
    });
  });
}

function drawTelemetry(animate) {
  const key = state.telemetryMetric;
  const m = METRICS[key];
  const data = state.telemetry[key];
  const n = data[0].length;
  const xLabels = Array.from({ length: n }, (_, i) => (i === n - 1 ? "now" : "-" + (n - 1 - i) * 2 + "s"));

  lineChart($("#telemetryChart"), {
    label: m.label + " by site",
    series: SITES.map((name, i) => ({ name, color: SITE_COLORS[i], values: data[i], area: false })),
    xLabels,
    min: m.min,
    max: m.max,
    unit: m.unit,
    height: 280,
    animate,
  });
  updateTelemetryLegend();
}

function updateTelemetryLegend() {
  const key = state.telemetryMetric;
  const m = METRICS[key];
  $("#telemetryLegend").innerHTML = SITES.map((name, i) => {
    const arr = state.telemetry[key][i];
    return `<span class="legend-item"><span class="legend-swatch" style="background:${SITE_COLORS[i]}"></span>${esc(name)} <b>${Math.round(arr[arr.length - 1])}${m.unit}</b></span>`;
  }).join("");
}

function renderOverview() {
  const systems = state.systems;
  const total = systems.length;
  const countStatus = (st) => systems.filter((s) => s.status === st).length;
  const online = countStatus("online");
  const active = activeAlerts();
  const open = active.filter((a) => a.status === "open").length;
  const investigating = active.length - open;
  const critical = active.filter((a) => a.severity === "critical").length;
  const health = average(systems.filter((s) => s.status !== "offline").map((s) => s.health));

  const cards = [
    { label: "Systems online", icon: "server", tone: "green", color: "#34d399", value: online, suffix: "/" + total, note: total - online + " need attention", spark: SPARKS.online },
    { label: "Active alerts", icon: "shield", tone: "amber", color: "#ffb020", value: active.length, note: open + " open · " + investigating + " investigating", spark: SPARKS.alerts },
    { label: "Critical alerts", icon: "alert", tone: "red", color: "#ff4d5e", value: critical, note: critical ? "Immediate review needed" : "All clear", spark: SPARKS.critical },
    { label: "Fleet health", icon: "pulse", tone: "cyan", color: "#38e1ff", value: health.toFixed(1), dec: 1, suffix: "%", delta: "▲ 1.2%", deltaGood: true, note: "vs yesterday", spark: SPARKS.health },
  ];
  $("#overviewStats").innerHTML = cards.map(statCard).join("");
  animateCounts($("#overviewStats"));

  // Metric buttons
  $$("#telemetryMetric button").forEach((b) => b.classList.toggle("active", b.dataset.metric === state.telemetryMetric));
  drawTelemetry(true);

  // Fleet status donut
  donut(
    $("#statusDonut"),
    ["online", "warning", "critical", "offline"].map((st) => ({ label: cap(st), value: countStatus(st), color: STATUS_COLORS[st] })),
    total,
    "systems"
  );

  // Recent alerts (newest 6)
  $("#recentAlerts").innerHTML = sortAlerts(state.alerts, "newest")
    .slice(0, 6)
    .map(
      (a, i) => `
      <li style="--i:${i}">
        <button class="feed-item bar-${a.severity}" data-alert="${a.id}" type="button">
          <div class="feed-main">
            <div class="feed-title">${esc(a.title)}</div>
            <div class="feed-sub">${a.id} · ${esc(systemName(a.systemId))}</div>
          </div>
          ${sevBadge(a.severity)}
          <span class="feed-time">${timeAgo(a.createdAt)}</span>
        </button>
      </li>`
    )
    .join("");

  // Systems needing attention (worst health first)
  $("#attentionList").innerHTML = systems
    .filter((s) => s.status !== "online")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.health - b.health)
    .slice(0, 6)
    .map(
      (s, i) => `
      <li style="--i:${i}">
        <button class="feed-item bar-${s.status}" data-sys="${s.id}" type="button">
          <div class="feed-main">
            <div class="feed-title">${esc(s.name)}</div>
            <div class="feed-sub">${esc(s.site)} · ${esc(s.type)}</div>
          </div>
          ${sysStatusPill(s.status)}
          <span class="feed-time">${s.health}%</span>
        </button>
      </li>`
    )
    .join("");
}


/* =====================================================================
   7. PAGE: SYSTEMS MONITORING
   ===================================================================== */

function getFilteredSystems() {
  const f = state.sys;
  const q = f.search.trim().toLowerCase();
  const list = state.systems.filter((s) => {
    const matchesText = !q || [s.id, s.name, s.type, s.site, s.protocol].join(" ").toLowerCase().includes(q);
    return matchesText && (f.status === "all" || s.status === f.status) && (f.site === "all" || s.site === f.site);
  });
  if (f.sort === "health") list.sort((a, b) => a.health - b.health);
  else if (f.sort === "load") list.sort((a, b) => b.load - a.load);
  else if (f.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.health - b.health);
  return list;
}

// Text for live-updating numbers (shows a dash when a system is offline).
function metricText(s, key) {
  if (s.status === "offline" && (key === "load" || key === "temp")) return "—";
  if (key === "load") return Math.round(s.load) + "%";
  if (key === "temp") return Math.round(s.temp) + "°C";
  if (key === "uptime") return s.uptimeDays + "d";
  return s.health + "%";
}

function renderSystems(animate = true) {
  savePrefs();
  // Keep the controls in sync with the state
  const f = state.sys;
  const search = $("#sysSearch");
  if (search.value !== f.search) search.value = f.search;
  $("#sysSite").value = f.site;
  $("#sysSort").value = f.sort;
  $$("#sysStatusChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.status === f.status));
  $$("#sysView button").forEach((b) => b.classList.toggle("active", b.dataset.view === f.view));

  const list = getFilteredSystems();
  $("#sysCount").textContent = `Showing ${list.length} of ${state.systems.length} systems`;
  const box = $("#sysContainer");
  box.classList.toggle("no-anim", !animate);

  if (!list.length) {
    box.innerHTML = `<div class="panel empty"><strong>No systems match your filters</strong><p>Try a different search or status.</p></div>`;
    return;
  }

  if (f.view === "table") {
    box.innerHTML = `
      <div class="panel table-panel"><div class="table-wrap"><table class="table">
        <thead><tr>
          <th>System</th><th class="hide-sm">Site</th><th>Status</th><th>Health</th>
          <th class="hide-sm">Load</th><th class="hide-md">Temp</th><th class="hide-md">Uptime</th><th aria-label="Open"></th>
        </tr></thead>
        <tbody>${list
          .map(
            (s, i) => `
          <tr data-sys="${s.id}" tabindex="0" style="--i:${i}">
            <td><div class="cell-title">${esc(s.name)}</div><div class="cell-sub">${s.id} · ${esc(s.type)}</div></td>
            <td class="hide-sm">${esc(s.site)}</td>
            <td>${sysStatusPill(s.status)}</td>
            <td><div style="display:flex;align-items:center;gap:10px"><div class="meter" style="width:80px"><div class="meter-fill m-${s.status}" style="width:${s.health}%"></div></div><span class="mono">${s.health}%</span></div></td>
            <td class="hide-sm"><span class="mono" data-m="load">${metricText(s, "load")}</span></td>
            <td class="hide-md"><span class="mono" data-m="temp">${metricText(s, "temp")}</span></td>
            <td class="hide-md"><span class="mono">${metricText(s, "uptime")}</span></td>
            <td class="chev">›</td>
          </tr>`
          )
          .join("")}</tbody>
      </table></div></div>`;
    return;
  }

  box.innerHTML =
    '<div class="sys-grid">' +
    list
      .map(
        (s, i) => `
      <article class="sys-card status-${s.status}" data-sys="${s.id}" tabindex="0" role="button" aria-label="Open ${esc(s.name)}" style="--i:${i}">
        <div class="sys-top"><span class="sys-id">${s.id}</span>${sysStatusPill(s.status)}</div>
        <h3>${esc(s.name)}</h3>
        <p class="sys-meta">${esc(s.site)} · ${esc(s.type)}</p>
        <div class="meter-row"><span>Health</span><b>${s.health}%</b></div>
        <div class="meter"><div class="meter-fill m-${s.status}" style="width:${s.health}%"></div></div>
        <div class="sys-metrics">
          <div><span>Load</span><b data-m="load">${metricText(s, "load")}</b></div>
          <div><span>Temp</span><b data-m="temp">${metricText(s, "temp")}</b></div>
          <div><span>Uptime</span><b>${metricText(s, "uptime")}</b></div>
        </div>
      </article>`
      )
      .join("") +
    "</div>";
}

// Called every 2 seconds: updates numbers without redrawing the page.
function updateLiveValues() {
  state.systems.forEach((s) => {
    $$(`[data-sys="${s.id}"] [data-m]`).forEach((el) => {
      el.textContent = metricText(s, el.dataset.m);
    });
  });
}

// ----- System popup (modal) -----
let lastFocused = null;

function openSystem(id) {
  const s = findSystem(id);
  if (!s) return;
  const related = sortAlerts(state.alerts.filter((a) => a.systemId === id), "newest");

  $("#sysModalBody").innerHTML = `
    <div class="modal-head">
      <span class="sys-id">${s.id}</span>
      <h2 id="sysModalTitle">${esc(s.name)}</h2>
      <div>${sysStatusPill(s.status)}</div>
    </div>

    <div class="modal-metrics">
      <div><span>Health</span><b>${metricText(s, "health")}</b></div>
      <div><span>Load</span><b>${metricText(s, "load")}</b></div>
      <div><span>Temp</span><b>${metricText(s, "temp")}</b></div>
      <div><span>Uptime</span><b>${metricText(s, "uptime")}</b></div>
    </div>

    <div class="modal-section">
      <h3>Load history (last 30 min)</h3>
      <div class="chart" id="modalChart"></div>
    </div>

    <div class="modal-section">
      <h3>Details</h3>
      <dl class="kv">
        <div><dt>Site</dt><dd>${esc(s.site)}</dd></div>
        <div><dt>Type</dt><dd>${esc(s.type)}</dd></div>
        <div><dt>Protocol</dt><dd>${esc(s.protocol)}</dd></div>
        <div><dt>Firmware</dt><dd>${esc(s.firmware)}</dd></div>
        <div><dt>IP address</dt><dd class="mono">${esc(s.ip)}</dd></div>
      </dl>
    </div>

    <div class="modal-section">
      <h3>Related alerts (${related.length})</h3>
      ${
        related.length
          ? '<ul class="feed">' +
            related
              .slice(0, 4)
              .map(
                (a) => `
            <li><button class="feed-item bar-${a.severity}" data-alert="${a.id}" type="button">
              <div class="feed-main"><div class="feed-title">${esc(a.title)}</div><div class="feed-sub">${a.id} · ${timeAgo(a.createdAt)}</div></div>
              ${alertStatusPill(a.status)}
            </button></li>`
              )
              .join("") +
            "</ul>"
          : '<p class="small-note">No alerts have been raised for this system.</p>'
      }
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" type="button" data-act="diag" data-id="${s.id}">Run diagnostic</button>
      <button class="btn btn-ghost" type="button" data-act="sys-alerts" data-id="${s.id}">Filter alerts by this system</button>
    </div>`;

  lastFocused = document.activeElement;
  $("#sysModal").hidden = false;
  $("#sysModalClose").focus();

  // Draw the mini chart now that the popup is visible (so it can measure its width)
  const history = s.status === "offline"
    ? Array(30).fill(0)
    : walk(seededRandom(parseInt(id.replace(/\D/g, ""), 10)), 30, s.load, 5, 5, 98);
  const labels = history.map((_, i) => (i === history.length - 1 ? "now" : "-" + (history.length - 1 - i) + "m"));
  lineChart($("#modalChart"), {
    label: "Load history",
    series: [{ name: "Load", color: "#38e1ff", values: history, area: true }],
    xLabels: labels,
    min: 0,
    max: 100,
    unit: "%",
    height: 170,
  });
}

function closeModal() {
  if ($("#sysModal").hidden) return;
  $("#sysModal").hidden = true;
  hideTip();
  if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
}

function runDiagnostic(button, id) {
  const s = findSystem(id);
  button.disabled = true;
  button.textContent = "Running…";
  setTimeout(() => {
    if (document.body.contains(button)) {
      button.disabled = false;
      button.textContent = "Run diagnostic";
    }
    if (s.status === "online") toast(s.name + ": no faults found (simulated)", "success");
    else if (s.status === "offline") toast(s.name + ": no response from device (simulated)", "danger");
    else toast(s.name + ": issues flagged, review related alerts (simulated)", "warn");
  }, 1800);
}


/* =====================================================================
   8. PAGE: SECURITY ALERTS
   ===================================================================== */

function alertHaystack(a) {
  return [a.id, a.title, a.category, a.sourceIp, a.protocol, a.systemId, systemName(a.systemId), a.status, a.severity].join(" ").toLowerCase();
}

function getFilteredAlerts() {
  const f = state.al;
  const q = f.search.trim().toLowerCase();
  const list = state.alerts.filter(
    (a) =>
      (!q || alertHaystack(a).includes(q)) &&
      (f.severity === "all" || a.severity === f.severity) &&
      (f.status === "all" || a.status === f.status) &&
      (f.category === "all" || a.category === f.category)
  );
  return sortAlerts(list, f.sort);
}

function renderAlerts(animate = true) {
  savePrefs();
  const f = state.al;

  // Keep controls in sync with state
  const search = $("#alertSearch");
  if (search.value !== f.search) search.value = f.search;
  $("#alertStatus").value = f.status;
  $("#alertCategory").value = f.category;
  $("#alertSort").value = f.sort;
  $$("#sevChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.sev === f.severity));
  $$("#sevChips [data-count]").forEach((el) => {
    el.textContent = state.alerts.filter((a) => a.severity === el.dataset.count).length;
  });

  // Stat cards
  const active = activeAlerts();
  const stats = [
    { label: "Active alerts", icon: "shield", tone: "amber", value: active.length, note: "open + investigating" },
    { label: "Critical", icon: "alert", tone: "red", value: active.filter((a) => a.severity === "critical").length, note: "need immediate review" },
    { label: "Investigating", icon: "eye", tone: "cyan", value: state.alerts.filter((a) => a.status === "investigating").length, note: "assigned to analysts" },
    { label: "Resolved", icon: "check", tone: "green", value: state.alerts.filter((a) => a.status === "resolved").length, note: "closed in this period" },
  ];
  const statBox = $("#alertStats");
  if (animate) {
    statBox.innerHTML = stats.map(statCard).join("");
    animateCounts(statBox);
  } else {
    stats.forEach((c, i) => {
      const el = $$(".count", statBox)[i];
      if (el) el.textContent = c.value;
    });
  }

  // Table
  const list = getFilteredAlerts();
  $("#alertCount").textContent = `Showing ${list.length} of ${state.alerts.length} alerts`;
  const body = $("#alertBody");
  $("#alertTable").classList.toggle("no-anim", !animate);
  body.innerHTML = list
    .map(
      (a, i) => `
      <tr data-alert="${a.id}" tabindex="0" style="--i:${i}">
        <td>${sevBadge(a.severity)}</td>
        <td><div class="cell-title">${esc(a.title)}</div><div class="cell-sub">${a.id} · ${esc(a.category)}</div></td>
        <td class="hide-sm">${esc(systemName(a.systemId))}</td>
        <td class="hide-sm"><span class="mono">${esc(a.sourceIp)}</span></td>
        <td>${alertStatusPill(a.status)}${a.escalated ? ' <span class="status-pill st-escalated">Escalated</span>' : ""}</td>
        <td class="hide-md"><span class="mono">${timeAgo(a.createdAt)}</span></td>
        <td class="chev">›</td>
      </tr>`
    )
    .join("");
  $("#alertEmpty").hidden = list.length > 0;
  $("#alertTable").hidden = list.length === 0;
}

function exportCSV() {
  const rows = getFilteredAlerts();
  if (!rows.length) return toast("Nothing to export with the current filters", "warn");
  const header = ["ID", "Severity", "Status", "Category", "Title", "System", "Source IP", "Protocol", "Detected"];
  const lines = [header].concat(
    rows.map((a) => [a.id, a.severity, a.status, a.category, a.title, systemName(a.systemId), a.sourceIp, a.protocol, new Date(a.createdAt).toISOString()])
  );
  const csv = lines.map((r) => r.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "forgesight-alerts.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  toast("Exported " + rows.length + " alerts to CSV", "success");
}


/* =====================================================================
   9. PAGE: ALERT DETAILS
   ===================================================================== */

function defaultAlert() {
  const pool = sortAlerts(activeAlerts(), "severity");
  return pool[0] || state.alerts[0];
}

function getSelectedAlert() {
  let a = findAlert(state.selectedAlertId);
  if (!a) {
    a = defaultAlert();
    state.selectedAlertId = a.id;
  }
  return a;
}

function riskScore(a) {
  const base = { critical: 88, high: 70, medium: 48, low: 24 }[a.severity];
  let score = clamp(base + Math.round((a.confidence - 80) / 4), 5, 99);
  if (a.status === "resolved") score = Math.round(score * 0.3);
  return score;
}

function renderDetail() {
  const a = getSelectedAlert();
  const s = findSystem(a.systemId);
  const ordered = sortAlerts(state.alerts, "newest");
  const idx = ordered.findIndex((x) => x.id === a.id);
  const newer = ordered[idx - 1];
  const older = ordered[idx + 1];

  const done = a.actions.filter((x) => x.done).length;
  const pct = Math.round((done / a.actions.length) * 100);

  const risk = riskScore(a);
  const riskColor = risk >= 80 ? "#ff4d5e" : risk >= 60 ? "#ff8a3d" : risk >= 40 ? "#ffc933" : "#4cc9a0";
  const riskLabel = risk >= 80 ? "Severe risk" : risk >= 60 ? "High risk" : risk >= 40 ? "Moderate risk" : "Low risk";
  const circumference = 2 * Math.PI * 52;

  const timeline = a.timeline
    .slice()
    .sort((x, y) => y.time - x.time)
    .map((t, i) => `<li class="k-${t.kind}" style="animation-delay:${i * 50}ms"><p>${esc(t.text)}</p><time>${formatDateTime(t.time)}</time></li>`)
    .join("");

  const buttons =
    a.status === "resolved"
      ? `<button class="btn btn-ghost" data-act="reopen" type="button">Reopen alert</button>`
      : `<button class="btn btn-ghost" data-act="ack" type="button" ${a.status !== "open" ? "disabled" : ""}>Acknowledge</button>
         <button class="btn btn-danger" data-act="escalate" type="button" ${a.escalated ? "disabled" : ""}>Escalate</button>
         <button class="btn btn-success" data-act="resolve" type="button">Mark resolved</button>`;

  $("#detailRoot").innerHTML = `
    <div class="detail-top">
      <a class="btn btn-ghost" href="#alerts">← Back to alerts</a>
      <div class="pager">
        <button class="btn btn-ghost" type="button" data-nav="${newer ? newer.id : ""}" ${newer ? "" : "disabled"}>‹ Newer</button>
        <button class="btn btn-ghost" type="button" data-nav="${older ? older.id : ""}" ${older ? "" : "disabled"}>Older ›</button>
      </div>
    </div>

    <div class="panel detail-head sev-${a.severity}">
      <div>
        <div class="detail-badges">
          ${sevBadge(a.severity)}
          ${alertStatusPill(a.status)}
          ${a.escalated ? '<span class="status-pill st-escalated">Escalated</span>' : ""}
        </div>
        <h2>${esc(a.title)}</h2>
        <p>${a.id} · detected ${timeAgo(a.createdAt)} (${formatDateTime(a.createdAt)})</p>
      </div>
      <div class="detail-actions">${buttons}</div>
    </div>

    <div class="detail-grid">
      <div class="stack">
        <div class="panel">
          <h3>Summary</h3>
          <p class="summary-text">${esc(a.description)}</p>
          <dl class="kv">
            <div><dt>Category</dt><dd>${esc(a.category)}</dd></div>
            <div><dt>Affected system</dt><dd>${s ? `<a href="#systems" data-sys="${s.id}">${esc(s.name)}</a>` : "Unknown"}</dd></div>
            <div><dt>Source IP</dt><dd class="mono">${esc(a.sourceIp)}</dd></div>
            <div><dt>Protocol</dt><dd>${esc(a.protocol)}</dd></div>
            <div><dt>Detection confidence</dt><dd>${a.confidence}%</dd></div>
            <div><dt>Assignee</dt><dd>${a.assignee ? esc(a.assignee) : "Unassigned"}</dd></div>
          </dl>
        </div>

        <div class="panel">
          <h3>Recommended actions <small id="actionCount">${done}/${a.actions.length} done</small></h3>
          <div class="progress"><div id="actionProgress" style="width:${pct}%"></div></div>
          ${a.actions
            .map(
              (act, i) => `
            <label class="check"><input type="checkbox" data-action="${i}" ${act.done ? "checked" : ""}><span>${esc(act.text)}</span></label>`
            )
            .join("")}
        </div>
      </div>

      <div class="stack">
        <div class="panel">
          <h3>Risk score</h3>
          <div class="risk">
            <div class="risk-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="track" cx="60" cy="60" r="52"/>
                <circle class="value" cx="60" cy="60" r="52" stroke="${riskColor}" stroke-dasharray="${(circumference * risk) / 100} ${circumference}"/>
              </svg>
              <b>${risk}</b>
            </div>
            <p><strong style="color:${riskColor}">${riskLabel}</strong>${
              a.status === "resolved" ? "Residual risk after resolution." : "Based on severity, detection confidence and the affected system."
            }</p>
          </div>
        </div>

        <div class="panel">
          <h3>Activity timeline</h3>
          <ul class="timeline">${timeline}</ul>
          <div class="note-form">
            <label class="field"><input id="noteInput" type="text" placeholder="Add a note…" maxlength="160" autocomplete="off" aria-label="Add a note"></label>
            <button class="btn btn-primary" type="button" data-act="note">Add</button>
          </div>
        </div>
      </div>
    </div>`;
}

function addTimeline(alert, text, kind) {
  // eventId marks this entry as one we save to localStorage (see the status section below)
  alert.timeline.push({ time: Date.now(), text, kind, eventId: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) });
}

// ----- Notes are saved in the browser (localStorage) so they survive a refresh -----
// Saved format:  { "ALT-2051": [ { id, time, text }, ... ], "ALT-2050": [ ... ] }
// The alert ID is the key, so every note stays attached to the right alert.
const NOTES_KEY = "forgesight.alertNotes.v1";
const NOTE_MAX_LENGTH = 160; // same limit as the input field in the page
const NOTE_MAX_PER_ALERT = 200;
let noteLockedUntil = 0; // used to ignore repeated clicks

// Reads everything saved. Never throws: bad or missing data gives an empty object.
function readSavedNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

// Saves one note under its alert ID. Returns true if it was stored.
function saveNote(alertId, note) {
  try {
    const all = readSavedNotes();
    const list = Array.isArray(all[alertId]) ? all[alertId] : [];
    list.push(note);
    all[alertId] = list.slice(-NOTE_MAX_PER_ALERT);
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
    return true;
  } catch (err) {
    return false; // storage blocked or full: the note still shows until refresh
  }
}

// Adds a note to the alert's timeline and saves it.
function addNote(alert, text) {
  const note = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), time: Date.now(), text };
  alert.timeline.push({ time: note.time, text: "Note: " + text, kind: "note", noteId: note.id });
  return saveNote(alert.id, note);
}

// Runs once when the app starts: puts saved notes back into each alert's timeline.
function loadSavedNotes() {
  const all = readSavedNotes();
  state.alerts.forEach((alert) => {
    const list = Array.isArray(all[alert.id]) ? all[alert.id] : [];
    list.forEach((note) => {
      const valid = note && typeof note.text === "string" && note.text.trim() && Number.isFinite(note.time);
      const known = alert.timeline.some((t) => t.noteId && t.noteId === note.id);
      if (!valid || known) return;
      alert.timeline.push({ time: note.time, text: "Note: " + note.text.trim().slice(0, NOTE_MAX_LENGTH), kind: "note", noteId: note.id });
    });
  });
}

// ----- Alert statuses are saved in the browser (localStorage) so they survive a refresh -----
// Saved format:  { "ALT-2051": { status, escalated, assignee, events: [ { id, time, text, kind }, ... ] } }
// The alert ID is the key, so every status stays attached to the right alert.
// This is separate from the notes key above, so the two never interfere.
const STATUS_KEY = "forgesight.alertStatus.v1";
const VALID_STATUSES = ["open", "investigating", "resolved"];

// Reads everything saved. Never throws: bad or missing data gives an empty object.
function readSavedStatuses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATUS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

// Saves the current status of one alert (plus its status history). Returns true if stored.
function saveAlertStatus(alert) {
  try {
    const all = readSavedStatuses();
    all[alert.id] = {
      status: alert.status,
      escalated: !!alert.escalated,
      assignee: alert.assignee || "",
      actions: alert.actions.map((x) => !!x.done), // the response checklist ticks
      events: alert.timeline
        .filter((t) => t.eventId)
        .map((t) => ({ id: t.eventId, time: t.time, text: t.text, kind: t.kind })),
    };
    localStorage.setItem(STATUS_KEY, JSON.stringify(all));
    return true;
  } catch (err) {
    return false; // storage blocked or full: the change still shows until refresh
  }
}

// Runs once when the app starts: puts saved statuses back onto each alert.
function loadSavedStatuses() {
  const all = readSavedStatuses();
  state.alerts.forEach((alert) => {
    const saved = all[alert.id];
    if (!saved || typeof saved !== "object" || !VALID_STATUSES.includes(saved.status)) return;

    alert.status = saved.status;
    alert.escalated = saved.escalated === true;
    if (typeof saved.assignee === "string" && saved.assignee) alert.assignee = saved.assignee.slice(0, 60);

    // Restore the response checklist (only if it still has the same number of steps)
    if (Array.isArray(saved.actions) && saved.actions.length === alert.actions.length) {
      alert.actions.forEach((step, i) => {
        step.done = saved.actions[i] === true;
      });
    }

    const events = Array.isArray(saved.events) ? saved.events : [];
    events.forEach((ev) => {
      const valid = ev && typeof ev.id === "string" && typeof ev.text === "string" && ev.text.trim() && Number.isFinite(ev.time);
      const known = alert.timeline.some((t) => t.eventId && t.eventId === ev.id);
      if (!valid || known) return;
      alert.timeline.push({ time: ev.time, text: ev.text.slice(0, 120), kind: ev.kind === "resolve" ? "resolve" : "status", eventId: ev.id });
    });
  });
}

// Alert detection times are recalculated every time the page loads, so a saved note or
// status event could end up looking older than the alert itself. This keeps every saved
// entry after the detection time and in the same order it was made.
function normalizeSavedTimes() {
  state.alerts.forEach((alert) => {
    const isSaved = (t) => t.noteId || t.eventId;
    const saved = alert.timeline.filter(isSaved).sort((a, b) => a.time - b.time);
    if (!saved.length) return;
    let latest = Math.max(alert.createdAt, ...alert.timeline.filter((t) => !isSaved(t)).map((t) => t.time));
    saved.forEach((t) => {
      t.time = Math.max(t.time, latest + 1000);
      latest = t.time;
    });
  });
}

// ----- Screen preferences (filters, sort, view, chart choices, last opened alert) -----
// Saved so the dashboard looks the same after a refresh. Search text is NOT saved on purpose,
// so you never come back to a list that looks empty because of an old search.
const PREFS_KEY = "forgesight.prefs.v1";

function savePrefs() {
  try {
    const { sys, al, analytics } = state;
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        sys: { status: sys.status, site: sys.site, sort: sys.sort, view: sys.view },
        al: { severity: al.severity, status: al.status, category: al.category, sort: al.sort },
        telemetryMetric: state.telemetryMetric,
        analytics: { range: analytics.range, seed: analytics.seed },
        selectedAlertId: state.selectedAlertId,
      })
    );
  } catch (err) {
    /* storage blocked or full: the dashboard still works, it just will not remember the screen setup */
  }
}

function loadPrefs() {
  let p;
  try {
    p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch (err) {
    return;
  }
  if (!p || typeof p !== "object") return;

  // A saved value is only used if it is one of the choices that really exist on the page.
  const optionValues = (selector) => $$(selector + " option").map((o) => o.value);
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

  if (p.sys && typeof p.sys === "object") {
    state.sys.status = pick(p.sys.status, ["all", "online", "warning", "critical", "offline"], state.sys.status);
    state.sys.site = pick(p.sys.site, optionValues("#sysSite"), state.sys.site);
    state.sys.sort = pick(p.sys.sort, optionValues("#sysSort"), state.sys.sort);
    state.sys.view = pick(p.sys.view, ["grid", "table"], state.sys.view);
  }
  if (p.al && typeof p.al === "object") {
    state.al.severity = pick(p.al.severity, ["all", "critical", "high", "medium", "low"], state.al.severity);
    state.al.status = pick(p.al.status, ["all", "open", "investigating", "resolved"], state.al.status);
    state.al.category = pick(p.al.category, optionValues("#alertCategory"), state.al.category);
    state.al.sort = pick(p.al.sort, optionValues("#alertSort"), state.al.sort);
  }
  state.telemetryMetric = pick(p.telemetryMetric, Object.keys(METRICS), state.telemetryMetric);
  if (p.analytics && typeof p.analytics === "object") {
    state.analytics.range = pick(p.analytics.range, [7, 14, 30], state.analytics.range);
    const seed = p.analytics.seed;
    if (Number.isInteger(seed) && seed >= 1 && seed < 1000000) state.analytics.seed = seed;
  }
  if (typeof p.selectedAlertId === "string" && findAlert(p.selectedAlertId)) state.selectedAlertId = p.selectedAlertId;
}

function alertAction(action) {
  const a = findAlert(state.selectedAlertId);
  if (!a) return;

  if (action === "ack") {
    a.status = "investigating";
    if (!a.assignee) a.assignee = "You (demo)";
    addTimeline(a, "Acknowledged and moved to Investigating", "status");
    toast(a.id + " acknowledged", "success");
  } else if (action === "escalate") {
    a.escalated = true;
    if (a.status === "open") a.status = "investigating";
    if (!a.assignee) a.assignee = "SOC Lead (demo)";
    addTimeline(a, "Escalated to the Security Operations lead", "status");
    toast(a.id + " escalated to the SOC lead", "warn");
  } else if (action === "resolve") {
    a.status = "resolved";
    addTimeline(a, "Marked as resolved", "resolve");
    toast(a.id + " marked as resolved", "success");
  } else if (action === "reopen") {
    a.status = "open";
    a.escalated = false;
    addTimeline(a, "Alert reopened for further review", "status");
    toast(a.id + " reopened", "warn");
  } else if (action === "note") {
    if (Date.now() < noteLockedUntil) return; // ignore a repeated click or key press
    const input = $("#noteInput");
    const text = input.value.trim().slice(0, NOTE_MAX_LENGTH);
    if (!text) {
      toast("Type a note first", "warn");
      return input.focus();
    }
    noteLockedUntil = Date.now() + 700;
    const saved = addNote(a, text);
    if (saved) toast("Note added", "success");
    else toast("Note added, but this browser could not save it", "warn");
  }
  // Every action except "note" changes the status, so save it (notes have their own saving above)
  if (action !== "note" && !saveAlertStatus(a)) toast("Status changed, but this browser could not save it", "warn");
  renderDetail();
  updateBadges();
}


/* =====================================================================
   10. PAGE: ANALYTICS
   ===================================================================== */

// Builds fake-but-believable analytics data for the chosen time range.
function generateAnalytics(range, seed) {
  const rng = seededRandom(seed * 1000 + range);
  const days = [];

  for (let i = range - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const base = Math.round((weekend ? 9 : 16) + rng() * 8);
    const critical = Math.round(base * (0.06 + rng() * 0.06));
    const high = Math.round(base * (0.16 + rng() * 0.08));
    const medium = Math.round(base * (0.3 + rng() * 0.1));
    const low = Math.max(1, base - critical - high - medium);
    days.push({ date, critical, high, medium, low, total: critical + high + medium + low });
  }

  const sum = (key) => days.reduce((s, d) => s + d[key], 0);
  const total = sum("total");

  const weights = CATEGORIES.map(() => 0.4 + rng());
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const categories = CATEGORIES.map((label, i) => ({ label, value: Math.round((weights[i] / weightSum) * total) })).sort((a, b) => b.value - a.value);

  const mttr = walk(rng, 6, 120, 14, 55, 150).map(Math.round);
  const heat = [];
  for (let d = 0; d < 7; d++) {
    const row = [];
    for (let hr = 0; hr < 24; hr++) {
      const businessHours = hr >= 8 && hr <= 18 ? 12 : 5;
      const lateSpike = hr >= 22 || hr <= 2 ? 6 : 0;
      const weekendFactor = d >= 5 ? 0.6 : 1;
      row.push(Math.round((businessHours + lateSpike) * weekendFactor * (0.4 + rng() * 1.2)));
    }
    heat.push(row);
  }

  return {
    days,
    total,
    perDay: total / range,
    severity: { critical: sum("critical"), high: sum("high"), medium: sum("medium"), low: sum("low") },
    categories,
    mttr,
    heat,
    mttrNow: mttr[mttr.length - 1],
    falsePositive: 3 + rng() * 5,
    deltaTotal: Math.round((rng() - 0.45) * 30),
    deltaMttr: Math.round((rng() - 0.65) * 24),
    deltaFp: ((rng() - 0.6) * 2).toFixed(1),
  };
}

const deltaText = (n, unit = "%") => (n >= 0 ? "▲ " : "▼ ") + Math.abs(n) + unit;

function renderAnalytics() {
  savePrefs();
  const { range, seed } = state.analytics;
  $$("#rangeSeg button").forEach((b) => b.classList.toggle("active", parseInt(b.dataset.range, 10) === range));

  const data = generateAnalytics(range, seed);
  const rng = seededRandom(seed + 5);

  const stats = [
    { label: "Total alerts", icon: "shield", tone: "amber", color: "#ffb020", value: data.total, delta: deltaText(data.deltaTotal), deltaGood: data.deltaTotal <= 0, note: "vs previous period", spark: data.days.map((d) => d.total) },
    { label: "Avg per day", icon: "clock", tone: "cyan", color: "#38e1ff", value: data.perDay.toFixed(1), dec: 1, note: "across all sites", spark: data.days.map((d) => d.high + d.critical) },
    { label: "Mean time to resolve", icon: "check", tone: "green", color: "#34d399", value: data.mttrNow, suffix: "min", delta: deltaText(data.deltaMttr), deltaGood: data.deltaMttr <= 0, note: "vs last week", spark: walk(rng, 12, 100, 14, 50, 150) },
    { label: "False positive rate", icon: "percent", tone: "orange", color: "#ff8a3d", value: data.falsePositive.toFixed(1), dec: 1, suffix: "%", delta: deltaText(parseFloat(data.deltaFp), " pts"), deltaGood: parseFloat(data.deltaFp) <= 0, note: "of detections", spark: walk(rng, 12, 6, 1, 2, 10) },
  ];
  $("#analyticsStats").innerHTML = stats.map(statCard).join("");
  animateCounts($("#analyticsStats"));

  // Alert volume line chart
  const labels = data.days.map((d) => d.date.toLocaleDateString([], { month: "short", day: "numeric" }));
  lineChart($("#trendChart"), {
    label: "Alerts per day",
    series: [
      { name: "All alerts", color: "#ffb020", values: data.days.map((d) => d.total), area: true },
      { name: "Critical + High", color: "#ff4d5e", values: data.days.map((d) => d.critical + d.high), area: false },
    ],
    xLabels: labels,
    min: 0,
    unit: " alerts",
    height: 290,
  });
  $("#trendLegend").innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#ffb020"></span>All alerts <b>${data.total}</b></span>
    <span class="legend-item"><span class="legend-swatch" style="background:#ff4d5e"></span>Critical + High <b>${data.severity.critical + data.severity.high}</b></span>`;

  // Severity donut
  donut(
    $("#severityDonut"),
    ["critical", "high", "medium", "low"].map((k) => ({ label: cap(k), value: data.severity[k], color: SEV_COLORS[k] })),
    data.total,
    "alerts"
  );

  hBars($("#categoryBars"), data.categories);
  vBars($("#mttrChart"), data.mttr.map((v, i) => ({ label: "W" + (i + 1), value: v })), " min");

  // Heatmap
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const maxHeat = Math.max(...data.heat.flat(), 1);
  let heatHtml = '<div class="hm-inner"><div class="hm-row"><span></span>';
  for (let hr = 0; hr < 24; hr++) heatHtml += `<span class="hm-hour">${hr % 3 === 0 ? hr : ""}</span>`;
  heatHtml += "</div>";
  data.heat.forEach((row, d) => {
    heatHtml += `<div class="hm-row"><span class="hm-label">${dayNames[d]}</span>`;
    row.forEach((count, hr) => {
      const alpha = (0.07 + 0.93 * (count / maxHeat)).toFixed(2);
      const tip = `<div class="tt-title">${dayNames[d]} ${String(hr).padStart(2, "0")}:00</div><b>${count}</b> events`;
      heatHtml += `<span class="hm-cell" style="background:rgba(255,176,32,${alpha});--d:${d * 24 + hr}" data-tip="${esc(tip)}"></span>`;
    });
    heatHtml += "</div>";
  });
  $("#heatmap").className = "heatmap";
  $("#heatmap").innerHTML = heatHtml + "</div>";
}


/* =====================================================================
   11. GLOBAL SEARCH (the box in the top bar)
   ===================================================================== */

function hideSearch() {
  $("#searchResults").hidden = true;
}

function runSearch(raw) {
  const q = raw.trim().toLowerCase();
  const box = $("#searchResults");
  if (!q) return hideSearch();

  const sys = state.systems.filter((s) => [s.id, s.name, s.type, s.site].join(" ").toLowerCase().includes(q)).slice(0, 4);
  const als = sortAlerts(state.alerts.filter((a) => alertHaystack(a).includes(q)), "newest").slice(0, 5);

  let html = "";
  if (als.length) {
    html += '<div class="sr-group">Alerts</div>';
    html += als
      .map((a) => `<button class="sr-item" type="button" data-alert="${a.id}"><span class="dot ${a.severity}"></span><div><strong>${esc(a.title)}</strong><small>${a.id} · ${cap(a.status)}</small></div></button>`)
      .join("");
  }
  if (sys.length) {
    html += '<div class="sr-group">Systems</div>';
    html += sys
      .map((s) => `<button class="sr-item" type="button" data-sys="${s.id}"><span class="dot ${s.status}"></span><div><strong>${esc(s.name)}</strong><small>${s.id} · ${esc(s.site)}</small></div></button>`)
      .join("");
  }
  box.innerHTML = html || '<div class="sr-empty">No matches found</div>';
  box.hidden = false;
}


/* =====================================================================
   12. ROUTER  (which page is showing?)
   The page is chosen by the part of the URL after "#", for example:
     index.html#overview        index.html#alert/ALT-2051
   Using this means the browser Back button works too.
   ===================================================================== */

const PAGES = {
  overview: { title: "Overview", sub: "Live operational and security posture across all sites", render: renderOverview },
  systems: { title: "Systems Monitoring", sub: "Status, health and live metrics for every connected system", render: renderSystems },
  alerts: { title: "Security Alerts", sub: "Detections from the industrial network, ready to triage", render: renderAlerts },
  detail: { title: "Alert Details", sub: "Investigate, act on and document a single alert", render: renderDetail },
  analytics: { title: "Analytics", sub: "Trends, patterns and response performance", render: renderAnalytics },
};

function parseHash() {
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  if (name === "alert") return { page: "detail", arg };
  if (PAGES[name]) return { page: name };
  return { page: "overview" };
}

function route() {
  const { page, arg } = parseHash();
  state.page = page;
  if (page === "detail" && arg && findAlert(arg)) state.selectedAlertId = arg;

  $$(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
  $$(".nav-link").forEach((link) => {
    const on = link.dataset.page === page;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const cfg = PAGES[page];
  $("#pageTitle").textContent = cfg.title;
  $("#pageSubtitle").textContent = cfg.sub;
  document.title = cfg.title + " | ForgeSight Demo";

  closeNav();
  hideSearch();
  hideTip();
  window.scrollTo(0, 0);
  cfg.render();
  savePrefs(); // remember the last opened alert
}

function closeNav() {
  document.body.classList.remove("nav-open");
}


/* =====================================================================
   13. EVENT LISTENERS  (reacting to the user)
   ===================================================================== */

function bindEvents() {
  // ----- Click anywhere: open alerts / systems from any list -----
  document.addEventListener("click", (e) => {
    const alertEl = e.target.closest("[data-alert]");
    if (alertEl) {
      e.preventDefault();
      closeModal();
      hideSearch();
      go("#alert/" + alertEl.dataset.alert);
      return;
    }
    const sysEl = e.target.closest("[data-sys]");
    if (sysEl) {
      e.preventDefault();
      hideSearch();
      openSystem(sysEl.dataset.sys);
      return;
    }
    if (!e.target.closest("#searchBox")) hideSearch();
  });

  // Keyboard: Enter / Space activates cards and table rows
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-alert], [data-sys]") && !e.target.matches("button, a, input")) {
      e.preventDefault();
      e.target.click();
    }
  });

  // ----- Tooltip follows the pointer over anything with data-tip -----
  const updateTip = (e) => {
    const target = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (target) showTip(target.dataset.tip, e.clientX, e.clientY);
    else hideTip();
  };
  document.addEventListener("pointermove", updateTip);
  document.addEventListener("pointerdown", updateTip);
  document.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") setTimeout(hideTip, 1600);
  });
  document.addEventListener("scroll", hideTip, true);

  // ----- Mobile menu -----
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#overlay").addEventListener("click", closeNav);

  // ----- Bell: jump to critical alerts -----
  $("#bellBtn").addEventListener("click", () => {
    const critical = activeAlerts().filter((a) => a.severity === "critical").length;
    if (!critical) return toast("No active critical alerts", "success");
    state.al = { search: "", severity: "critical", status: "all", category: "all", sort: "newest" };
    go("#alerts");
  });

  // ----- Global search -----
  const gs = $("#globalSearch");
  gs.addEventListener("input", () => runSearch(gs.value));
  gs.addEventListener("focus", () => gs.value && runSearch(gs.value));
  gs.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = $("#searchResults .sr-item");
      if (first) first.click();
    }
    if (e.key === "Escape") {
      gs.value = "";
      hideSearch();
      gs.blur();
    }
  });

  // ----- Overview: telemetry metric switch -----
  $("#telemetryMetric").addEventListener("click", (e) => {
    const b = e.target.closest("[data-metric]");
    if (!b) return;
    state.telemetryMetric = b.dataset.metric;
    savePrefs();
    $$("#telemetryMetric button").forEach((x) => x.classList.toggle("active", x === b));
    drawTelemetry(true);
  });

  // ----- Systems page controls -----
  $("#sysSearch").addEventListener("input", (e) => {
    state.sys.search = e.target.value;
    renderSystems(false);
  });
  $("#sysStatusChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-status]");
    if (!b) return;
    state.sys.status = b.dataset.status;
    renderSystems(false);
  });
  $("#sysSite").addEventListener("change", (e) => {
    state.sys.site = e.target.value;
    renderSystems(false);
  });
  $("#sysSort").addEventListener("change", (e) => {
    state.sys.sort = e.target.value;
    renderSystems(false);
  });
  $("#sysView").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    state.sys.view = b.dataset.view;
    renderSystems(true);
  });

  // ----- Alerts page controls -----
  $("#alertSearch").addEventListener("input", (e) => {
    state.al.search = e.target.value;
    renderAlerts(false);
  });
  $("#sevChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sev]");
    if (!b) return;
    state.al.severity = b.dataset.sev;
    renderAlerts(false);
  });
  $("#alertStatus").addEventListener("change", (e) => {
    state.al.status = e.target.value;
    renderAlerts(false);
  });
  $("#alertCategory").addEventListener("change", (e) => {
    state.al.category = e.target.value;
    renderAlerts(false);
  });
  $("#alertSort").addEventListener("change", (e) => {
    state.al.sort = e.target.value;
    renderAlerts(false);
  });
  $("#clearFilters").addEventListener("click", () => {
    state.al = { search: "", severity: "all", status: "all", category: "all", sort: "newest" };
    renderAlerts(false);
    toast("Filters cleared");
  });
  $("#exportBtn").addEventListener("click", exportCSV);

  // ----- Alert details: action buttons, checklist, notes, prev/next -----
  const detail = $("#detailRoot");
  detail.addEventListener("click", (e) => {
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) return alertAction(actBtn.dataset.act);
    const navBtn = e.target.closest("[data-nav]");
    if (navBtn && navBtn.dataset.nav) go("#alert/" + navBtn.dataset.nav);
  });
  detail.addEventListener("change", (e) => {
    const box = e.target.closest("[data-action]");
    if (!box) return;
    const a = findAlert(state.selectedAlertId);
    a.actions[parseInt(box.dataset.action, 10)].done = box.checked;
    if (!saveAlertStatus(a)) toast("Checklist changed, but this browser could not save it", "warn");
    const done = a.actions.filter((x) => x.done).length;
    $("#actionCount").textContent = done + "/" + a.actions.length + " done";
    $("#actionProgress").style.width = Math.round((done / a.actions.length) * 100) + "%";
    if (done === a.actions.length && a.status !== "resolved") toast("All actions complete. You can mark the alert as resolved.", "success");
  });
  detail.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.repeat && e.target.id === "noteInput") alertAction("note");
  });

  // ----- System popup -----
  $("#sysModalClose").addEventListener("click", closeModal);
  $("#sysModal").addEventListener("click", (e) => {
    if (e.target === $("#sysModal")) closeModal();
  });
  $("#sysModalBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "diag") runDiagnostic(btn, btn.dataset.id);
    if (btn.dataset.act === "sys-alerts") {
      state.al = { search: systemName(btn.dataset.id), severity: "all", status: "all", category: "all", sort: "newest" };
      closeModal();
      go("#alerts");
    }
  });

  // ----- Analytics controls -----
  $("#rangeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]");
    if (!b) return;
    state.analytics.range = parseInt(b.dataset.range, 10);
    renderAnalytics();
  });
  $("#regenBtn").addEventListener("click", () => {
    state.analytics.seed += 1;
    renderAnalytics();
    toast("Sample data regenerated", "success");
  });

  // ----- Keyboard shortcuts -----
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      gs.focus();
    }
    if (e.key === "Escape") {
      closeModal();
      closeNav();
      hideSearch();
    }
  });

  // ----- Browser navigation and resizing -----
  window.addEventListener("hashchange", route);
  let lastWidth = window.innerWidth;
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Only redraw when the width changed (phones fire resize while scrolling)
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        if (!$("#sysModal").hidden) closeModal();
        PAGES[state.page].render();
      }
    }, 200);
  });
}


/* =====================================================================
   14. LIVE SIMULATION  (numbers that move every 2 seconds)
   ===================================================================== */

function tickSystems() {
  state.systems.forEach((s) => {
    if (s.status === "offline") return;
    s.load = clamp(s.load + (s.baseLoad - s.load) * 0.1 + (Math.random() - 0.5) * 4, 8, 99);
    s.temp = clamp(s.temp + (s.baseTemp - s.temp) * 0.1 + (Math.random() - 0.5) * 1.2, 25, 98);
  });
}

function tick() {
  tickSystems();
  tickTelemetry();
  if (document.hidden) return;

  if (state.page === "overview") {
    // Skip redrawing while the pointer is over the chart so the tooltip stays steady
    if ($("#telemetryChart").matches(":hover")) updateTelemetryLegend();
    else drawTelemetry(false);
  }
  if (state.page === "systems") updateLiveValues();
}

function startClock() {
  const clock = $("#clock");
  const update = () => {
    clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
  };
  update();
  setInterval(update, 1000);
}


/* =====================================================================
   15. START THE APP
   ===================================================================== */

function init() {
  // Fill the dropdowns that depend on our data
  $("#sysSite").innerHTML = '<option value="all">All sites</option>' + SITES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("#alertCategory").innerHTML =
    '<option value="all">All categories</option>' + CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

  loadSavedNotes(); // restore notes saved in this browser
  loadSavedStatuses(); // restore alert statuses and checklists saved in this browser
  normalizeSavedTimes(); // keep saved notes/events after each alert's detection time
  loadPrefs(); // restore filters, sort, view and chart choices
  initTelemetry();
  bindEvents();
  updateBadges();
  startClock();
  route(); // show the page that matches the URL
  setInterval(tick, 2000);
}

init();
