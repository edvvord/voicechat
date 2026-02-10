/**
 * Cloudflare Pages Function для WebSocket
 * Path: functions/ws.js
 * 
 * Обрабатывает WebSocket подключения и синхронизирует игроков
 */

// Хранилище активных игроков (в Durable Objects если нужно масштабирование)
const players = new Map();

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // WebSocket upgrade
  if (request.headers.get('upgrade') === 'websocket') {
    return handleWebSocket(request, env);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleWebSocket(request, env) {
  // Получаем ник из URL
  const url = new URL(request.url);
  const nick = url.searchParams.get('nick');

  if (!nick) {
    return new Response('Nick required', { status: 400 });
  }

  // Создаём WebSocket пару
  const { 0: client, 1: server } = new WebSocketPair();

  // Регистрируем игрока
  const player = {
    nick,
    x: 0,
    y: 64,
    z: 0,
    lastUpdate: Date.now(),
    ws: server
  };

  players.set(nick, player);
  console.log(`[${nick}] подключился (всего: ${players.size})`);

  // Отправляем текущий список игроков новому игроку
  broadcastPlayersUpdate();

  // Обработка входящих сообщений
  server.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'audio_chunk') {
        broadcastAudio(data, nick);
      }
    } catch (error) {
      console.error(`Ошибка от ${nick}:`, error);
    }
  };

  // Отключение
  server.onclose = () => {
    players.delete(nick);
    console.log(`[${nick}] отключился (всего: ${players.size})`);
    broadcastPlayersUpdate();
  };

  // Ошибка
  server.onerror = (error) => {
    console.error(`[${nick}] ошибка:`, error);
  };

  server.accept();
  return new Response(null, { status: 101, webSocket: client });
}

// Трансляция обновления координат всем
function broadcastPlayersUpdate() {
  const playersData = Array.from(players.entries()).map(([nick, p]) => ({
    nick,
    x: p.x,
    y: p.y,
    z: p.z
  }));

  const message = JSON.stringify({
    type: 'players_update',
    players: playersData,
    timestamp: Date.now()
  });

  for (const player of players.values()) {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(message);
      } catch (error) {
        console.error('Ошибка отправки:', error);
      }
    }
  }
}

// Трансляция аудио близким игроками
function broadcastAudio(audioMessage, senderNick) {
  const sender = players.get(senderNick);
  if (!sender) return;

  const audioData = {
    type: 'audio_chunk',
    playerNick: senderNick,
    audioData: audioMessage.audioData,
    x: sender.x,
    z: sender.z
  };

  const MAX_DISTANCE = 20;

  for (const [nick, player] of players.entries()) {
    if (nick === senderNick) continue;

    const distance = Math.sqrt(
      Math.pow(player.x - sender.x, 2) +
      Math.pow(player.z - sender.z, 2)
    );

    if (distance <= MAX_DISTANCE && player.ws?.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(JSON.stringify(audioData));
      } catch (error) {
        console.error(`Ошибка отправки для ${nick}:`, error);
      }
    }
  }
}
