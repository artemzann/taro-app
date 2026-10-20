// Принимает события от Telegram: подтверждает оплату, отвечает на /start и /paysupport.
// Один раз после выкладки откройте в браузере:
//   https://ВАШ-АДРЕС.vercel.app/api/webhook?setup=ВАШ_WEBHOOK_SECRET
// Это подключит бота к этому адресу.

async function api(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

module.exports = async (req, res) => {
  const token = process.env.BOT_TOKEN;
  const secret = process.env.WEBHOOK_SECRET;
  const support = process.env.SUPPORT_CONTACT || '';
  if (!token || !secret) return res.status(500).send('BOT_TOKEN or WEBHOOK_SECRET is not set');

  const appUrl = `https://${req.headers.host}`;

  // Разовая настройка вебхука из браузера
  if (req.method === 'GET') {
    if ((req.query && req.query.setup) !== secret) return res.status(403).send('forbidden');
    const result = await api(token, 'setWebhook', {
      url: `${appUrl}/api/webhook`,
      secret_token: secret,
      allowed_updates: ['message', 'pre_checkout_query']
    });
    return res.status(200).json(result);
  }

  // Принимаем только запросы от Telegram
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(403).end();

  const update = req.body || {};

  try {
    // Telegram спрашивает: «можно проводить оплату?» Отвечать нужно за 10 секунд, иначе платёж не пройдёт.
    if (update.pre_checkout_query) {
      await api(token, 'answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
    } else if (update.message) {
      const m = update.message;
      const chat_id = m.chat.id;
      const text = m.text || '';

      if (m.successful_payment) {
        console.log('PAID', JSON.stringify({ user: m.from && m.from.id, ...m.successful_payment }));
        await api(token, 'sendMessage', { chat_id, text: 'Спасибо за покупку! ✨ Ваш расклад уже открыт в приложении.' });
      } else if (text.startsWith('/paysupport')) {
        await api(token, 'sendMessage', {
          chat_id,
          text: 'Вопросы по оплате: ' + (support || 'ответьте на это сообщение') +
            '. Напишите, какой расклад покупали и когда, мы разберёмся и при необходимости вернём звёзды.'
        });
      } else {
        await api(token, 'sendMessage', {
          chat_id,
          text: 'Привет! 🔮 Здесь бесплатная карта дня и расклады таро. Нажмите кнопку ниже, чтобы открыть приложение.',
          reply_markup: { inline_keyboard: [[{ text: '🔮 Открыть Таро', web_app: { url: appUrl } }]] }
        });
      }
    }
  } catch (e) {
    console.error(e);
  }
  return res.status(200).end();
};
