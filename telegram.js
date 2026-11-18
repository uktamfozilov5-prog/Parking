async function sendTelegramMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('Не задана переменная окружения TELEGRAM_BOT_TOKEN.');
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(5000)
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
        throw new Error(`Telegram API: ${result.description || response.statusText}`);
    }
}

async function notifyAdmin(text) {
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
        return;
    }

    try {
        await sendTelegramMessage(chatId, text);
    } catch (error) {
        console.error('Не удалось отправить уведомление Telegram:', error);
    }
}

module.exports = { notifyAdmin, sendTelegramMessage };
