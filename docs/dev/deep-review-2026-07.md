# 深度 Code Review 报告（2026-07-04）

> 范围：架构设计 / 探针（neko-agent + collector 对接）/ 数据库 / 性能 / 前端代码质量 / 交互与暗色模式，六个维度并行深查后交叉去重汇总。
> 所有 P0 结论已抽查代码核实；数据库表达式索引结论经 `EXPLAIN QUERY PLAN` 实测；Go 侧 `go vet / build / test` 全绿。

## P0（正在造成错误结果或可致服务/探针瘫痪）

### P0-1 hourly 维度数据被 7 天 retention 一刀切，"30 天保留"形同虚设【数据库】
- `config.repository.ts:334-343`：`deleteOldMinuteStats` 用 connectionLogsDays（默认 7 天）的 cutoff 同时删除 `hourly_dim_stats` / `hourly_country_stats`；而 `resolveFactTable` 把 >6h 范围查询全部路由到 `hourly_dim_stats`。
- 后果：用户选"最近 30 天"时 domain/IP/rule/device 维度只有 7 天数据，静默缺失且已物理删除。只有总量趋势（`hourly_stats`，30 天清理）完整。
- 修法：`deleteOldMinuteStats` 只清 minute 级表；hourly_dim/hourly_country 挂到 `cleanupHourlyStats` 的 30 天 cutoff。

### P0-2 ClickHouse 写侧精简与读侧回退互不知情，CH 抖动时静默展示缩水数据【架构+数据库】
- 写侧：`batch-buffer.ts:174` CH 健康时 SQLite 跳过 domain/ip/rule/dim/device 写入（reduceWrites）。
- 读侧：`stats.service.ts:373-390` CH 查询失败即回退 SQLite——但那些窗口的 SQLite 数据本来就没写，回退结果是"合法但错"的小数字。相关：`STATS_QUERY_SOURCE` 默认 sqlite 而写侧默认 reduce，配置陷阱；CH `getGlobalSummary` 硬编码 90 天窗口而 SQLite 版是 all-time。
- 修法：把存储拓扑显式建模为枚举（sqlite-only / dual-write / ch-primary），启动时校验并同时约束读写；回退结果标记 `degraded`；启用 CH 写但读源为 sqlite 时启动告警。

### P0-3 OpenWrt 探针"锁误判 → exit 0 → procd 重试耗尽"可永久静默下线【探针】
- `runner.go:183-187` 拿锁失败仅 return（exit 0）；`nekoagent:304` procd respawn 5 次后放弃；`runner.go:166-177` 锁检查只看 comm 含 "neko-agent"，崩溃后 PID 被其他 backend 的 agent 实例复用即永久误判。另：systemd 单元 `PrivateTmp=true` 使 /tmp 锁在 systemd 场景完全失效。
- 修法：改用 flock 咨询锁放 STATE_DIR（进程死亡自动释放）；拿锁失败 `os.Exit(1)`；OpenWrt respawn 改无限重试。

### P0-4 `getAllRuleChainFlows` O(R×N) 合并 + 全表无 LIMIT，可秒级卡死事件循环【性能】
- `rule.repository.ts:441-456`（及 :347）：DB 全量行 × realtime 行（上限 5 万）逐条 `findIndex`；每个订阅 chain-flow 的 WS 客户端每 5s 触发一次，跑在与摄入共享的主线程上。
- 修法：rows 建 `Map<rule::chain>` 合并（O(R+N)，半天工作量）；全量查询加 `ORDER BY 流量 DESC LIMIT 2000`；`realtime.store.ts:621` 的整表深拷贝改直接遍历；修完可再加 2-5s 结果级 TTL 缓存（websocket.server.ts:1114）。

### P0-5 世界地图完全未适配暗色模式【交互】
- `world-traffic-map.tsx:73,112,187,269-281`：无数据国家 `#f1f5f9`（近白）、色阶起点 `#e0e7ff` 全部硬编码亮色，暗色下是一块刺眼白色大陆且低流量国家不可分辨。
- 修法：用 `resolvedTheme`（rule-chain-flow.tsx:557 已有现成模式）切两套色值，图例与 colorScale 同源。

