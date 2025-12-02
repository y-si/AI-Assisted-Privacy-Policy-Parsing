// Options Page JavaScript
// Handles API key storage and settings management

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

function setupEventListeners() {
  // Toggle password visibility
  document.getElementById('toggle-visibility').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Save button
  document.getElementById('save-btn').addEventListener('click', saveSettings);

  // Confidence threshold slider
  const slider = document.getElementById('confidence-threshold');
  const valueDisplay = document.getElementById('threshold-value');

  slider.addEventListener('input', () => {
    valueDisplay.textContent = slider.value + '%';
  });

  // Auto-detect checkbox
  document.getElementById('auto-detect').addEventListener('change', (e) => {
    // Settings will be saved when user clicks save
  });

  // API key input - update status on change
  document.getElementById('api-key').addEventListener('input', () => {
    updateApiStatus('not-configured', 'Not saved');
  });
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'openaiApiKey',
      'autoDetect',
      'confidenceThreshold'
    ]);

    // API Key
    if (result.openaiApiKey) {
      document.getElementById('api-key').value = result.openaiApiKey;
      updateApiStatus('success', 'Configured');
    }

    // Auto-detect
    const autoDetect = result.autoDetect !== false; // Default to true
    document.getElementById('auto-detect').checked = autoDetect;

    // Confidence threshold
    const threshold = result.confidenceThreshold || 60;
    document.getElementById('confidence-threshold').value = threshold;
    document.getElementById('threshold-value').textContent = threshold + '%';

  } catch (error) {
    console.error('Error loading settings:', error);
    showMessage('Error loading settings', 'error');
  }
}

async function saveSettings() {
  const apiKey = document.getElementById('api-key').value.trim();
  const autoDetect = document.getElementById('auto-detect').checked;
  const confidenceThreshold = parseInt(document.getElementById('confidence-threshold').value);

  // Validate API key format (OpenAI keys start with "sk-")
  if (apiKey && !apiKey.startsWith('sk-')) {
    showMessage('Invalid API key format. OpenAI keys start with "sk-"', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({
      openaiApiKey: apiKey,
      autoDetect: autoDetect,
      confidenceThreshold: confidenceThreshold
    });

    if (apiKey) {
      updateApiStatus('success', 'Configured');
    } else {
      updateApiStatus('warning', 'Not configured');
    }

    showMessage('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage('Error saving settings', 'error');
  }
}

async function testApiConnection() {
  const apiKey = document.getElementById('api-key').value.trim();

  if (!apiKey) {
    showMessage('Please enter an API key first', 'error');
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'Say "ok"'
        }]
      })
    });

    if (response.ok) {
      updateApiStatus('success', 'Connected');
      showMessage('API connection successful!', 'success');
    } else {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      updateApiStatus('error', 'Connection failed');
      showMessage(`API error: ${errorMessage}`, 'error');
    }
  } catch (error) {
    updateApiStatus('error', 'Connection failed');
    showMessage(`Connection error: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test API Connection';
  }
}

function updateApiStatus(status, text) {
  const statusIndicator = document.getElementById('api-status');
  const statusText = statusIndicator.querySelector('.status-text');

  statusIndicator.className = 'status-indicator ' + status;
  statusText.textContent = text;
}

function showMessage(text, type) {
  const messageEl = document.getElementById('message');
  messageEl.textContent = text;
  messageEl.className = 'message ' + type;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 3000);
}
