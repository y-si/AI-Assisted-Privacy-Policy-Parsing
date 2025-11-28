// Side Panel JavaScript
// Handles UI updates, streaming responses, and chat functionality

let currentTabId = null;
let isAnalyzing = false;
let streamingContent = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  setupEventListeners();
  setupMessageListeners();

  // Check if we have existing analysis for this tab
  checkExistingAnalysis();
});

function setupEventListeners() {
  // Analyze button
  document.getElementById('analyze-btn').addEventListener('click', startAnalysis);
  document.getElementById('retry-btn').addEventListener('click', startAnalysis);

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Chat toggle
  document.getElementById('chat-toggle').addEventListener('click', toggleChat);

  // Chat input
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  chatInput.addEventListener('input', () => {
    sendBtn.disabled = chatInput.value.trim() === '';
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendChatMessage();
      }
    }
  });

  sendBtn.addEventListener('click', sendChatMessage);

  // Collapsible sections
  document.querySelectorAll('.section-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      const content = toggle.nextElementSibling;
      content.classList.toggle('collapsed');
    });
  });
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.tabId && message.tabId !== currentTabId) return;

    switch (message.type) {
      case 'STREAM_CHUNK':
        handleStreamChunk(message.content);
        break;
      case 'STREAM_COMPLETE':
        handleStreamComplete(message.fullResponse);
        break;
      case 'ANALYSIS_ERROR':
        handleError(message.error);
        break;
      case 'CHAT_CHUNK':
        handleChatChunk(message.content);
        break;
      case 'CHAT_COMPLETE':
        handleChatComplete(message.fullResponse);
        break;
    }
  });
}

async function checkExistingAnalysis() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ANALYSIS',
      tabId: currentTabId
    });

    if (response.success && response.analysis) {
      displayAnalysis(response.analysis);
    }
  } catch (error) {
    console.log('No existing analysis');
  }
}

async function startAnalysis() {
  if (isAnalyzing) return;
  isAnalyzing = true;

  showState('loading');
  streamingContent = '';
  document.getElementById('streaming-preview').textContent = '';
  updateStatus('Analyzing...');

  try {
    await chrome.runtime.sendMessage({
      type: 'ANALYZE_POLICY',
      tabId: currentTabId
    });
  } catch (error) {
    handleError(error.message);
  }
}

function handleStreamChunk(content) {
  streamingContent += content;
  const preview = document.getElementById('streaming-preview');
  // Show more of the streaming content for better feedback
  preview.textContent = streamingContent.substring(0, 1000) + (streamingContent.length > 1000 ? '...' : '');
  preview.scrollTop = preview.scrollHeight;

  // Update status to show we're receiving data
  updateStatus('Receiving analysis...');
}

function handleStreamComplete(fullResponse) {
  isAnalyzing = false;
  updateStatus('Analysis complete');

  try {
    // Extract JSON from response
    const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      displayAnalysis(analysis);
    } else {
      // Display raw response if not JSON
      displayRawResponse(fullResponse);
    }
  } catch (error) {
    console.error('Error parsing analysis:', error);
    displayRawResponse(fullResponse);
  }
}

