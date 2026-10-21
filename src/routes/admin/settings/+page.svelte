<script>
    import { onMount } from "svelte";
    import { apiGet, apiPost, apiPut } from "$lib/api.js";

    let loading = $state(true);
    let saving = $state(false);
    let testing = $state(false);

    let baiduAccessToken = $state("");
    let baiduAuthorizeUrl = $state("");
    let appBaseUrl = $state("");
    let uploadLinkTtlSec = $state("900");
    let maxUploadMb = $state("2048");

    let showToken = $state(false);
    let authorizeCopied = $state(false);
    let baseline = $state("");

    let notice = $state(null);
    let testNotice = $state(null);

    let tokenConfigured = $derived(baiduAccessToken.trim() !== "");
    let authorizeUrlValid = $derived.by(() => {
        const value = baiduAuthorizeUrl.trim();

        if (!value) {
            return false;
        }

        try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:";
        } catch {
            return false;
        }
    });
    let dirty = $derived(snapshot() !== baseline);

    onMount(() => {
        loadSettings();
    });

    function snapshot() {
        return JSON.stringify([
            baiduAccessToken,
            baiduAuthorizeUrl,
            appBaseUrl,
            uploadLinkTtlSec,
            maxUploadMb
        ]);
    }

    async function loadSettings() {
        loading = true;

        try {
            const data = await apiGet("/api/admin/settings");
            applySettings(data);
            baseline = snapshot();
        } catch (error) {
            notice = {
                type: "error",
                text: sanitizeMessage(error && error.message ? error.message : "读取设置失败")
            };
        } finally {
            loading = false;
        }
    }

    function applySettings(data) {
        if (!data) {
            return;
        }

        baiduAccessToken = data.baidu_access_token ?? "";
        baiduAuthorizeUrl = data.baidu_authorize_url ?? "";
        appBaseUrl = data.app_base_url ?? "";

        const ttl = Number(data.upload_link_ttl_sec);
        uploadLinkTtlSec = Number.isFinite(ttl) && ttl > 0 ? String(Math.round(ttl)) : "";

        maxUploadMb = bytesToUnit(data.max_upload_size, 1024 * 1024);
    }

    function bytesToUnit(value, unit) {
        const size = Number(value);

        if (!Number.isFinite(size) || size <= 0) {
            return "";
        }

        return String(Math.round(size / unit));
    }

    function parsePositiveInteger(value) {
        if (value === "" || value === null || value === undefined) {
            return null;
        }

        const number = Number(value);

        if (!Number.isInteger(number) || number <= 0) {
            return null;
        }

        return number;
    }

    function isValidBaseUrl(value) {
        const url = value.trim();

        return url.startsWith("/") || /^https?:\/\//i.test(url);
    }

    function sanitizeMessage(message) {
        const text = String(message ?? "");
        const secret = baiduAccessToken.trim();

        if (!secret) {
            return text;
        }

        return text.split(secret).join("***");
    }

    function validate() {
        if (!isValidBaseUrl(appBaseUrl)) {
            return "app_base_url 需以 http://、https:// 或 / 开头";
        }

        const ttl = parsePositiveInteger(uploadLinkTtlSec);

        if (ttl === null || ttl < 60 || ttl > 86400) {
            return "上传短链有效期必须是 60–86400 的整数（秒）";
        }

        if (parsePositiveInteger(maxUploadMb) === null) {
            return "单文件上传上限必须是正整数（MB）";
        }

        if (baiduAuthorizeUrl.trim()) {
            try {
                const url = new URL(baiduAuthorizeUrl.trim());

                if (url.protocol !== "http:" && url.protocol !== "https:") {
                    return "外部授权链接必须是 http:// 或 https:// 地址";
                }
            } catch {
                return "外部授权链接必须是完整的 http/https URL";
            }
        }

        return null;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        notice = null;

        const validationError = validate();

        if (validationError) {
            notice = { type: "error", text: validationError };
            return;
        }

        const payload = {
            baidu_access_token: baiduAccessToken.trim(),
            baidu_authorize_url: baiduAuthorizeUrl.trim(),
            app_base_url: appBaseUrl.trim(),
            upload_link_ttl_sec: parsePositiveInteger(uploadLinkTtlSec),
            max_upload_size: Math.round(parsePositiveInteger(maxUploadMb) * 1024 * 1024)
        };

        saving = true;

        try {
            const data = await apiPut("/api/admin/settings", payload);

            if (data) {
                applySettings(data);
            }

            baseline = snapshot();
            notice = { type: "success", text: "设置已保存" };
        } catch (error) {
            notice = {
                type: "error",
                text: sanitizeMessage(error && error.message ? error.message : "保存设置失败")
            };
        } finally {
            saving = false;
        }
    }

    function openAuthorizePage() {
        if (!authorizeUrlValid) {
            notice = { type: "error", text: "请先填写有效的 http/https 外部授权链接" };
            return;
        }

        window.open(baiduAuthorizeUrl.trim(), "_blank", "noopener,noreferrer");
    }

    async function copyAuthorizeLink() {
        const value = baiduAuthorizeUrl.trim();

        if (!value) {
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            authorizeCopied = true;
            window.setTimeout(() => {
                authorizeCopied = false;
            }, 1600);
        } catch (error) {
            window.prompt("复制失败，请手动复制授权链接：", value);
        }
    }

    async function handleTest() {
        testNotice = null;

        if (!baiduAccessToken.trim()) {
            testNotice = { type: "error", text: "请先填写百度 access_token" };
            return;
        }

        testing = true;

        try {
            const data = await apiPost("/api/admin/settings/test");
            const connected = Boolean(data && data.connected);
            const sampleCount = data && data.sampleCount !== undefined ? data.sampleCount : 0;

            if (connected) {
                testNotice = {
                    type: "success",
                    text: `连接成功 · 根目录可见 ${sampleCount} 项`
                };
            } else {
                testNotice = {
                    type: "error",
                    text: "连接失败，请检查 access_token 是否过期或是否具备访问权限。"
                };
            }
        } catch (error) {
            testNotice = {
                type: "error",
                text: sanitizeMessage(error && error.message ? error.message : "连接测试失败")
            };
        } finally {
            testing = false;
        }
    }
