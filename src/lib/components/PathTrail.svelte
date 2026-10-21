<script>
    let { path = "/", max = 3 } = $props();

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
        const parts = normalized.split("/").filter(Boolean);

        if (parts.length === 0) {
            return [{ name: "根目录", path: "/" }];
        }

        const result = [{ name: "根目录", path: "/" }];
        let accumulated = "";

        for (const part of parts) {
            accumulated += `/${part}`;
            result.push({ name: part, path: accumulated });
        }

        return result;
    });

    let visible = $derived.by(() => {
        if (crumbs.length <= max) {
            return crumbs;
        }

        return [crumbs[0], { name: "…", path: "", more: true }, ...crumbs.slice(-(max - 1))];
    });

    let isRoot = $derived(normalized === "/");
</script>

<span class="trail" title={normalized}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
    </svg>
    <span class="trail-text">
        {#each visible as crumb, index (crumb.more ? "more" : crumb.path)}
            {#if index > 0}
                <span class="trail-sep" aria-hidden="true">›</span>
            {/if}
            <span class:trail-more={crumb.more}>{crumb.name}</span>
        {/each}
        {#if isRoot}
            <span class="trail-note">全部</span>
        {/if}
    </span>
</span>

<style>
    .trail {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        max-width: 100%;
        color: var(--text);
        font-size: var(--fs-body);
        line-height: 1;
        vertical-align: middle;
    }

    .trail svg {
        width: 15px;
        height: 15px;
        flex: none;
        align-self: center;
        color: var(--muted);
        stroke-width: 1.5;
        transform: translateY(-0.5px);
    }

    .trail-text {
        min-width: 0;
        line-height: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .trail-sep {
        margin: 0 4px;
        color: #9a9ea2;
    }

    .trail-more {
        color: var(--muted);
    }

    .trail-note {
        margin-left: 6px;
        color: var(--muted);
        font-size: var(--fs-small);
    }
</style>
