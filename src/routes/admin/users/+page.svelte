<script>
    import { onMount } from "svelte";
    import { apiDelete, apiGet, apiPatch, apiPost } from "$lib/api.js";
    import Modal from "$lib/components/Modal.svelte";
    import { avatarTone, formatDateTime, initialOf } from "$lib/format.js";

    const MASK = "mcp_••••••••";

    let users = $state([]);
    let loading = $state(true);
    let error = $state("");

    let createOpen = $state(false);
    let newName = $state("");
    let creating = $state(false);
    let createError = $state("");

    let keyOpen = $state(false);
    let createdUser = $state(null);
    let createdKeyCopied = $state(false);

    let revealed = $state({});
    let copiedId = $state("");
    let pending = $state({});

    let enabledCount = $derived(users.filter((user) => user.enabled).length);
    let disabledCount = $derived(users.filter((user) => !user.enabled).length);
    let endpointCopied = $state(false);

    onMount(() => {
        loadUsers();
    });

    function normalizeUsers(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (data && Array.isArray(data.users)) {
            return data.users;
        }

        if (data && Array.isArray(data.items)) {
            return data.items;
        }

        return [];
    }

    function keyOf(user) {
        return user && (user.apiKey || user.api_key) ? user.apiKey || user.api_key : "";
    }

    function errorMessage(err) {
        return err && err.message ? err.message : "操作失败，请稍后重试";
    }

    async function loadUsers() {
        loading = true;
        error = "";

        try {
            const data = await apiGet("/api/admin/users");
            users = normalizeUsers(data);
        } catch (err) {
            error = errorMessage(err);
        } finally {
            loading = false;
        }
    }

    function openCreate() {
        createError = "";
        newName = "";
        createOpen = true;
    }

    function closeCreate() {
        if (creating) {
            return;
        }

        createOpen = false;
        createError = "";
    }

    function closeKey() {
        keyOpen = false;
        createdUser = null;
        createdKeyCopied = false;
    }

    async function copyText(text, onSuccess) {
        if (!text) {
            return false;
        }

        try {
            if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
                throw new Error("clipboard unavailable");
            }

            await navigator.clipboard.writeText(text);
            onSuccess();
            return true;
        } catch (err) {
            window.prompt("复制失败，请手动复制以下 Key：", text);
            return false;
        }
    }

    async function handleCreate(event) {
        event.preventDefault();

        const name = newName.trim();

        if (!name) {
            createError = "请输入用户名称";
            return;
        }

        creating = true;
        createError = "";

        try {
            const data = await apiPost("/api/admin/users", { name });
            const user = data && data.user ? data.user : data;

            if (!user) {
                throw new Error("创建失败：响应缺少用户信息");
            }

            users = [user, ...users.filter((item) => item.id !== user.id)];
            createOpen = false;
            newName = "";
            createdKeyCopied = false;
            createdUser = user;
            keyOpen = true;
        } catch (err) {
            createError = errorMessage(err);
        } finally {
            creating = false;
        }
    }

    function toggleReveal(user) {
        revealed[user.id] = !revealed[user.id];
    }

    async function copyUserKey(user) {
        await copyText(keyOf(user), () => {
            copiedId = user.id;

            window.setTimeout(() => {
                if (copiedId === user.id) {
                    copiedId = "";
                }
            }, 2000);
        });
    }

    function copyCreatedKey() {
        const key = createdUser ? keyOf(createdUser) : "";

        copyText(key, () => {
            createdKeyCopied = true;

            window.setTimeout(() => {
                createdKeyCopied = false;
            }, 2000);
        });
    }

    async function toggleEnabled(user) {
        if (pending[user.id]) {
            return;
        }

        pending[user.id] = true;
        error = "";

        try {
            const data = await apiPatch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                enabled: !user.enabled
            });
            const updated = data && data.user ? data.user : { ...user, enabled: !user.enabled };

            users = users.map((item) => (item.id === user.id ? updated : item));
        } catch (err) {
            error = errorMessage(err);
        } finally {
            delete pending[user.id];
        }
    }

    async function copyEndpoint() {
        const url = new URL("/mcp", window.location.origin).href;

        try {
            await navigator.clipboard.writeText(url);
            endpointCopied = true;
            window.setTimeout(() => {
                endpointCopied = false;
            }, 1600);
        } catch (err) {
            window.prompt("复制失败，请手动复制 MCP 端点：", url);
        }
    }

    async function removeUser(user) {
        if (pending[user.id]) {
            return;
        }

        const confirmed = window.confirm(
            `确定删除用户“${user.name}”吗？该操作不可恢复。`
        );

        if (!confirmed) {
            return;
        }

        pending[user.id] = true;
        error = "";

        try {
            await apiDelete(`/api/admin/users/${encodeURIComponent(user.id)}`);
            await loadUsers();
        } catch (err) {
            error = errorMessage(err);
        } finally {
            delete pending[user.id];
        }
    }
