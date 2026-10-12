/**
 * Noise Level Monitor Script
 * Includes:
 * - Dynamic meter scaling (Min Level to Max Level)
 * - 10-second hold timer on higher level images & messages
 * - Auto-injection of level ticks (L0-L5) on meter bar
 * - Web Audio API mic processing
 */

document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.noise-monitor-card');

  cards.forEach((card) => {
    initNoiseMonitor(card);
  });
});

function initNoiseMonitor(card) {
  let audioContext = null;
  let mediaStream = null;
  let analyser = null;
  let animationFrameId = null;
  let isMonitoring = false;

  // Initialize level hold variables
  card._currentLevelIndex = 0;
  card._levelHoldTimestamp = 0;

  // Dynamically generate level ticks if missing from HTML
  const meterContainer = card.querySelector('.noise-meter-container');
  if (meterContainer && !meterContainer.querySelector('.noise-meter-ticks')) {
    const ticksContainer = document.createElement('div');
    ticksContainer.className = 'noise-meter-ticks';
    for (let i = 0; i < 6; i++) {
      const tick = document.createElement('div');
      tick.className = 'noise-tick';
      tick.innerHTML = `<span class="noise-tick-label">L${i}</span>`;
      ticksContainer.appendChild(tick);
    }
    meterContainer.appendChild(ticksContainer);
  }

  const toggleBtn = card.querySelector('.noise-btn-toggle');
  const thresholdSlider = card.querySelector('.noise-slider-threshold');
  const minSlider = card.querySelector('.noise-slider-min');
  const maxSlider = card.querySelector('.noise-slider-max');

  const thresholdValDisplay = card.querySelector('.noise-slider-val-threshold');
  const minValDisplay = card.querySelector('.noise-slider-val-min');
  const maxValDisplay = card.querySelector('.noise-slider-val-max');

  // Range slider handlers
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', () => {
      if (thresholdValDisplay) thresholdValDisplay.textContent = thresholdSlider.value;
      refreshUI();
    });
  }

  if (minSlider) {
    minSlider.addEventListener('input', () => {
      if (minValDisplay) minValDisplay.textContent = minSlider.value;
      if (maxSlider && parseFloat(minSlider.value) >= parseFloat(maxSlider.value)) {
        maxSlider.value = parseFloat(minSlider.value) + 1;
        if (maxValDisplay) maxValDisplay.textContent = maxSlider.value;
      }
      refreshUI();
    });
  }

  if (maxSlider) {
    maxSlider.addEventListener('input', () => {
      if (maxValDisplay) maxValDisplay.textContent = maxSlider.value;
      if (minSlider && parseFloat(maxSlider.value) <= parseFloat(minSlider.value)) {
        minSlider.value = Math.max(0, parseFloat(maxSlider.value) - 1);
        if (minValDisplay) minValDisplay.textContent = minSlider.value;
      }
      refreshUI();
    });
  }

  // Custom text message input listener
  const msgInputs = card.querySelectorAll('.noise-msg-input');
  msgInputs.forEach((input) => {
    input.addEventListener('input', () => {
      refreshUI();
    });
  });

  // Toggle button handler
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      if (!isMonitoring) {
        await startMonitoring();
      } else {
        stopMonitoring();
      }
    });
  }

  // ---- Import / export settings ----
  const exportBtn = card.querySelector('.noise-btn-export');
  const importBtn = card.querySelector('.noise-btn-import');
  const fileInput = card.querySelector('.noise-file-import');
  const ioFeedback = card.querySelector('.noise-io-feedback');

  function showIoMessage(text, kind) {
    if (!ioFeedback) return;
    ioFeedback.textContent = text;
    ioFeedback.className = 'noise-io-feedback' + (kind ? ' noise-io-' + kind : '');
  }

  function currentSettings() {
    const messages = [];
    for (let i = 0; i < 6; i++) {
      const input = card.querySelector(`.noise-msg-input[data-level="${i}"]`);
      messages.push(input ? input.value : '');
    }
    return {
      type: 'noisemonitor-settings',
      version: 1,
      threshold: parseFloat(thresholdSlider.value),
      imageMin: parseFloat(minSlider.value),
      imageMax: parseFloat(maxSlider.value),
      messages: messages,
    };
  }

  function toLevel(value) {
    const n = Number(value);
    if (value === null || value === '' || typeof value === 'boolean' || !isFinite(n)) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  // Applies whatever valid settings the object contains. Returns how many were applied.
  function applySettings(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('This file is not a Noise Monitor settings file.');
    }
    let applied = 0;
    const notes = [];

    const threshold = toLevel(data.threshold);
    if (threshold !== null) {
      thresholdSlider.value = threshold;
      thresholdValDisplay.textContent = threshold;
      applied++;
    } else if ('threshold' in data) {
      notes.push('threshold');
    }

    let newMin = toLevel(data.imageMin);
    let newMax = toLevel(data.imageMax);
    if (newMin === null && 'imageMin' in data) notes.push('min level');
    if (newMax === null && 'imageMax' in data) notes.push('max level');
    if (newMin === null) newMin = parseFloat(minSlider.value);
    else applied++;
    if (newMax === null) newMax = parseFloat(maxSlider.value);
    else applied++;
    if (newMax <= newMin) {
      // Same fallback the directive uses when image-max is not above image-min
      newMin = 0;
      newMax = 100;
      notes.push('min/max range (max must be above min, so 0 to 100 was used)');
    }
    minSlider.value = newMin;
    maxSlider.value = newMax;
    minValDisplay.textContent = newMin;
    maxValDisplay.textContent = newMax;

    if (Array.isArray(data.messages)) {
      for (let i = 0; i < 6; i++) {
        const input = card.querySelector(`.noise-msg-input[data-level="${i}"]`);
        if (input && typeof data.messages[i] === 'string') {
          input.value = data.messages[i];
          applied++;
        }
      }
    } else if ('messages' in data) {
      notes.push('messages');
    }

    if (applied === 0) {
      throw new Error('No Noise Monitor settings were found in this file.');
    }
    refreshUI();
    return notes;
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const json = JSON.stringify(currentSettings(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'noise-monitor-settings.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showIoMessage('Settings exported.', 'ok');
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const notes = applySettings(JSON.parse(reader.result));
          showIoMessage(
            notes.length
              ? 'Settings imported, but these were ignored: ' + notes.join(', ') + '.'
              : 'Settings imported.',
            notes.length ? '' : 'ok'
          );
        } catch (err) {
          const message = err instanceof SyntaxError
            ? 'This file is not valid JSON.'
            : err.message;
          showIoMessage('Could not import settings. ' + message, 'error');
        } finally {
          fileInput.value = '';
        }
      };
      reader.onerror = () => {
        showIoMessage('Could not read that file.', 'error');
        fileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  function refreshUI() {
    const dbDisplay = card.querySelector('.noise-db-value');
    const currentDb = dbDisplay ? parseFloat(dbDisplay.textContent) || 0 : 0;
    updateNoiseUI(card, currentDb);
  }

  async function startMonitoring() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      const source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      isMonitoring = true;
      toggleBtn.textContent = "Stop Mic Monitor";
      toggleBtn.classList.add("active");

      processAudio();
    } catch (err) {
      console.error("Microphone access denied or error occurred:", err);
      alert("Unable to access the microphone. Please check browser permissions.");
    }
  }

  function stopMonitoring() {
    isMonitoring = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }

    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }

    toggleBtn.textContent = "Start Mic Monitor";
    toggleBtn.classList.remove("active");

    const statusText = card.querySelector('.noise-status-text');
    if (statusText) {
      statusText.textContent = "Monitoring stopped.";
      statusText.className = "noise-status-text";
    }
  }

  function processAudio() {
    if (!isMonitoring || !analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);

    let calculatedDb = 0;
    if (rms > 0) {
      calculatedDb = Math.min(100, Math.max(0, (rms / 128) * 100));
    }

    updateNoiseUI(card, calculatedDb);

    animationFrameId = requestAnimationFrame(processAudio);
  }
}

