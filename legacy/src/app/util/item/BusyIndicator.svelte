<!-- BusyIndicator.svelte -->
<div class="verify-box">
    <div class="spinner"></div>
    <div class="msg">
        <slot />
    </div>
</div>

<style>
    .verify-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 4px solid rgba(255, 255, 255, 0.2);
        border-top: 4px solid #ffffff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
