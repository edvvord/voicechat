/**
 * AudioProcessor.js
 * Модуль для обработки аудио с эффектами затухания по дистанции
 * и пространственной обработки звука
 */

class AudioProcessor {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.gainNodes = new Map(); // { playerNick: GainNode }
    this.pannerNodes = new Map(); // { playerNick: PannerNode }
    this.analyzerNodes = new Map(); // { playerNick: AnalyserNode }
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = 1;
    
    // Для визуализации
    this.frequencyData = new Map();
  }

  /**
   * Создает аудиоцепочку для удаленного игрока
   * Вход → Gain (громкость) → Panner (панорама) → Analyser → Master
   */
  createAudioChain(playerNick) {
    const source = this.audioContext.createMediaElementAudioSource(
      new Audio()
    );
    
    const gainNode = this.audioContext.createGain();
    const pannerNode = this.audioContext.createStereoPanner();
    const analyserNode = this.audioContext.createAnalyser();
    
    analyserNode.fftSize = 256;
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    this.frequencyData.set(playerNick, dataArray);
    
    // Подключаем цепочку
    source.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(analyserNode);
    analyserNode.connect(this.masterGain);
    
    this.gainNodes.set(playerNick, gainNode);
    this.pannerNodes.set(playerNick, pannerNode);
    this.analyzerNodes.set(playerNick, analyserNode);
    
    return source;
  }

  /**
   * Вычисляет громкость на основе расстояния
   * 
   * Поддерживает разные кривые затухания:
   * - linear: линейное затухание
   * - exponential: экспоненциальное (более естественное)
   * - logarithmic: логарифмическое (как в реальности)
   */
  calculateVolume(distance, maxDistance = 20, curve = 'exponential') {
    const ratio = Math.min(distance / maxDistance, 1);
    
    switch (curve) {
      case 'linear':
        return Math.max(0, 1 - ratio);
        
      case 'exponential':
        // Быстрее затухает на дальних расстояниях
        return Math.pow(1 - ratio, 2);
        
      case 'logarithmic':
        // Более естественное затухание (как в реальности)
        if (distance === 0) return 1;
        return Math.max(0, 1 - Math.log(distance + 1) / Math.log(maxDistance + 1));
        
      case 'inverse_square':
        // Физически точное затухание (как звук в открытом пространстве)
        if (distance === 0) return 1;
        return 1 / Math.pow(distance / maxDistance + 1, 2);
        
      default:
        return Math.max(0, 1 - ratio);
    }
  }

  /**
   * Обновляет громкость для игрока с учетом расстояния
   * @param {string} playerNick
   * @param {number} distance в блоках
   * @param {number} masterVolume глобальная громкость (0-1)
   * @param {string} curve тип кривой затухания
   */
  updateVolume(playerNick, distance, masterVolume = 1, curve = 'exponential') {
    const gainNode = this.gainNodes.get(playerNick);
    if (!gainNode) return;
    
    const volume = this.calculateVolume(distance, 20, curve) * masterVolume;
    
    // Плавное изменение громкости (500ms)
    gainNode.gain.setTargetAtTime(
      volume,
      this.audioContext.currentTime,
      0.1
    );
  }

  /**
   * Вычисляет пространственную панораму на основе координат
   * Дает впечатление, откуда приходит звук (слева/справа)
   */
  calculatePan(playerX, playerZ, myX, myZ) {
    const dx = playerX - myX;
    const angle = Math.atan2(dx, 0);
    
    // Нормализуем к диапазону [-1, 1]
    const pan = Math.sin(angle);
    return Math.max(-1, Math.min(1, pan));
  }

  /**
   * Обновляет панораму для игрока
   */
  updatePan(playerNick, playerX, playerZ, myX, myZ) {
    const pannerNode = this.pannerNodes.get(playerNick);
    if (!pannerNode) return;
    
    const pan = this.calculatePan(playerX, playerZ, myX, myZ);
    pannerNode.pan.setValueAtTime(pan, this.audioContext.currentTime);
  }

  /**
   * Получает текущие частоты для визуализации
   */
  getFrequencyData(playerNick) {
    const analyserNode = this.analyzerNodes.get(playerNick);
    if (!analyserNode) return null;
    
    const dataArray = this.frequencyData.get(playerNick);
    analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Применяет высокочастотный фильтр для имитации расстояния
   * Дальние звуки звучат более глухо
   */
  applyDistanceFiltering(playerNick, distance, maxDistance = 20) {
    const gainNode = this.gainNodes.get(playerNick);
    if (!gainNode) return;
    
    // Простой фильтр: снижаем высокие частоты на дальних расстояниях
    const ratio = distance / maxDistance;
    
    // Создаем фильтр (если еще не создан)
    let filterNode = this.filterNodes?.get(playerNick);
    if (!filterNode) {
      filterNode = this.audioContext.createBiquadFilter();
      filterNode.type = 'lowpass';
      this.filterNodes = this.filterNodes || new Map();
      this.filterNodes.set(playerNick, filterNode);
      
      // Подключаем в цепочку
      const pannerNode = this.pannerNodes.get(playerNick);
      if (pannerNode) {
        // Перестраиваем цепочку: ... → filter → panner → ...
        const inputs = pannerNode.getInputs?.() || [];
        // Упрощенная реализация - в реальности нужна более сложная перестройка
      }
    }
    
    // Частота среза: 20kHz на близком расстоянии, 5kHz на дальнем
    const frequency = 20000 - (ratio * 15000);
    filterNode.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
  }

  /**
   * Полное обновление параметров для игрока
   */
  updatePlayerAudio(playerNick, playerX, playerZ, myX, myZ, 
                    masterVolume = 1, curve = 'exponential') {
    const distance = Math.sqrt(
      Math.pow(playerX - myX, 2) + Math.pow(playerZ - myZ, 2)
    );
    
    // Обновляем громкость
    this.updateVolume(playerNick, distance, masterVolume, curve);
    
    // Обновляем панораму (стерео)
    this.updatePan(playerNick, playerX, playerZ, myX, myZ);
    
    // Применяем фильтр расстояния (опционально)
    // this.applyDistanceFiltering(playerNick, distance);
  }

  /**
   * Установить мастер громкость
   */
  setMasterVolume(volume) {
    this.masterGain.gain.setValueAtTime(
      volume,
      this.audioContext.currentTime
    );
  }

  /**
   * Очистить все аудио для игрока
   */
  removePlayer(playerNick) {
    this.gainNodes.delete(playerNick);
    this.pannerNodes.delete(playerNick);
    this.analyzerNodes.delete(playerNick);
    this.frequencyData.delete(playerNick);
  }

  /**
   * Получить текущее состояние аудиоконтекста
   */
  getStats() {
    return {
      state: this.audioContext.state,
      currentTime: this.audioContext.currentTime,
      sampleRate: this.audioContext.sampleRate,
      playersCount: this.gainNodes.size,
      masterVolume: this.masterGain.gain.value
    };
  }
}

// Экспортируем для использования в React компоненте
export default AudioProcessor;
