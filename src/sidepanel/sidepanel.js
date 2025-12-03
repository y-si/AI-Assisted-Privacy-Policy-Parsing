// Side Panel JavaScript
// Handles UI updates, streaming responses, and chat functionality

let currentTabId = null;
let isAnalyzing = false;
let streamingContent = "";

// Accessibility state
let isSimplifiedMode = false;
let isKeyPointsMode = false;
let originalAnalysis = null;
let simplifiedAnalysis = null;
let keyPointsData = null;
let ttsUtterance = null;
let isSpeaking = false;

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  // Load accessibility preferences
  await loadAccessibilityPreferences();

  setupEventListeners();
  setupMessageListeners();

  // Check if there's an analysis in progress or existing analysis
  await checkAnalysisStatus();
});

// Load accessibility preferences from storage
async function loadAccessibilityPreferences() {
  try {
    const result = await chrome.storage.local.get(['defaultSimplified', 'ttsRate']);

    // If default simplified is enabled, mark the button as active
    if (result.defaultSimplified) {
      isSimplifiedMode = true;
      document.getElementById("simplify-btn").classList.add("active");
    }

    // Store TTS rate for later use
    window.ttsRate = (result.ttsRate || 90) / 100;
  } catch (error) {
    console.error("Error loading accessibility preferences:", error);
  }
}

// Check if analysis is in progress or already complete
async function checkAnalysisStatus() {
  try {
    // First check if analysis is in progress
    const statusResponse = await chrome.runtime.sendMessage({
      type: "GET_ANALYSIS_STATUS",
      tabId: currentTabId,
    });

    if (statusResponse.inProgress) {
      // Analysis is in progress - show loading state
      showState("loading");
      updateStatus("Analyzing...");
      return;
    }

    if (statusResponse.success && statusResponse.analysis) {
      // We have existing analysis - display it
      displayAnalysis(statusResponse.analysis);
      return;
    }

    // No analysis in progress or complete - check if policy detected
    checkExistingAnalysis();
  } catch (error) {
    console.log("Error checking analysis status:", error);
    checkExistingAnalysis();
  }
}