## P1（应尽快修）

### 后端
1. **WS 广播串行 await + 无背压**（`websocket.server.ts:1222-1311`）：循环体内 await 使广播总耗时 = Σ 各组合耗时；`ws.send` 不查 `bufferedAmount`，慢客户端可拖爆内存。→ 并发 fetch 后统一 send；bufferedAmount 超阈值跳过/断开。
2. **删除 `updateTrafficStats` 单条写路径**（`traffic-writer.repository.ts:143-193`）：生产零调用方，与批量路径已漂移 7 处（connections 口径、事件时间、device 表、CSV 截断、unknown 过滤等）。"双路径保持同步"的约定已实际失守，删掉即结构性解决。
3. **批量写三个独立事务，重试双计**（tx1/tx2/tx3，`batch-buffer.ts:172-192` 失败不清 buffer 重放）→ 外层单事务包住（better-sqlite3 嵌套自动降级 savepoint）。
4. **INSTR 子串误匹配丢关联数据**（`traffic-writer.repository.ts:45-59,527-547`）："a.com" 命中 "aa.com" 导致新值不追加；正确写法 L679 已存在（`','||list||','`），推广到全部 CSV 列。
5. **四个 `total_download + total_upload` 表达式索引从未被使用**（`schema.ts:465-471`，EXPLAIN 实测）：纯写放大，DROP。
6. **flush 部分失败状态机复制三份**（gateway.collector / surge.collector / app.ts flushAgentBuffer）：防丢数据最核心的逻辑 copy-paste，已现细微分叉 → 下沉进 BatchBuffer。
7. **WS 协议类型三处定义已漂移、无版本号**：server 内联 + websocket.types.ts（未接线）+ web 手写（含服务端根本不发的 `liveConnections` 死字段）→ 契约收进 @neko-master/shared；`message.parser.ts` 300 行死抽象删除或接线。
8. **连接即推全字段默认摘要**（`websocket.server.ts:260-279`）：订阅意图到达前白算一次全量 summary → 首帧延迟到收到 subscribe。
9. **分钟边界查询风暴**（cache 存结果值非 Promise，所有客户端 rolling range 同时跳变）→ cache 存 Promise 做请求合并 + subscribe 推送 debounce。
10. **30s 批量 flush 同步阻塞事件循环 100-500ms** → 分批 + `setImmediate` 让出；顺手把每次 flush 重新 prepare 的 ~17 条语句改实例级缓存（对照 singleStmts 模式）。

### 探针（打包进下个 agent release）
11. **nekoagent 下载无 timeout/retry**（`nekoagent:82-95,489-493`；install.sh 已修但 :110 也漏）——memory 遗留项确认仍在。
12. **cmd_upgrade `cp` 原地覆盖运行中脚本**（`nekoagent:633-641`）：实体拷贝安装的老用户 upgrade 可能跑飞 → cp 到 .new 后 mv 原子替换——遗留项确认。
13. **绑定保护超时 10s < 心跳 30s**（`app.ts:545` vs `config.go:55`）：空闲期 20s 窗口可被抢绑成 ping-pong → 超时改 心跳×2+余量；config/policy-state 同步也刷新 lastSeen。
14. **tmp 目录 trap 被覆盖 → OpenWrt tmpfs（RAM）泄漏**（`nekoagent:567/619` 两个 EXIT trap 互相覆盖）；跨文件系统 mv 的 ETXTBSY 风险（`nekoagent:608`）。
15. **systemd `StartLimitIntervalSec` 在 [Service] 段无效**（`nekoagent:271-277`，应在 [Unit]）——遗留项确认。
16. **shutdown drain 与 report loop 并发 flushOnce，`setRetryBatch` 覆盖丢批**（`runner.go:607-612`；`requeueFront` 是现成死代码，接线即可）。

