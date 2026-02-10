/**
 * Cloudflare Pages Function для REST API
 * Path: functions/api/update-coords.js
 * 
 * Обновляет координаты игрока
 */

export async function onRequest(context) {
  const { request, env } = context;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { nick, x, y, z } = await request.json();

    if (!nick || x === undefined || z === undefined) {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Обновляем координаты в Durable Object (если используется)
    // или в памяти сервера (для простых случаев)
    
    // Для простого варианта без DO:
    // Координаты синхронизируются через WebSocket напрямую

    return new Response(
      JSON.stringify({ status: 'ok' }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
