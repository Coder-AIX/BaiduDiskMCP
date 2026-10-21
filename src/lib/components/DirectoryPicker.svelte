<script>
    import { apiGet } from "$lib/api.js";
    import Modal from "./Modal.svelte";
    import PathBar from "./PathBar.svelte";
    import PathTrail from "./PathTrail.svelte";

    let { open = false, initialDir = "/", onSelect = () => {}, onClose = () => {} } = $props();

    let currentDir = $state("/");
    let entries = $state([]);
    let loading = $state(false);
    let error = $state("");
    let manualPath = $state("/");
    let showManual = $state(false);

    let requestToken = 0;
    let wasOpen = false;

    let dirs = $derived(
        (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && entry.isDir && entry.name)
            .slice()
            .sort((left, right) => String(left.name).localeCompare(String(right.name), "zh-CN"))
    );

    function normalizePath(input) {
        if (typeof input !== "string") {
            return "/";
        }

        let path = input.trim();

        if (!path) {
            return "/";
        }

        if (!path.startsWith("/")) {
            path = `/${path}`;
        }

        path = path.replace(/\/{2,}/g, "/");

        if (path.length > 1 && path.endsWith("/")) {
            path = path.slice(0, -1);
        }

        return path || "/";
    }

    function parentOf(dir) {
        const path = normalizePath(dir);

        if (path === "/") {
            return "/";
        }

        const index = path.lastIndexOf("/");

        return index <= 0 ? "/" : path.slice(0, index);
    }

    async function loadDir(dir) {
        const target = normalizePath(dir);

        requestToken += 1;
        const token = requestToken;

        loading = true;
        error = "";
        manualPath = target;

        try {
            const data = await apiGet(`/api/admin/fs/list?dir=${encodeURIComponent(target)}`);

            if (token !== requestToken) {
                return;
            }

            const list = Array.isArray(data) ? data : data && Array.isArray(data.entries) ? data.entries : [];

            currentDir = target;
            entries = list;
        } catch (err) {
            if (token !== requestToken) {
                return;
            }

            entries = [];
            error = err && err.message ? err.message : "加载目录失败";
        } finally {
            if (token === requestToken) {
                loading = false;
            }
        }
    }

    $effect(() => {
        if (open && !wasOpen) {
            wasOpen = true;

            const start = normalizePath(initialDir);

            currentDir = start;
            entries = [];
            error = "";
            manualPath = start;
            showManual = false;

            loadDir(start);
        } else if (!open && wasOpen) {
            wasOpen = false;
            requestToken += 1;
            loading = false;
            entries = [];
            error = "";
            showManual = false;
        }
    });

    function enterDir(dir) {
        if (loading || !dir || !dir.name) {
            return;
        }

        const index = currentDir === "/" ? `/${dir.name}` : `${currentDir}/${dir.name}`;
        const target = dir.path ? normalizePath(dir.path) : index;

        loadDir(target);
    }

    function goTo(path) {
        const target = normalizePath(path);

        if (loading || target === currentDir) {
            return;
        }

        loadDir(target);
    }

    function goParent() {
        goTo(parentOf(currentDir));
    }

    function handleManualSubmit(event) {
        event.preventDefault();

        if (loading) {
            return;
        }

        const target = normalizePath(manualPath);

        manualPath = target;

        if (target === currentDir) {
            return;
        }

        loadDir(target);
    }

    function handleSelect() {
        onSelect(currentDir);
        onClose();
    }
</script>

<Modal {open} title="选择目录" size="lg" {onClose}>
    <div class="picker">
        <PathBar
            path={currentDir}
            onNavigate={goTo}
            onUp={goParent}
            count={loading ? null : dirs.length}
            label="选择目录"
        />

        <div class="picker-tools">
            <button class="btn btn-ghost btn-sm" type="button" onclick={() => (showManual = !showManual)}>
                {showManual ? "收起手动输入" : "手动输入路径"}
            </button>
            <span class="hint">点击文件夹进入下一级</span>
        </div>

        {#if showManual}
            <form class="manual" onsubmit={handleManualSubmit}>
                <input
                    class="input"
                    type="text"
                    bind:value={manualPath}
                    placeholder="/目录/子目录"
                    aria-label="手动输入目录路径"
                    data-autofocus
                />
                <button class="btn" type="submit" disabled={loading}>前往</button>
            </form>
        {/if}

        <div class="list">
            {#if loading}
                <div class="list-loading">
                    {#each [1, 2, 3, 4] as row (row)}
                        <div class="list-skeleton">
                            <span class="skeleton" style="width:16px;height:16px"></span>
                            <span class="skeleton" style="width:42%"></span>
                        </div>
                    {/each}
                </div>
            {:else if error}
                <div class="state">
                    <p class="error-text">{error}</p>
                    <button class="btn btn-sm" type="button" onclick={() => loadDir(currentDir)}>重试</button>
                </div>
            {:else if dirs.length === 0}
                <div class="state muted">当前目录没有子目录</div>
            {:else}
                <ul class="dir-list">
                    {#each dirs as dir (dir.path || dir.name)}
                        <li>
                            <button class="dir-item" type="button" onclick={() => enterDir(dir)}>
                                <span class="folder-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
                                        <path d="M3.5 7.5v-2h5l2 2" />
                                    </svg>
                                </span>
                                <span class="dir-name">{dir.name}</span>
                                <span class="dir-enter" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="m9.5 5 7 7-7 7" />
                                    </svg>
                                </span>
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <footer class="footer">
            <div class="picked">
                <span class="hint">已选目录</span>
                <PathTrail path={currentDir} />
            </div>
            <button
                class="btn btn-primary"
                type="button"
                onclick={handleSelect}
                disabled={loading || Boolean(error)}
            >
                选择当前目录
            </button>
        </footer>
    </div>
</Modal>

<style>
    .picker {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .picker-tools {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .manual {
        display: flex;
        gap: 8px;
    }

    .manual .input {
        flex: 1;
        min-width: 0;
    }

    .list {
        min-height: 240px;
        max-height: 390px;
        overflow-y: auto;
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        background: var(--surface);
    }

    .dir-list {
        padding: 4px;
    }

    .dir-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 42px;
        padding: 6px 10px;
        border: 0;
        border-radius: var(--radius-control);
        background: transparent;
        color: var(--text);
        text-align: left;
    }

    .dir-item:hover {
        background: var(--raised);
    }

    .folder-icon {
        display: grid;
        place-items: center;
        width: 17px;
        height: 17px;
        flex: none;
        color: var(--accent);
    }

    .folder-icon svg,
    .dir-enter svg {
        width: 17px;
        height: 17px;
        stroke-width: 1.5;
    }

    .dir-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dir-enter {
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        flex: none;
        color: var(--muted);
    }

    .state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 240px;
        padding: 20px;
        text-align: center;
    }

    .state p {
        margin: 0;
    }

    .list-loading {
        padding: 8px;
    }

    .list-skeleton {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 0 10px;
    }

    .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--rule);
    }

    .picked {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    @media (max-width: 600px) {
        .picker-tools {
            align-items: flex-start;
            flex-direction: column;
            gap: 6px;
        }

        .manual {
            flex-direction: column;
        }

        .footer {
            align-items: stretch;
            flex-direction: column;
            gap: 10px;
        }

        .footer .btn {
            width: 100%;
        }

        .list {
            max-height: 46svh;
        }
    }
</style>
