<script>
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { apiPost } from "$lib/api.js";
    import AuthPanel from "$lib/components/AuthPanel.svelte";

    let password = $state("");
    let error = $state("");
    let saving = $state(false);

    function nextTarget() {
        const next = page.url.searchParams.get("next");

        if (
            next &&
            (next === "/admin" || next.startsWith("/admin/")) &&
            !next.startsWith("//")
        ) {
            return next;
        }

        return "/admin";
    }

    async function handleSubmit(event) {
        event.preventDefault();
        error = "";

        if (!password) {
            error = "请输入管理员密码";
            return;
        }

        saving = true;

        try {
            await apiPost("/api/admin/auth/login", { password });
            await goto(nextTarget(), { invalidateAll: true });
        } catch (err) {
            error = err && err.message ? err.message : "登录失败";
        } finally {
            saving = false;
        }
    }
</script>

<svelte:head>
    <title>登录管理端</title>
</svelte:head>

<AuthPanel title="登录管理端" subtitle="输入管理员密码继续。">
    <form onsubmit={handleSubmit}>
        <div class="field">
            <label for="admin-password">密码</label>
            <input
                id="admin-password"
                type="password"
                bind:value={password}
                autocomplete="current-password"
                placeholder="管理员密码"
                disabled={saving}
            />
        </div>

        {#if error}
            <p class="error-text auth-error" role="alert">{error}</p>
        {/if}

        <button class="btn btn-primary auth-submit" type="submit" disabled={saving}>
            {saving ? "登录中…" : "登录"}
        </button>
    </form>
</AuthPanel>
