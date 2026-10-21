<script>
    import { onMount } from "svelte";
    import { apiGet, apiPost } from "$lib/api.js";
    import { avatarTone, formatDateTime, initialOf } from "$lib/format.js";

    let settings = $state(null);
    let users = $state([]);
    let connection = $state({ status: "idle", sampleCount: null, message: "" });
    let loading = $state(true);
    let error = $state("");
    let copied = $state(false);

    const token = $derived(
        settings ? String(settings.access_token || settings.baidu_access_token || "").trim() : ""
    );
    const tokenConfigured = $derived(token !== "");
    const userCount = $derived(users.length);
    const enabledCount = $derived(users.filter((user) => user.enabled).length);
    const baseUrl = $derived(settings && settings.app_base_url ? String(settings.app_base_url) : "");
    const recentUsers = $derived(users.slice(0, 4));
    const maxUploadMb = $derived(
        settings && Number(settings.max_upload_size) > 0
            ? Math.round(Number(settings.max_upload_size) / (1024 * 1024))
            : null
    );
    const linkTtlLabel = $derived.by(() => {
        const seconds = settings ? Number(settings.upload_link_ttl_sec) : 0;

        if (!Number.isFinite(seconds) || seconds <= 0) {
            return "—";
        }

        return seconds >= 60 ? `${Math.round(seconds / 60)} 分钟` : `${seconds} 秒`;
    });

    const connectionText = $derived.by(() => {
        if (!tokenConfigured) return "未配置";
        if (connection.status === "connected") return "已连接";
        if (connection.status === "failed") return "连接失败";
        if (connection.status === "testing") return "检测中";
        return "待检测";
    });

    const connectionTone = $derived.by(() => {
        if (!tokenConfigured || connection.status === "failed") return "bad";
        if (connection.status === "connected") return "good";
        return "pending";
    });

    const setupSteps = $derived([
        {
            label: "百度 access_token",
            detail: tokenConfigured ? "已保存，服务端可以用它访问网盘。" : "还没有保存 access_token。",
            done: tokenConfigured,
            href: "/admin/settings",
            action: "去配置"
        },
        {
            label: "对外访问地址",
            detail: baseUrl || "短链生成前需要设置对外访问地址。",
            done: Boolean(baseUrl),
            href: "/admin/settings",
            action: "去设置"
        },
        {
            label: "成员与目录授权",
            detail: userCount > 0 ? `${userCount} 位成员已创建，可在用户详情页分配目录。` : "还没有创建成员。",
            done: userCount > 0,
            href: "/admin/users",
            action: "去创建"
        }
    ]);

    const setupDone = $derived(setupSteps.every((step) => step.done));

    function errorMessage(err) {
        return err && err.message ? err.message : "请求失败";
    }

    async function testConnection() {
        connection = { status: "testing", sampleCount: null, message: "" };

        try {
            const result = await apiPost("/api/admin/settings/test");

            connection = {
                status: result && result.connected ? "connected" : "failed",
                sampleCount:
                    result && typeof result.sampleCount === "number" ? result.sampleCount : null,
                message: ""
            };
        } catch (err) {
            connection = { status: "failed", sampleCount: null, message: errorMessage(err) };
        }
    }

    async function load() {
        loading = true;
        error = "";

        try {
            const [settingsData, usersData] = await Promise.all([
                apiGet("/api/admin/settings"),
                apiGet("/api/admin/users")
            ]);

            settings = settingsData || {};
            users = Array.isArray(usersData) ? usersData : [];

            const currentToken = String(
                settings.access_token || settings.baidu_access_token || ""
            ).trim();

            loading = false;

            if (currentToken) {
                connection = { status: "testing", sampleCount: null, message: "" };
                testConnection();
            } else {
                connection = { status: "missing", sampleCount: null, message: "" };
            }
        } catch (err) {
            error = errorMessage(err);
            connection = { status: "idle", sampleCount: null, message: "" };
        } finally {
            loading = false;
        }
    }

    async function copyEndpoint() {
        const url = new URL("/mcp", window.location.origin).href;

        try {
            await navigator.clipboard.writeText(url);
            copied = true;
            window.setTimeout(() => {
                copied = false;
            }, 1600);
        } catch (err) {
            window.prompt("复制失败，请手动复制 MCP 端点：", url);
        }
    }

    onMount(() => {
        load();
    });
