// ── Cloudflare Pages Function: crear-preferencia.js ──────────────────────────
// Ubicación en el repo: functions/crear-preferencia.js
// URL automática:       /crear-preferencia
// Variable de entorno:  MP_ACCESS_TOKEN  (configurar en Cloudflare Pages → Settings → Variables)

export async function onRequestPost(context) {
  const { request, env } = context;

  const ACCESS_TOKEN = env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return Response.json({ error: 'MP_ACCESS_TOKEN no configurado en Cloudflare' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch(e) {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { items, nombre, email, tel, dropNum, back_url } = body;

  if (!items || !items.length || !nombre || !email) {
    return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 });
  }

  // El precio que llega en item.precio es el precio final publicado en el drop
  // (mismo valor que se muestra para transferencia y para MP en 1 pago).
  // No se aplica ningún recargo: lo que se cobra acá tiene que coincidir 1 a 1
  // con lo que el cliente vio en la web.
  const mpItems = items.map(item => ({
    title:       item.nombre + (item.talle ? ' — Talle ' + item.talle : '') + (item.color ? ' / ' + item.color : ''),
    quantity:    1,
    unit_price:  Math.round(item.precio),
    currency_id: 'ARS',
  }));

  const totalFinal = items.reduce((s, i) => s + Math.round(i.precio), 0);

  const base = back_url || 'https://carryclub-ar.pages.dev';
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
      installments: 1,
      default_installments: 1,
    },
    statement_descriptor: 'CARRY CLUB',
    external_reference: `DROP${dropNum || '000'}-${Date.now()}`,
    metadata: {
      drop_num:          dropNum,
      comprador_nombre:  nombre,
      comprador_tel:     tel,
      total_ars:         totalFinal,
    },
  };

  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: {
        'Authorization':     'Bearer ' + ACCESS_TOKEN,
        'Content-Type':      'application/json',
        'X-Idempotency-Key': `${Date.now()}-${Math.random()}`,
      },
      body: JSON.stringify(preferencia),
    });

    if (!mpRes.ok) {
      const err = await mpRes.json().catch(() => ({}));
      return Response.json({ error: err.message || 'Error en MercadoPago' }, { status: mpRes.status });
    }

    const mpData = await mpRes.json();

    return Response.json({
      init_point:    mpData.init_point,
      sandbox_url:   mpData.sandbox_init_point,
      preference_id: mpData.id,
    });

  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// Rechazar métodos que no sean POST
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  return onRequestPost(context);
}
