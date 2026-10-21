<script>
    import { formatFileTime, formatSize } from "$lib/format.js";

    let { entries = [], loading = false, onOpenDir = () => {}, onAction = () => {} } = $props();

    let openMenu = $state(null);

    const sortedEntries = $derived(
        [...entries].sort((a, b) => {
            if (a.isDir !== b.isDir) {
                return a.isDir ? -1 : 1;
            }

            return String(a.name ?? "").localeCompare(String(b.name ?? ""), "zh-CN");
        })
    );

    $effect(() => {
        if (!openMenu) {
            return;
        }

        const close = () => {
            openMenu = null;
        };
        const handleKeydown = (event) => {
            if (event.key === "Escape") {
                openMenu = null;
            }
        };

        window.addEventListener("click", close);
        window.addEventListener("keydown", handleKeydown);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);

        return () => {
            window.removeEventListener("click", close);
            window.removeEventListener("keydown", handleKeydown);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    });

    function entryKey(entry) {
        return entry.fsId ?? entry.path ?? entry.name;
    }

    function emit(type, entry) {
        onAction({ type, entry });
    }

    function toggleMenu(event, entry) {
        event.stopPropagation();

        if (openMenu && openMenu.entry === entry) {
            openMenu = null;
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const width = 180;
        const height = entry.isDir ? 176 : 212;
        const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
        let top = rect.bottom + 6;

        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - height - 6);
        }

        openMenu = { entry, left, top };
    }

    function choose(type, entry) {
        openMenu = null;
        emit(type, entry);
    }
</script>

