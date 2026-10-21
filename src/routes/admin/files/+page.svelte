<script>
    import { onMount } from "svelte";
    import { apiGet, apiPost } from "$lib/api.js";
    import FileBrowser from "$lib/components/FileBrowser.svelte";
    import { formatFileTime, formatSize } from "$lib/format.js";
    import PathBar from "$lib/components/PathBar.svelte";
    import DirectoryPicker from "$lib/components/DirectoryPicker.svelte";
    import Modal from "$lib/components/Modal.svelte";

    let currentDir = $state("/");
    let entries = $state([]);
    let loading = $state(false);
    let error = $state("");
    let uploading = $state(false);
    let uploadProgress = $state(0);
    let uploadName = $state("");
    let submitting = $state(false);

    let renameTarget = $state(null);
    let renameName = $state("");
    let mkdirOpen = $state(false);
    let mkdirName = $state("");
    let pickerOpen = $state(false);
    let pickerMode = $state("move");
    let pickerEntry = $state(null);

    let fileInput = $state(null);

    let folderCount = $derived(entries.filter((entry) => entry.isDir).length);
    let fileCount = $derived(entries.filter((entry) => !entry.isDir).length);
    let totalSize = $derived(
        entries
            .filter((entry) => !entry.isDir)
            .reduce((sum, entry) => sum + (Number(entry.size) || 0), 0)
    );
    let recentEntries = $derived(
        [...entries]
            .sort((left, right) => Number(right.mtime ?? 0) - Number(left.mtime ?? 0))
            .slice(0, 4)
    );
    let latestMtime = $derived(recentEntries.length > 0 ? recentEntries[0].mtime : null);

    function errorMessage(err) {
        if (err && typeof err.message === "string" && err.message) {
            return err.message;
        }

        return "操作失败，请稍后重试";
    }

    function parentOf(dir) {
        if (!dir || dir === "/") {
            return "/";
        }

        const index = dir.lastIndexOf("/");

        return index <= 0 ? "/" : dir.slice(0, index);
    }

    async function loadDir(dir) {
        loading = true;
        error = "";

        try {
            const data = await apiGet(`/api/admin/fs/list?dir=${encodeURIComponent(dir)}`);
            entries = data && Array.isArray(data.entries) ? data.entries : [];
            currentDir = data && data.dir ? data.dir : dir;
        } catch (err) {
            error = errorMessage(err);
        } finally {
            loading = false;
        }
    }

    async function performOperation(body) {
        submitting = true;
        error = "";

        try {
            await apiPost("/api/admin/fs/operation", body);
            await loadDir(currentDir);
            return true;
        } catch (err) {
            error = errorMessage(err);
            return false;
        } finally {
            submitting = false;
        }
    }

    function openDir(entry) {
        const target = entry.path || `${currentDir === "/" ? "" : currentDir}/${entry.name}`;
        loadDir(target);
    }

    function goToDir(dir) {
        if (dir === currentDir) {
            return;
        }

        loadDir(dir);
    }

    function handleAction(payload) {
        const type = payload.type;
        const entry = payload.entry;

        if (!entry) {
            return;
        }

        if (type === "download") {
            window.open(`/api/admin/fs/download?path=${encodeURIComponent(entry.path)}`, "_blank");
            return;
        }

        if (type === "rename") {
            renameTarget = entry;
            renameName = entry.name || "";
            return;
        }

        if (type === "move" || type === "copy") {
            pickerEntry = entry;
            pickerMode = type;
            pickerOpen = true;
            return;
        }

        if (type === "delete") {
            const isDir = Boolean(entry.isDir);
            const hint = isDir
                ? `确定删除目录“${entry.name}”吗？将删除目录及其全部内容。`
                : `确定删除文件“${entry.name}”吗？`;

            if (!window.confirm(hint)) {
                return;
            }

            performOperation({ op: "delete", paths: [entry.path] });
        }
    }

    async function submitRename(event) {
        event.preventDefault();

        const newName = renameName.trim();

        if (!renameTarget || !newName) {
            error = "请输入新的名称";
            return;
        }

        const ok = await performOperation({
            op: "rename",
            path: renameTarget.path,
            newName
        });

        if (ok) {
            renameTarget = null;
            renameName = "";
        }
    }

    function openMkdir() {
        mkdirName = "";
        mkdirOpen = true;
    }

    async function submitMkdir(event) {
        event.preventDefault();

        const name = mkdirName.trim();

        if (!name) {
            error = "请输入文件夹名称";
            return;
        }

        const ok = await performOperation({ op: "mkdir", dir: currentDir, name });

        if (ok) {
            mkdirOpen = false;
            mkdirName = "";
        }
    }

    function closePicker() {
        pickerOpen = false;
        pickerEntry = null;
    }

    async function handlePickerSelect(destDir) {
        if (!pickerEntry || !destDir) {
            return;
        }

        const entry = pickerEntry;
        const mode = pickerMode;
        pickerOpen = false;
        pickerEntry = null;

        await performOperation({ op: mode, path: entry.path, destDir });
    }

    function triggerUpload() {
        if (uploading) {
            return;
        }

        error = "";

        if (fileInput) {
            fileInput.click();
        }
    }

    function uploadOne(file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const form = new FormData();

            form.append("dir", currentDir);
            form.append("file", file);

            xhr.open("POST", "/api/admin/fs/upload");

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    onProgress(event.loaded, event.total);
                }
            };

            xhr.onload = () => {
                let data = null;

                try {
                    data = JSON.parse(xhr.responseText);
                } catch (err) {
                    reject(new Error("服务返回了无法解析的响应"));
                    return;
                }

                if (xhr.status < 200 || xhr.status >= 300 || !data || data.ok === false) {
                    const message =
                        data && data.error && data.error.message
                            ? data.error.message
                            : `上传失败（HTTP ${xhr.status}）`;
                    reject(new Error(message));
                    return;
                }

                resolve(data.data);
            };

            xhr.onerror = () => {
                reject(new Error("网络请求失败，上传未完成"));
            };

            xhr.onabort = () => {
                reject(new Error("上传已取消"));
            };

            xhr.send(form);
        });
    }

    async function handleUpload(event) {
        const files = Array.from(event.target.files || []);
        event.target.value = "";

        if (files.length === 0 || uploading) {
            return;
        }

        uploading = true;
        uploadProgress = 0;
        error = "";

        for (let index = 0; index < files.length; index += 1) {
            uploadName = files[index].name;

            try {
                await uploadOne(files[index], (loaded, total) => {
                    const ratio = total > 0 ? loaded / total : 0;
                    uploadProgress = Math.min(
                        100,
                        Math.round(((index + ratio) / files.length) * 100)
                    );
                });
            } catch (err) {
                error = `上传“${files[index].name}”失败：${errorMessage(err)}`;
                break;
            }
        }

        uploadProgress = 100;
        await loadDir(currentDir);
        uploading = false;
        uploadProgress = 0;
        uploadName = "";
    }

    onMount(() => {
        loadDir(currentDir);
    });