/**
 * Updates UI with scaled meter, status, and 10-second hold timer on level drops
 */
function updateNoiseUI(cardElement, dbValue) {
  const minSlider = cardElement.querySelector('.noise-slider-min');
  const maxSlider = cardElement.querySelector('.noise-slider-max');
  const thresholdSlider = cardElement.querySelector('.noise-slider-threshold');

  const imageMin = minSlider ? parseFloat(minSlider.value) : parseFloat(cardElement.dataset.imageMin || 0);
  const imageMax = maxSlider ? parseFloat(maxSlider.value) : parseFloat(cardElement.dataset.imageMax || 100);
  const threshold = thresholdSlider ? parseFloat(thresholdSlider.value) : parseFloat(cardElement.dataset.threshold || 60);

  // 1. Dynamic Meter Scaling based on Min/Max settings
  let percentage = 0;
  if (imageMax > imageMin) {
    percentage = ((dbValue - imageMin) / (imageMax - imageMin)) * 100;
  }
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);

  // 2. Real-time Meter Bar Width & Color Updates
  const meterBar = cardElement.querySelector('.noise-meter-bar');
  if (meterBar) {
    meterBar.style.width = `${clampedPercentage}%`;
    if (dbValue >= threshold) {
      meterBar.classList.add('danger');
    } else {
      meterBar.classList.remove('danger');
    }
  }

  // 3. Update Numerical dB Readout
  const dbDisplay = cardElement.querySelector('.noise-db-value');
  if (dbDisplay) {
    dbDisplay.textContent = Math.round(dbValue);
  }

  // 4. Update Status Text
  const statusText = cardElement.querySelector('.noise-status-text');
  if (statusText) {
    if (dbValue >= threshold) {
      statusText.textContent = "Warning: Exceeding Noise Threshold!";
      statusText.className = "noise-status-text text-danger";
    } else {
      statusText.textContent = "Monitoring ambient sound...";
      statusText.className = "noise-status-text text-safe";
    }
  }

  // 5. Calculate Immediate Target Level (0 through 5)
  let rawLevelIndex = 0;
  if (imageMax > imageMin) {
    const normalizedRatio = Math.min(Math.max((dbValue - imageMin) / (imageMax - imageMin), 0), 1);
    rawLevelIndex = Math.min(5, Math.floor(normalizedRatio * 6));
  }

  // 6. 10-Second Hold Timer Logic
