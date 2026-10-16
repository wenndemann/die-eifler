// Weltdaten laden: Versionen, Manifest, Ortsverzeichnis, Kacheln. Kacheln liegen unter versionierten
// Pfaden und ändern sich nie, darum merkt sich der Browser sie im Cache-Speicher (Drehbuch 8.1).
import type { Manifest, Orte, Versionen } from './format';

/** Basis-URL der Weltdaten: VITE_WELT_URL oder <base>/welt (Entwicklungsserver liefert welt-daten/ dort aus). */
export const WELT_URL: string = (import.meta.env.VITE_WELT_URL as string | undefined)
  ?? `${import.meta.env.BASE_URL}welt`;

const CACHE = 'eifeler-welt-1';

async function cached(url: string): Promise<Response> {
  let cache: Cache | null = null;
  try { cache = typeof caches !== 'undefined' ? await caches.open(CACHE) : null; } catch { cache = null; }
  const hit = cache ? await cache.match(url) : undefined;
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  if (cache) {
    try { await cache.put(url, res.clone()); } catch { /* voll oder nicht erlaubt: egal */ }
  }
  return res;
}

/** Bytes einer Datei; gzip wird erkannt (Magic 1f 8b) und entpackt, auch wenn der Server es schon getan hat. */
export async function holeBytes(url: string, immutable = true): Promise<Uint8Array> {
  const res = immutable ? await cached(url) : await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}

export async function holeJson<T>(url: string, immutable = true): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await holeBytes(url, immutable))) as T;
}

export interface Welt {
  base: string;
  version: string;
  manifest: Manifest;
  orte: Orte;
  /** URL einer Datei der Version, z. B. datei('r10/9_4.bin.gz'). */
  datei(pfad: string): string;
}

/** Lädt Manifest und Ortsverzeichnis einer Datenversion (Standard: aktuelle). */
export async function ladeWelt(version?: string, base = WELT_URL): Promise<Welt> {
  if (!version) {
    const v = await holeJson<Versionen>(`${base}/versions.json`, false);
    version = v.aktuell;
  }
  const datei = (p: string) => `${base}/${version}/${p}`;
  const [manifest, orte] = await Promise.all([
    holeJson<Manifest>(datei('manifest.json')),
    holeJson<Orte>(datei('orte.json')),
  ]);
  return { base, version, manifest, orte, datei };
}

/** sha256 als Hex-Text (zum Abgleich mit manifest.files). */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}
