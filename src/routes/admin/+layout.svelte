<script>
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { apiPost } from "$lib/api.js";

    let { children } = $props();

    const navItems = [
        { label: "概览", href: "/admin", exact: true, icon: "overview" },
        { label: "文件", href: "/admin/files", exact: false, icon: "files" },
        { label: "用户", href: "/admin/users", exact: false, icon: "users" },
        { label: "设置", href: "/admin/settings", exact: false, icon: "settings" }
    ];

    let pathname = $derived(page.url.pathname);
    let navOpen = $state(false);
    let copied = $state(false);
    let loggingOut = $state(false);
    let authPage = $derived(pathname === "/admin/login" || pathname === "/admin/setup");

    let currentLabel = $derived.by(() => {
        if (pathname.startsWith("/admin/files")) return "文件";
        if (pathname.startsWith("/admin/users")) return "用户";
        if (pathname.startsWith("/admin/settings")) return "设置";
        return "概览";
    });

    $effect(() => {
        pathname;
        navOpen = false;
    });

    $effect(() => {
        if (!navOpen) {
            return;
        }

        const previous = document.body.style.overflow;
        const handleKeydown = (event) => {
            if (event.key === "Escape") {
                navOpen = false;
            }
        };

        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeydown);

        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", handleKeydown);
        };
    });

    function isActive(item) {
        if (item.exact) {
            return pathname === item.href || pathname === item.href + "/";
        }

        return pathname === item.href || pathname.startsWith(item.href + "/");
    }

    async function logout() {
        if (loggingOut) {
            return;
        }

        loggingOut = true;

        try {
            await apiPost("/api/admin/auth/logout");
        } catch {
            // WHY: 即使请求失败也回到登录页，避免停在已失效的管理端
        } finally {
            await goto("/admin/login", { invalidateAll: true });
            loggingOut = false;
        }
    }

    async function copyMcpEndpoint() {
        const url = new URL("/mcp", window.location.origin).href;

        try {
            await navigator.clipboard.writeText(url);
            copied = true;
            window.setTimeout(() => {
                copied = false;
            }, 1800);
        } catch (error) {
            window.prompt("复制失败，请手动复制 MCP 端点：", url);
        }
    }
</script>

