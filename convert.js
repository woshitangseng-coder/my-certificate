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

function findColumnIndex(headerRow, aliases) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] ?? "").trim();
    if (aliases.includes(cell)) return i;
  }
  return -1;
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

function parseSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) {
    throw new Error("表格至少需要表头行和一行数据");
  }

  const headerRow = rows[0].map((c) => String(c).trim());
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
    throw new Error(`缺少列: ${missing.join("、")}`);
  }

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const record = {
      name: cellToString(row[col.name]),
      gender: cellToString(row[col.gender]),
      certNo: cellToString(row[col.certNo]),
      expiry: cellToString(row[col.expiry]),
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

  const workbook = XLSX.readFile(inputPath);
  const sheetName = workbook.SheetNames[0];
  let records = parseSheet(workbook.Sheets[sheetName]);

  if (merge) {
    records = mergeRecords(loadExisting(outputPath), records);
  }

  assertUniqueCertNos(records);
  writeDataJson(outputPath, records);
}

main();
