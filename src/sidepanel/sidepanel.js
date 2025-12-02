// Side Panel JavaScript
// Handles UI updates, streaming responses, and chat functionality

let currentTabId = null;
let isAnalyzing = false;
let streamingContent = "";

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  setupEventListeners();
  setupMessageListeners();

  // Check if there's an analysis in progress or existing analysis
  await checkAnalysisStatus();
});

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
