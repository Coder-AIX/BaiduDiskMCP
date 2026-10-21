<script>
    import { goto } from "$app/navigation";
    import { apiPost } from "$lib/api.js";
    import AuthPanel from "$lib/components/AuthPanel.svelte";

    let password = $state("");
    let confirm = $state("");
    let error = $state("");
    let saving = $state(false);

    async function handleSubmit(event) {
        event.preventDefault();
        error = "";

        if (password.length < 10) {
            error = "密码至少需要 10 个字符";
            return;
        }

        if (password !== confirm) {
            error = "两次输入的密码不一致";
            return;
        }

        saving = true;

        try {
            await apiPost("/api/admin/auth/setup", { password, confirm });
            await goto("/admin", { invalidateAll: true });
        } catch (err) {
            error = err && err.message ? err.message : "设置密码失败";
        } finally {
            saving = false;
        }
    }
</script>

<svelte:head>
    <title>设置管理员密码</title>
</svelte:head>

<AuthPanel
    title="设置管理员密码"
    subtitle="首次使用管理端，请先设置一个密码。"
>
    <form onsubmit={handleSubmit}>
        <div class="field">
            <label for="admin-password">密码</label>
            <input
                id="admin-password"
                type="password"
                bind:value={password}
                autocomplete="new-password"
                placeholder="至少 10 个字符"
                disabled={saving}
            />
        </div>

        <div class="field auth-field">
            <label for="admin-password-confirm">确认密码</label>
            <input
                id="admin-password-confirm"
                type="password"
                bind:value={confirm}
                autocomplete="new-password"
                placeholder="再次输入密码"
                disabled={saving}
            />
        </div>

        <p class="hint auth-hint">密码至少 10 个字符。忘记后只能手动重置数据库中的管理员记录。</p>

        {#if error}
            <p class="error-text auth-error" role="alert">{error}</p>
        {/if}

        <button class="btn btn-primary auth-submit" type="submit" disabled={saving}>
            {saving ? "设置中…" : "设置密码并进入"}
        </button>
    </form>
</AuthPanel>

<style>
    .auth-field {
        margin-top: 16px;
    }

    .auth-hint {
        margin-top: 12px;
        line-height: 1.5;
    }
</style>