</script>

<svelte:head>
    <title>管理端概览</title>
</svelte:head>

<div class="page">
    <header class="page-header">
        <div>
            <h1 class="page-title">概览</h1>
            <p class="page-subtitle">百度网盘接入状态、成员与 MCP 端点。</p>
        </div>
        <div class="page-actions">
            <button class="btn" type="button" onclick={load} disabled={loading}>
                {loading ? "刷新中…" : "刷新"}
            </button>
            {#if tokenConfigured}
                <a class="btn btn-primary" href="/admin/files">浏览文件</a>
            {:else}
                <a class="btn btn-primary" href="/admin/settings">去设置</a>
            {/if}
        </div>
    </header>

    {#if error}
        <div class="notice notice-error inline-notice" role="alert">
            <span>{error}</span>
            <button class="btn btn-sm" type="button" onclick={load}>重试</button>
        </div>
    {/if}

    {#if !loading && !error && !tokenConfigured}
        <div class="notice notice-warning" role="status">
            <strong>尚未配置百度 access_token</strong>
            <span class="hint">配置后才能上传、下载和浏览文件。</span>
        </div>
    {/if}

    {#if loading}
        <section class="kpis skeleton-kpis" aria-label="正在加载概览">
            {#each [1, 2, 3, 4] as cell (cell)}
                <div class="kpi">
                    <div class="skeleton" style="width: 56px"></div>
                    <div class="skeleton" style="width: 96px; height: 24px; margin-top: 10px"></div>
                </div>
            {/each}
        </section>
        <div class="overview-grid">
            <div class="card">
                <div class="skeleton" style="width: 120px; height: 16px"></div>
                <div class="skeleton" style="width: 100%; height: 180px; margin-top: 18px"></div>
            </div>
            <div class="card">
                <div class="skeleton" style="width: 96px; height: 16px"></div>
                <div class="skeleton" style="width: 100%; height: 150px; margin-top: 18px"></div>
            </div>
        </div>
    {:else}
        <section class="kpis" aria-label="接入状态">
            <div class="kpi">
                <div class="kpi-label">百度连接</div>
                <div class="kpi-value status-value">
                    <span class="status-dot {connectionTone}"></span>
                    <span>{connectionText}</span>
                </div>
                <div class="kpi-note">
                    {#if connection.status === "connected" && connection.sampleCount !== null}
                        根目录可见 {connection.sampleCount} 项
                    {:else if connection.status === "failed" && connection.message}
                        {connection.message}
                    {:else if !tokenConfigured}
                        等待填写 access_token
                    {:else}
                        访问百度网盘开放平台
                    {/if}
                </div>
            </div>

            <div class="kpi">
                <div class="kpi-label">成员</div>
                <div class="kpi-value">{userCount}<small>位</small></div>
                <div class="kpi-note">{enabledCount} 位已启用</div>
            </div>

            <div class="kpi">
                <div class="kpi-label">对外访问地址</div>
                <div class="kpi-value kpi-text mono">{baseUrl || "—"}</div>
                <div class="kpi-note">{baseUrl ? "用于生成上传、下载短链" : "尚未设置"}</div>
            </div>
        </section>

        <div class="overview-grid">
            <section class="card">
                <header class="section-head">
                    <div>
                        <h2 class="section-title">{setupDone ? "MCP 接入" : "接入检查"}</h2>
                        <p class="hint">
                            {setupDone
                                ? "成员使用 Bearer Key 调用统一端点。"
                                : "完成下面几项后即可让成员接入。"}
                        </p>
                    </div>
                    {#if setupDone}
                        <a class="btn btn-sm" href="/admin/users">管理成员</a>
                    {:else}
                        <a class="btn btn-sm" href="/admin/settings">打开设置</a>
                    {/if}
                </header>

                {#if setupDone}
                    <div class="mcp-block">
                        <div class="mcp-row">
                            <span class="mcp-label">端点</span>
                            <code class="mcp-value">/mcp</code>
                            <button class="path-copy" type="button" onclick={copyEndpoint}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <rect x="8" y="8" width="11" height="11" rx="2" />
                                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                                </svg>
                                <span>{copied ? "已复制" : "复制"}</span>
                            </button>
                        </div>
                        <div class="mcp-row">
                            <span class="mcp-label">鉴权</span>
                            <code class="mcp-value">Authorization: Bearer mcp_…</code>
                        </div>
                        <div class="mcp-row">
                            <span class="mcp-label">范围</span>
                            <span>按成员的目录授权校验每一次操作</span>
                        </div>
                        <p class="hint mcp-note">
                            Key 在用户详情页查看或重置；没有有效 Key 的请求一律拒绝。
                        </p>
                    </div>
                {:else}
                    <ul class="setup-list">
                        {#each setupSteps as step (step.label)}
                            <li class="setup-row">
                                <span class="setup-dot status-dot {step.done ? "good" : "bad"}"></span>
                                <span class="setup-copy">
                                    <strong>{step.label}</strong>
                                    <span class="hint">{step.detail}</span>
                                </span>
                                {#if step.done}
                                    <span class="pill pill-positive">已完成</span>
                                {:else}
                                    <a class="btn btn-sm" href={step.href}>{step.action}</a>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>

            <section class="card">
                <header class="section-head">
                    <div>
                        <h2 class="section-title">最近成员</h2>
                        <p class="hint">按创建时间从新到旧。</p>
                    </div>
                    <a class="btn btn-sm" href="/admin/users">查看全部</a>
                </header>

                {#if recentUsers.length === 0}
                    <div class="empty member-empty">
                        <div>
                            <strong>还没有成员</strong>
                            <p class="hint">创建成员后，这里会显示最近的访问者。</p>
                            <a class="btn btn-sm" href="/admin/users">新建用户</a>
                        </div>
                    </div>
                {:else}
                    <ul class="member-list">
                        {#each recentUsers as user (user.id)}
                            {@const tone = avatarTone(user.name)}
                            <li>
                                <a class="member-row" href={`/admin/users/${encodeURIComponent(user.id)}`}>
                                    <span class="avatar" style={`background:${tone.bg};color:${tone.ink}`}>
                                        {initialOf(user.name)}
                                    </span>
                                    <span class="member-copy">
                                        <span class="member-name">{user.name}</span>
                                        <span class="member-meta">{formatDateTime(user.createdAt ?? user.created_at)}</span>
                                    </span>
                                    <span class="pill" class:pill-positive={user.enabled} class:pill-negative={!user.enabled}>
                                        {user.enabled ? "启用" : "禁用"}
                                    </span>
                                </a>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>
        </div>

        <div class="overview-lower">
            <section class="card">
                <header class="section-head">
                    <div>
                        <h2 class="section-title">传输设置</h2>
                        <p class="hint">上传方式、单文件上限与短链有效期。</p>
                    </div>
                    <a class="btn btn-sm" href="/admin/settings">调整设置</a>
                </header>

                <dl class="limit-list">
                    <div>
                        <dt>单文件上传</dt>
                        <dd class="num">{maxUploadMb ? `${maxUploadMb.toLocaleString("zh-CN")} MB` : "—"}</dd>
                    </div>
                    <div>
                        <dt>上传方式</dt>
                        <dd>短链 + curl</dd>
                    </div>
                    <div>
                        <dt>上传短链</dt>
                        <dd>{linkTtlLabel}</dd>
                    </div>
                    <div>
                        <dt>下载短链</dt>
                        <dd>10 分钟</dd>
                    </div>
                </dl>
            </section>

            <section class="card">
                <header class="section-head">
                    <div>
                        <h2 class="section-title">权限等级</h2>
                        <p class="hint">等级从低到高，逐级包含下方能力。</p>
                    </div>
                    <a class="btn btn-sm" href="/admin/users">管理授权</a>
                </header>

                <ul class="level-list">
                    <li>
                        <span class="pill pill-accent">查看</span>
                        <span>列出、搜索、查看详情与下载</span>
                    </li>
                    <li>
                        <span class="pill">编辑</span>
                        <span>上传、新建、重命名、复制、移动</span>
                    </li>
                    <li>
                        <span class="pill">管理</span>
                        <span>在编辑基础上删除文件或目录</span>
                    </li>
                </ul>
            </section>
        </div>
    {/if}
</div>

<style>
    .inline-notice {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        background: var(--surface);
    }

    .kpi {
        min-width: 0;
        padding: 16px 20px;
    }

    .kpi + .kpi {
        border-left: 1px solid var(--border);
    }

    .kpi-label {
        color: var(--muted);
        font-size: var(--fs-small);
        font-weight: 500;
    }

    .kpi-value {
        margin-top: 5px;
        font-size: 24px;
        line-height: 1.25;
        font-weight: 400;
        letter-spacing: -0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .kpi-value small {
        margin-left: 2px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 400;
    }

    .kpi-text {
        font-size: 16px;
        font-weight: 500;
        line-height: 34px;
    }

    .status-value {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .kpi-note {
        margin-top: 4px;
        color: var(--muted);
        font-size: var(--fs-small);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .overview-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.85fr);
        gap: var(--gap);
        align-items: start;
    }

    .overview-lower {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--gap);
        align-items: start;
    }

    .limit-list {
        display: grid;
        gap: 0;
        margin-top: 14px;
    }

    .limit-list > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        padding: 8px 0;
    }

    .limit-list > div + div {
        border-top: 1px solid var(--rule);
    }

    .limit-list dt {
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .limit-list dd {
        margin: 0;
        font-size: 13px;
        text-align: right;
    }

    .level-list {
        display: grid;
        gap: 0;
        margin-top: 14px;
    }

    .level-list li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 0;
    }

    .level-list li + li {
        border-top: 1px solid var(--rule);
    }

    .level-list .pill {
        flex: none;
    }

    .level-list li > span:last-child {
        color: var(--muted);
        font-size: 13px;
    }

    .setup-list {
        margin-top: 18px;
    }

    .setup-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 0;
    }

    .setup-row + .setup-row {
        border-top: 1px solid var(--rule);
    }

    .setup-dot {
        flex: none;
        margin-top: 1px;
    }

    .setup-copy {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .setup-copy strong {
        font-weight: 500;
    }

    .setup-copy .hint {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .mcp-block {
        margin-top: 18px;
    }

    .mcp-row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 40px;
        padding: 6px 0;
        border-bottom: 1px solid var(--rule);
    }

    .mcp-row:last-of-type {
        border-bottom: 0;
    }

    .mcp-label {
        flex: none;
        width: 48px;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .mcp-value {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }

    .mcp-row .path-copy {
        flex: none;
    }

    .mcp-note {
        margin-top: 10px;
    }

    .member-list {
        margin-top: 12px;
    }

    .member-list li + li {
        border-top: 1px solid var(--rule);
    }

    .member-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 0;
        border-radius: var(--radius-chip);
    }

    .member-row:hover .member-name {
        text-decoration: underline;
        text-underline-offset: 3px;
    }

    .avatar {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        flex: none;
        font-size: 13px;
        font-weight: 600;
    }

    .member-copy {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    .member-name {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .member-meta {
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .member-empty {
        margin-top: 16px;
    }

    .member-empty .btn {
        margin-top: 10px;
    }

    .skeleton-kpis .kpi {
        min-height: 96px;
    }

    @media (max-width: 1040px) {
        .kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .kpi:nth-child(3) {
            grid-column: 1 / -1;
            border-left: 0;
            border-top: 1px solid var(--border);
        }

        .overview-grid,
        .overview-lower {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    @media (max-width: 560px) {
        .kpis {
            grid-template-columns: minmax(0, 1fr);
        }

        .kpi + .kpi {
            border-top: 1px solid var(--border);
            border-left: 0;
        }

        .kpi {
            padding: 14px 16px;
        }

        .setup-row {
            align-items: flex-start;
        }

        .mcp-row {
            align-items: flex-start;
            flex-wrap: wrap;
        }

        .mcp-value {
            flex-basis: calc(100% - 60px);
        }
    }
</style>
