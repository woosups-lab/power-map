#!/usr/bin/env node
/* OSM 송전선로·변전소·발전소를 Overpass에서 받아 grid.json / grid-meta.json 으로 저장.
   앱은 grid-meta.json 의 generated 값이 더 새로울 때만 grid.json 을 다시 받는다.
   내용(hash)이 그대로이면 파일을 고치지 않으므로 앱도 다시 받지 않는다. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const AREA = `area["ISO3166-1"="KR"][admin_level=2]->.kr;`;
const QUERY = `[out:json][timeout:540];${AREA}
(way["power"="line"](area.kr);way["power"="cable"]["voltage"](area.kr););out tags geom;
(nwr["power"="substation"](area.kr);nwr["power"="plant"](area.kr););out center tags;`;
/* 이전 데이터의 이 비율 밑으로 줄면 서버 오류로 보고 덮어쓰지 않음 */
const MIN_RATIO = 0.7;

const sleep = ms => new Promise(ok => setTimeout(ok, ms));

async function overpass(query) {
  let lastErr;
  for (let round = 0; round < 3; round++) {
    for (const ep of ENDPOINTS) {
      try {
        console.log(`요청: ${ep} (시도 ${round + 1})`);
        const r = await fetch(ep, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "woosups-lab/power-map grid updater" },
          signal: AbortSignal.timeout(600_000),
        });
        if (!r.ok) throw new Error(`서버 응답 ${r.status}`);
        const j = await r.json();
        if (j.remark && /timed out|runtime error|out of memory/i.test(j.remark)) throw new Error(j.remark);
        return j;
      } catch (e) {
        lastErr = e;
        console.warn(`실패: ${ep}: ${e.message}`);
        await sleep(5000);
      }
    }
    await sleep(30_000);
  }
  throw lastErr;
}

function center(el) {
  if (el.type === "node") return [el.lat, el.lon];
  if (el.center) return [el.center.lat, el.center.lon];
  return null;
}
const round5 = n => +n.toFixed(5);

function toLine(el) {
  const t = el.tags || {};
  const p = [];
  for (const g of el.geometry) p.push(round5(g.lat), round5(g.lon));
  return { id: "w" + el.id, v: t.voltage || "", n: t["name:ko"] || t.name || "", o: t.operator || "", c: t.power === "cable" ? 1 : 0, m: 0, p };
}
function toSub(el) {
  const c = center(el); if (!c) return null;
  const t = el.tags || {};
  return { id: el.type[0] + el.id, name: t["name:ko"] || t.name || "이름 없는 변전소", lat: round5(c[0]), lng: round5(c[1]), voltage: t.voltage || "", operator: t.operator || "", kind: t.substation || "" };
}
function toPlant(el) {
  const c = center(el); if (!c) return null;
  const t = el.tags || {};
  return { id: el.type[0] + el.id, name: t["name:ko"] || t.name || "이름 없는 발전소", lat: round5(c[0]), lng: round5(c[1]), src: t["plant:source"] || "", out: t["plant:output:electricity"] || "", operator: t.operator || "" };
}

function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

function shape(els) {
  const lines = [], subs = [], plants = [];
  for (const el of els) {
    const pw = el.tags?.power;
    if (pw === "substation") { const s = toSub(el); if (s) subs.push(s); }
    else if (pw === "plant") { const s = toPlant(el); if (s) plants.push(s); }
    else if (el.geometry) lines.push(toLine(el));
  }
  return { lines: lines.sort(byId), subs: subs.sort(byId), plants: plants.sort(byId) };
}

async function readJson(name) {
  try { return JSON.parse(await readFile(join(ROOT, name), "utf8")); } catch { return null; }
}

const raw = await overpass(QUERY);
const data = shape(raw.elements || []);
const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
const counts = { lines: data.lines.length, subs: data.subs.length, plants: data.plants.length };
console.log("받은 데이터:", counts);

const prev = await readJson("grid-meta.json");
if (prev?.hash === hash) { console.log("바뀐 내용이 없어 파일을 그대로 둡니다."); process.exit(0); }
for (const k of Object.keys(counts))
  if (counts[k] === 0 || (prev?.counts?.[k] && counts[k] < prev.counts[k] * MIN_RATIO))
    throw new Error(`${k} 개수가 비정상입니다: 이전 ${prev?.counts?.[k] ?? "없음"} → ${counts[k]}`);

const generated = new Date().toISOString();
const body = JSON.stringify({ v: 1, generated, osmBase: raw.osm3s?.timestamp_osm_base || "", ...data });
await writeFile(join(ROOT, "grid.json"), body);
await writeFile(join(ROOT, "grid-meta.json"), JSON.stringify({ v: 1, generated, osmBase: raw.osm3s?.timestamp_osm_base || "", hash, bytes: Buffer.byteLength(body), counts }, null, 2) + "\n");
console.log(`저장: grid.json ${(Buffer.byteLength(body) / 1e6).toFixed(1)} MB, 기준 ${generated}`);
