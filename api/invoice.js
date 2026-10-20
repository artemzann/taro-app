// Создаёт счёт на оплату в Telegram Stars для мини-приложения.
// Мини-приложение отправляет сюда { kind, initData }, а получает { link }.
const crypto = require('crypto');

// Цены в звёздах. Если меняете здесь, поменяйте и PRICES в index.html, чтобы цифры на кнопках совпадали.
const PRODUCTS = {
  three: { amount: 25, title: 'Расклад «Три карты»', description: 'Прошлое, настоящее и будущее: расклад на три карты.' },
  yesno: { amount: 10, title: 'Расклад «Да или нет»', description: 'Короткий ответ карт на ваш вопрос.' }
};

// Проверяем, что запрос пришёл из настоящего Telegram, а не подделан
function checkInitData(initData, token) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (calc !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (Date.now() / 1000 - authDate > 86400) return null; // данные старше суток не принимаем
  try { return JSON.parse(params.get('user') || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'BOT_TOKEN is not set' });

  const { kind, initData } = req.body || {};
  const product = PRODUCTS[kind];
  if (!product) return res.status(400).json({ error: 'Unknown product' });

  const user = checkInitData(initData || '', token);
  if (!user) return res.status(401).json({ error: 'Bad initData' });

  const r = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: product.title,
      description: product.description,
      payload: JSON.stringify({ k: kind, u: user.id || 0, t: Date.now() }),
      currency: 'XTR', // XTR = Telegram Stars
      prices: [{ label: product.title, amount: product.amount }]
    })
  });
  const j = await r.json();
  if (!j.ok) return res.status(502).json({ error: j.description || 'Telegram error' });
  return res.status(200).json({ link: j.result });
};

module.exports.checkInitData = checkInitData;
