exports.handler = async event => {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return jsonResponse(400, { error: 'Некорректные данные' });
    }

    if (body.website) {
        return jsonResponse(400, { error: 'Некорректные данные' });
    }

    const fields = {
        name: cleanText(body.name, 100),
        phone: cleanText(body.phone, 30),
        car: cleanText(body.car, 30),
        comment: cleanText(body.comment, 1000)
    };

    if (!fields.name || !fields.phone || !fields.car) {
        return jsonResponse(400, { error: 'Заполните обязательные поля' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.error('Отсутствуют TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID');
        return jsonResponse(500, { error: 'Сервис временно недоступен' });
    }

    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const text = [
        '🅿️ Новая заявка SmartParking',
        `Имя: ${escapeHtml(fields.name)}`,
        `Телефон: ${escapeHtml(fields.phone)}`,
        `Авто: ${escapeHtml(fields.car)}`,
        `Комментарий: ${escapeHtml(fields.comment || '-')}`,
        `Время: ${escapeHtml(time)}`
    ].join('\n');

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }),
            signal: AbortSignal.timeout(10000)
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
            console.error('Telegram API error:', result.description || response.statusText);
            return jsonResponse(502, { error: 'Не удалось отправить заявку' });
        }

        return jsonResponse(200, { ok: true });
    } catch (error) {
        console.error('Ошибка отправки заявки:', error);
        return jsonResponse(502, { error: 'Не удалось отправить заявку' });
    }
};

function cleanText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(body)
    };
}
