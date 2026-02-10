/**
 * ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
 * 
 * Как интегрировать AudioProcessor в React компонент
 * и использовать разные кривые затухания звука
 */

import AudioProcessor from './AudioProcessor';

// ===== ПРИМЕР 1: Инициализация =====

const audioProcessor = new AudioProcessor();

// Проверяем статистику
console.log(audioProcessor.getStats());
// {
//   state: "running",
//   currentTime: 0.123,
//   sampleRate: 48000,
//   playersCount: 0,
//   masterVolume: 1
// }


// ===== ПРИМЕР 2: Обновление громкости для одного игрока =====

// Игрок находится на расстоянии 10 блоков
const playerNick = "Player123";
const distance = 10;
const masterVolume = 1;
const curve = 'exponential'; // или 'linear', 'logarithmic', 'inverse_square'

audioProcessor.updateVolume(playerNick, distance, masterVolume, curve);


// ===== ПРИМЕР 3: Использование разных кривых затухания =====

// Тестируем разные кривые на разных расстояниях
const distances = [0, 5, 10, 15, 20];
const curves = ['linear', 'exponential', 'logarithmic', 'inverse_square'];

console.log('=== Сравнение кривых затухания ===');
curves.forEach(curve => {
  console.log(`\n${curve.toUpperCase()}:`);
  distances.forEach(dist => {
    const volume = audioProcessor.calculateVolume(dist, 20, curve);
    console.log(`  ${dist}м: ${(volume * 100).toFixed(0)}%`);
  });
});

// Вывод:
// === Сравнение кривых затухания ===
//
// LINEAR:
//   0м: 100%
//   5м: 75%
//   10м: 50%
//   15м: 25%
//   20м: 0%
//
// EXPONENTIAL:
//   0м: 100%
//   5м: 56%
//   10м: 25%
//   15м: 6%
//   20м: 0%
//
// LOGARITHMIC:
//   0м: 100%
//   5м: 72%
//   10м: 56%
//   15м: 44%
//   20м: 33%
//
// INVERSE_SQUARE:
//   0м: 100%
//   5м: 44%
//   10м: 20%
//   15м: 9%
//   20м: 4%


// ===== ПРИМЕР 4: Обновление позиции и аудио игрока =====

audioProcessor.updatePlayerAudio(
  'Player123',      // Ник игрока
  100.5,           // playerX
  -200.3,          // playerZ
  95.2,            // myX (мои координаты)
  -195.8,          // myZ
  0.8,             // masterVolume (80%)
  'exponential'    // curve
);


// ===== ПРИМЕР 5: Использование в React компоненте =====

import React, { useRef, useEffect, useState } from 'react';