function setupEventListeners() {
  // Analyze button
  document
    .getElementById("analyze-btn")
    .addEventListener("click", startAnalysis);
  document.getElementById("retry-btn").addEventListener("click", startAnalysis);

  // Settings button
  document.getElementById("settings-btn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Chat toggle
  document.getElementById("chat-toggle").addEventListener("click", toggleChat);

  // Chat input
  const chatInput = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");

  chatInput.addEventListener("input", () => {
    sendBtn.disabled = chatInput.value.trim() === "";
    // Auto-resize textarea
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + "px";
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendChatMessage();
      }
    }
  });

  sendBtn.addEventListener("click", sendChatMessage);

  // Collapsible sections
  document.querySelectorAll(".section-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      toggle.classList.toggle("active");
      const content = toggle.nextElementSibling;
      content.classList.toggle("collapsed");
    });
  });

  // Accessibility: Simplified language toggle
  document.getElementById("simplify-btn").addEventListener("click", toggleSimplifiedMode);

  // Accessibility: Key points mode
  document.getElementById("keypoints-btn").addEventListener("click", toggleKeyPointsMode);
  document.getElementById("back-to-full-btn").addEventListener("click", exitKeyPointsMode);

  // Dark patterns back button
  document.getElementById("back-from-darkpatterns-btn").addEventListener("click", () => {
    showState("initial");
  });

  // Accessibility: Text-to-speech
  document.getElementById("tts-btn").addEventListener("click", startTextToSpeech);
  document.getElementById("tts-stop-btn").addEventListener("click", stopTextToSpeech);
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    // Handle notifications that don't need tab ID matching
    if (message.type === "POLICY_DETECTED_NOTIFICATION") {
      handlePolicyDetectedNotification(message);
      return;
    }

    if (message.type === "POLICY_AGREEMENT_NOTIFICATION") {
      handlePolicyAgreementNotification(message);
      return;
    }

    if (message.tabId && message.tabId !== currentTabId) return;

    switch (message.type) {
      case "ANALYSIS_STARTED":
        // Analysis is starting - show loading state immediately
        showState("loading");
        streamingContent = "";
        document.getElementById("streaming-preview").textContent = "";
        updateStatus("Analyzing...");
        isAnalyzing = true;
        break;
      case "STREAM_CHUNK":
        // If we receive chunks but aren't in loading state, switch to it
        if (!isAnalyzing) {
          showState("loading");
          streamingContent = "";
          isAnalyzing = true;
        }
        handleStreamChunk(message.content);
        break;
      case "STREAM_COMPLETE":
        handleStreamComplete(message.fullResponse);
        break;
      case "ANALYSIS_ERROR":
        handleError(message.error);
        break;
      case "CHAT_CHUNK":
        handleChatChunk(message.content);
        break;
      case "CHAT_COMPLETE":
        handleChatComplete(message.fullResponse);
        break;
      case "SIMPLIFY_COMPLETE":
        handleSimplifyComplete(message.simplifiedAnalysis);
        break;
      case "SIMPLIFY_ERROR":
        handleSimplifyError(message.error);
        break;
      case "KEYPOINTS_COMPLETE":
        handleKeyPointsComplete(message.keyPoints);
        break;
      case "KEYPOINTS_ERROR":
        handleKeyPointsError(message.error);
        break;
      case "SHOW_DARK_PATTERNS":
        displayDarkPatterns(message.patterns);
        break;
      case "COOKIE_POPUP_DETECTED":
        handleCookiePopupDetected(message);
        break;
      case "EXTERNAL_POLICY_LOADING":
        handleExternalPolicyLoading(message);
        break;
    }
  });
}

// Handle policy detection notification - show a prompt to analyze
function handlePolicyDetectedNotification(message) {
  console.log("[Side Panel] Policy detected notification:", message);

  // Update the current tab ID if needed
  if (message.tabId) {
    currentTabId = message.tabId;
  }

  // Update the initial state to show we detected a policy
  const initialState = document.getElementById("initial-state");
  if (initialState && !initialState.classList.contains("hidden")) {
    const detectionBanner = document.createElement("div");
    detectionBanner.className = "detection-banner";
    detectionBanner.innerHTML = `
      <div class="detection-text">
        <strong>Privacy Policy Detected!</strong>
        <span>Confidence: ${Math.round(
          (message.confidence || 0.8) * 100
        )}%</span>
      </div>
    `;

    // Insert before the analyze button
    const existingBanner = initialState.querySelector(".detection-banner");
    if (existingBanner) {
      existingBanner.remove();
    }
    const analyzeBtn = document.getElementById("analyze-btn");
    if (analyzeBtn) {
      analyzeBtn.parentNode.insertBefore(detectionBanner, analyzeBtn);
    }
  }

  updateStatus("Ready to analyze.");
}

// Handle agreement button click notification - show a warning
function handlePolicyAgreementNotification(message) {
  console.log("[Side Panel] Policy agreement notification:", message);

  // Update the current tab ID if needed
  if (message.tabId) {
    currentTabId = message.tabId;
  }

  // Show a prominent warning in the side panel
  const initialState = document.getElementById("initial-state");
  if (initialState && !initialState.classList.contains("hidden")) {
    const warningBanner = document.createElement("div");
    warningBanner.className = "warning-banner";
    warningBanner.innerHTML = `
      <div class="warning-icon">⚠️</div>
      <div class="warning-text">
        <p>You're about to agree to a privacy policy/terms of service. Review the policy first to understand what data is collected and how it will be used.</p>
      </div>
    `;

    // Insert at the top
    const existingWarning = initialState.querySelector(".warning-banner");
    if (existingWarning) {
      existingWarning.remove();
    }
    initialState.insertBefore(warningBanner, initialState.firstChild);
  }

  updateStatus("Review before agreeing.");
}

