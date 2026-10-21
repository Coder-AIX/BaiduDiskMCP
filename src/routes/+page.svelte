<svelte:head>
    <title>工作室网盘</title>
    <meta http-equiv="refresh" content="0; url=/admin" />
</svelte:head>

<main class="entry">
    <p>正在进入管理端…</p>
    <p>如果没有自动跳转，请<a href="/admin">点击此处</a>。</p>
</main>

<style>
    .entry {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 8px;
        font-size: 15px;
        color: var(--muted);
    }

    .entry p {
        margin: 0;
    }

    .entry a {
        color: var(--accent);
        text-decoration: underline;
        text-underline-offset: 3px;
    }
</style>
