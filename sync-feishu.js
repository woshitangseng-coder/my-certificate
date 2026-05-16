#!/usr/bin/env node
/**
 * 从飞书多维表格同步到 data.json
 * 环境变量见 .env.example
 */

const fs = require("fs");
const path = require("path");

try {
  require("dotenv").config();
} catch {
  /* optional before npm install */
}

const OUTPUT = path.resolve(process.cwd(), "data.json");

const FIELD_NAMES = {
  name: ["姓名"],
  gender: ["性别"],
  certNo: ["证书编号"],
  expiry: ["证书有效期", "截止日期"],
};

async function feishuRequest(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (body.code !== 0) {
    throw new Error(body.msg || `飞书 API 错误 code=${body.code}`);
  }
  return body;
}

async function getTenantAccessToken(appId, appSecret) {
  const body = await feishuRequest(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );
  return body.tenant_access_token;
}

function extractFieldValue(field) {
  if (field == null) return "";
  if (typeof field === "string" || typeof field === "number") {
    return String(field).trim();
  }
  if (Array.isArray(field)) {
    if (field[0] && typeof field[0] === "object" && field[0].text != null) {
      return field.map((x) => x.text).join("");
    }
    return field.map(String).join("");
  }
  if (typeof field === "object") {
    if (field.text != null) return String(field.text).trim();
    if (field.value != null) return extractFieldValue(field.value);
    if (Array.isArray(field.value)) return extractFieldValue(field.value);
  }
  return String(field).trim();
}

function mapRecord(feishuFields, columnMap) {
  const get = (key) => {
    const colName = columnMap[key];
    if (!colName) return "";
    return extractFieldValue(feishuFields[colName]);
  };
  return {
    name: get("name"),
    gender: get("gender"),
    certNo: get("certNo"),
    expiry: get("expiry"),
  };
}

function resolveColumnMap(sampleFields) {
  const names = Object.keys(sampleFields || {});
  const map = {};

  for (const [key, aliases] of Object.entries(FIELD_NAMES)) {
    const found = names.find((n) => aliases.includes(n));
    if (!found) {
      throw new Error(
        `多维表中未找到列「${aliases[0]}」，当前列名: ${names.join("、") || "无"}`
      );
    }
    map[key] = found;
  }
  return map;
}

async function listAllRecords(token, appToken, tableId) {
  const records = [];
  let pageToken = undefined;

  do {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`
    );
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const body = await feishuRequest(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    records.push(...(body.data?.items || []));
    pageToken = body.data?.has_more ? body.data.page_token : undefined;
  } while (pageToken);

  return records;
}

function assertUniqueCertNos(records) {
  const seen = new Set();
  for (const r of records) {
    const key = r.certNo.trim();
    if (seen.has(key)) {
      throw new Error(`证书编号重复: ${key}`);
    }
    seen.add(key);
  }
}

function writeDataJson(records) {
  const payload = {
    updatedAt: new Date().toISOString(),
    records,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`已同步 ${records.length} 条 → ${OUTPUT}`);
}

async function main() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;

  if (!appId || !appSecret || !appToken || !tableId) {
    console.error(`
缺少环境变量。请复制 .env.example 为 .env 并填写:
  FEISHU_APP_ID
  FEISHU_APP_SECRET
  FEISHU_APP_TOKEN   (多维表格 app_token，来自表格 URL)
  FEISHU_TABLE_ID    (数据表 table_id)
`);
    process.exit(1);
  }

  const token = await getTenantAccessToken(appId, appSecret);
  const items = await listAllRecords(token, appToken, tableId);

  if (!items.length) {
    console.warn("飞书表格中没有记录，将写入空列表");
    writeDataJson([]);
    return;
  }

  const columnMap = resolveColumnMap(items[0].fields);
  console.log("列映射:", columnMap);

  const records = [];
  for (const item of items) {
    const r = mapRecord(item.fields, columnMap);
    if (!r.certNo) continue;
    records.push(r);
  }

  assertUniqueCertNos(records);
  writeDataJson(records);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
