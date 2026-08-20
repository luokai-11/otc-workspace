# OTC医药销售个人AI工作台 · 后端开发进度记录

> 最后更新：2026-08-20  
> 状态：**方案设计完成，等待用户确认后启动开发**（服务器采购 + 域名决策）

---

## 一、用户需求（2026-08-20 确认）

| 编号 | 需求 | 说明 | 优先级 |
|------|------|------|--------|
| 1 | 云端多设备数据同步 | 电脑录入手机可见，所有设备实时同步 | 🔴 P0 |
| 2 | 多账号权限 | 目前仅一人使用，先做单人账号体系，预留扩展 | 🟡 P0 基础版 |
| 3 | 数据永不丢失 | 自动备份 + 邮件，避免清缓存/设备损坏丢失 | 🔴 P0 |
| 4 | 复盘数据库全设备查询 | 复盘统一存云端，按门店/产品/日期搜索 | 🟢 P1 |
| 9 | 自动生成PDF/Excel下载 | 复盘PDF、订单报表Excel一键下载 | 🟢 P1 |

- 使用人数：目前仅用户本人（未来可扩展销售员）
- 年度预算：100 元以内

---

## 二、费用方案（≤100元/年）

| 项目 | 方案 | 费用 | 是否必须 |
|------|------|------|---------|
| 云服务器 | 腾讯云轻量 新客特惠 1核2G 40G盘 4M带宽 | ≈ 60 元/年（新人首年） | ✅ 必须 |
| 域名 | .top 或 .cn 域名（可选）| 30-40 元/年 | ⭐ 可选（方案A） |
| HTTPS证书 | Let's Encrypt 免费 | 0 元 | 含 |
| 数据库 | SQLite 文件数据库（内置） | 0 元 | 含 |
| 邮件服务 | 用户现有QQ邮箱2332385907@qq.com SMTP | 0 元 | 含 |
| 进程管理 | PM2（免费开源） | 0 元 | 含 |
| **合计（方案A 买域名）** | | **90-100 元/年** | ✅ |
| **合计（方案B 不买域名）** | | **≈ 60 元/年** | ✅ |

> 腾讯云新人特价首年60元；第二年续费约120-200元/年，届时可评估是否续费或迁移更低成本方案。

---

## 三、技术选型

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | 现有 index.html 原生JS（GitHub Pages：https://luokai-11.github.io/otc-workspace/） | 界面不改，仅将 localStorage 读写改造为请求后端 API |
| 后端 | Node.js + Express | 单机性能足够，开发快速 |
| 数据库 | SQLite（单文件） | 0费用、备份=复制文件、无需MySQL服务 |
| 认证 | JWT + bcrypt 密码哈希 | 登录拿token，密码加密入库 |
| 备份 | 每日凌晨2点自动导出SQL → zip压缩 → 发QQ邮箱 | 双重保险 |
| 进程守护 | PM2 | 崩了自动重启、开机自启 |
| 部署目标 | 腾讯云轻量 广州地域 1核2G Ubuntu 22.04 | 广东用户延迟最低 |

---

## 四、架构图

```
┌───────────────────────┐    HTTPS JSON     ┌──────────────────────────┐
│ 手机/电脑 浏览器       │ ───────────────▶ │ 腾讯云轻量(广州) 单机    │
│ index.html (GitHub    │                  │ IP: 待采购后填写         │
│  Pages) 登录/客户/... │ ◀────────────── │ 端口: 3000 (HTTPS)       │
└───────────────────────┘                  │  ┌────────────────────┐  │
                                           │  │ Node.js + Express  │  │
                                           │  │  - JWT认证          │  │
                                           │  │  - 业务CRUD API     │  │
                                           │  │  - 导出(PDF/Excel)  │  │
                                           │  │  - 定时备份+邮件    │  │
                                           │  └──────┬─────────────┘  │
                                           │         │ 读写            │
                                           │  ┌──────▼─────────────┐  │
                                           │  │ SQLite data.db     │  │
                                           │  │ users/customers/   │  │
                                           │  │ orders/reviews/    │  │
                                           │  │ plans/todos/...    │  │
                                           │  └────────────────────┘  │
                                           │  每日备份zip → QQ邮箱    │
                                           └──────────────────────────┘
```

---

## 五、数据模型（计划表格）

```
users            — 账号表(id, username, password_hash, created_at)
customers        — 客户档案(id, 名称, 电话, 地址, 老板姓名, 类型, 等级, 备注, owner_id, created_at, updated_at)
orders           — 订单(id, customer_id, 产品, 数量, 金额, 付款状态, 下单日期, ...)
market_plans     — 动销方案(id, customer_id, 目标, 产品列表, 方案内容, 生成日期, ...)
reviews          — 复盘(id, customer_id, 产品, 日期, 销量, 问题, 改进, 指标, ...)
todos            — 待办(id, 内容, 状态, 截止日期, 是否长期, ...)
product_knowledge— 产品知识(id, 品名, 规格, 卖点, 用法, 禁忌, ...)
backup_logs      — 备份日志(id, 文件名, 大小, 备份时间, 邮件发送状态, ...)
```

---

## 六、API 设计（核心接口清单）