### 前端
17. **WS 推送不校验 `message.backendId`**（`lib/websocket.ts:324-345`）：切换后端瞬间旧后端数据写进新后端缓存 key → onmessage 比对丢弃。
18. **`UnifiedRuleChainFlow` memo 漏比较 `visibleRuleNames`**（`rule-chain-flow.tsx:1594-1602`）：Active Policy 白名单停留旧值直到分钟跳变。
19. **全站无错误边界**（无 error.tsx/global-error.tsx）：可视化组件异常白屏整个 dashboard。
20. **双轨数据流缝合处**：残缺的字段级 wsSummary 被当完整 StatsSummary 直连消费（`use-dashboard.ts:278`）→ 统一让 WS 只写 React Query 缓存，组件只从 query 读（17/20 一起消失）。
21. **每个 `useStatsWebSocket` 实例各开一条 WS**（单页 3-5 条连接，服务端负载线性放大）→ 模块级共享连接管理器 + 订阅合并。
22. **上传箭头暗色写成蓝色**（`interactive-rule-stats.tsx:537` `dark:text-blue-400` 应为 `dark:text-purple-400`）：暗色下上传/下载同色不可分。
23. **链路图 error 静默 return null**（`rule-chain-flow.tsx:1504`）→ 渲染带重试的错误占位。
24. **移动端底部导航 7 tab 只见 5 个且无可发现性**（`navigation.tsx:284-305`）→ 渐隐遮罩 + 激活项 scrollIntoView。
25. **后端健康徽标/hover 缺 dark 变体**（`backend-config-dialog.tsx:1764`、`header/index.tsx:236`，同文件 L265 已有正确写法可复用）。

## P2（值得优化，摘要）

