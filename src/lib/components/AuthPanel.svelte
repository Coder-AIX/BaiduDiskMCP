<script>
    let { title = "", subtitle = "", children } = $props();
</script>

<div class="auth-page">
    <main class="auth-card">
        <aside class="auth-aside">
            <div class="auth-brand">
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
            </div>

            <div class="auth-aside-copy">
                <p class="auth-line">文件、成员与授权，<br />在一个地方管理。</p>
                <p class="auth-note">百度网盘 · MCP 文件层</p>
            </div>
        </aside>

        <section class="auth-main">
            <header class="auth-head">
                <h1>{title}</h1>
                <p>{subtitle}</p>
            </header>
            <div class="auth-body">
                {@render children()}
            </div>
        </section>
    </main>
</div>

<style>
    .auth-page {
        display: grid;
        place-items: center;
        min-height: 100svh;
        padding: 24px;
        background: var(--ground);
    }

    .auth-card {
        display: grid;
        grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
        width: 100%;
        max-width: 960px;
        min-height: 520px;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius-sheet);
        background: var(--surface);
    }

    .auth-aside {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 32px;
        padding: 32px;
        border-right: 1px solid var(--border);
        background: var(--raised);
    }

    .auth-brand {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .brand-mark {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        flex: none;
        color: var(--accent);
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

    .auth-aside-copy {
        display: grid;
        gap: 16px;
    }

    .auth-line {
        margin: 0;
        max-width: 14em;
        font-size: 24px;
        line-height: 1.25;
        font-weight: 400;
        letter-spacing: -0.01em;
    }

    .auth-note {
        margin: 0;
        color: var(--muted);
        font-size: var(--fs-small);
    }

    .auth-main {
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 44px;
    }

    .auth-head h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.25;
        font-weight: 600;
        letter-spacing: -0.01em;
    }

    .auth-head p {
        margin-top: 6px;
        color: var(--muted);
        font-size: var(--fs-body);
    }

    .auth-body {
        margin-top: 24px;
    }

    :global(.auth-submit) {
        width: 100%;
        height: 40px;
        margin-top: 8px;
    }

    :global(.auth-error) {
        margin-top: 10px;
        font-size: var(--fs-small);
    }

    @media (max-width: 760px) {
        .auth-page {
            padding: 16px;
        }

        .auth-card {
            grid-template-columns: minmax(0, 1fr);
            min-height: 0;
        }

        .auth-aside {
            padding: 20px;
            border-right: 0;
            border-bottom: 1px solid var(--border);
        }

        .auth-aside-copy {
            display: none;
        }

        .auth-main {
            padding: 24px 20px 28px;
        }

        .auth-head h1 {
            font-size: 22px;
        }
    }
</style>
