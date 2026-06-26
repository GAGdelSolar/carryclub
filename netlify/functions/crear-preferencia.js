// ── Netlify Function: crear-preferencia.js ───────────────────────────────────
// Crea una preferencia de pago en MercadoPago Checkout Pro.
// El Access Token vive como variable de entorno en Netlify (nunca en el código).
// Variables de entorno requeridas en Netlify:
//   MP_ACCESS_TOKEN  = APP_USR-4975902764377002-...

exports.handler = async function(event) {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'MP_ACCESS_TOKEN no configurado en Netlify' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido' }) };
  }

  const { items, nombre, email, tel, dropNum, back_url } = body;

  // Validaciones mínimas
  if (!items || !items.length || !nombre || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos requeridos' }) };
  }

  // Armar los items para MP
  // Cada item ya viene con: nombre, precio (ARS), cantidad (siempre 1 por producto)
  const mpItems = items.map(item => ({
    title:       item.nombre + (item.talle ? ' — Talle ' + item.talle : '') + (item.color ? ' / ' + item.color : ''),
    quantity:    1,
    unit_price:  Math.round(item.precio * 1.25), // precio con el 25% de cuotas
    currency_id: 'ARS',
  }));

  const totalConRecargo = items.reduce((s, i) => s + Math.round(i.precio * 1.25), 0);

  const base = back_url || 'https://carryclub.netlify.app';
  const dropPath = dropNum ? `/drops/drop${String(dropNum).padStart(3,'0')}.html` : '/';

  const preferencia = {
    items: mpItems,
    payer: {
      name:  nombre,
      email: email,
      phone: tel ? { number: tel } : undefined,
    },
    back_urls: {
      success: base + dropPath + '?pago=aprobado',
      failure: base + dropPath + '?pago=error',
      pending: base + dropPath + '?pago=pendiente',
    },
    auto_return: 'approved',
    payment_methods: {
      installments: 3,        // máximo 3 cuotas
      default_installments: 3,
    },
    statement_descriptor: 'CARRY CLUB',
    external_reference: `DROP${dropNum || '000'}-${Date.now()}`,
    metadata: {
      drop_num: dropNum,
      comprador_nombre: nombre,
      comprador_tel:    tel,
      total_ars:        totalConRecargo,
    },
  };

  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + ACCESS_TOKEN,
        'Content-Type':  'application/json',
        'X-Idempotency-Key': `${Date.now()}-${Math.random()}`,
      },
      body: JSON.stringify(preferencia),
    });

    if (!mpRes.ok) {
      const err = await mpRes.json().catch(() => ({}));
      console.error('MP error:', err);
      return {
        statusCode: mpRes.status,
        body: JSON.stringify({ error: err.message || 'Error en MercadoPago' }),
      };
    }

    const mpData = await mpRes.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        init_point:    mpData.init_point,      // URL de pago (producción)
        sandbox_url:   mpData.sandbox_init_point,
        preference_id: mpData.id,
      }),
    };

  } catch(e) {
    console.error('Error creando preferencia MP:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
