<script>
    import { page } from "$app/state";
    import { apiDelete, apiGet, apiPatch, apiPost } from "$lib/api.js";
    import DirectoryPicker from "$lib/components/DirectoryPicker.svelte";
    import PathTrail from "$lib/components/PathTrail.svelte";
    import { avatarTone, formatDateTime, initialOf } from "$lib/format.js";

    const levels = [
        { value: "view", label: "查看", note: "列表、搜索、详情与下载" },
        { value: "edit", label: "编辑", note: "查看 + 上传、新建、重命名、移动、复制" },
        { value: "manage", label: "管理", note: "编辑 + 删除文件或目录" }
    ];

    const statusLabels = {
        active: "未使用",
        used: "已使用",
        expired: "已过期"
    };

    let userId = $derived(page.params.id);

    let user = $state(null);
    let grants = $state([]);
    let links = $state([]);
    let loading = $state(true);
    let error = $state("");
    let notice = $state("");

    let keyVisible = $state(false);
    let actionBusy = $state(false);

    let grantPath = $state("");
    let grantLevel = $state("view");
    let grantError = $state("");
    let grantSaving = $state(false);
    let pickerOpen = $state(false);

    let apiKey = $derived(user ? (user.apiKey ?? user.api_key ?? "") : "");
    let enabled = $derived(isUserEnabled(user));
    let maskedKey = $derived(maskKey(apiKey, keyVisible));
    let tone = $derived(user ? avatarTone(user.name) : { bg: "#e4eff1", ink: "#125463" });
    let canSubmitGrant = $derived(grantPath.trim().length > 0 && !grantSaving);
    let currentLevelNote = $derived(
        levels.find((item) => item.value === grantLevel)?.note ?? ""
    );

    $effect(() => {
        const id = page.params.id;

        if (!id) {
            loading = false;
            error = "缺少用户 ID";
            return;
        }

        loadPage(id);
    });

    async function loadPage(id) {
        loading = true;
        error = "";
        notice = "";

        try {
            const [detail, linkList] = await Promise.all([
                apiGet(`/api/admin/users/${encodeURIComponent(id)}`),
                apiGet(`/api/admin/upload-links?userId=${encodeURIComponent(id)}`)
            ]);

            user = detail && detail.user ? detail.user : null;
            grants = detail && Array.isArray(detail.grants) ? detail.grants : [];
            links = normalizeLinks(linkList);

            if (!user) {
                error = "用户不存在";
            }
        } catch (err) {
            error = errorMessage(err);
        } finally {
            loading = false;
        }
    }

    async function loadGrants() {
        try {
            const data = await apiGet(
                `/api/admin/users/${encodeURIComponent(userId)}/grants`
            );

            if (Array.isArray(data)) {
                grants = data;
            } else if (data && Array.isArray(data.grants)) {
                grants = data.grants;
            }
        } catch (err) {
            error = errorMessage(err);
        }
    }

    function normalizeLinks(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (data && Array.isArray(data.links)) {
            return data.links;
        }

        return [];
    }

    function errorMessage(err) {
        if (err && err.message) {
            return err.message;
        }

        return "操作失败，请稍后重试";
    }

    function isUserEnabled(value) {
        if (!value) {
            return false;
        }

        if (typeof value.enabled === "string") {
            return value.enabled === "1" || value.enabled === "true";
        }

        return Boolean(value.enabled);
    }

    function maskKey(value, visible) {
        if (!value) {
            return "—";
        }

        return visible ? value : "mcp_••••••••••••";
    }

    function grantId(grant) {
        return grant.id ?? grant.grantId;
    }

    function grantPathOf(grant) {
        return grant.path ?? grant.dir ?? "—";
    }

    async function toggleEnabled() {
        if (!user) {
            return;
        }

        const next = !enabled;

        actionBusy = true;
        error = "";

        try {
            const data = await apiPatch(
                `/api/admin/users/${encodeURIComponent(userId)}`,
                { enabled: next }
            );

            if (data && data.user) {
                user = data.user;
            } else {
                user = { ...user, enabled: next };
            }

            notice = next ? "用户已启用" : "用户已禁用";
        } catch (err) {
            error = errorMessage(err);
        } finally {
            actionBusy = false;
        }
    }

    async function regenerateKey() {
        if (!confirm("重置后旧 Key 会立即失效，确定要重置吗？")) {
            return;
        }

        actionBusy = true;
        error = "";
        notice = "";

        try {
            const data = await apiPost(
                `/api/admin/users/${encodeURIComponent(userId)}/regenerate-key`
            );

            if (user && data && data.apiKey) {
                user = { ...user, apiKey: data.apiKey };
            }

            keyVisible = true;
            notice = "Key 已重置，请复制并妥善保存";
        } catch (err) {
            error = errorMessage(err);
        } finally {
            actionBusy = false;
        }
    }

    async function copyKey() {
        if (!apiKey) {
            return;
        }

        try {
            await navigator.clipboard.writeText(apiKey);
            notice = "Key 已复制到剪贴板";
        } catch (err) {
            window.prompt("复制失败，请手动复制 Key：", apiKey);
        }
    }

    async function copyMcpConfig() {
        if (!apiKey) {
            return;
        }

        const endpoint = new URL("/mcp", window.location.origin).href;
        const config = `{
  "mcpServers": {
    "studio-drive": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${endpoint}",
        "--header",
        "Authorization: Bearer ${apiKey}"
      ]
    }
  }
}`;

        try {
            await navigator.clipboard.writeText(config);
            notice = "MCP 配置已复制";
        } catch (err) {
            window.prompt("复制失败，请手动复制配置：", config);
        }
    }

    function openGrantPicker() {
        pickerOpen = true;
    }

    function handleSelectDir(path) {
        grantPath = path || "/";
        pickerOpen = false;
        grantError = "";
    }

    async function submitGrant(event) {
        event.preventDefault();

        const path = grantPath.trim();

        if (!path) {
            grantError = "请填写或选择目录路径";
            return;
        }

        grantSaving = true;
        grantError = "";
        error = "";

        try {
            await apiPost(
                `/api/admin/users/${encodeURIComponent(userId)}/grants`,
                { path, level: grantLevel }
            );

            notice = "授权已保存";
            grantPath = "";
            await loadGrants();
        } catch (err) {
            grantError = errorMessage(err);
        } finally {
            grantSaving = false;
        }
    }

    async function updateGrantLevel(grant, level) {
        if (level === grant.level) {
            return;
        }

        actionBusy = true;
        error = "";

        try {
            const data = await apiPatch(
                `/api/admin/grants/${grantId(grant)}`,
                { level }
            );
            const updated = data && data.grant ? data.grant : data;
            const currentId = grantId(grant);

            grants = grants.map((item) => {
                if (grantId(item) !== currentId) {
                    return item;
                }

                if (updated && typeof updated === "object") {
                    return { ...item, ...updated, level };
                }

                return { ...item, level };
            });

            notice = "授权等级已更新";
        } catch (err) {
            error = errorMessage(err);
            await loadGrants();
        } finally {
            actionBusy = false;
        }
    }

    async function removeGrant(grant) {
        if (!confirm(`确定删除路径“${grantPathOf(grant)}”的授权吗？`)) {
            return;
        }

        actionBusy = true;
        error = "";

        try {
            await apiDelete(`/api/admin/grants/${grantId(grant)}`);
            const currentId = grantId(grant);

            grants = grants.filter((item) => grantId(item) !== currentId);
            notice = "授权已删除";
        } catch (err) {
            error = errorMessage(err);
        } finally {
            actionBusy = false;
        }
    }

    function linkId(link) {
        return link.id ?? link.linkId;
    }

    function linkTarget(link) {
        return link.targetDir ?? link.target_dir ?? link.dir ?? "—";
    }

    function linkFileName(link) {
        return link.fileName ?? link.file_name ?? "—";
    }

    function linkExpires(link) {
        return link.expiresAt ?? link.expires_at ?? null;
    }

    function linkStatus(link) {
        if (
            link.status === "active" ||
            link.status === "used" ||
            link.status === "expired"
        ) {
            return link.status;
        }

        const usedAt = link.usedAt ?? link.used_at;

        if (usedAt) {
            return "used";
        }

        const expiresAt = linkExpires(link);

        if (expiresAt) {
            const time = new Date(expiresAt).getTime();

            if (!Number.isNaN(time) && time <= Date.now()) {
                return "expired";
            }
        }

        return "active";
    }

    async function revokeLink(link) {
        if (!confirm("确定撤销这条上传短链吗？撤销后链接将立即失效。")) {
            return;
        }

        actionBusy = true;
        error = "";

        try {
            await apiDelete(`/api/admin/upload-links/${linkId(link)}`);
            const currentId = linkId(link);

            links = links.filter((item) => linkId(item) !== currentId);
            notice = "上传短链已撤销";
        } catch (err) {
            error = errorMessage(err);
        } finally {
            actionBusy = false;
        }
    }