async function checkExistingAnalysis() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_ANALYSIS",
      tabId: currentTabId,
    });

    if (response.success && response.analysis) {
      displayAnalysis(response.analysis);
    }
  } catch (error) {
    console.log("No existing analysis");
  }
}

async function startAnalysis() {
  if (isAnalyzing) return;
  isAnalyzing = true;

  showState("loading");
  streamingContent = "";
  document.getElementById("streaming-preview").textContent = "";
  updateStatus("Analyzing privacy policy...");

  try {
    await chrome.runtime.sendMessage({
      type: "ANALYZE_POLICY",
      tabId: currentTabId,
    });
  } catch (error) {
    handleError(error.message);
  }
}

function handleStreamChunk(content) {
  streamingContent += content;
  const preview = document.getElementById("streaming-preview");
  // Show more of the streaming content for better feedback
  preview.textContent =
    streamingContent.substring(0, 1000) +
    (streamingContent.length > 1000 ? "..." : "");
  preview.scrollTop = preview.scrollHeight;
  updateStatus("Analyzing privacy policy...");
}

function handleStreamComplete(fullResponse) {
  isAnalyzing = false;
  updateStatus("Analysis complete!");

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
    console.error("Error parsing analysis:", error);
    displayRawResponse(fullResponse);
  }
}