//   const now = Date.now();
//   const HOLD_DURATION_MS = 10000;

//   if (rawLevelIndex > cardElement._currentLevelIndex) {
//     // Immediate step up on volume spike
//     cardElement._currentLevelIndex = rawLevelIndex;
//     cardElement._levelHoldTimestamp = now;
//   } else if (rawLevelIndex < cardElement._currentLevelIndex) {
//     // Hold level for 10s before stepping down
//     if (now - cardElement._levelHoldTimestamp >= HOLD_DURATION_MS) {
//       cardElement._currentLevelIndex = rawLevelIndex;
//       cardElement._levelHoldTimestamp = now;
//     }
//   } else {
//     cardElement._levelHoldTimestamp = now;
//   }

//   const activeLevel = cardElement._currentLevelIndex;


// 6. Step-down Timer Logic (1 step down every 3 seconds)
  const now = Date.now();
  const DECAY_STEP_MS = 3000; // 3 seconds per step down

  // Initialize timestamp if missing
  if (!cardElement._levelHoldTimestamp) {
    cardElement._levelHoldTimestamp = now;
  }

  if (rawLevelIndex > cardElement._currentLevelIndex) {
    // Immediate step up on volume spike
    cardElement._currentLevelIndex = rawLevelIndex;
    cardElement._levelHoldTimestamp = now;
  } else if (rawLevelIndex < cardElement._currentLevelIndex) {
    // Step down 1 level every 3 seconds
    if (now - cardElement._levelHoldTimestamp >= DECAY_STEP_MS) {
      cardElement._currentLevelIndex -= 1;
      cardElement._levelHoldTimestamp = now;
    }
  } else {
    // Level matches current, reset timer
    cardElement._levelHoldTimestamp = now;
  }

  const activeLevel = cardElement._currentLevelIndex;

  // 7. Update Active Foreground Image
  const imgElement = cardElement.querySelector('.noise-image');
  if (imgElement) {
    const newImgSrc = cardElement.getAttribute(`data-img${activeLevel}`);
    if (newImgSrc && imgElement.getAttribute('src') !== newImgSrc) {
      imgElement.setAttribute('src', newImgSrc);
    }
  }

  // 8. Update Active Custom Level Message
  const messageElement = cardElement.querySelector('.noise-level-message');
  if (messageElement) {
    const msgInput = cardElement.querySelector(`.noise-msg-input[data-level="${activeLevel}"]`);
    let activeMsg = msgInput ? msgInput.value : cardElement.getAttribute(`data-msg${activeLevel}`);

    if (activeMsg !== null) {
      messageElement.textContent = activeMsg;
    }
  }
}