<div class="file-browser">
    <div class="table-wrap">
        <table class="table">
            <thead>
                <tr>
                    <th>名称</th>
                    <th class="num col-size">大小</th>
                    <th class="num col-time">修改时间</th>
                    <th class="col-actions"><span class="sr-only">操作</span></th>
                </tr>
            </thead>
            <tbody>
                {#if loading}
                    {#each [1, 2, 3, 4, 5] as row (row)}
                        <tr class="skeleton-row">
                            <td class="col-name">
                                <div class="loading-row">
                                    <span class="skeleton" style="width:16px;height:16px"></span>
                                    <span class="skeleton" style="width:min(46%, 280px)"></span>
                                </div>
                            </td>
                            <td class="num col-size"><span class="skeleton" style="width:48px;margin-left:auto"></span></td>
                            <td class="num col-time"><span class="skeleton" style="width:104px;margin-left:auto"></span></td>
                            <td class="col-actions"></td>
                        </tr>
                    {/each}
                {:else if sortedEntries.length === 0}
                    <tr>
                        <td colspan="4">
                            <div class="table-empty">
                                <strong>当前目录为空</strong>
                                <span class="hint">可以从这里上传文件或新建文件夹。</span>
                            </div>
                        </td>
                    </tr>
                {:else}
                    {#each sortedEntries as entry (entryKey(entry))}
                        <tr>
                            <td class="col-name">
                                <div class="name-cell">
                                    <span class="file-icon" class:folder={entry.isDir} aria-hidden="true">
                                        {#if entry.isDir}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
                                                <path d="M3.5 7.5v-2h5l2 2" />
                                            </svg>
                                        {:else}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                                <path d="M6 3.5h8l4 4v13H6v-17Z" />
                                                <path d="M14 3.5v4h4" />
                                            </svg>
                                        {/if}
                                    </span>

                                    {#if entry.isDir}
                                        <button
                                            class="dir-link"
                                            type="button"
                                            title={entry.name}
                                            onclick={() => onOpenDir(entry)}
                                        >
                                            {entry.name}
                                        </button>
                                    {:else}
                                        <span class="file-name" title={entry.name}>{entry.name}</span>
                                    {/if}
                                </div>
                                <div class="mobile-meta">
                                    {entry.isDir ? "文件夹" : formatSize(entry.size)} · {formatFileTime(entry.mtime)}
                                </div>
                            </td>
                            <td class="num cell-size col-size">{entry.isDir ? "—" : formatSize(entry.size)}</td>
                            <td class="num cell-time col-time">{formatFileTime(entry.mtime)}</td>
                            <td class="col-actions">
                                <button
                                    class="row-more"
                                    type="button"
                                    aria-label={`${entry.name} 的操作`}
                                    aria-haspopup="menu"
                                    aria-expanded={openMenu?.entry === entry}
                                    onclick={(event) => toggleMenu(event, entry)}
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                        <circle cx="5.5" cy="12" r="1.4" />
                                        <circle cx="12" cy="12" r="1.4" />
                                        <circle cx="18.5" cy="12" r="1.4" />
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    {/each}
                {/if}
            </tbody>
        </table>
    </div>
</div>

{#if openMenu}
    <div
        class="row-menu"
        role="menu"
        tabindex="-1"
        style:left={`${openMenu.left}px`}
        style:top={`${openMenu.top}px`}
    >
        {#if !openMenu.entry.isDir}
            <button type="button" role="menuitem" onclick={() => choose("download", openMenu.entry)}>
                下载
            </button>
        {/if}
        <button type="button" role="menuitem" onclick={() => choose("rename", openMenu.entry)}>重命名</button>
        <button type="button" role="menuitem" onclick={() => choose("move", openMenu.entry)}>移动</button>
        <button type="button" role="menuitem" onclick={() => choose("copy", openMenu.entry)}>复制</button>
        <button class="danger" type="button" role="menuitem" onclick={() => choose("delete", openMenu.entry)}>
            删除
        </button>
    </div>
{/if}

<style>
    .name-cell {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
    }

    .file-icon {
        display: grid;
        place-items: center;
        width: 17px;
        height: 17px;
        flex: none;
        color: var(--muted);
    }

    .file-icon.folder {
        color: var(--accent);
    }

    .file-icon svg {
        width: 17px;
        height: 17px;
        stroke-width: 1.5;
    }

    .dir-link {
        min-width: 0;
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent);
        font: inherit;
        font-weight: 500;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dir-link:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
    }

    .file-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .mobile-meta {
        display: none;
    }

    .col-name {
        width: 52%;
    }

    .col-size {
        width: 110px;
    }

    .col-time {
        width: 168px;
    }

    .col-actions {
        width: 48px;
    }

    .row-more {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: var(--radius-chip);
        background: transparent;
        color: var(--muted);
    }

    .row-more:hover,
    .row-more[aria-expanded="true"] {
        background: var(--active);
        color: var(--text);
    }

    .row-more svg {
        width: 18px;
        height: 18px;
    }

    .table-empty {
        display: grid;
        gap: 4px;
    }

    .table-empty strong {
        color: var(--text);
        font-weight: 500;
    }

    .row-menu {
        position: fixed;
        z-index: 900;
        width: 180px;
        padding: 4px;
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        background: var(--surface);
        box-shadow: 0 14px 32px rgb(19 20 22 / 14%);
    }

    .row-menu button {
        display: block;
        width: 100%;
        height: 32px;
        padding: 0 10px;
        border: 0;
        border-radius: var(--radius-chip);
        background: transparent;
        color: var(--text);
        font-size: var(--fs-body);
        text-align: left;
    }

    .row-menu button:hover {
        background: var(--raised);
    }

    .row-menu button.danger {
        color: var(--negative);
    }

    .row-menu button.danger:hover {
        background: var(--pill-negative-bg);
    }

    @media (max-width: 720px) {
        .file-browser .table tr {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            column-gap: 8px;
            align-items: start;
        }

        .file-browser .table td.col-name {
            display: block;
            grid-column: 1;
        }

        .file-browser .table td.col-actions {
            display: block;
            grid-column: 2;
            grid-row: 1;
            width: auto;
            margin-top: 0;
        }

        .file-browser .table td.col-size,
        .file-browser .table td.col-time {
            display: none;
        }

        .name-cell {
            min-height: 28px;
        }

        .mobile-meta {
            display: block;
            margin-top: 5px;
            color: var(--muted);
            font-size: var(--fs-small);
        }

        .skeleton-row .col-name {
            grid-column: 1 / -1;
        }
    }
</style>