function displayAnalysis(analysis) {
  showState("results");

  // Store the original analysis for toggling
  if (!simplifiedAnalysis || analysis !== simplifiedAnalysis) {
    // This is the original analysis
    if (!originalAnalysis) {
      originalAnalysis = analysis;

      // If default simplified mode is on and we haven't fetched simplified yet, request it
      if (isSimplifiedMode && !simplifiedAnalysis) {
        // Auto-request simplified version
        const simplifyBtn = document.getElementById("simplify-btn");
        simplifyBtn.classList.add("loading");
        chrome.runtime.sendMessage({
          type: "SIMPLIFY_ANALYSIS",
          tabId: currentTabId,
          analysis: originalAnalysis,
        }).catch((error) => {
          console.error("Error requesting simplified analysis:", error);
          simplifyBtn.classList.remove("loading");
        });
      }
    }
  }

  // Overall rating
  const ratingBadge = document.getElementById("rating-badge");
  const rating = (analysis.overallRating || "MODERATE").toLowerCase();
  ratingBadge.textContent = analysis.overallRating || "MODERATE";
  ratingBadge.className = "rating-badge " + rating;
  document.getElementById("rating-explanation").textContent =
    analysis.ratingExplanation || "";

  // Summary
  document.getElementById("summary-content").innerHTML = `<p>${escapeHtml(
    analysis.summary || "No summary available."
  )}</p>`;

  // Risks
  const risksContent = document.getElementById("risks-content");
  if (analysis.risks && analysis.risks.length > 0) {
    risksContent.innerHTML = analysis.risks
      .map(
        (risk) => `
      <div class="risk-item">
        <div class="risk-header">
          <span class="risk-level ${(risk.level || "medium").toLowerCase()}">${
          risk.level || "MEDIUM"
        }</span>
          <span class="risk-title">${escapeHtml(
            risk.title || "Unnamed Risk"
          )}</span>
        </div>
        <p class="risk-description">${escapeHtml(risk.description || "")}</p>
        ${
          risk.quote
            ? `<div class="risk-quote" data-quote="${escapeHtml(
                risk.quote
              )}">"${escapeHtml(risk.quote)}"</div>`
            : ""
        }
      </div>
    `
      )
      .join("");

    // Add click handlers for quotes
    risksContent.querySelectorAll(".risk-quote").forEach((quote) => {
      quote.addEventListener("click", () =>
        highlightQuote(quote.dataset.quote)
      );
    });
  } else {
    risksContent.innerHTML = "<p>No specific risks identified.</p>";
  }

  // Data Collection
  const dataCollectionContent = document.getElementById(
    "data-collection-content"
  );
  if (analysis.dataCollection && analysis.dataCollection.length > 0) {
    dataCollectionContent.innerHTML = analysis.dataCollection
      .map(
        (item) => `
      <div class="data-item">
        <div class="data-type">${escapeHtml(item.type || "Unknown")}</div>
        <p class="data-description">${escapeHtml(item.description || "")}</p>
        ${
          item.quote
            ? `<div class="data-quote" data-quote="${escapeHtml(
                item.quote
              )}">"${escapeHtml(item.quote)}"</div>`
            : ""
        }
      </div>
    `
      )
      .join("");

    dataCollectionContent.querySelectorAll(".data-quote").forEach((quote) => {
      quote.addEventListener("click", () =>
        highlightQuote(quote.dataset.quote)
      );
    });
  } else {
    dataCollectionContent.innerHTML =
      "<p>No data collection information found.</p>";
  }

  // Data Sharing
  const dataSharingContent = document.getElementById("data-sharing-content");
  if (analysis.dataSharing && analysis.dataSharing.length > 0) {
    dataSharingContent.innerHTML = analysis.dataSharing
      .map(
        (item) => `
      <div class="data-item">
        <div class="data-type">${escapeHtml(item.recipient || "Unknown")}</div>
        <p class="data-description">${escapeHtml(item.purpose || "")}</p>
        ${
          item.quote
            ? `<div class="data-quote" data-quote="${escapeHtml(
                item.quote
              )}">"${escapeHtml(item.quote)}"</div>`
            : ""
        }
      </div>
    `
      )
      .join("");

    dataSharingContent.querySelectorAll(".data-quote").forEach((quote) => {
      quote.addEventListener("click", () =>
        highlightQuote(quote.dataset.quote)
      );
    });
  } else {
    dataSharingContent.innerHTML = "<p>No data sharing information found.</p>";
  }

  // User Rights
  const userRightsContent = document.getElementById("user-rights-content");
  if (analysis.userRights && analysis.userRights.length > 0) {
    userRightsContent.innerHTML = analysis.userRights
      .map(
        (item) => `
      <div class="data-item">
        <div class="data-type">${escapeHtml(item.right || "Unknown")}</div>
        <p class="data-description">${escapeHtml(item.description || "")}</p>
        ${
          item.quote
            ? `<div class="data-quote" data-quote="${escapeHtml(
                item.quote
              )}">"${escapeHtml(item.quote)}"</div>`
            : ""
        }
      </div>
    `
      )
      .join("");

    userRightsContent.querySelectorAll(".data-quote").forEach((quote) => {
      quote.addEventListener("click", () =>
        highlightQuote(quote.dataset.quote)
      );
    });
  } else {
    userRightsContent.innerHTML = "<p>No user rights information found.</p>";
  }
}

function displayRawResponse(response) {
  showState("results");

  document.getElementById("rating-card").style.display = "none";
  document.getElementById("summary-content").innerHTML = `<p>${escapeHtml(
    response
  )}</p>`;

  // Hide other sections
  document.querySelectorAll(".result-section").forEach((section, index) => {
    if (index > 0) section.style.display = "none";
  });
}

function handleError(errorMessage) {
  isAnalyzing = false;
  showState("error");
  document.getElementById("error-message").textContent = errorMessage;
  updateStatus("Error");
}

function showState(state) {
  document
    .getElementById("initial-state")
    .classList.toggle("hidden", state !== "initial");
  document
    .getElementById("loading-state")
    .classList.toggle("hidden", state !== "loading");
  document
    .getElementById("results-state")
    .classList.toggle("hidden", state !== "results");
  document
    .getElementById("keypoints-state")
    .classList.toggle("hidden", state !== "keypoints");
  document
    .getElementById("darkpatterns-state")
    .classList.toggle("hidden", state !== "darkpatterns");
  document
    .getElementById("error-state")
    .classList.toggle("hidden", state !== "error");
}

function updateStatus(text) {
  document.getElementById("status-text").textContent = text;
}

function toggleChat() {
  const container = document.getElementById("chat-container");
  const toggle = document.getElementById("chat-toggle");

  container.classList.toggle("collapsed");
  toggle.classList.toggle("active");
}

let chatStreamingElement = null;

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();

  if (!message) return;

  // Add user message to chat
  addChatMessage(message, "user");
  input.value = "";
  input.style.height = "auto";
  document.getElementById("send-btn").disabled = true;

  // Create streaming assistant message
  chatStreamingElement = addChatMessage("", "assistant", true);

  try {
    await chrome.runtime.sendMessage({
      type: "CHAT_MESSAGE",
      tabId: currentTabId,
      userMessage: message,
    });
  } catch (error) {
    chatStreamingElement.textContent = "Error: " + error.message;
    chatStreamingElement.classList.remove("streaming");
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
    chatStreamingElement.classList.remove("streaming");
    chatStreamingElement = null;
  }
}

function addChatMessage(content, role, isStreaming = false) {
  const messagesContainer = document.getElementById("chat-messages");
  const messageEl = document.createElement("div");
  messageEl.className = `chat-message ${role}${
    isStreaming ? " streaming" : ""
  }`;
  messageEl.textContent = content;
  messagesContainer.appendChild(messageEl);
  scrollChatToBottom();
  return messageEl;
}

function scrollChatToBottom() {
  const container = document.getElementById("chat-messages");
  container.scrollTop = container.scrollHeight;
}

async function highlightQuote(quote) {
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      type: "HIGHLIGHT_CLAUSE",
      quote: quote,
    });
  } catch (error) {
    console.error("Failed to highlight:", error);
  }
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Accessibility Features
// ============================================

// Toggle simplified language mode
async function toggleSimplifiedMode() {
  const simplifyBtn = document.getElementById("simplify-btn");

  if (!originalAnalysis) {
    // No analysis to simplify
    return;
  }

  if (isSimplifiedMode) {
    // Switch back to original
    isSimplifiedMode = false;
    simplifyBtn.classList.remove("active");
    displayAnalysis(originalAnalysis);
  } else {
    // Switch to simplified
    if (simplifiedAnalysis) {
      // Already have simplified version cached
      isSimplifiedMode = true;
      simplifyBtn.classList.add("active");
      displayAnalysis(simplifiedAnalysis);
    } else {
      // Request simplified version from service worker
      simplifyBtn.classList.add("loading");
      try {
        await chrome.runtime.sendMessage({
          type: "SIMPLIFY_ANALYSIS",
          tabId: currentTabId,
          analysis: originalAnalysis,
        });
      } catch (error) {
        console.error("Error requesting simplified analysis:", error);
        simplifyBtn.classList.remove("loading");
      }
    }
  }
}

// Handle simplified analysis response
function handleSimplifyComplete(simplified) {
  const simplifyBtn = document.getElementById("simplify-btn");
  simplifyBtn.classList.remove("loading");
  simplifyBtn.classList.add("active");

  simplifiedAnalysis = simplified;
  isSimplifiedMode = true;
  displayAnalysis(simplified);
}

// Handle simplification error
function handleSimplifyError(error) {
  const simplifyBtn = document.getElementById("simplify-btn");
  simplifyBtn.classList.remove("loading");
  console.error("Simplification error:", error);
}

// Text-to-Speech functionality
function startTextToSpeech() {
  if (!originalAnalysis && !simplifiedAnalysis) {
    return;
  }

  const analysis = isSimplifiedMode ? simplifiedAnalysis : originalAnalysis;
  if (!analysis) return;

  // Build the text to read
  const textParts = [];

  // Rating
  if (analysis.overallRating) {
    textParts.push(`Overall rating: ${analysis.overallRating}.`);
    if (analysis.ratingExplanation) {
      textParts.push(analysis.ratingExplanation);
    }
  }

  // Summary
  if (analysis.summary) {
    textParts.push("Summary:");
    textParts.push(analysis.summary);
  }

  // Key risks
  if (analysis.risks && analysis.risks.length > 0) {
    textParts.push("Key risks:");
    analysis.risks.forEach((risk, index) => {
      textParts.push(`Risk ${index + 1}: ${risk.title}. ${risk.description}`);
    });
  }

  const fullText = textParts.join(" ");

  // Cancel any ongoing speech
  if (isSpeaking) {
    stopTextToSpeech();
  }

  // Create and start utterance
  ttsUtterance = new SpeechSynthesisUtterance(fullText);
  ttsUtterance.rate = window.ttsRate || 0.9; // Use saved rate or default
  ttsUtterance.pitch = 1;

  ttsUtterance.onstart = () => {
    isSpeaking = true;
    document.getElementById("tts-btn").classList.add("hidden");
    document.getElementById("tts-stop-btn").classList.remove("hidden");
  };

  ttsUtterance.onend = () => {
    isSpeaking = false;
    document.getElementById("tts-btn").classList.remove("hidden");
    document.getElementById("tts-stop-btn").classList.add("hidden");
  };

  ttsUtterance.onerror = () => {
    isSpeaking = false;
    document.getElementById("tts-btn").classList.remove("hidden");
    document.getElementById("tts-stop-btn").classList.add("hidden");
  };

  window.speechSynthesis.speak(ttsUtterance);
}

function stopTextToSpeech() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  document.getElementById("tts-btn").classList.remove("hidden");
  document.getElementById("tts-stop-btn").classList.add("hidden");
}

// ============================================
// Key Points Mode
// ============================================

async function toggleKeyPointsMode() {
  const keypointsBtn = document.getElementById("keypoints-btn");

  if (!originalAnalysis) {
    return;
  }

  if (isKeyPointsMode) {
    // Switch back to full analysis
    exitKeyPointsMode();
  } else {
    // Switch to key points mode
    if (keyPointsData) {
      // Already have key points cached
      displayKeyPoints(keyPointsData);
    } else {
      // Request key points from service worker
      keypointsBtn.classList.add("loading");
      try {
        await chrome.runtime.sendMessage({
          type: "EXTRACT_KEYPOINTS",
          tabId: currentTabId,
          analysis: originalAnalysis,
        });
      } catch (error) {
        console.error("Error requesting key points:", error);
        keypointsBtn.classList.remove("loading");
      }
    }
  }
}

function exitKeyPointsMode() {
  isKeyPointsMode = false;
  document.getElementById("keypoints-btn").classList.remove("active");
  showState("results");
}

function handleKeyPointsComplete(keyPoints) {
  const keypointsBtn = document.getElementById("keypoints-btn");
  keypointsBtn.classList.remove("loading");
  keypointsBtn.classList.add("active");

  keyPointsData = keyPoints;
  displayKeyPoints(keyPoints);
}

function handleKeyPointsError(error) {
  const keypointsBtn = document.getElementById("keypoints-btn");
  keypointsBtn.classList.remove("loading");
  console.error("Key points extraction error:", error);
}

function displayKeyPoints(keyPoints) {
  isKeyPointsMode = true;
  showState("keypoints");

  // Copy rating from original analysis
  const rating = (originalAnalysis.overallRating || "MODERATE").toLowerCase();
  const ratingBadge = document.getElementById("keypoints-rating-badge");
  ratingBadge.textContent = originalAnalysis.overallRating || "MODERATE";
  ratingBadge.className = "rating-badge " + rating;
  document.getElementById("keypoints-rating-explanation").textContent =
    originalAnalysis.ratingExplanation || "";

  // Display important points
  const importantContent = document.getElementById("important-points-content");
  if (keyPoints.importantPoints && keyPoints.importantPoints.length > 0) {
    importantContent.innerHTML = keyPoints.importantPoints
      .map(
        (point) => `
        <div class="keypoint-item important">
          <span class="keypoint-icon">${getPointIcon(point.category)}</span>
          <div class="keypoint-content">
            <div class="keypoint-title">${escapeHtml(point.title)}</div>
            <div class="keypoint-description">${escapeHtml(point.description)}</div>
          </div>
        </div>
      `
      )
      .join("");
  } else {
    importantContent.innerHTML = "<p>No key points identified.</p>";
  }

  // Display standout/unusual points
  const standoutContent = document.getElementById("standout-points-content");
  if (keyPoints.standoutPoints && keyPoints.standoutPoints.length > 0) {
    standoutContent.innerHTML = keyPoints.standoutPoints
      .map(
        (point) => `
        <div class="keypoint-item ${point.isConcerning ? 'concern' : 'unusual'}">
          <span class="keypoint-icon">${point.isConcerning ? '⚠️' : '💡'}</span>
          <div class="keypoint-content">
            <div class="keypoint-title">${escapeHtml(point.title)}</div>
            <div class="keypoint-description">${escapeHtml(point.description)}</div>
          </div>
        </div>
      `
      )
      .join("");
  } else {
    standoutContent.innerHTML = "<p>No unusual clauses identified.</p>";
  }
}

function getPointIcon(category) {
  const icons = {
    data_collection: "📊",
    data_sharing: "🔗",
    data_retention: "💾",
    user_rights: "✅",
    security: "🔒",
    cookies: "🍪",
    third_party: "👥",
    default: "📋"
  };
  return icons[category] || icons.default;
}

// ============================================
// Dark Pattern Detection UI
// ============================================

function displayDarkPatterns(patterns) {
  showState("darkpatterns");

  const listContainer = document.getElementById("darkpatterns-list");

  if (!patterns || patterns.length === 0) {
    listContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">No dark patterns detected on this page.</p>`;
    return;
  }

  listContainer.innerHTML = patterns
    .map(
      (pattern) => `
      <div class="darkpattern-item ${pattern.severity}">
        <span class="darkpattern-icon">${pattern.severity === 'high' ? '🚨' : '⚠️'}</span>
        <div class="darkpattern-content">
          <div class="darkpattern-name">${escapeHtml(pattern.name)}</div>
          <div class="darkpattern-description">${escapeHtml(pattern.details || pattern.description)}</div>
          <span class="darkpattern-severity ${pattern.severity}">${pattern.severity} severity</span>
        </div>
      </div>
    `
    )
    .join("");
}