</script>

<div class="settings-page">
    <header class="page-header">
        <div>
            <h1 class="page-title">设置</h1>
            <p class="page-subtitle">百度网盘接入、短链有效期与上传限制。</p>
        </div>
        <div class="page-actions">
            <span class="pill" class:pill-warning={dirty} class:pill-positive={!dirty && !loading}>
                {#if loading}
                    读取中
                {:else if dirty}
                    有未保存的更改
                {:else}
                    已保存
                {/if}
            </span>
        </div>
    </header>

    {#if notice}
        <div
            class="notice"
            class:notice-success={notice.type === "success"}
            class:notice-error={notice.type === "error"}
            role="status"
            aria-live="polite"
        >
            {notice.text}
        </div>
    {/if}

    {#if loading}
        <div class="settings-section">
            <div class="settings-copy">
                <div class="skeleton" style="width:120px;height:18px"></div>
                <div class="skeleton" style="width:80%;height:14px;margin-top:10px"></div>
            </div>
            <div class="section-panel">
                <div class="skeleton" style="width:100%;height:120px"></div>
            </div>
        </div>
    {:else}
        <form onsubmit={handleSubmit}>
            <section class="settings-section">
                <div class="settings-copy">
                    <h2>百度网盘接入</h2>
                    <p class="hint">
                        access_token 只在服务端使用，用于访问百度网盘开放平台。也可以打开外部授权页获取 token 后手动粘贴。
                    </p>
                    <span class="pill" class:pill-positive={tokenConfigured} class:pill-negative={!tokenConfigured}>
                        {tokenConfigured ? "已配置" : "未配置"}
                    </span>

                    <div class="auth-help">
                        <span class="hint">获取 access_token</span>
                        <ol>
                            <li>打开外部授权页，完成百度授权。</li>
                            <li>复制返回的 access_token。</li>
                            <li>粘贴到右侧并保存，然后测试连接。</li>
                        </ol>
                    </div>

                    <span class="hint auth-link-state">
                        {baiduAuthorizeUrl ? "外部授权链接已填写" : "尚未设置外部授权链接"}
                    </span>
                </div>

                <div class="section-panel">
                    <div class="field">
                        <label for="baidu-access-token">百度 access_token</label>
                        <div class="input-with-action">
                            <input
                                id="baidu-access-token"
                                type={showToken ? "text" : "password"}
                                bind:value={baiduAccessToken}
                                autocomplete="off"
                                spellcheck="false"
                                placeholder="百度网盘开放平台 access_token"
                            />
                            <button
                                type="button"
                                class="btn btn-ghost"
                                onclick={() => (showToken = !showToken)}
                            >
                                {showToken ? "隐藏" : "显示"}
                            </button>
                        </div>
                        <span class="field-hint">token 过期后需要在这里更新，并重新测试连接。</span>
                    </div>

                    <div class="field">
                        <label for="baidu-authorize-url">外部授权页链接（可选）</label>
                        <input
                            id="baidu-authorize-url"
                            type="url"
                            bind:value={baiduAuthorizeUrl}
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="https://openapi.baidu.com/oauth/2.0/authorize?..."
                        />
                        <span class="field-hint">
                            在外部授权页完成百度授权后，复制 access_token，粘贴到上方输入框并保存。不会经过本服务回调。
                        </span>
                        <div class="authorize-actions">
                            <button
                                type="button"
                                class="btn"
                                disabled={!authorizeUrlValid}
                                onclick={openAuthorizePage}
                            >
                                打开授权页
                            </button>
                            <button
                                type="button"
                                class="btn btn-ghost"
                                disabled={!authorizeUrlValid}
                                onclick={copyAuthorizeLink}
                            >
                                {authorizeCopied ? "已复制" : "复制链接"}
                            </button>
                        </div>
                    </div>

                    <div class="panel-foot">
                        <button
                            type="button"
                            class="btn"
                            disabled={testing}
                            onclick={handleTest}
                        >
                            {testing ? "测试中…" : "测试连接"}
                        </button>
                        <span class="hint">测试使用服务端已保存的配置。</span>
                    </div>

                    {#if testNotice}
                        <div
                            class="test-result"
                            class:notice-success={testNotice.type === "success"}
                            class:notice-error={testNotice.type === "error"}
                            role="status"
                            aria-live="polite"
                        >
                            {testNotice.text}
                        </div>
                    {/if}
                </div>
            </section>

            <section class="settings-section">
                <div class="settings-copy">
                    <h2>地址与短链</h2>
                    <p class="hint">
                        对外访问地址用于生成上传、下载短链，必须是成员实际可以访问的地址。
                    </p>
                    <div class="section-preview">
                        <span class="hint">短链形如</span>
                        <code>{appBaseUrl || "http://localhost:3000"}/u/&lt;token&gt;</code>
                    </div>
                </div>

                <div class="section-panel">
                    <div class="field">
                        <label for="app-base-url">对外访问地址 app_base_url</label>
                        <input
                            id="app-base-url"
                            type="text"
                            bind:value={appBaseUrl}
                            autocomplete="off"
                            placeholder="http://localhost:3000 或 /"
                        />
                        <span class="field-hint">以 http://、https:// 开头，或以 / 开头的站内路径。</span>
                    </div>

                    <div class="field">
                        <label for="upload-link-ttl">上传短链有效期（秒）</label>
                        <input
                            id="upload-link-ttl"
                            type="number"
                            min="60"
                            max="86400"
                            step="1"
                            bind:value={uploadLinkTtlSec}
                        />
                        <span class="field-hint">范围 60–86400 秒；短链只能成功使用一次。</span>
                    </div>
                </div>
            </section>

            <section class="settings-section">
                <div class="settings-copy">
                    <h2>上传限制</h2>
                    <p class="hint">
                        MCP 上传只使用短链 + curl，不再提供分片工具。单文件上限需要小于环境变量 BODY_SIZE_LIMIT 和反向代理的请求体上限。
                    </p>
                    <div class="section-preview">
                        <span class="hint">上传方式</span>
                        <code>短链 + curl</code>
                    </div>
                </div>

                <div class="section-panel">
                    <div class="field">
                        <label for="max-upload-size">单文件上传上限（MB）</label>
                        <input
                            id="max-upload-size"
                            type="number"
                            min="1"
                            step="1"
                            bind:value={maxUploadMb}
                        />
                        <span class="field-hint">保存时按 MB × 1024 × 1024 转换为字节；MCP 短链上传同样受此上限约束。</span>
                    </div>
                </div>
            </section>

            <div class="settings-actions">
                <span class="hint">{dirty ? "修改还没有保存。" : "所有更改已保存。"}</span>
                <button type="submit" class="btn btn-primary" disabled={saving || !dirty}>
                    {saving ? "保存中…" : "保存设置"}
                </button>
            </div>
        </form>
    {/if}
</div>

<style>
    .settings-page {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        width: 100%;
        max-width: 1152px;
    }

    .settings-section {
        display: grid;
        grid-template-columns: 380px minmax(0, 1fr);
        gap: 32px;
        padding: 28px 0;
        border-top: 1px solid var(--rule);
    }

    .settings-section:first-of-type {
        padding-top: 4px;
        border-top: 0;
    }

    .settings-copy {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }

    .settings-copy h2 {
        margin: 0;
        font-size: var(--fs-section);
        line-height: 1.35;
        font-weight: 600;
    }

    .settings-copy .pill {
        margin-top: 2px;
    }

    .section-preview {
        display: grid;
        gap: 3px;
        margin-top: 4px;
    }

    .section-preview code {
        display: block;
        max-width: 100%;
        overflow-wrap: anywhere;
        color: var(--text);
        font-size: var(--fs-small);
    }

    .section-panel {
        display: grid;
        gap: 18px;
        padding: 20px;
        border-radius: var(--radius-card);
        background: var(--raised);
    }

    .auth-help {
        display: grid;
        gap: 6px;
        margin-top: 4px;
    }

    .auth-help ol {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        font-size: var(--fs-small);
        line-height: 1.6;
    }

    .auth-link-state {
        margin-top: 2px;
    }

    .authorize-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 2px;
    }

    .panel-foot {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        padding-top: 4px;
    }

    .test-result {
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface);
        font-size: var(--fs-small);
    }

    .test-result.notice-success {
        border-color: #bfe8ce;
    }

    .test-result.notice-error {
        border-color: #f4c7c4;
    }

    .settings-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-top: 20px;
        border-top: 1px solid var(--rule);
    }

    @media (max-width: 860px) {
        .settings-section {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
            padding: 24px 0;
        }

        .section-panel {
            padding: 16px;
        }

        .settings-actions {
            align-items: stretch;
            flex-direction: column;
        }

        .settings-actions .btn {
            width: 100%;
        }
    }
</style>
