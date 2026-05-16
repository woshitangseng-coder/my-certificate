const COLUMN_LABELS = {
  name: "姓名",
  gender: "性别",
  certNo: "证书编号",
  expiry: "证书有效期",
};

let siteConfig = {};
let records = [];

const el = {
  logo: document.getElementById("logo"),
  siteTitle: document.getElementById("site-title"),
  orgName: document.getElementById("org-name"),
  viewQuery: document.getElementById("view-query"),
  viewResults: document.getElementById("view-results"),
  queryForm: document.getElementById("query-form"),
  inputName: document.getElementById("input-name"),
  inputCert: document.getElementById("input-cert"),
  resultsContainer: document.getElementById("results-container"),
  btnBack: document.getElementById("btn-back"),
};

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, "");
}

function normalizeCertNo(value) {
  return String(value || "").trim();
}

function showQueryView() {
  el.viewQuery.hidden = false;
  el.viewResults.hidden = true;
}

function showResultsView() {
  el.viewQuery.hidden = true;
  el.viewResults.hidden = false;
}

function renderResults(matches) {
  const notFoundMessage =
    siteConfig.notFoundMessage || "未查询到该人员信息";

  el.resultsContainer.innerHTML = "";

  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "results__empty";
    empty.textContent = notFoundMessage;
    el.resultsContainer.appendChild(empty);
    return;
  }

  if (matches.length > 1) {
    const count = document.createElement("p");
    count.className = "results__count";
    count.textContent = `共 ${matches.length} 条记录`;
    el.resultsContainer.appendChild(count);
  }

  for (const record of matches) {
    el.resultsContainer.appendChild(createCertCard(record));
  }
}

function createCertCard(record) {
  const card = document.createElement("article");
  card.className = "cert-card";

  const rows = [
    ["name", record.name],
    ["gender", record.gender],
    ["certNo", record.certNo],
    ["expiry", record.expiry],
  ];

  for (const [key, value] of rows) {
    const row = document.createElement("div");
    row.className = "cert-card__row";
    row.innerHTML = `
      <span class="cert-card__label">${COLUMN_LABELS[key]}</span>
      <span class="cert-card__value">${escapeHtml(value ?? "")}</span>
    `;
    card.appendChild(row);
  }

  return card;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function search({ name, certNo }) {
  const trimmedCert = normalizeCertNo(certNo);
  const normalizedName = normalizeName(name);

  if (trimmedCert) {
    return records.filter((r) => normalizeCertNo(r.certNo) === trimmedCert);
  }

  if (normalizedName) {
    return records.filter((r) => normalizeName(r.name) === normalizedName);
  }

  return [];
}

function runSearch() {
  const name = el.inputName.value;
  const certNo = el.inputCert.value;

  if (!normalizeName(name) && !normalizeCertNo(certNo)) {
    showFormError("请至少填写姓名或证书编号");
    return;
  }

  clearFormError();
  const matches = search({ name, certNo });
  renderResults(matches);
  showResultsView();
}

function showFormError(message) {
  clearFormError();
  const p = document.createElement("p");
  p.className = "form-error";
  p.id = "form-error";
  p.textContent = message;
  el.queryForm.insertBefore(p, el.queryForm.querySelector(".btn--primary"));
}

function clearFormError() {
  const existing = document.getElementById("form-error");
  if (existing) existing.remove();
}

function applySiteConfig(config) {
  siteConfig = config;
  document.title = config.title || document.title;
  el.siteTitle.textContent = config.title || el.siteTitle.textContent;
  el.orgName.textContent = config.orgName || el.orgName.textContent;

  if (config.logoPath) {
    el.logo.src = config.logoPath;
    el.logo.alt = config.orgName || "logo";
    el.logo.hidden = false;
    el.logo.onerror = () => {
      el.logo.hidden = true;
    };
  }
}

async function loadData() {
  const [configRes, dataRes] = await Promise.all([
    fetch("site.config.json"),
    fetch("data.json"),
  ]);

  if (!configRes.ok) throw new Error("无法加载站点配置");
  if (!dataRes.ok) throw new Error("无法加载证书数据");

  const config = await configRes.json();
  const data = await dataRes.json();

  applySiteConfig(config);
  records = Array.isArray(data.records) ? data.records : [];
}

function handleDirectCertUrl() {
  const params = new URLSearchParams(window.location.search);
  const cert =
    params.get("cert") || params.get("certNo") || params.get("id");
  if (!cert) return false;

  el.inputCert.value = cert.trim();
  const matches = search({ name: "", certNo: cert });
  renderResults(matches);
  showResultsView();
  return true;
}

function initEvents() {
  el.queryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch();
  });

  el.btnBack.addEventListener("click", () => {
    showQueryView();
    clearFormError();
  });
}

async function init() {
  el.resultsContainer.innerHTML = '<p class="loading">加载中…</p>';

  try {
    await loadData();
    initEvents();

    if (!handleDirectCertUrl()) {
      showQueryView();
      el.resultsContainer.innerHTML = "";
    }
  } catch (err) {
    el.resultsContainer.innerHTML = `<p class="results__empty">加载失败，请稍后重试</p>`;
    console.error(err);
  }
}

init();