</script>

<div class="page">
    <header class="page-header">
        <div>
            <h1 class="page-title">文件</h1>
            <p class="page-subtitle">百度网盘目录，按需加载。</p>
        </div>
        <div class="page-actions">
            <button
                type="button"
                class="btn btn-primary"
                disabled={uploading}
                onclick={triggerUpload}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
                    <path d="M4.5 14v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
                </svg>
                {uploading ? `上传中 ${uploadProgress}%` : "上传文件"}
            </button>
            <button
                type="button"
                class="btn"
                disabled={uploading || submitting}
                onclick={openMkdir}
            >
                新建文件夹
            </button>
            <button
                type="button"
                class="btn btn-icon"
                aria-label="刷新目录"
                title="刷新目录"
                disabled={loading || uploading}
                onclick={() => loadDir(currentDir)}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 11a8 8 0 1 0-2.3 6.7" />
                    <path d="M20 5v6h-6" />
                </svg>
            </button>
            <input
                class="hidden-input"
                type="file"
                multiple
                bind:this={fileInput}
                onchange={handleUpload}
            />
        </div>
    </header>

    <PathBar
        path={currentDir}
        count={loading ? null : entries.length}
        onNavigate={goToDir}
        onUp={() => goToDir(parentOf(currentDir))}
        label="当前目录"
    />

    {#if uploading}
        <div class="upload-status" role="status" aria-live="polite">
            <div class="upload-line">
                <span class="truncate">正在上传 {uploadName || "文件"}</span>
                <span class="muted num">{uploadProgress}%</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style:width={`${uploadProgress}%`}></div>
            </div>
        </div>
    {/if}

    {#if error}
        <div class="notice notice-error" role="alert">{error}</div>
    {/if}

    <div class="files-layout">
        <div class="files-main">
            <FileBrowser
                {entries}
                {loading}
                onOpenDir={openDir}
                onAction={handleAction}
            />
        </div>

        <aside class="files-aside">
            <section class="card">
                <h2 class="section-title">目录概览</h2>
                <dl class="dir-facts">
                    <div>
                        <dt>文件夹</dt>
                        <dd class="num">{loading ? "—" : folderCount}</dd>
                    </div>
                    <div>
                        <dt>文件</dt>
                        <dd class="num">{loading ? "—" : fileCount}</dd>
                    </div>
                    <div>
                        <dt>合计大小</dt>
                        <dd class="num">{loading ? "—" : fileCount > 0 ? formatSize(totalSize) : "—"}</dd>
                    </div>
                    <div>
                        <dt>最近修改</dt>
                        <dd>{loading ? "—" : formatFileTime(latestMtime)}</dd>
                    </div>
                </dl>
            </section>

            <section class="card">
                <h2 class="section-title">最近修改</h2>
                {#if loading}
                    <div class="recent-list">
                        {#each [1, 2, 3] as row (row)}
                            <div class="recent-row">
                                <span class="skeleton" style="width:60%"></span>
                                <span class="skeleton" style="width:72px"></span>
                            </div>
                        {/each}
                    </div>
                {:else if recentEntries.length === 0}
                    <p class="hint recent-empty">当前目录没有条目。</p>
                {:else}
                    <ul class="recent-list">
                        {#each recentEntries as entry (entry.fsId ?? entry.path)}
                            <li class="recent-row">
                                <span class="recent-name" title={entry.name}>
                                    <span class="recent-icon" aria-hidden="true">
                                        {#if entry.isDir}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
                                            </svg>
                                        {:else}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M6 3.5h8l4 4v13H6v-17Z" />
                                                <path d="M14 3.5v4h4" />
                                            </svg>
                                        {/if}
                                    </span>
                                    {entry.name}
                                </span>
                                <span class="recent-time">{formatFileTime(entry.mtime)}</span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>
        </aside>
    </div>
</div>

<Modal
    open={renameTarget !== null}
    title="重命名"
    onClose={() => (renameTarget = null)}
>
    <form onsubmit={submitRename}>
        <div class="field">
            <label for="rename-name">新名称</label>
            <input
                id="rename-name"
                type="text"
                bind:value={renameName}
                autocomplete="off"
                data-autofocus
            />
        </div>
        <div class="form-actions modal-actions">
            <button type="button" class="btn" onclick={() => (renameTarget = null)}>
                取消
            </button>
            <button type="submit" class="btn btn-primary" disabled={submitting}>
                确定
            </button>
        </div>
    </form>
</Modal>

<Modal open={mkdirOpen} title="新建文件夹" onClose={() => (mkdirOpen = false)}>
    <form onsubmit={submitMkdir}>
        <div class="field">
            <label for="mkdir-name">文件夹名称</label>
            <input
                id="mkdir-name"
                type="text"
                bind:value={mkdirName}
                autocomplete="off"
                data-autofocus
            />
        </div>
        <div class="form-actions modal-actions">
            <button type="button" class="btn" onclick={() => (mkdirOpen = false)}>
                取消
            </button>
            <button type="submit" class="btn btn-primary" disabled={submitting}>
                创建
            </button>
        </div>
    </form>
</Modal>

<DirectoryPicker
    open={pickerOpen}
    initialDir={currentDir}
    onSelect={handlePickerSelect}
    onClose={closePicker}
/>

<style>
    .hidden-input {
        display: none;
    }

    .upload-status {
        display: grid;
        gap: 6px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        background: var(--raised);
    }

    .upload-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        font-size: var(--fs-small);
    }

    .progress-track {
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: #dde4e7;
    }

    .progress-fill {
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        transition: width var(--t-ui) var(--ease-out);
    }

    .files-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: var(--gap);
        align-items: start;
    }

    .files-main {
        min-width: 0;
    }

    .files-aside {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 0;
    }

    .dir-facts {
        display: grid;
        gap: 0;
        margin-top: 12px;
    }

    .dir-facts > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
    }

    .dir-facts > div + div {
        border-top: 1px solid var(--rule);
    }

    .dir-facts dt {
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .dir-facts dd {
        margin: 0;
        color: var(--text);
        font-size: 13px;
        text-align: right;
    }

    .recent-list {
        margin-top: 10px;
    }

    .recent-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 36px;
        padding: 6px 0;
    }

    .recent-row + .recent-row {
        border-top: 1px solid var(--rule);
    }

    .recent-name {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    }

    .recent-icon {
        display: grid;
        place-items: center;
        width: 15px;
        height: 15px;
        flex: none;
        color: var(--muted);
    }

    .recent-icon svg {
        width: 15px;
        height: 15px;
        stroke-width: 1.5;
    }

    .recent-time {
        flex: none;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .recent-empty {
        margin-top: 12px;
    }

    .modal-actions {
        margin-top: 20px;
    }

    @media (max-width: 1100px) {
        .files-layout {
            grid-template-columns: minmax(0, 1fr);
        }

        .files-aside {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
        }
    }

    @media (max-width: 700px) {
        .files-aside {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    @media (max-width: 560px) {
        .page-actions {
            width: 100%;
        }

        .page-actions .btn-primary {
            flex: 1;
        }
    }
</style>
