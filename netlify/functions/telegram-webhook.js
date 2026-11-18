const crypto = require('node:crypto');
const db = require('../../db');
const { sendTelegramMessage } = require('../../telegram');

function isValidSecret(provided, expected) {
    if (!provided || !expected) return false;
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return providedBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function formatStats() {
    const stats = db.getStats();
    return [
        '📊 Сводка парковки',
        `Загрузка: ${stats.occupancyRate}% (${stats.occupiedCount}/${stats.totalSpots})`,
        `Свободно мест: ${stats.freeCount}`,
        `Выручка: ${stats.totalRevenue.toLocaleString('ru-RU')} сум`,
        `Активные начисления: ${stats.activeAccruedRevenue.toLocaleString('ru-RU')} сум`,
        `Завершённых сессий: ${stats.totalSessions}`
    ].join('\n');
}

function formatRevenue() {
    const stats = db.getStats();
    const recentReceipts = db.getReceipts().slice(0, 3);
    const lines = [
        '💰 Выручка и последние чеки',
        `Выручка: ${stats.totalRevenue.toLocaleString('ru-RU')} сум`,
        `Всего чеков: ${stats.totalSessions}`
    ];

    if (recentReceipts.length) {
        lines.push('', 'Последние чеки:');
        recentReceipts.forEach(receipt => {
            lines.push(
                `${receipt.carPlate}: ${(receipt.totalAmount || 0).toLocaleString('ru-RU')} сум (${receipt.durationFormatted || '—'})`
            );
        });
    }

    return lines.join('\n');
}

exports.handler = async event => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Метод не поддерживается.' };
    }

    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const headers = Object.fromEntries(
        Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
    );
    if (!isValidSecret(headers['x-telegram-bot-api-secret-token'], expectedSecret)) {
        return { statusCode: 401, body: 'Недействительный webhook secret.' };
    }

    let update;
    try {
        const body = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : event.body || '{}';
        update = JSON.parse(body);
    } catch (error) {
        return { statusCode: 400, body: 'Некорректный JSON запроса.' };
    }

    const message = update.message;
    if (!message || !message.chat || !message.text) {
        return { statusCode: 200, body: 'OK' };
    }

    const chatId = String(message.chat.id);
    const command = message.text.trim().split(/\s+/)[0].split('@')[0].toLowerCase();
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    try {
        if (!adminChatId) {
            if (command === '/start') {
                await sendTelegramMessage(
                    chatId,
                    `Бот подключён. Ваш Telegram chat ID: ${chatId}\nДобавьте его в Netlify как TELEGRAM_ADMIN_CHAT_ID, затем повторно разверните сайт.`
                );
            }
            return { statusCode: 200, body: 'OK' };
        }

        if (chatId !== adminChatId) {
            return { statusCode: 200, body: 'OK' };
        }

        const responses = {
            '/start': 'Бот SmartPark активен. Команды: /stats, /revenue, /help',
            '/help': 'Команды администратора:\n/stats — состояние парковки\n/revenue — выручка и чеки',
            '/stats': formatStats(),
            '/revenue': formatRevenue()
        };
        const reply = responses[command];
        if (reply) {
            await sendTelegramMessage(chatId, reply);
        }
        return { statusCode: 200, body: 'OK' };
    } catch (error) {
        console.error('Ошибка обработки webhook Telegram:', error);
        return { statusCode: 500, body: 'Не удалось обработать сообщение Telegram.' };
    }
};
