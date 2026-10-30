const zlib = require('zlib');
const { StringDecoder } = require('string_decoder');

// Minimal .xlsx reader for BMS exports — no npm dependency.
//
// An .xlsx file is a zip archive of XML files. BMS exports are large (one
// day ≈ 50 MB of sheet XML), so the main sheet is inflated as a stream and
// handed to the caller one row at a time instead of being held in memory.
//
// Supports what the BMS platform writes: inline strings, numbers, and
// shared strings. Formulas, dates-as-serials and rich text are not needed.

// --- zip ------------------------------------------------------------------

function readZipEntries(buf) {
  // End of central directory record: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx file (zip directory not found)');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt .xlsx file (bad zip entry)');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // Data starts after the local header, whose name/extra lengths can differ.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;

    entries[name] = { method, data: buf.subarray(dataStart, dataStart + compSize) };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntryText(entry) {
  if (!entry) return null;
  if (entry.method === 0) return entry.data.toString('utf8');
  if (entry.method === 8) return zlib.inflateRawSync(entry.data).toString('utf8');
  throw new Error(`Unsupported zip compression method ${entry.method}`);
}

// --- xml helpers --------------------------------------------------------------

function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

// Parses one <row>…</row> into { values: [...], styles: Set<string> }.
function parseRow(xml, sharedStrings) {
  const values = [];
  const styles = new Set();
  CELL_RE.lastIndex = 0;
  let m;
  while ((m = CELL_RE.exec(xml))) {
    const attrs = m[1];
    const body = m[2] || '';
    const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
    const idx = ref ? colIndex(ref[1]) : values.length;
    const type = (/\bt="(\w+)"/.exec(attrs) || [])[1];
    const style = (/\bs="(\d+)"/.exec(attrs) || [])[1];
    if (style) styles.add(style);

    let v = null;
    if (type === 'inlineStr') {
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      v = t ? decodeXml(t[1]) : '';
    } else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body);
      if (raw) {
        if (type === 's') v = sharedStrings[parseInt(raw[1], 10)] ?? '';
        else if (type === 'str' || type === 'b' || type === 'e') v = decodeXml(raw[1]);
        else v = Number(raw[1]);
      }
    }
    values[idx] = v;
  }
  return { values, styles };
}

function loadSharedStrings(entries) {
  const xml = readEntryText(entries['xl/sharedStrings.xml']);
  if (!xml) return [];
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    // Concatenate every <t> (rich text runs) in the item.
    out.push(decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  }
  return out;
}

// Maps sheet names to their XML paths via workbook.xml + its rels.
function sheetPaths(entries) {
  const wb = readEntryText(entries['xl/workbook.xml']) || '';
  const rels = readEntryText(entries['xl/_rels/workbook.xml.rels']) || '';
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (/Id="([^"]+)"/.exec(m[0]) || [])[1];
    const target = (/Target="([^"]+)"/.exec(m[0]) || [])[1];
    if (id && target) relMap[id] = target.replace(/^\/?(xl\/)?/, 'xl/');
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml((/name="([^"]*)"/.exec(m[0]) || [])[1] || '');
    const rid = (/r:id="([^"]+)"/.exec(m[0]) || [])[1];
    out.push({ name, path: relMap[rid] });
  }
  return out;
}

// --- public -------------------------------------------------------------------

// Opens a workbook from a Buffer. Returns:
//   sheets      — [{ name, path }]
//   readSheet   — (name) => all rows of a small sheet, as arrays
//   streamSheet — (name, onRow) => Promise; calls onRow(values, styles, rowNumber)
function openWorkbook(buf) {
  const entries = readZipEntries(buf);
  const sheets = sheetPaths(entries);
  const sharedStrings = loadSharedStrings(entries);

  function entryFor(name) {
    const s = typeof name === 'number' ? sheets[name] : sheets.find((x) => x.name === name);
    return s ? entries[s.path] : null;
  }

  function readSheet(name) {
    const xml = readEntryText(entryFor(name));
    if (!xml) return [];
    return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((m) => parseRow(m[1], sharedStrings).values);
  }

  function streamSheet(name, onRow) {
    const entry = entryFor(name);
    if (!entry) return Promise.reject(new Error(`Sheet "${name}" not found`));
    return new Promise((resolve, reject) => {
      const inflater = entry.method === 8 ? zlib.createInflateRaw() : null;
      const decoder = new StringDecoder('utf8');
      let pending = '';
      let rowNumber = 0;

      function consume(text) {
        pending += text;
        let end;
        while ((end = pending.indexOf('</row>')) !== -1) {
          const start = pending.lastIndexOf('<row', end);
          const open = pending.indexOf('>', start);
          const { values, styles } = parseRow(pending.slice(open + 1, end), sharedStrings);
          onRow(values, styles, rowNumber++);
          pending = pending.slice(end + 6);
        }
      }

      if (!inflater) {
        try { consume(entry.data.toString('utf8')); resolve(rowNumber); } catch (err) { reject(err); }
        return;
      }
      inflater.on('data', (chunk) => {
        try { consume(decoder.write(chunk)); } catch (err) { inflater.destroy(err); }
      });
      inflater.on('end', () => { consume(decoder.end()); resolve(rowNumber); });
      inflater.on('error', reject);
      inflater.end(entry.data);
    });
  }

  return { sheets, readSheet, streamSheet };
}

module.exports = { openWorkbook };
