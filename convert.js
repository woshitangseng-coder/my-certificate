#!/usr/bin/env node
/**
 * Excel → data.json
 * Usage:
 *   node convert.js <input.xlsx> [output.json]
 *   node convert.js <input.xlsx> --merge   # merge by certNo, keep others
 *
 * Expected columns: 姓名, 性别, 证书编号, 证书有效期
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const HEADERS = {
  name: ["姓名", "name"],
  gender: ["性别", "gender"],
  certNo: ["证书编号", "certNo", "证书号"],
  expiry: ["证书有效期", "expiry", "截止日期", "有效期"],
};

function usage() {
  console.log(`
用法:
  node convert.js <input.xlsx> [output.json]
  node convert.js <input.xlsx> --merge [output.json]

选项:
  --merge    按证书编号合并到现有 data.json（存在则更新，不存在则追加）
  默认       全量替换 records

表头需包含: 姓名, 性别, 证书编号, 证书有效期
`);
}

function normalizeHeaderCell(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function findColumnIndex(headerRow, aliases) {
  const normalizedAliases = aliases.map(normalizeHeaderCell);
  for (let i = 0; i < headerRow.length; i++) {
    const cell = normalizeHeaderCell(headerRow[i]);
    if (!cell) continue;
    if (normalizedAliases.includes(cell)) return i;
    if (aliases.some((a) => cell.includes(normalizeHeaderCell(a)))) return i;
  }
  return -1;
}

function findHeaderRowIndex(rows) {
  const maxScan = Math.min(rows.length, 15);
  let bestIdx = 0;
  let bestScore = -1;

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    const col = {
      name: findColumnIndex(row, HEADERS.name),
      gender: findColumnIndex(row, HEADERS.gender),
      certNo: findColumnIndex(row, HEADERS.certNo),
      expiry: findColumnIndex(row, HEADERS.expiry),
    };
    const score = Object.values(col).filter((i) => i >= 0).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
    if (score === 4) return r;
  }

  return bestIdx;
}

function formatRowPreview(row) {
  return (row || [])
    .map((c) => {
      const s = String(c ?? "").trim();
      return s || "(空)";
    })
    .join(" | ");
}

function cellToString(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    return `${y}年${m}月`;
  }
  return String(value).trim();
}

/** Excel 日期序列号（如 47543）→ 2030年3月 */
function isExcelSerial(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 20000 && n <= 80000;
}

function formatExpiry(value) {
  if (value == null || value === "") return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}年${value.getMonth() + 1}月`;
  }

  if (typeof value === "number" && isExcelSerial(value)) {
    return excelSerialToYearMonth(value);
  }

  const str = String(value).trim();
  if (/年/.test(str)) return str;

  const num = Number(str);
  if (str !== "" && !Number.isNaN(num) && isExcelSerial(num)) {
    return excelSerialToYearMonth(num);
  }

  return str;
}

function excelSerialToYearMonth(serial) {
  const code = Math.floor(Number(serial));
  if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === "function") {
    const parsed = XLSX.SSF.parse_date_code(code);
    if (parsed && parsed.y) {
      return `${parsed.y}年${parsed.m}月`;
    }
  }
  const utcDays = code - 25569;
  const date = new Date(utcDays * 86400 * 1000);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`;
  }
  return String(serial);
}

function parseSheet(sheet, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) {
    throw new Error("表格至少需要表头行和一行数据");
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const headerRow = rows[headerRowIndex] || [];
  const col = {
    name: findColumnIndex(headerRow, HEADERS.name),
    gender: findColumnIndex(headerRow, HEADERS.gender),
    certNo: findColumnIndex(headerRow, HEADERS.certNo),
    expiry: findColumnIndex(headerRow, HEADERS.expiry),
  };

  const missing = Object.entries(col)
    .filter(([, idx]) => idx < 0)
    .map(([key]) => HEADERS[key][0]);
  if (missing.length) {
    const preview = rows
      .slice(0, Math.min(5, rows.length))
      .map((row, i) => `  第 ${i + 1} 行: ${formatRowPreview(row)}`)
      .join("\n");
    throw new Error(
      `缺少列: ${missing.join("、")}\n` +
        `工作表「${sheetName}」前 5 行内容:\n${preview}\n` +
        `请确认表头为: 姓名、性别、证书编号、证书有效期（可在第 1～15 行内）`
    );
  }

  if (headerRowIndex > 0) {
    console.log(`已识别第 ${headerRowIndex + 1} 行为表头`);
  }

  const records = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const record = {
      name: cellToString(row[col.name]),
      gender: cellToString(row[col.gender]),
      certNo: cellToString(row[col.certNo]),
      expiry: formatExpiry(row[col.expiry]),
    };
    if (!record.certNo && !record.name) continue;
    if (!record.certNo) {
      console.warn(`第 ${r + 1} 行: 缺少证书编号，已跳过`);
      continue;
    }
    records.push(record);
  }

  return records;
}

function assertUniqueCertNos(records) {
  const seen = new Map();
  for (let i = 0; i < records.length; i++) {
    const key = records[i].certNo.trim();
    if (seen.has(key)) {
      throw new Error(
        `证书编号重复: ${key}（第 ${seen.get(key)} 行与第 ${i + 2} 行）`
      );
    }
    seen.set(key, i + 2);
  }
}

function writeDataJson(outputPath, records) {
  const payload = {
    updatedAt: new Date().toISOString(),
    records,
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`已写入 ${records.length} 条 → ${outputPath}`);
}

function loadExisting(outputPath) {
  if (!fs.existsSync(outputPath)) return [];
  const raw = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  return Array.isArray(raw.records) ? raw.records : [];
}

function mergeRecords(existing, incoming) {
  const map = new Map();
  for (const r of existing) {
    map.set(r.certNo.trim(), r);
  }
  for (const r of incoming) {
    map.set(r.certNo.trim(), r);
  }
  return [...map.values()];
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(args.length ? 0 : 1);
  }

  const merge = args.includes("--merge");
  const filtered = args.filter((a) => a !== "--merge");
  const inputPath = filtered[0];
  const outputPath = path.resolve(
    filtered[1] || path.join(process.cwd(), "data.json")
  );

  if (!fs.existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(inputPath, { cellDates: true });
  console.log(`工作表: ${workbook.SheetNames.join("、")}`);
  const sheetName = workbook.SheetNames[0];
  let records = parseSheet(workbook.Sheets[sheetName], sheetName);

  if (merge) {
    records = mergeRecords(loadExisting(outputPath), records);
  }

  assertUniqueCertNos(records);
  writeDataJson(outputPath, records);
}

main();