</script>

<div class="page">
    <header class="page-header">
        <div>
            <nav class="page-crumbs" aria-label="返回路径">
                <a href="/admin/users">用户</a>
                <span aria-hidden="true">/</span>
                <span>{user ? user.name : "用户详情"}</span>
            </nav>
            <h1 class="page-title">
                {user ? user.name : "用户详情"}
                {#if user}
                    <span class="pill" class:pill-positive={enabled} class:pill-negative={!enabled}>
                        {enabled ? "已启用" : "已禁用"}
                    </span>
                {/if}
            </h1>
            {#if user}
                <p class="page-subtitle">
                    创建于 {formatDateTime(user.createdAt ?? user.created_at)}
                </p>
            {/if}
        </div>

        {#if user}
            <div class="page-actions">
                <button
                    class="btn"
                    type="button"
                    onclick={toggleEnabled}
                    disabled={actionBusy}
                >
                    {enabled ? "禁用用户" : "启用用户"}
                </button>
            </div>
        {/if}
    </header>

    {#if error}
        <div class="notice notice-error" role="alert">{error}</div>
    {/if}

    {#if notice}
        <div class="notice notice-success" role="status">{notice}</div>
    {/if}

    {#if loading}
        <div class="detail-grid">
            <div class="card aside-skeleton">
                <div class="skeleton" style="width:48px;height:48px;border-radius:50%"></div>
                <div class="skeleton" style="width:120px;height:18px"></div>
                <div class="skeleton" style="width:100%;height:80px"></div>
                <div class="skeleton" style="width:100%;height:120px"></div>
            </div>
            <div class="card">
                <div class="skeleton" style="width:160px;height:18px"></div>
                <div class="skeleton" style="width:100%;height:260px;margin-top:20px"></div>
            </div>
        </div>
    {:else if user}
        <div class="detail-grid">
            <aside class="user-aside">
                <section class="card identity-card">
                    <div class="identity-head">
                        <span class="avatar" style={`background:${tone.bg};color:${tone.ink}`}>
                            {initialOf(user.name)}
                        </span>
                        <div class="identity-copy">
                            <h2>{user.name}</h2>
                            <span class="hint">{enabled ? "可以访问已授权的目录" : "已停止访问所有目录"}</span>
                        </div>
                    </div>

                    <dl class="facts">
                        <div class="fact">
                            <dt>用户 ID</dt>
                            <dd class="mono">{user.id}</dd>
                        </div>
                        <div class="fact">
                            <dt>创建时间</dt>
                            <dd>{formatDateTime(user.createdAt ?? user.created_at)}</dd>
                        </div>
                    </dl>
                </section>

                <section class="card">
                    <div class="section-head">
                        <h2 class="section-title">API Key</h2>
                        <span class="pill">敏感</span>
                    </div>

                    <div class="key-well mono">{maskedKey}</div>

                    <div class="key-actions">
                        <button
                            class="btn btn-sm"
                            type="button"
                            onclick={() => (keyVisible = !keyVisible)}
                            disabled={!apiKey}
                        >
                            {keyVisible ? "隐藏" : "显示"}
                        </button>
                        <button class="btn btn-sm" type="button" onclick={copyKey} disabled={!apiKey}>
                            复制
                        </button>
                    </div>

                    <div class="danger-zone">
                        <button
                            class="btn btn-sm btn-danger"
                            type="button"
                            onclick={regenerateKey}
                            disabled={actionBusy}
                        >
                            重置 Key
                        </button>
                        <p class="hint">重置后旧 Key 立即失效，成员需要更新客户端配置。</p>
                    </div>
                </section>

                <section class="card">
                    <h2 class="section-title">MCP 连接</h2>
                    <div class="mcp-row">
                        <span class="mcp-label">端点</span>
                        <code>/mcp</code>
                    </div>
                    <pre class="code-snippet">Authorization: Bearer {keyVisible ? apiKey || "mcp_…" : "mcp_••••••••"}</pre>
                    <button
                        class="btn mcp-config"
                        type="button"
                        onclick={copyMcpConfig}
                        disabled={!apiKey}
                    >
                        复制 MCP 配置
                    </button>
                </section>
            </aside>

            <main class="user-main">
                <section class="card grants-section">
                    <header class="section-head">
                        <div>
                            <h2 class="section-title">目录授权</h2>
                            <p class="hint">授权路径及其子目录；有效权限取最高等级。</p>
                        </div>
                        <span class="pill">{grants.length} 个目录</span>
                    </header>

                    <div class="grant-grid">
                        <form class="grant-editor" onsubmit={submitGrant}>
                            <div class="editor-head">
                                <h3>添加授权</h3>
                                <p class="hint">选择目录后设置权限等级。</p>
                            </div>

                            <div class="field">
                                <label for="grant-path">目录</label>
                                <div class="input-row">
                                    <input
                                        id="grant-path"
                                        class="input"
                                        type="text"
                                        bind:value={grantPath}
                                        placeholder="/工作室/项目"
                                        autocomplete="off"
                                    />
                                    <button class="btn" type="button" onclick={openGrantPicker}>
                                        选择
                                    </button>
                                </div>
                                {#if grantPath}
                                    <div class="grant-preview">
                                        <PathTrail path={grantPath} />
                                    </div>
                                {/if}
                            </div>

                            <fieldset class="level-field">
                                <legend>权限等级</legend>
                                <div class="level-choices">
                                    {#each levels as item (item.value)}
                                        <label class="level-choice" class:selected={grantLevel === item.value}>
                                            <input
                                                type="radio"
                                                name="grant-level"
                                                value={item.value}
                                                bind:group={grantLevel}
                                            />
                                            <span>{item.label}</span>
                                        </label>
                                    {/each}
                                </div>
                                <p class="hint level-note">{currentLevelNote}</p>
                            </fieldset>

                            {#if grantError}
                                <p class="error-text grant-error">{grantError}</p>
                            {/if}

                            <button class="btn btn-primary editor-submit" type="submit" disabled={!canSubmitGrant}>
                                {grantSaving ? "添加中…" : "添加授权"}
                            </button>
                            <p class="hint">同一路径再次添加会更新等级。</p>
                        </form>

                        <div class="grant-list">
                            <div class="grant-list-head">
                                <span class="hint">已授权 {grants.length} 个目录</span>
                                {#if grants.length > 0}
                                    <span class="hint">等级可随时调整</span>
                                {/if}
                            </div>

                            {#if grants.length === 0}
                                <div class="empty grant-empty">
                                    <div>
                                        <strong>还没有目录授权</strong>
                                        <p class="hint">从左侧选择目录并添加第一条授权。</p>
                                    </div>
                                </div>
                            {:else}
                                <ul class="grant-rows">
                                    {#each grants as grant (grantId(grant))}
                                        <li class="grant-row">
                                            <div class="grant-copy">
                                                <PathTrail path={grantPathOf(grant)} />
                                                <span class="grant-meta">
                                                    添加于 {formatDateTime(grant.createdAt ?? grant.created_at)}
                                                </span>
                                            </div>
                                            <div class="grant-actions">
                                                <select
                                                    class="level-select"
                                                    aria-label={`${grantPathOf(grant)} 的权限等级`}
                                                    value={grant.level}
                                                    onchange={(event) =>
                                                        updateGrantLevel(grant, event.currentTarget.value)}
                                                    disabled={actionBusy}
                                                >
                                                    {#each levels as item (item.value)}
                                                        <option value={item.value}>{item.label}</option>
                                                    {/each}
                                                </select>
                                                <button
                                                    class="btn btn-sm btn-danger"
                                                    type="button"
                                                    onclick={() => removeGrant(grant)}
                                                    disabled={actionBusy}
                                                >
                                                    移除
                                                </button>
                                            </div>
                                        </li>
                                    {/each}
                                </ul>
                            {/if}

                            <p class="hint grant-rule">
                                有效权限取目标路径自身或其祖先授权中的最高等级。
                            </p>
                        </div>
                    </div>
                </section>

                <section class="card links-section">
                    <header class="section-head">
                        <div>
                            <h2 class="section-title">上传短链</h2>
                            <p class="hint">
                                由 <code>create_upload_link</code> 生成，上传成功后自动失效。
                            </p>
                        </div>
                        <span class="pill">{links.length} 条</span>
                    </header>

                    {#if links.length === 0}
                        <div class="empty links-empty">
                            <div>
                                <strong>暂无上传短链</strong>
                                <p class="hint">成员通过 MCP 创建短链后，会在这里显示状态与有效期。</p>
                            </div>
                        </div>
                    {:else}
                        <ul class="link-list">
                            {#each links as link (linkId(link))}
                                {@const status = linkStatus(link)}
                                <li class="link-row">
                                    <div class="link-copy">
                                        <PathTrail path={linkTarget(link)} max={2} />
                                        <span class="link-meta">
                                            {linkFileName(link)} · {formatDateTime(linkExpires(link))}
                                        </span>
                                    </div>
                                    <div class="link-side">
                                        <span
                                            class="pill"
                                            class:pill-positive={status === "active"}
                                            class:pill-accent={status === "used"}
                                            class:pill-negative={status === "expired"}
                                        >
                                            {statusLabels[status] ?? status}
                                        </span>
                                        <button
                                            class="btn btn-sm btn-danger"
                                            type="button"
                                            onclick={() => revokeLink(link)}
                                            disabled={actionBusy}
                                        >
                                            撤销
                                        </button>
                                    </div>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </section>
            </main>
        </div>
    {:else}
        <div class="empty">
            <div>
                <strong>未找到该用户</strong>
                <p class="hint">用户可能已被删除。</p>
                <a class="btn btn-sm" href="/admin/users">返回用户列表</a>
            </div>
        </div>
    {/if}
</div>

<DirectoryPicker
    open={pickerOpen}
    initialDir={grantPath || "/"}
    onSelect={handleSelectDir}
    onClose={() => (pickerOpen = false)}
/>

<style>
    .detail-grid {
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        gap: var(--gap);
        align-items: start;
    }

    .user-aside {
        position: sticky;
        top: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .identity-card {
        display: grid;
        gap: 16px;
    }

    .identity-head {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
    }

    .avatar {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        flex: none;
        font-size: 18px;
        font-weight: 600;
    }

    .identity-copy {
        display: grid;
        gap: 2px;
        min-width: 0;
    }

    .identity-copy h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.3;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .facts {
        display: grid;
        gap: 6px;
        margin: 0;
        padding-top: 14px;
        border-top: 1px solid var(--rule);
    }

    .fact {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
    }

    .fact dt {
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .fact dd {
        margin: 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }

    .key-well {
        margin-top: 14px;
        padding: 10px 12px;
        overflow-wrap: anywhere;
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--raised);
        font-size: 12px;
        line-height: 1.6;
    }

    .key-actions {
        display: flex;
        gap: 6px;
        margin-top: 8px;
    }

    .danger-zone {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--rule);
    }

    .danger-zone .hint {
        margin-top: 8px;
    }

    .mcp-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
        font-size: 13px;
    }

    .mcp-label {
        width: 38px;
        flex: none;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .code-snippet {
        margin-top: 10px;
        padding: 10px 12px;
        overflow-x: auto;
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--raised);
        font-size: 12px;
        line-height: 1.6;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    .mcp-config {
        width: 100%;
        margin-top: 10px;
    }

    .user-main {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        min-width: 0;
    }

    .grant-grid {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 20px;
        align-items: start;
        margin-top: 18px;
    }

    .grant-editor {
        display: grid;
        gap: 16px;
        padding: 16px;
        border-radius: var(--radius-card);
        background: var(--raised);
    }

    .editor-head h3 {
        margin: 0;
        font-size: var(--fs-body);
        font-weight: 600;
    }

    .editor-head .hint {
        margin-top: 3px;
    }

    .grant-preview {
        min-width: 0;
        margin-top: 2px;
        padding: 6px 8px;
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface);
    }

    .level-field {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        border: 0;
    }

    .level-field legend {
        margin-bottom: 8px;
        padding: 0;
        font-size: var(--fs-body);
        font-weight: 500;
    }

    .level-choices {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 2px;
        padding: 2px;
        border-radius: var(--radius-control);
        background: var(--raised-strong);
    }

    .level-choice {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 30px;
        border-radius: var(--radius-chip);
        color: var(--muted);
        font-size: 13px;
        cursor: pointer;
        transition:
            background-color var(--t-hover) ease,
            color var(--t-hover) ease;
    }

    .level-choice:hover {
        color: var(--text);
    }

    .level-choice.selected {
        background: var(--accent-soft);
        color: var(--accent-ink);
        font-weight: 500;
    }

    .level-choice input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
    }

    .level-choice input:focus-visible + span {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 4px;
    }

    .level-note {
        min-height: 34px;
        line-height: 1.45;
    }

    .editor-submit {
        width: 100%;
    }

    .grant-error {
        font-size: var(--fs-small);
    }

    .grant-list {
        min-width: 0;
    }

    .grant-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 30px;
    }

    .grant-rows {
        margin-top: 6px;
    }

    .grant-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-top: 1px solid var(--rule);
    }

    .grant-copy {
        flex: 1;
        min-width: 0;
    }

    .grant-meta {
        display: block;
        margin-top: 3px;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .grant-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: none;
    }

    .level-select {
        height: 30px;
        padding: 0 8px;
        border: 1px solid var(--control);
        border-radius: var(--radius-control);
        background: var(--surface);
        font-size: var(--fs-small);
    }

    .level-select:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgb(27 108 128 / 14%);
    }

    .grant-rule {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--rule);
    }

    .grant-empty {
        min-height: 132px;
        margin-top: 6px;
    }

    .links-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .link-list {
        margin-top: 12px;
    }

    .link-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 0;
        border-top: 1px solid var(--rule);
    }

    .link-copy {
        flex: 1;
        min-width: 0;
    }

    .link-meta {
        display: block;
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .link-side {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
    }

    .links-empty {
        margin-top: 14px;
        min-height: 120px;
    }

    .aside-skeleton {
        display: grid;
        gap: 16px;
        align-content: start;
    }

    @media (max-width: 1180px) {
        .detail-grid {
            grid-template-columns: minmax(0, 1fr);
        }

        .user-aside {
            position: static;
            order: 2;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
        }

        .identity-card {
            grid-column: 1 / -1;
        }

        .user-main {
            order: 1;
        }
    }

    @media (max-width: 900px) {
        .grant-grid {
            grid-template-columns: minmax(0, 1fr);
        }

        .user-aside {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    @media (max-width: 600px) {
        .grant-row,
        .link-row {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
        }

        .grant-actions,
        .link-side {
            justify-content: space-between;
        }

        .grant-actions .level-select {
            flex: 1;
        }

        .link-side {
            flex-wrap: wrap;
        }
    }
</style>
