const db = require('../../db');
const { sendTelegramMessage } = require('../../telegram');

exports.config = {
    schedule: '0 4 * * *'
};

exports.handler = async () => {
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!chatId) {
        throw new Error('Не задана переменная окружения TELEGRAM_ADMIN_CHAT_ID.');
    }

    const stats = db.getStats();
    const report = [
        '☀️ Ежедневный отчёт SmartPark',
        `Загрузка парковки: ${stats.occupancyRate}%`,
        `Занято: ${stats.occupiedCount} из ${stats.totalSpots}, свободно: ${stats.freeCount}`,
        `Выручка: ${stats.totalRevenue.toLocaleString('ru-RU')} сум`,
        `Активные начисления: ${stats.activeAccruedRevenue.toLocaleString('ru-RU')} сум`,
        `Завершённых чеков: ${stats.totalSessions}`
    ].join('\n');

    await sendTelegramMessage(chatId, report);
    return { statusCode: 200, body: 'Ежедневный отчёт отправлен.' };
};
