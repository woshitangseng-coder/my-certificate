# 机读目录格式编目员上岗证书查询站

静态证书查询网站：支持姓名（精确、忽略空格）、证书编号（精确）查询；数据来自 `data.json`，可由 Excel 或飞书多维表维护。

**线上地址（部署后）**：`https://my-certificate.pages.dev`  
**证书直达链接**：`https://my-certificate.pages.dev/?cert=20250321001`

---

## 目录结构

```
cert-query/
├── index.html          # 查询页（查询视图 / 结果视图）
├── site.config.json    # 标题、单位名称、LOGO 路径等
├── data.json           # 证书数据（提交到 Git 后自动发布）
├── css/styles.css
├── js/app.js
├── convert.js          # Excel → data.json
├── sync-feishu.js      # 飞书多维表 → data.json
├── public/logo.svg     # 默认 LOGO（可换成 logo.png）
└── package.json
```

---

## 一、本机首次安装

在项目目录打开 PowerShell：

```powershell
cd D:\AI产物\cert-query
npm install
```

---

## 二、更换 LOGO 与文案

| 修改项 | 操作 |
|--------|------|
| 网站标题、单位名称 | 编辑 `site.config.json` |
| LOGO | 将图片放到 `public/logo.png`，并把 `site.config.json` 里 `logoPath` 改为 `public/logo.png` |

---

## 三、批量导入（Excel）

1. Excel 表头必须为：**姓名、性别、证书编号、证书有效期**（与飞书表一致）。
2. 执行：

```powershell
node convert.js 你的文件.xlsx
```

默认覆盖写入 `data.json`。若要在现有数据上按证书编号更新/追加：

```powershell
node convert.js 你的文件.xlsx --merge
```

3. 提交并推送：

```powershell
git add data.json
git commit -m "Update certificate data"
git push
```

---

## 四、飞书多维表维护（推荐日常）

### 4.1 建表

四列：**姓名、性别、证书编号、证书有效期**（列名需一致）。  
证书编号勿重复。

### 4.2 配置飞书应用（一次性）

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建 **企业自建应用**。
2. 权限（名称以控制台为准）：开通 **多维表格** 相关读权限（如 `bitable:app:readonly` 或查看多维表格）。
3. 发布应用（可用版本）并确保你的飞书账号在应用可用范围内。
4. 打开你的多维表格 → **…** → **添加文档应用** → 选择刚建的应用（否则 API 读不到表）。
5. 从浏览器地址栏获取：
   - `app_token`：URL 中 `base/` 后面一段（`App` 开头）。
   - `table_id`：URL 参数 `table=` 后面的 `tbl` 开头字符串。
6. 复制 `.env.example` 为 `.env`，填入 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_APP_TOKEN`、`FEISHU_TABLE_ID`。

### 4.3 同步到网站

飞书改完后，在本机执行：

```powershell
npm run sync
git add data.json
git commit -m "Sync from Feishu"
git push
```

约 1～2 分钟后 Cloudflare Pages 自动更新。

### 4.4 批量删除

在飞书表中 **多选行 → 删除**，再执行 `npm run sync` 并 `git push`。  
全量以飞书当前内容为准（同步会重写 `data.json` 的 `records`）。

---

## 五、协作者（非技术人员）

- 只使用 **飞书多维表** 增删改，不要改列名。
- 不要开启「获得链接的人可编辑」。
- 证书编号不要重复。
- 你负责在本机 `npm run sync` 和 `git push` 发布。

---

## 六、Cloudflare Pages 设置

| 项 | 值 |
|----|-----|
| Build command | （留空） |
| Build output directory | `/` 或留空 |
| Production branch | `main` |

根目录需有 `index.html`（已包含）。

---

## 七、查询规则说明

- **姓名**：去掉空格后精确匹配；不同人同名会 **全部显示**。
- **证书编号**：精确匹配；若与姓名同时填写，**以证书编号为准**。
- **查无结果**：显示「未查询到该人员信息」。
- **有效期**：原样显示，如 `2030年3月`。

---

## 八、常见问题

**Visit 打开 404**  
确认仓库根目录有 `index.html`，且 Pages 的 Build output 不是错误的子目录。

**同步飞书报错**  
检查 `.env`、应用是否已添加到该多维表格、权限是否开通。

**push 失败**  
使用 GitHub Personal Access Token 作为密码，不是登录密码。
