<script>
    let { open = false, title = "", size = "default", onClose = () => {}, children } = $props();

    let dialogEl = $state(null);

    const FOCUSABLE =
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    $effect(() => {
        if (!open) {
            return;
        }

        const lastFocused = document.activeElement;
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        queueMicrotask(() => {
            if (!dialogEl) {
                return;
            }

            const preferred = dialogEl.querySelector("[data-autofocus]");

            if (preferred) {
                preferred.focus();
            } else {
                dialogEl.focus();
            }
        });

        const handleKeydown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== "Tab" || !dialogEl) {
                return;
            }

            const items = [...dialogEl.querySelectorAll(FOCUSABLE)].filter(
                (element) => element.offsetParent !== null
            );

            if (items.length === 0) {
                event.preventDefault();
                dialogEl.focus();
                return;
            }

            const first = items[0];
            const last = items[items.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener("keydown", handleKeydown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeydown);

            if (lastFocused instanceof HTMLElement) {
                lastFocused.focus();
            }
        };
    });

    function handleOverlayClick(event) {
        if (event.target === event.currentTarget) {
            onClose();
        }
    }
</script>

{#if open}
    <div class="modal-overlay" role="presentation" onclick={handleOverlayClick}>
        <div
            class="modal"
            class:modal-wide={size === "lg"}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabindex="-1"
            bind:this={dialogEl}
        >
            <header class="modal-header">
                <h2 class="modal-title">{title}</h2>
                <button class="modal-close" type="button" aria-label="关闭" onclick={onClose}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
                        <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                </button>
            </header>
            <div class="modal-body">
                {@render children()}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgb(19 20 22 / 46%);
    }

    .modal {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 640px;
        max-height: min(84svh, 780px);
        border: 1px solid var(--border);
        border-radius: var(--radius-sheet);
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 24px 60px rgb(19 20 22 / 20%);
        outline: none;
        animation: modal-in 140ms var(--ease-out);
    }

    .modal-wide {
        max-width: 780px;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 56px;
        padding: 0 16px 0 20px;
        border-bottom: 1px solid var(--rule);
        flex: none;
    }

    .modal-title {
        margin: 0;
        font-size: var(--fs-section);
        font-weight: 600;
    }

    .modal-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: var(--radius-control);
        background: transparent;
        color: var(--muted);
    }

    .modal-close:hover {
        background: var(--raised);
        color: var(--text);
    }

    .modal-close svg {
        width: 18px;
        height: 18px;
        stroke-width: 1.6;
    }

    .modal-body {
        flex: 1;
        min-height: 0;
        padding: 20px;
        overflow-y: auto;
    }

    @keyframes modal-in {
        from {
            opacity: 0;
            transform: translateY(8px) scale(0.99);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    @media (max-width: 600px) {
        .modal-overlay {
            align-items: flex-end;
            padding: 0;
        }

        .modal {
            max-height: 92svh;
            border-right: 0;
            border-bottom: 0;
            border-left: 0;
            border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
        }

        .modal-body {
            padding: 16px;
        }
    }
</style>