</script>

<div class="page">
    <header class="page-header">
        <div>
            <h1 class="page-title">用户</h1>
            <p class="page-subtitle">
                {#if users.length === 0}
                    管理 MCP 用户、Key 与启用状态。
                {:else}
                    {users.length} 位成员 · {enabledCount} 位已启用
                {/if}
            </p>
        </div>
        <div class="page-actions">
            <button class="btn btn-primary" type="button" onclick={openCreate}>新建用户</button>
        </div>
    </header>

    {#if error}
        <div class="notice notice-error" role="alert">{error}</div>
    {/if}

    <div class="users-stack">
        <div class="users-main">
            {#if loading && users.length === 0}
                <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>成员</th>
                        <th>Key</th>
                        <th>状态</th>
                        <th class="num">创建时间</th>
                        <th><span class="sr-only">操作</span></th>
                    </tr>
                </thead>
                <tbody>
                    {#each [1, 2, 3] as row (row)}
                        <tr>
                            <td>
                                <div class="member-cell">
                                    <span class="skeleton avatar-skeleton"></span>
                                    <span class="skeleton" style="width:96px"></span>
                                </div>
                            </td>
                            <td><span class="skeleton" style="width:128px"></span></td>
                            <td><span class="skeleton" style="width:44px"></span></td>
                            <td><span class="skeleton" style="width:110px;margin-left:auto"></span></td>
                            <td></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else if users.length === 0}
        <div class="empty users-empty">
            <div>
                <strong>还没有用户</strong>
                <p class="hint">创建第一个成员后，可以查看 Key、分配目录并控制启用状态。</p>
                <button class="btn btn-primary" type="button" onclick={openCreate}>新建用户</button>
            </div>
        </div>
    {:else}
        <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>成员</th>
                        <th>Key</th>
                        <th>状态</th>
                        <th class="num">创建时间</th>
                        <th><span class="sr-only">操作</span></th>
                    </tr>
                </thead>
                <tbody>
                    {#each users as user (user.id)}
                        {@const tone = avatarTone(user.name)}
                        <tr>
                            <td>
                                <a class="member-cell" href={`/admin/users/${encodeURIComponent(user.id)}`}>
                                    <span class="avatar" style={`background:${tone.bg};color:${tone.ink}`}>
                                        {initialOf(user.name)}
                                    </span>
                                    <span class="member-name">{user.name}</span>
                                </a>
                            </td>
                            <td>
                                <div class="key-cell">
                                    <code class="key-text" class:muted={!revealed[user.id]}>
                                        {revealed[user.id] ? keyOf(user) : MASK}
                                    </code>
                                    <div class="key-actions">
                                        <button
                                            class="btn btn-ghost btn-sm"
                                            type="button"
                                            disabled={!keyOf(user)}
                                            onclick={() => toggleReveal(user)}
                                        >
                                            {revealed[user.id] ? "隐藏" : "显示"}
                                        </button>
                                        <button
                                            class="btn btn-ghost btn-sm"
                                            type="button"
                                            disabled={!keyOf(user)}
                                            onclick={() => copyUserKey(user)}
                                        >
                                            {copiedId === user.id ? "已复制" : "复制"}
                                        </button>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span class="pill" class:pill-positive={user.enabled} class:pill-negative={!user.enabled}>
                                    {user.enabled ? "启用" : "禁用"}
                                </span>
                            </td>
                            <td class="num cell-time">{formatDateTime(user.created_at ?? user.createdAt)}</td>
                            <td class="cell-actions">
                                <div class="row-actions">
                                    <button
                                        class="btn btn-sm"
                                        type="button"
                                        disabled={pending[user.id]}
                                        onclick={() => toggleEnabled(user)}
                                    >
                                        {user.enabled ? "禁用" : "启用"}
                                    </button>
                                    <button
                                        class="btn btn-sm btn-danger"
                                        type="button"
                                        disabled={pending[user.id]}
                                        onclick={() => removeUser(user)}
                                    >
                                        删除
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
            {/if}
        </div>

        <section class="card onboarding-card">
            <header class="section-head">
                <div>
                    <h2 class="section-title">成员接入</h2>
                    <p class="hint">从创建成员到客户端连通。</p>
                </div>
            </header>

            <div class="onboarding-grid">
                <ol class="access-steps">
                    <li class="access-step">
                        <span class="step-number" aria-hidden="true">1</span>
                        <div class="step-copy">
                            <strong>创建成员</strong>
                            <span class="hint">系统会生成以 mcp_ 开头的 API Key。</span>
                        </div>
                        {#if users.length === 0}
                            <button class="btn btn-sm" type="button" onclick={openCreate}>新建用户</button>
                        {:else}
                            <span class="pill pill-positive">已完成</span>
                        {/if}
                    </li>

                    <li class="access-step">
                        <span class="step-number" aria-hidden="true">2</span>
                        <div class="step-copy">
                            <strong>分配目录</strong>
                            <span class="hint">在成员详情页选择目录，设置查看、编辑或管理权限。</span>
                        </div>
                        {#if users.length > 0}
                            <a class="btn btn-sm" href={`/admin/users/${encodeURIComponent(users[0].id)}`}>打开成员</a>
                        {:else}
                            <span class="hint">等待成员</span>
                        {/if}
                    </li>

                    <li class="access-step">
                        <span class="step-number" aria-hidden="true">3</span>
                        <div class="step-copy">
                            <strong>配置客户端</strong>
                            <span class="hint">在客户端填入端点 <code>/mcp</code> 和成员自己的 Key。</span>
                        </div>
                        <button class="btn btn-sm" type="button" onclick={copyEndpoint}>
                            {endpointCopied ? "已复制" : "复制端点"}
                        </button>
                    </li>
                </ol>

                <div class="member-summary">
                    <div class="access-summary">
                        <div>
                            <span>成员</span>
                            <strong class="num">{loading ? "—" : users.length}</strong>
                        </div>
                        <div>
                            <span>启用</span>
                            <strong class="num">{loading ? "—" : enabledCount}</strong>
                        </div>
                        <div>
                            <span>禁用</span>
                            <strong class="num">{loading ? "—" : disabledCount}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <div class="users-lower">
            <section class="card">
                <header class="section-head">
                    <div>
                        <h2 class="section-title">权限等级</h2>
                        <p class="hint">等级从低到高，逐级包含下方能力。</p>
                    </div>
                    <span class="pill">按目录授权</span>
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

            <section class="card">
                <header class="section-head">
                    <div>
                        <h2 class="section-title">Key 安全</h2>
                        <p class="hint">Key 等同于成员的文件访问权。</p>
                    </div>
                </header>

                <ul class="security-list">
                    <li>API Key 以明文存储在 SQLite 中，界面只做视觉遮罩。</li>
                    <li>成员离开或更换客户端时，在成员详情页重置 Key。</li>
                    <li>不要把 Key 写进公开仓库、日志或截图。</li>
                </ul>
            </section>
        </div>
    </div>
</div>

<Modal open={createOpen} title="新建用户" onClose={closeCreate}>
    <form onsubmit={handleCreate}>
        <div class="field">
            <label for="user-name">名称</label>
            <input
                id="user-name"
                type="text"
                bind:value={newName}
                placeholder="请输入用户名称"
                disabled={creating}
                autocomplete="off"
                data-autofocus
            />
        </div>

        {#if createError}
            <p class="error-text field-error">{createError}</p>
        {/if}

        <div class="form-actions modal-actions">
            <button class="btn" type="button" disabled={creating} onclick={closeCreate}>
                取消
            </button>
            <button class="btn btn-primary" type="submit" disabled={creating}>
                {creating ? "创建中…" : "创建"}
            </button>
        </div>
    </form>
</Modal>

<Modal open={keyOpen} title="用户 Key" onClose={closeKey}>
    {#if createdUser}
        <p class="hint">用户 <strong>{createdUser.name}</strong> 已创建。请保存以下 Key：</p>
        <div class="key-display mono">{keyOf(createdUser) || "—"}</div>
        <p class="notice notice-warning key-warning">Key 关闭后仍可在用户列表查看。请勿泄露给他人。</p>
        <div class="form-actions modal-actions">
            <button class="btn" type="button" onclick={copyCreatedKey}>
                {createdKeyCopied ? "已复制" : "复制"}
            </button>
            <button class="btn btn-primary" type="button" onclick={closeKey}>我已保存</button>
        </div>
    {/if}
</Modal>

<style>
    .users-stack {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
    }

    .users-main {
        min-width: 0;
    }

    .onboarding-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 24px;
        align-items: start;
        margin-top: 16px;
    }

    .access-steps {
        display: grid;
        gap: 0;
    }

    .access-step {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 0;
        border-top: 1px solid var(--rule);
    }

    .access-step:first-child {
        padding-top: 0;
        border-top: 0;
    }

    .step-number {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        flex: none;
        border-radius: 50%;
        background: var(--accent-soft);
        color: var(--accent-ink);
        font-size: 12px;
        font-weight: 600;
    }

    .step-copy {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    .step-copy strong {
        font-size: var(--fs-body);
        font-weight: 500;
    }

    .step-copy .hint {
        line-height: 1.45;
    }

    .access-step .btn {
        flex: none;
    }

    .member-summary {
        padding-left: 24px;
        border-left: 1px solid var(--rule);
    }

    .access-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--raised);
    }

    .access-summary > div {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 10px 12px;
    }

    .access-summary > div + div {
        border-left: 1px solid var(--border);
    }

    .access-summary span {
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .access-summary strong {
        font-size: 20px;
        font-weight: 400;
        line-height: 1.2;
    }

    .users-lower {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        gap: var(--gap);
        align-items: start;
    }

    .level-list,
    .security-list {
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

    .security-list li {
        padding: 9px 0;
        color: var(--muted);
        font-size: 13px;
    }

    .security-list li + li {
        border-top: 1px solid var(--rule);
    }

    .member-cell {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
    }

    .member-name {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    a.member-cell:hover .member-name {
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

    .avatar-skeleton {
        border-radius: 50%;
    }

    .key-cell {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .key-text {
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }

    .key-actions {
        display: flex;
        gap: 2px;
    }

    .row-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
    }

    .users-empty {
        min-height: 220px;
    }

    .users-empty .btn {
        margin-top: 12px;
    }

    .field-error {
        margin-top: 10px;
        font-size: var(--fs-small);
    }

    .modal-actions {
        margin-top: 20px;
    }

    .key-display {
        margin-top: 12px;
        padding: 12px 14px;
        overflow-wrap: anywhere;
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--raised);
        font-size: 13px;
        line-height: 1.6;
    }

    .key-warning {
        margin-top: 12px;
    }

    @media (max-width: 900px) {
        .onboarding-grid,
        .users-lower {
            grid-template-columns: minmax(0, 1fr);
        }

        .member-summary {
            padding-top: 16px;
            padding-left: 0;
            border-top: 1px solid var(--rule);
            border-left: 0;
        }
    }

    @media (max-width: 720px) {
        .key-cell {
            align-items: flex-start;
        }

        .key-text {
            max-width: 100%;
        }

        .row-actions {
            justify-content: flex-start;
        }

        .cell-time {
            display: none;
        }
    }
</style>
