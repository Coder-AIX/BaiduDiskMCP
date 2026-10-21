<script>
    let {
        path = "/",
        onNavigate = () => {},
        onUp = null,
        count = null,
        showCopy = true,
        label = "目录路径"
    } = $props();

    let copied = $state(false);
    let moreMenu = $state(null);

    let normalized = $derived.by(() => {
        let value = typeof path === "string" ? path.trim() : "/";

        if (!value) {
            value = "/";
        }

        if (!value.startsWith("/")) {
            value = `/${value}`;
        }

        value = value.replace(/\/{2,}/g, "/");

        if (value.length > 1 && value.endsWith("/")) {
            value = value.slice(0, -1);
        }

        return value || "/";
    });

    let crumbs = $derived.by(() => {
        const result = [{ name: "根目录", path: "/" }];
        let accumulated = "";

        for (const part of normalized.split("/").filter(Boolean)) {
            accumulated += `/${part}`;
            result.push({ name: part, path: accumulated });
        }

        return result;
    });

    let nodes = $derived.by(() => {
        if (crumbs.length <= 4) {
            return crumbs.map((crumb) => ({ type: "crumb", ...crumb }));
        }

        return [
            { type: "crumb", ...crumbs[0] },
            { type: "more", items: crumbs.slice(1, -2) },
            ...crumbs.slice(-2).map((crumb) => ({ type: "crumb", ...crumb }))
        ];
    });

    let canGoUp = $derived(Boolean(onUp) && normalized !== "/");

    async function copyPath() {
        try {
            await navigator.clipboard.writeText(normalized);
            copied = true;
            window.setTimeout(() => {
                copied = false;
            }, 1600);
        } catch (error) {
            window.prompt("复制失败，请手动复制路径：", normalized);
        }
    }

    $effect(() => {
        if (!moreMenu) {
            return;
        }

        const close = () => {
            moreMenu = null;
        };
        const handleKeydown = (event) => {
            if (event.key === "Escape") {
                moreMenu = null;
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

    function toggleMore(event, items) {
        event.stopPropagation();

        if (moreMenu) {
            moreMenu = null;
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const width = 200;
        const height = items.length * 32 + 8;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        let top = rect.bottom + 6;

        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - height - 6);
        }

        moreMenu = { items, left, top };
    }

    function navigate(target) {
        moreMenu = null;

        if (target === normalized) {
            return;
        }

        onNavigate(target);
    }
</script>

<div class="path-bar" aria-label={label}>
    <button
        class="path-back"
        type="button"
        aria-label="上一级"
        title="上一级"
        disabled={!canGoUp}
        onclick={() => onUp && onUp()}
    >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m14.5 5-7 7 7 7" />
        </svg>
    </button>

    <nav class="path-nav" aria-label="面包屑">
        {#each nodes as node, index (node.type === "more" ? "more" : node.path)}
            {#if index > 0}
                <span class="path-sep" aria-hidden="true">›</span>
            {/if}

            {#if node.type === "more"}
                <button
                    class="path-more"
                    type="button"
                    aria-label="显示被折叠的路径"
                    aria-haspopup="menu"
                    aria-expanded={moreMenu !== null}
                    onclick={(event) => toggleMore(event, node.items)}
                >
                    …
                </button>
            {:else if index === nodes.length - 1}
                <span class="path-crumb current" aria-current="page" title={normalized}>
                    {#if node.path === "/"}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
                        </svg>
                    {/if}
                    <span>{node.name}</span>
                </span>
            {:else}
                <button class="path-crumb" type="button" title={node.path} onclick={() => navigate(node.path)}>
                    {#if node.path === "/"}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
                        </svg>
                    {/if}
                    <span>{node.name}</span>
                </button>
            {/if}
        {/each}
    </nav>

    {#if count !== null}
        <span class="path-count">{count} 项</span>
    {/if}

    {#if showCopy}
        <div class="path-actions">
            <button class="path-copy" type="button" onclick={copyPath} title={normalized}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="8" y="8" width="11" height="11" rx="2" />
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                </svg>
                <span>{copied ? "已复制" : "复制路径"}</span>
            </button>
        </div>
    {/if}
</div>

{#if moreMenu}
    <div
        class="path-menu"
        role="menu"
        style:left={`${moreMenu.left}px`}
        style:top={`${moreMenu.top}px`}
    >
        {#each moreMenu.items as item (item.path)}
            <button type="button" role="menuitem" onclick={() => navigate(item.path)}>
                {item.name}
            </button>
        {/each}
    </div>
{/if}

<style>
    .path-crumb svg {
        width: 15px;
        height: 15px;
        flex: none;
        align-self: center;
        stroke-width: 1.5;
        transform: translateY(-0.5px);
    }

    .path-back svg {
        width: 16px;
        height: 16px;
        stroke-width: 1.6;
    }
</style>