function handleCookiePopupDetected(message) {
  console.log("[Side Panel] Cookie popup detected:", message);

  // If dark patterns were found, we could show an alert in the UI
  if (message.hasDarkPatterns && message.darkPatternCount > 0) {
    // Store the patterns for later display
    window.detectedDarkPatterns = message.patterns;

    // Could add a notification badge or alert here
    console.log(`[Side Panel] ${message.darkPatternCount} dark patterns detected`);
  }

  // Store policy links for later use
  if (message.policyLinks && message.policyLinks.length > 0) {
    window.detectedPolicyLinks = message.policyLinks;
  }
}

function handleExternalPolicyLoading(message) {
  console.log("[Side Panel] Loading external policy:", message);

  // Show loading state with info about what we're fetching
  showState("loading");

  const policyTypeLabels = {
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    cookie: 'Cookie Policy',
    policy: 'Policy'
  };

  const typeLabel = policyTypeLabels[message.policyType] || 'Policy';

  // Update the loading message to show what we're fetching
  const loadingSection = document.getElementById("loading-state");
  if (loadingSection) {
    const existingMessage = loadingSection.querySelector(".loading-subtitle");
    if (existingMessage) {
      existingMessage.textContent = `Fetching ${typeLabel} from external page...`;
    }
  }

  updateStatus(`Fetching ${typeLabel}...`);
}