- **自动 VACUUM 同步阻塞**（cleanup >10000 行即触发，几乎每天；大库分钟级冻结）→ 删除或改 incremental_vacuum。
- **叉乘累计表无 retention**（rule_ip_traffic、device_ip_stats、ip_proxy_stats 等 13 张表永不清理，随远端 IP 无界增长；`cleanupASNCache` 无调用方，geoip_cache 无清理方法）→ 按 last_seen LRU 裁剪。
- **dashboard 每条 WS 消息两次 setState 整树重渲染**（`use-dashboard.ts:184` autoRefreshTick + lastMessage 新引用）；**timeRange 每 5s 新对象击穿 memo**（`use-dashboard.ts:416-425`）→ 值相等短路。
- **trend-chart memo 用 JSON.stringify 深比较 1440 点**（`trend-chart.tsx:438-447`）→ 引用+浅比较。
- **SMIL animateMotion 粒子动画**：show-all 模式 300-600 个常驻主线程动画（rules 页风扇元凶）→ CSS offset-path / 限量 top 30 / 离屏暂停。
- **filteredData 双向 includes 模糊匹配 + findIndex O(n²)**（`rule-chain-flow.tsx:1196-1204,1382,1423`，兼有 "Google"/"GoogleFCM" 误匹配）→ 预计算映射 + Map。
- **`fetchJson` 无超时无 AbortSignal，401 仍重试**（`lib/api.ts:53-106`）。
- **未认证请求先解 gzip 再验 token**（`app.ts:119-124`，/api/agent/* 在公开白名单）→ 只对带 Authorization 的 agent 路由解压。
- **Surge policy group N+1 串行请求 + 失败写空值致 hash 抖动重发**（`gateway/config.go:164-184`）。
- **requestId 幂等表先标记后处理**（`app.ts:229-245`）：handler 中途抛错则重试被当重复丢弃 → 成功后登记。
- **巨型组件**：backend-config-dialog.tsx 3373 行（18 处 `catch(error: any)`）、rule-chain-flow.tsx 1605 行 → 按 tab/职责拆分。
- **i18n 漏翻**：interactive-rule-stats / interactive-proxy-stats tooltip、formatDuration、backend 健康提示全是硬编码英文。
- **排序表头 div+onClick 键盘不可达**（domain/ip 表）；About 弹窗手写 fixed 遮罩无 Esc/焦点陷阱；时间范围"应用"非法输入静默失败；地图数值触屏拿不到（只有 hover）。
- **架构清理**：`TrafficUpdate` 三处定义（收进 shared）；分钟键格式化 4 份；`connection.ts` 死代码与 db.ts pragma 漂移；realtimeStore 全局单例 setDatabase 时序耦合；app.ts 1381 行应切出 modules/agent 与 gateway-proxy；agent 表裸 SQL 下沉 AgentRepository。
- **数据完整性护栏**：FK CASCADE 声明但 `PRAGMA foreign_keys` 未开启，靠 `deleteBackendData` 人肉清单（当前 24 张表已核对齐全）→ 加"枚举 sqlite_master 含 backend_id 的表 vs 删除清单 diff"的守护测试；close 前无 wal_checkpoint；无 `db.backup()` 在线备份入口。
- **GeoIP 批处理无并发上限**（`app.ts:760-772` Promise.all 可瞬间上千并发）。

## P3（低风险，摘要）

- `resolveFactTableSplit` 用本地时区截断当前小时（半时区双计 ~30 分钟）；getTodayTraffic 的 "today" 是 UTC 日。
- 图表坐标轴 `#888888` 硬编码 5+ 处 → 统一 `var(--muted-foreground)`。
- 登录按钮 `disabled:opacity-100` 视觉无差异；密码可见性按钮 `tabIndex={-1}`；Header 图标按钮缺 aria-label。
- radix-ui 元包与 scoped 单包混用；PWA 双重注册 + PWARegister 死代码；`use-gateway.ts` RULES_KEY 与真实 key 不一致的死 hook。
- agentId 派生自 token SHA-256 前 64bit 并在 409 回显（风险极低，文档注明即可）。
- syncConfig 初始重试 time.Sleep 不响应 ctx，配合 stop 12s 后 kill -9。
- realtime store 逐出全量排序、内层 ips Set 无单条上限（仅 CH 故障时放大）。

## 总体评价

三端代码都**明显高于同类自研项目平均水平**：collector 的 repository 拆分、schema 单一来源、CH 降级链路（健康阈值 + detailOk/aggOk 精细清理）、agent 协议的版本门禁 + requestId 幂等 + 单 flight retry、前端的 query key 收口、WS 回调 ref 化、结构指纹区分数据/结构更新，都是踩坑后的成熟写法。依赖健康度好（唯一循环是 type-only）。

系统性短板是三类：
1. **"一致性靠约定"**——双写路径、CH/SQLite 读写口径、三处 WS 类型、Go/TS payload 镜像，全靠人肉同步且均已漂移。修法统一是"把约定变结构"：删冗余实现、显式拓扑枚举、契约收进 shared。
2. **单线程上的阻塞源与 O(n²)**——同步 flush、VACUUM、串行广播、findIndex 合并共享一个事件循环，数据量小看不见，重度实例会从"流畅"突然跌到"秒卡"。建议顺手加 event-loop lag 指标验证。
3. **"体系外"组件**——世界地图、手写 About 弹窗、硬编码 tooltip 没走已建立的主题/i18n/Dialog 基建；错误态相对 loading/empty 态系统性缺失。

## 建议动手顺序

1. **立即（小 diff 大收益）**：P0-1 retention 分拆、P0-4 Map 合并+LIMIT、P1-22 颜色笔误、P1-5 DROP 索引、P1-4 INSTR 分隔符、P1-18 memo 补参数。
2. **本周**：P0-2 存储拓扑枚举、P0-5 地图暗色、P1-1 广播并发+背压、P1-2 删单条路径、P1-3 单事务、P1-17/19/20 前端数据流三件套。
3. **下个 agent release 打包**：P0-3 flock 锁、P1-11/12/14/15/16。
4. **下个迭代（结构性）**：WS 契约进 shared + 共享连接管理器、flush 状态机下沉、巨型组件拆分、叉乘表 retention。
