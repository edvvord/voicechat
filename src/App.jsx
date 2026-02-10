import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, Users, Radio, Settings, MapPin, Wifi, WifiOff } from 'lucide-react';

export default function MinecraftVoiceChat() {
  const [nickname, setNickname] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [nearbyPlayers, setNearbyPlayers] = useState([]);
  const [masterVolume, setMasterVolume] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected, connecting, connected
  const [myCoordinates, setMyCoordinates] = useState({ x: 0, z: 0 });
  
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef({});
  const gainNodesRef = useRef({});
  const playerCoordinatesRef = useRef({});
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Загрузка аудиоустройств
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const inputs = devices.filter(d => d.kind === 'audioinput');
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        
        setInputDevices(inputs);
        setOutputDevices(outputs);
        
        if (inputs.length > 0 && !selectedInput) setSelectedInput(inputs[0].deviceId);
        if (outputs.length > 0 && !selectedOutput) setSelectedOutput(outputs[0].deviceId);
      } catch (error) {
        console.error('Ошибка при загрузке устройств:', error);
      }
    };

    loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
  }, []);

  // Инициализация Web Audio API
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
  }, []);

  // Подключение к серверу
  const handleConnect = async () => {
    if (!nickname.trim()) {
      alert('Введите ник!');
      return;
    }

    setConnectionStatus('connecting');

    try {
      // Получаем микрофон
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedInput } },
        video: false
      });

      localStreamRef.current = stream;

      // Определяем URL Worker
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?nick=${encodeURIComponent(nickname)}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionStatus('connected');
        setIsConnected(true);
        console.log('✓ Подключено к серверу');

        // Начинаем запись аудио
        startAudioRecording(stream);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'players_update') {
            playerCoordinatesRef.current = {};
            data.players.forEach(p => {
              playerCoordinatesRef.current[p.nick] = { x: p.x, z: p.z };
            });
            updateNearbyPlayers(data.players);
          } else if (data.type === 'audio_chunk') {
            handleRemoteAudio(data);
          }
        } catch (error) {
          console.error('Ошибка парсинга:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('✗ Ошибка WebSocket:', error);
        setConnectionStatus('disconnected');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('Отключено от сервера');
        setConnectionStatus('disconnected');
        setIsConnected(false);
        localStreamRef.current?.getTracks().forEach(track => track.stop());
      };

      wsRef.current = ws;
    } catch (error) {
      alert('✗ Ошибка доступа к микрофону: ' + error.message);
      setConnectionStatus('disconnected');
    }
  };

  // Запись и отправка аудио
  const startAudioRecording = (stream) => {
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (audioChunksRef.current.length === 0) return;

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];

      // Конвертируем в base64 и отправляем
      const reader = new FileReader();
      reader.onload = () => {
        const base64Audio = reader.result.split(',')[1];
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'audio_chunk',
            audioData: base64Audio
          }));
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    mediaRecorder.start(100); // Отправляем аудио порциями по 100ms
    mediaRecorderRef.current = mediaRecorder;
  };

  // Обновление списка близких игроков
  const updateNearbyPlayers = (allPlayers) => {
    const myData = allPlayers.find(p => p.nick === nickname);
    if (myData) {
      setMyCoordinates({ x: myData.x, z: myData.z });
    }

    const nearby = allPlayers
      .filter(p => p.nick !== nickname)
      .map(p => ({
        ...p,
        distance: myData ? Math.sqrt(
          Math.pow(p.x - myData.x, 2) +
          Math.pow(p.z - myData.z, 2)
        ) : 999
      }))
      .filter(p => p.distance <= 20)
      .sort((a, b) => a.distance - b.distance);

    setNearbyPlayers(nearby);
  };

  // Обработка аудио от других игроков
  const handleRemoteAudio = (data) => {
    const { playerNick, audioData, x, z } = data;

    if (!playerCoordinatesRef.current[nickname]) return;

    const distance = Math.sqrt(
      Math.pow(x - playerCoordinatesRef.current[nickname].x, 2) +
      Math.pow(z - playerCoordinatesRef.current[nickname].z, 2)
    );

    const volume = Math.max(0, 1 - (distance / 20));

    if (!remoteAudioRef.current[playerNick]) {
      const audio = new Audio();
      audio.id = `audio-${playerNick}`;
      audio.crossOrigin = 'anonymous';
      document.body.appendChild(audio);
      remoteAudioRef.current[playerNick] = audio;

      const source = audioContextRef.current.createMediaElementAudioSource(audio);
      const gainNode = audioContextRef.current.createGain();
      
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      gainNodesRef.current[playerNick] = gainNode;
    }

    const gainNode = gainNodesRef.current[playerNick];
    if (gainNode) {
      gainNode.gain.setValueAtTime(volume * masterVolume, audioContextRef.current.currentTime);
    }

    if (audioData) {
      const audio = remoteAudioRef.current[playerNick];
      audio.src = `data:audio/webm;base64,${audioData}`;
      audio.play().catch(e => console.error('Ошибка проигрывания:', e));
    }
  };

  // Отключение
  const handleDisconnect = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    wsRef.current?.close();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setNearbyPlayers([]);
  };

  // Смена выходного устройства
  const handleOutputChange = async (deviceId) => {
    setSelectedOutput(deviceId);
    Object.values(remoteAudioRef.current).forEach(audio => {
      if (audio.setSinkId) {
        audio.setSinkId(deviceId).catch(e => console.error('Ошибка:', e));
      }
    });
  };

  const statusColor = {
    disconnected: 'text-red-400',
    connecting: 'text-yellow-400',
    connected: 'text-green-400'
  }[connectionStatus];

  const statusIcon = {
    disconnected: <WifiOff className="w-4 h-4" />,
    connecting: <Wifi className="w-4 h-4 animate-pulse" />,
    connected: <Wifi className="w-4 h-4" />
  }[connectionStatus];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Radio className="w-8 h-8 text-green-400 animate-pulse" />
            <h1 className="text-4xl font-bold">Minecraft Voice Chat</h1>
          </div>
          <p className="text-gray-400">Локальный голосовой чат в игре</p>
          <div className={`flex items-center justify-center gap-2 mt-2 ${statusColor}`}>
            {statusIcon}
            <span className="text-sm font-medium">
              {connectionStatus === 'connected' && 'Подключено'}
              {connectionStatus === 'connecting' && 'Подключение...'}
              {connectionStatus === 'disconnected' && 'Отключено'}
            </span>
          </div>
        </div>

        {/* Главная карточка */}
        <div className="bg-gray-800 rounded-lg p-8 shadow-2xl border border-gray-700 mb-6">
          {!isConnected ? (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Ваш ник</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Введите ник..."
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                    disabled={isConnected}
                    onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <Mic className="w-4 h-4" /> Микрофон (Input)
                  </label>
                  <select
                    value={selectedInput}
                    onChange={(e) => setSelectedInput(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                    disabled={isConnected || inputDevices.length === 0}
                  >
                    {inputDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Микрофон ${device.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                    <Volume2 className="w-4 h-4" /> Динамики (Output)
                  </label>
                  <select
                    value={selectedOutput}
                    onChange={(e) => handleOutputChange(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
                    disabled={outputDevices.length === 0}
                  >
                    {outputDevices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Динамики ${device.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={!nickname.trim() || inputDevices.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
              >
                Подключиться
              </button>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-400">Вы подключены как</p>
                    <p className="text-2xl font-bold text-green-400">{nickname}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-300">Online</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Мастер громкость
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={masterVolume}
                      onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-medium w-8">{Math.round(masterVolume * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="flex items-center gap-2 text-lg font-bold mb-4">
                  <Users className="w-5 h-5 text-blue-400" />
                  Игроки поблизости ({nearbyPlayers.length})
                </h2>
                
                {nearbyPlayers.length > 0 ? (
                  <div className="space-y-3">
                    {nearbyPlayers.map(player => (
                      <div key={player.nick} className="bg-gray-700 p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{player.nick}</span>
                          <span className="text-xs text-gray-400">
                            {player.distance.toFixed(1)} блоков
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                          <MapPin className="w-3 h-3" />
                          <span>X: {player.x.toFixed(1)}, Z: {player.z.toFixed(1)}</span>
                        </div>
                        <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{
                              width: `${((20 - player.distance) / 20) * 100}%`,
                              transition: 'width 0.3s ease'
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Нет игроков поблизости</p>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Устройства
                </button>

                {showSettings && (
                  <div className="bg-gray-700 p-4 rounded-lg space-y-3">
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Микрофон</p>
                      <select
                        value={selectedInput}
                        onChange={(e) => setSelectedInput(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none"
                      >
                        {inputDevices.map(device => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Микрофон`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400 mb-1">Динамики</p>
                      <select
                        value={selectedOutput}
                        onChange={(e) => handleOutputChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none"
                      >
                        {outputDevices.map(device => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Динамики`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleDisconnect}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors"
                >
                  Отключиться
                </button>
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-sm text-gray-400">
          <p className="mb-2"><strong>⚡ Полностью на Cloudflare:</strong></p>
          <ul className="space-y-1 text-xs">
            <li>• Workers + Durable Objects для всей логики</li>
            <li>• Pages для фронтенда</li>
            <li>• WebSocket для real-time соединения</li>
            <li>• Никаких внешних серверов!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