function displayAnalysis(analysis) {
  showState('results');

  // Overall rating
  const ratingBadge = document.getElementById('rating-badge');
  const rating = (analysis.overallRating || 'MODERATE').toLowerCase();
  ratingBadge.textContent = analysis.overallRating || 'MODERATE';
  ratingBadge.className = 'rating-badge ' + rating;
  document.getElementById('rating-explanation').textContent = analysis.ratingExplanation || '';

  // Summary
  document.getElementById('summary-content').innerHTML = `<p>${escapeHtml(analysis.summary || 'No summary available.')}</p>`;

  // Risks
  const risksContent = document.getElementById('risks-content');
  if (analysis.risks && analysis.risks.length > 0) {
    risksContent.innerHTML = analysis.risks.map(risk => `
      <div class="risk-item">
        <div class="risk-header">
          <span class="risk-level ${(risk.level || 'medium').toLowerCase()}">${risk.level || 'MEDIUM'}</span>
          <span class="risk-title">${escapeHtml(risk.title || 'Unnamed Risk')}</span>
        </div>
        <p class="risk-description">${escapeHtml(risk.description || '')}</p>
        ${risk.quote ? `<div class="risk-quote" data-quote="${escapeHtml(risk.quote)}">"${escapeHtml(risk.quote)}"</div>` : ''}
      </div>
    `).join('');

    // Add click handlers for quotes
    risksContent.querySelectorAll('.risk-quote').forEach(quote => {
      quote.addEventListener('click', () => highlightQuote(quote.dataset.quote));
    });
  } else {
    risksContent.innerHTML = '<p>No specific risks identified.</p>';
  }

  // Data Collection
  const dataCollectionContent = document.getElementById('data-collection-content');
  if (analysis.dataCollection && analysis.dataCollection.length > 0) {
    dataCollectionContent.innerHTML = analysis.dataCollection.map(item => `
      <div class="data-item">
        <div class="data-type">${escapeHtml(item.type || 'Unknown')}</div>
        <p class="data-description">${escapeHtml(item.description || '')}</p>
        ${item.quote ? `<div class="data-quote" data-quote="${escapeHtml(item.quote)}">"${escapeHtml(item.quote)}"</div>` : ''}
      </div>
    `).join('');

    dataCollectionContent.querySelectorAll('.data-quote').forEach(quote => {
      quote.addEventListener('click', () => highlightQuote(quote.dataset.quote));
    });
  } else {
    dataCollectionContent.innerHTML = '<p>No data collection information found.</p>';
  }

  // Data Sharing
  const dataSharingContent = document.getElementById('data-sharing-content');
  if (analysis.dataSharing && analysis.dataSharing.length > 0) {
    dataSharingContent.innerHTML = analysis.dataSharing.map(item => `
      <div class="data-item">
        <div class="data-type">${escapeHtml(item.recipient || 'Unknown')}</div>
        <p class="data-description">${escapeHtml(item.purpose || '')}</p>
        ${item.quote ? `<div class="data-quote" data-quote="${escapeHtml(item.quote)}">"${escapeHtml(item.quote)}"</div>` : ''}
      </div>
    `).join('');

    dataSharingContent.querySelectorAll('.data-quote').forEach(quote => {
      quote.addEventListener('click', () => highlightQuote(quote.dataset.quote));
    });
  } else {
    dataSharingContent.innerHTML = '<p>No data sharing information found.</p>';
  }

  // User Rights
  const userRightsContent = document.getElementById('user-rights-content');
  if (analysis.userRights && analysis.userRights.length > 0) {
    userRightsContent.innerHTML = analysis.userRights.map(item => `
      <div class="data-item">
        <div class="data-type">${escapeHtml(item.right || 'Unknown')}</div>
        <p class="data-description">${escapeHtml(item.description || '')}</p>
        ${item.quote ? `<div class="data-quote" data-quote="${escapeHtml(item.quote)}">"${escapeHtml(item.quote)}"</div>` : ''}
      </div>
    `).join('');

    userRightsContent.querySelectorAll('.data-quote').forEach(quote => {
      quote.addEventListener('click', () => highlightQuote(quote.dataset.quote));
    });
  } else {
    userRightsContent.innerHTML = '<p>No user rights information found.</p>';
  }
}

function displayRawResponse(response) {
  showState('results');

  document.getElementById('rating-card').style.display = 'none';
  document.getElementById('summary-content').innerHTML = `<p>${escapeHtml(response)}</p>`;

  // Hide other sections
  document.querySelectorAll('.result-section').forEach((section, index) => {
    if (index > 0) section.style.display = 'none';
  });
}

function handleError(errorMessage) {
  isAnalyzing = false;
  showState('error');
  document.getElementById('error-message').textContent = errorMessage;
  updateStatus('Error');
}

function showState(state) {
  document.getElementById('initial-state').classList.toggle('hidden', state !== 'initial');
  document.getElementById('loading-state').classList.toggle('hidden', state !== 'loading');
  document.getElementById('results-state').classList.toggle('hidden', state !== 'results');
  document.getElementById('error-state').classList.toggle('hidden', state !== 'error');
}

function updateStatus(text) {
  document.getElementById('status-text').textContent = text;
}

function toggleChat() {
  const container = document.getElementById('chat-container');
  const toggle = document.getElementById('chat-toggle');

  container.classList.toggle('collapsed');
  toggle.classList.toggle('active');
}

let chatStreamingElement = null;

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();

  if (!message) return;

  // Add user message to chat
  addChatMessage(message, 'user');
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  // Create streaming assistant message
  chatStreamingElement = addChatMessage('', 'assistant', true);

  try {
    await chrome.runtime.sendMessage({
      type: 'CHAT_MESSAGE',
      tabId: currentTabId,
      userMessage: message
    });
  } catch (error) {
    chatStreamingElement.textContent = 'Error: ' + error.message;
    chatStreamingElement.classList.remove('streaming');
    chatStreamingElement = null;
  }
}

function handleChatChunk(content) {
  if (chatStreamingElement) {
    chatStreamingElement.textContent += content;
    scrollChatToBottom();
  }
}

function handleChatComplete() {
  if (chatStreamingElement) {
    chatStreamingElement.classList.remove('streaming');
    chatStreamingElement = null;
  }
}

function addChatMessage(content, role, isStreaming = false) {
  const messagesContainer = document.getElementById('chat-messages');
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}${isStreaming ? ' streaming' : ''}`;
  messageEl.textContent = content;
  messagesContainer.appendChild(messageEl);
  scrollChatToBottom();
  return messageEl;
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

async function highlightQuote(quote) {
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      type: 'HIGHLIGHT_CLAUSE',
      quote: quote
    });
  } catch (error) {
    console.error('Failed to highlight:', error);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