{#if authPage}
    {@render children()}
{:else}
<div class="app-frame">
    <aside class="sidebar" class:open={navOpen} aria-label="管理端导航">
        <div class="brand">
            <span class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
                    <path d="m4 12 8 4.5 8-4.5" />
                    <path d="m4 16.5 8 4.5 8-4.5" />
                </svg>
            </span>
            <span class="brand-copy">
                <span class="brand-name">BaiduDiskMCP</span>
                <span class="brand-scope">管理端</span>
            </span>
            <button class="nav-close" type="button" aria-label="关闭菜单" onclick={() => (navOpen = false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
                    <path d="m6 6 12 12M18 6 6 18" />
                </svg>
            </button>
        </div>

        <nav class="nav">
            {#each navItems as item}
                <a
                    class="nav-item"
                    class:active={isActive(item)}
                    href={item.href}
                    aria-current={isActive(item) ? "page" : undefined}
                >
                    <span class="nav-icon" aria-hidden="true">
                        {#if item.icon === "overview"}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" />
                            </svg>
                        {:else if item.icon === "files"}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3.5 7.5h6l2 2h9v9a2 2 0 0 1-2 2h-15v-13Z" />
                                <path d="M3.5 7.5v-2h5l2 2" />
                            </svg>
                        {:else if item.icon === "users"}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="9" cy="8" r="3.2" />
                                <path d="M3.5 20c.5-3.2 2.3-5 5.5-5s5 1.8 5.5 5" />
                                <path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 15.2c1.8.6 2.8 2.2 3 4.8" />
                            </svg>
                        {:else}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
                            </svg>
                        {/if}
                    </span>
                    <span>{item.label}</span>
                </a>
            {/each}
        </nav>

        <div class="sidebar-foot">
            <span>百度网盘 · MCP 文件层</span>
            <span>按目录授权</span>
            <button class="logout-btn" type="button" onclick={logout} disabled={loggingOut}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                    <path d="m15 8 4 4-4 4M9 12h10" />
                </svg>
                <span>{loggingOut ? "退出中…" : "退出登录"}</span>
            </button>
        </div>
    </aside>

    {#if navOpen}
        <button class="nav-scrim" type="button" aria-label="关闭菜单" onclick={() => (navOpen = false)}></button>
    {/if}

    <div class="frame-main">
        <header class="topbar">
            <button
                class="menu-toggle"
                type="button"
                aria-label="打开菜单"
                aria-expanded={navOpen}
                onclick={() => (navOpen = true)}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
            </button>

            <div class="top-context">
                <span class="top-product">BaiduDiskMCP</span>
                <span class="top-sep" aria-hidden="true">/</span>
                <span class="top-section">{currentLabel}</span>
            </div>

            <button class="mcp-button" type="button" onclick={copyMcpEndpoint} title="复制 MCP 端点地址">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 4.9" />
                    <path d="M14 11a5 5 0 0 0-7.1 0l-2.4 2.4a5 5 0 0 0 7.1 7.1L13 19.1" />
                </svg>
                <span class="mono">/mcp</span>
                <span class="mcp-state">{copied ? "已复制" : "复制"}</span>
            </button>
        </header>

        <div class="sheet">
            <main class="sheet-inner">
                {@render children()}
            </main>
        </div>
    </div>
</div>
{/if}

<style>
    .app-frame {
        display: flex;
        min-height: 100svh;
        background: var(--ground);
    }

    .sidebar {
        position: sticky;
        top: 0;
        display: flex;
        flex: 0 0 var(--sidebar-width);
        flex-direction: column;
        width: var(--sidebar-width);
        height: 100svh;
        padding: 20px 14px 16px;
        overflow-y: auto;
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 6px 20px;
    }

    .brand-mark {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        color: var(--accent);
        flex: none;
    }

    .brand-mark svg {
        width: 26px;
        height: 26px;
        stroke-width: 1.5;
    }

    .brand-copy {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    .brand-name {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.01em;
    }

    .brand-scope {
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .nav-close {
        display: none;
        margin-left: auto;
        padding: 4px;
        border: 0;
        border-radius: var(--radius-chip);
        background: transparent;
        color: var(--muted);
    }

    .nav-close svg {
        width: 18px;
        height: 18px;
        stroke-width: 1.6;
    }

    .nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .nav-item {
        display: flex;
        align-items: center;
        gap: 9px;
        height: var(--nav-row);
        padding: 0 10px;
        border-radius: var(--radius-control);
        color: var(--muted);
        font-size: var(--fs-body);
        transition:
            background-color var(--t-hover) ease,
            color var(--t-hover) ease;
    }

    .nav-item:hover {
        background: var(--raised-strong);
        color: var(--text);
    }

    .nav-item.active {
        background: var(--active);
        color: var(--text);
        font-weight: 500;
    }

    .nav-icon {
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        flex: none;
        color: inherit;
    }

    .nav-icon svg {
        width: 16px;
        height: 16px;
        stroke-width: 1.5;
    }

    .nav-item.active .nav-icon {
        color: var(--accent);
    }

    .sidebar-foot {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: auto;
        padding: 16px 10px 4px;
        color: var(--muted);
        font-size: var(--fs-small);
        line-height: 1.5;
    }

    .logout-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: var(--fs-small);
        text-align: left;
    }

    .logout-btn:hover:not(:disabled) {
        color: var(--text);
    }

    .logout-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .logout-btn svg {
        width: 14px;
        height: 14px;
        flex: none;
        stroke-width: 1.6;
    }

    .frame-main {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
    }

    .topbar {
        display: flex;
        align-items: center;
        gap: 12px;
        height: var(--topbar-height);
        flex: none;
        padding: 0 16px 0 24px;
    }

    .menu-toggle {
        display: none;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: var(--radius-control);
        background: transparent;
        color: var(--text);
    }

    .menu-toggle:hover {
        background: var(--raised-strong);
    }

    .menu-toggle svg {
        width: 18px;
        height: 18px;
        stroke-width: 1.6;
    }

    .top-context {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .top-product,
    .top-section {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .top-product {
        font-weight: 500;
    }

    .top-section {
        color: var(--text);
    }

    .top-sep {
        color: #9a9ea2;
    }

    .mcp-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        margin-left: auto;
        padding: 0 8px;
        border: 0;
        border-radius: var(--radius-control);
        background: transparent;
        color: var(--muted);
        font-size: var(--fs-small);
        transition: background-color var(--t-hover) ease;
    }

    .mcp-button:hover {
        background: var(--raised-strong);
        color: var(--text);
    }

    .mcp-button svg {
        width: 14px;
        height: 14px;
        stroke-width: 1.6;
    }

    .mcp-state {
        color: var(--faint);
    }

    .sheet {
        flex: 1;
        min-width: 0;
        margin: 0 var(--sheet-inset) var(--sheet-inset) 0;
        border: 1px solid var(--border);
        border-radius: var(--radius-sheet);
        background: var(--surface);
    }

    .sheet-inner {
        width: 100%;
        max-width: 1300px;
        margin: 0 auto;
        padding: 28px 32px 40px;
    }

    .nav-scrim {
        display: none;
    }

    @media (max-width: 900px) {
        .app-frame {
            display: block;
        }

        .sidebar {
            position: fixed;
            inset: 0;
            z-index: 30;
            width: min(300px, 86vw);
            height: 100svh;
            padding: 18px 14px;
            border-right: 1px solid var(--border);
            background: var(--surface);
            transform: translateX(-100%);
            transition: transform var(--t-ui) var(--ease-out);
        }

        .sidebar.open {
            transform: none;
        }

        .nav-close {
            display: inline-flex;
        }

        .frame-main {
            min-height: 100svh;
        }

        .topbar {
            padding: 0 12px;
        }

        .menu-toggle {
            display: inline-flex;
        }

        .sheet {
            margin: 0;
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: 0;
            min-height: calc(100svh - var(--topbar-height));
        }

        .sheet-inner {
            padding: 20px 16px 32px;
        }

        .nav-scrim {
            position: fixed;
            inset: 0;
            z-index: 20;
            display: block;
            padding: 0;
            border: 0;
            background: rgb(19 20 22 / 42%);
        }

        .mcp-state {
            display: none;
        }
    }

    @media (max-width: 480px) {
        .top-product,
        .top-sep {
            display: none;
        }

        .top-section {
            font-size: var(--fs-body);
            font-weight: 500;
            color: var(--text);
        }
    }
</style>
