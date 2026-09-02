/**
 * Proxy simples para o Escaneia Patrimônio.
 *
 * Ele existe só para resolver o bloqueio de CORS: o navegador não deixa o
 * app (hospedado no GitHub Pages) buscar diretamente uma página de
 * e-estado.ro.gov.br em segundo plano. Este Worker roda no servidor da
 * Cloudflare, busca a página por você (servidor-a-servidor não tem
 * bloqueio de CORS) e devolve o resultado para o app com os cabeçalhos
 * corretos.
 *
 * Só repassa pedidos para o domínio e-estado.ro.gov.br — qualquer outro
 * endereço é recusado, para o proxy não virar uma porta aberta para
 * qualquer site.
 *
 * (Os registros e as fotos NÃO passam mais por aqui — agora ficam no
 * Supabase, o mesmo usado pelo Radar de Investimentos. Este Worker cuidava
 * disso antes; se você já tinha configurado D1/R2/Cron Trigger pra esse
 * fim, pode deixar como está sem problema, só não é mais usado.)
 */

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

const ALLOWED_HOST = 'e-estado.ro.gov.br';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get('url');

  if (!target) {
    return new Response('Parâmetro "url" ausente. Use assim: ?url=https://e-estado.ro.gov.br/publico/bens/31290158', {
      status: 400,
      headers: CORS_HEADERS
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    return new Response('URL inválida.', { status: 400, headers: CORS_HEADERS });
  }

  if (targetUrl.hostname !== ALLOWED_HOST) {
    return new Response('Domínio não permitido. Este proxy só busca páginas de ' + ALLOWED_HOST + '.', {
      status: 403,
      headers: CORS_HEADERS
    });
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EscaneiaPatrimonioBot/1.0)' }
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8'
      }
    });
  } catch (e) {
    return new Response('Erro ao buscar o site do governo: ' + (e && e.message ? e.message : String(e)), {
      status: 502,
      headers: CORS_HEADERS
    });
  }
}