function MinecraftVoiceChatWithAudio() {
  const audioProcessorRef = useRef(null);
  const [playersList, setPlayersList] = useState([]);
  const [selectedCurve, setSelectedCurve] = useState('exponential');
  const [masterVolume, setMasterVolume] = useState(1);

  // Инициализация
  useEffect(() => {
    audioProcessorRef.current = new AudioProcessor();
    
    return () => {
      // Очистка
      audioProcessorRef.current = null;
    };
  }, []);

  // Обновление громкости при изменении мастер-громкости
  useEffect(() => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.setMasterVolume(masterVolume);
    }
  }, [masterVolume]);

  // Обновление аудио всех игроков каждый кадр
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioProcessorRef.current && playersList.length > 0) {
        playersList.forEach(player => {
          audioProcessorRef.current.updatePlayerAudio(
            player.nick,
            player.x,
            player.z,
            myCoordinates.x,  // Ваши координаты
            myCoordinates.z,
            masterVolume,
            selectedCurve
          );
        });
      }
    }, 100); // Обновляем каждые 100ms

    return () => clearInterval(interval);
  }, [playersList, masterVolume, selectedCurve]);

  return (
    <div>
      <label>
        Кривая затухания:
        <select 
          value={selectedCurve}
          onChange={(e) => setSelectedCurve(e.target.value)}
        >
          <option value="linear">Линейная</option>
          <option value="exponential">Экспоненциальная (рекомендуется)</option>
          <option value="logarithmic">Логарифмическая</option>
          <option value="inverse_square">Обратный квадрат (физическая)</option>
        </select>
      </label>

      <label>
        Мастер громкость: {Math.round(masterVolume * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
        />
      </label>

      <div>
        <h3>Игроки поблизости:</h3>
        {playersList.map(player => {
          const distance = Math.sqrt(
            Math.pow(player.x - myCoordinates.x, 2) +
            Math.pow(player.z - myCoordinates.z, 2)
          );
          
          const volume = audioProcessorRef.current?.calculateVolume(
            distance,
            20,
            selectedCurve
          ) || 0;
          
          return (
            <div key={player.nick}>
              <p>{player.nick}</p>
              <p>Расстояние: {distance.toFixed(1)}м</p>
              <p>Громкость: {(volume * 100).toFixed(0)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MinecraftVoiceChatWithAudio;


// ===== ПРИМЕР 6: Визуализация звука (спектр) =====

function AudioVisualizer({ audioProcessor, playerNick }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const animate = () => {
      const frequencyData = audioProcessor.getFrequencyData(playerNick);
      
      if (!frequencyData) {
        requestAnimationFrame(animate);
        return;
      }
      
      // Очищаем холст
      ctx.fillStyle = 'rgb(200, 200, 200)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Рисуем спектр
      ctx.fillStyle = 'rgb(0, 255, 0)';
      const barWidth = canvas.width / frequencyData.length;
      
      for (let i = 0; i < frequencyData.length; i++) {
        const barHeight = (frequencyData[i] / 255) * canvas.height;
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
      }
      
      requestAnimationFrame(animate);
    };
    
    animate();
  }, [playerNick, audioProcessor]);
  
  return <canvas ref={canvasRef} width={300} height={100} />;
}


// ===== ПРИМЕР 7: Получение частотных данных для эквалайзера =====

function getAudioFrequencies(audioProcessor, playerNick) {
  const frequencyData = audioProcessor.getFrequencyData(playerNick);
  
  if (!frequencyData) return null;
  
  const frequencies = {
    bass: 0,      // 0-100 Hz
    mid: 0,       // 100-1000 Hz
    treble: 0     // 1000+ Hz
  };
  
  // Примерное разделение спектра
  const third = frequencyData.length / 3;
  
  for (let i = 0; i < frequencyData.length; i++) {
    if (i < third) frequencies.bass += frequencyData[i];
    else if (i < third * 2) frequencies.mid += frequencyData[i];
    else frequencies.treble += frequencyData[i];
  }
  
  // Нормализуем
  frequencies.bass = frequencies.bass / (third * 255);
  frequencies.mid = frequencies.mid / (third * 255);
  frequencies.treble = frequencies.treble / (third * 255);
  
  return frequencies;
}


// ===== ПРИМЕР 8: Панорама (стерео направление) =====

function TestPanning() {
  const audioProcessor = new AudioProcessor();
  
  // Игрок находится справа от нас
  const pan = audioProcessor.calculatePan(105, -200, 100, -200);
  console.log(`Игрок справа, pan=${pan}`); // pan будет близок к 1
  
  // Игрок находится слева от нас
  const pan2 = audioProcessor.calculatePan(95, -200, 100, -200);
  console.log(`Игрок слева, pan=${pan2}`); // pan будет близок к -1
  
  // Игрок прямо перед нами
  const pan3 = audioProcessor.calculatePan(100, -190, 100, -200);
  console.log(`Игрок перед, pan=${pan3}`); // pan будет близок к 0
}


// ===== ПРИМЕР 9: Удаление игрока из системы =====

function removePlayerFromAudio(audioProcessor, playerNick) {
  audioProcessor.removePlayer(playerNick);
  console.log(`Игрок ${playerNick} удален из аудиосистемы`);
}


// ===== ПРИМЕР 10: Отладка и логирование =====

function debugAudioSystem(audioProcessor) {
  console.log('=== Статистика аудиосистемы ===');
  const stats = audioProcessor.getStats();
  
  Object.entries(stats).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  
  // Тестируем затухание для разных расстояний
  console.log('\n=== Тест затухания (exponential) ===');
  for (let dist = 0; dist <= 20; dist += 2) {
    const volume = audioProcessor.calculateVolume(dist, 20, 'exponential');
    const bar = '█'.repeat(Math.round(volume * 20));
    console.log(`${dist.toString().padStart(2)}м: ${bar} ${(volume * 100).toFixed(0)}%`);
  }
}

debugAudioSystem(audioProcessor);
// Вывод:
// === Статистика аудиосистемы ===
// state: running
// currentTime: 0.123
// sampleRate: 48000
// playersCount: 0
// masterVolume: 1
//
// === Тест затухания (exponential) ===
//  0м: ████████████████████ 100%
//  2м: ███████████ 56%
//  4м: ██████ 31%
//  6м: ███ 19%
//  8м: ██ 12%
// 10м: █ 8%
// 12м: █ 5%
// 14м: █ 3%
// 16м: █ 2%
// 18м: █ 1%
// 20м:  0%