```
认证：
  POST   /api/auth/login          账号密码登录 → JWT token
  GET    /api/auth/me             当前登录用户

客户档案：
  GET    /api/customers           列表（分页+搜索+筛选）
  POST   /api/customers           新增
  PUT    /api/customers/:id       修改
  DELETE /api/customers/:id       删除

订单 / 动销方案 / 复盘 / 待办 / 产品知识：
  同上 RESTful CRUD

统计/搜索：
  GET    /api/stats/summary       销售总览
  GET    /api/stats/by-customer/:id 某客户档案聚合
  GET    /api/reviews/search?q=.. 复盘搜索（门店/产品/日期范围）

导出下载：
  GET    /api/exports/review-pdf?id=   复盘报告PDF
  GET    /api/exports/orders-excel?month= 订单报表Excel
```

---

## 七、开发时间表（约5周 / 35天）

| 阶段 | 周数 | 内容 | 交付物 |
|------|------|------|--------|
| P0-1 后端基础 | 第1周 | 服务器采购+配置、Node/Express/PM2搭建、SQLite建表、JWT认证、自动备份邮件脚本 | 可登录后端服务、每日备份发邮箱 |
| P0-2 客户档案云端同步 | 第2周 | 客户CRUD API、前端改造localStorage→API、数据迁移脚本（现有localStorage导入数据库） | 多设备客户档案实时同步 |
| P0-3 全模块同步 | 第3周 | 订单/方案/复盘/待办/产品知识 CRUD API + 前端改造 + 数据迁移 | 所有模块数据云端同步 |
| P1-1 复盘查询 | 第4周 | 复盘搜索API（多条件组合筛选+分页）、前端搜索UI | 任意设备按门店/产品/日期查复盘 |
| P1-2 导出下载 | 第5周 | 复盘PDF生成、订单Excel生成、下载接口 | 按钮一键下载PDF/Excel |

> 每阶段完成后先测试一周，再进入下一阶段。

---

## 八、待确认事项（用户需确认后启动）

- [ ] **事项1 - 服务器采购**：用户自行到腾讯云采购「轻量应用服务器 1核2G 新客特惠」（约60元/年），Ubuntu 22.04，广州地域。采购完成后把「公网IP + root密码」告知开发者，立即开始 P0-1。
  - 如果暂时不买服务器：开发者可先写代码，代码存在 GitHub 仓库，等用户买好服务器后再一键部署。

- [ ] **事项2 - 域名决策**：
  - 方案A（买域名，合计90-100元）：用户注册 .top 域名（如 otc-luokai.top 约30元/年），开发者配置 DNS 解析 + Let's Encrypt HTTPS 证书。后端地址形如 `https://api.otc-luokai.top`。
  - 方案B（不买域名，合计约60元）：直接用 IP 访问 `https://<IP>:3000`，功能完全一样，只是地址不如域名好看。

---

## 九、当前状态快照

| 项目 | 状态 |
|------|------|
| 纯前端页面 | ✅ 已上线（GitHub Pages + surge.sh 双链接均可使用，已修复动销方案生成 bug） |
| 后端方案设计 | ✅ 已完成（本文件） |
| 服务器采购 | ⏸️ 待用户采购或确认是否先暂不采购 |
| 域名购买 | ⏸️ 待用户选方案 A / B |
| 后端代码开发 | 🔲 未开始（等确认） |
| 数据迁移（localStorage → 数据库） | 🔲 未开始（P0-2 阶段） |
| 备份系统 | 🔲 未开始（P0-1 阶段） |

---

## 十、后续恢复时执行指令（提示给开发者）

1. 打开 GitHub 仓库：`luokai-11/otc-workspace`
2. 查看此文件 `BACKEND_PROGRESS.md` 确认进度
3. 确认用户是否已经提供：服务器 IP/账号/密码 + 域名决策
4. 从表格「七、开发时间表」中对应阶段开始推进
5. 后端代码建议新建 `server/` 目录下开发，完成后一起 push 到同一仓库
6. 部署用 PM2：`pm2 start server/index.js --name otc-backend`，并设 `pm2 startup` 开机自启
7. 自动备份：用 `node-cron` 在后端内触发，或系统级 crontab `0 2 * * * /root/backup.sh`
8. 备份邮件用 nodemailer + QQ 邮箱 SMTP：host `smtp.qq.com`，端口 465 SSL，用户 `2332385907@qq.com`，pass 填 QQ 邮箱授权码（不是QQ密码）
9. 前端 GitHub Pages 是 HTTPS → 后端必须也是 HTTPS（用 Let's Encrypt certbot 申请证书，或用 Caddy 一键反代）

---

## 附：用户关键凭据（由开发者安全存储，不要公开）

- GitHub 用户名：`luokai-11`
- GitHub Pages：`https://luokai-11.github.io/otc-workspace/`
- GitHub PAT（用于推送）：见本地 credential store
- QQ 邮箱（备份邮件发送目标 + SMTP 发送方）：`2332385907@qq.com`
- Surge 备用公网：`https://otc-sj-workbench-2026.surge.sh/`（账号：2332385907@qq.com / OTCsj@2026workbench）
