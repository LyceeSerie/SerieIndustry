<template>
    <a :href="url" target="_blank" class="contact-card">
        <img :src="icon" alt="" class="contact-icon" />

        <div class="contact-title">{{ title }}</div>
        <div class="contact-id">{{ id }}</div>
    </a>
</template>

<script setup>
    defineProps({
        icon: String,   // アイコン画像URL
        title: String,  // タイトル（Twitter / Discordなど）
        id: String,     // 表示するID
        url: String     // 遷移先
    })
</script>

<style scoped>
    .contact-card {
        width: 260px;
        padding: 20px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        text-decoration: none;
        color: #000;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        background: #fff;
        transition: 0.2s ease;
    }

    .contact-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    }

    .contact-icon {
        width: 48px;
        height: 48px;
    }

    .contact-title {
        font-size: 1.2rem;
        font-weight: 600;
    }

    .contact-id {
        font-size: 0.95rem;
        color: #4b5563;
    }
</style>