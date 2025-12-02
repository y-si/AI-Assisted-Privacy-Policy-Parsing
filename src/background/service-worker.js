// Service Worker
// Handles API calls to OpenAI, message routing, and side panel management

// Store conversation history per tab
const conversations = new Map();

// Store analysis results per tab
const analysisResults = new Map();

// Store tabs that have been notified about policy detection
const notifiedTabs = new Set();

// Store tabs with analysis in progress
const analysisInProgress = new Set();

// Configure side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Failed to set panel behavior:", error));

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // Clear the badge when user clicks
  chrome.action.setBadgeText({ text: "", tabId: tab.id });
  chrome.action.setTitle({ title: "Privacy Policy Parser", tabId: tab.id });

  // Open side panel
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Try to open side panel for a tab (with fallback notification)
async function tryOpenSidePanel(tabId, reason = "detection") {
  try {
    const tab = await chrome.tabs.get(tabId);
    const window = await chrome.windows.get(tab.windowId);

    // Attempt to open the side panel
    await chrome.sidePanel.open({ windowId: window.id });
    console.log(`[Service Worker] Side panel opened for ${reason}`);

    // Clear the badge since panel is open
    chrome.action.setBadgeText({ text: "", tabId });
    return true;
  } catch (error) {
    console.log(
      `[Service Worker] Could not auto-open side panel for ${reason}:`,
      error.message
    );
    // The side panel couldn't be opened automatically (requires user gesture)
    // Set a badge to draw attention to the extension icon
    chrome.action.setBadgeText({ text: "!", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#f59e0b", tabId });
    chrome.action.setTitle({
      title: "Click to review privacy policy!",
      tabId,
    });
    return false;
  }
}

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Service Worker] Received message:", message.type);

  switch (message.type) {
    case "CONTENT_SCRIPT_READY":
      handleContentScriptReady(sender.tab);
      break;

    case "POLICY_DETECTED":
      handlePolicyDetected(message, sender.tab, sendResponse);
      return true;

    case "POLICY_AGREEMENT_CLICKED":
      handlePolicyAgreementClicked(message, sender.tab, sendResponse);
      return true;

    case "OPEN_SIDE_PANEL":
      // Open side panel immediately in response to user gesture
      // This MUST be the first async operation to preserve gesture context
      if (sender.tab?.id) {
        chrome.sidePanel
          .open({ tabId: sender.tab.id })
          .then(() => {
            console.log("[Service Worker] Side panel opened via user gesture");
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.log(
              "[Service Worker] Failed to open side panel:",
              error.message
            );
            sendResponse({ success: false, error: error.message });
          });
        return true; // Keep channel open for async
      }
      sendResponse({ success: false, error: "No tab ID" });
      break;

    case "ANALYZE_POLICY":
      handleAnalyzePolicy(message, sender.tab, sendResponse);
      return true; // Keep channel open for async

    case "GET_ANALYSIS":
      handleGetAnalysis(message, sendResponse);
      return true;

    case "GET_ANALYSIS_STATUS":
      // Check if analysis is in progress or complete
      const tabIdForStatus = message.tabId;
      const inProgress = analysisInProgress.has(tabIdForStatus);
      const existingAnalysis = analysisResults.get(tabIdForStatus);
      sendResponse({
        inProgress,
        success: !!existingAnalysis,
        analysis: existingAnalysis || null,
      });
      break;

    case "CHAT_MESSAGE":
      handleChatMessage(message, sendResponse);
      return true;

    case "GET_CONVERSATION":
      const conv = conversations.get(message.tabId) || [];
      sendResponse({ conversation: conv });
      break;

    case "CLEAR_CONVERSATION":
      conversations.delete(message.tabId);
      analysisResults.delete(message.tabId);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: "Unknown message type" });
  }
});

// Handle content script ready
function handleContentScriptReady(tab) {
  console.log("[Service Worker] Content script ready on tab:", tab.id, tab.url);
}

// Handle privacy policy detection - auto-open side panel
async function handlePolicyDetected(message, tab, sendResponse) {
  const tabId = tab?.id;
  if (!tabId) {
    sendResponse({ success: false, error: "No tab ID" });
    return;
  }

  // Check if we've already notified for this tab
  if (notifiedTabs.has(tabId)) {
    sendResponse({ success: false, alreadyNotified: true });
    return;
  }

  console.log(
    "[Service Worker] Policy detected on tab:",
    tabId,
    "confidence:",
    message.confidence
  );
  notifiedTabs.add(tabId);

  // Try to open side panel automatically
  const opened = await tryOpenSidePanel(tabId, "policy detection");

  // Notify the side panel about the detected policy
  chrome.runtime
    .sendMessage({
      type: "POLICY_DETECTED_NOTIFICATION",
      tabId,
      confidence: message.confidence,
      url: tab.url,
      autoOpened: opened,
    })
    .catch(() => {});

  sendResponse({ success: true, sidePanelOpened: opened });
}

// Handle when user clicks an "I agree" / "Accept" button on a privacy policy
async function handlePolicyAgreementClicked(message, tab, sendResponse) {
  const tabId = tab?.id;
  if (!tabId) {
    sendResponse({ success: false, error: "No tab ID" });
    return;
  }

  console.log(
    "[Service Worker] Privacy policy agreement clicked on tab:",
    tabId,
    "button text:",
    message.buttonText
  );

  // Try to open side panel automatically
  const opened = await tryOpenSidePanel(tabId, "policy agreement");

  // Notify the side panel about the agreement action
  chrome.runtime
    .sendMessage({
      type: "POLICY_AGREEMENT_NOTIFICATION",
      tabId,
      buttonText: message.buttonText,
      url: tab.url,
      autoOpened: opened,
    })
    .catch(() => {});

  sendResponse({ success: true, sidePanelOpened: opened });
}

// Handle policy analysis request
async function handleAnalyzePolicy(message, tab, sendResponse) {
  let tabId = tab?.id || message.tabId;

  try {
    // If no tabId, get the active tab
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tabId = activeTab?.id;
      console.log("[Service Worker] Got active tab:", tabId);
    }

    if (!tabId) {
      sendResponse({ error: "Could not determine which tab to analyze" });
      return;
    }

    // Mark analysis as in progress
    analysisInProgress.add(tabId);

    // Notify side panel that analysis is starting
    chrome.runtime
      .sendMessage({
        type: "ANALYSIS_STARTED",
        tabId,
      })
      .catch(() => {});

    // Get API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      analysisInProgress.delete(tabId);
      sendResponse({
        error:
          "API key not configured. Please set your OpenAI API key in the extension options.",
      });
      // Open options page
      chrome.runtime.openOptionsPage();
      return;
    }

    try {
      const window = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: window.id });
      console.log("[Service Worker] Side panel opened for window:", window.id);
    } catch (e) {
      console.log(
        "[Service Worker] Could not auto-open side panel:",
        e.message
      );
    }

    // Get policy content from content script
    console.log("[Service Worker] Requesting content from tab:", tabId);
    const contentResponse = await chrome.tabs.sendMessage(tabId, {
      type: "GET_POLICY_CONTENT",
    });

    if (!contentResponse.success) {
      analysisInProgress.delete(tabId);
      sendResponse({
        error:
          "Failed to extract policy content: " +
          (contentResponse.error || "Unknown error"),
      });
      return;
    }

    console.log(
      "[Service Worker] Got content, length:",
      contentResponse.content?.length
    );

    // Start streaming analysis
    sendResponse({ status: "started", tabId });

    // Perform analysis
    await analyzeWithOpenAI(
      tabId,
      contentResponse.content,
      contentResponse.title,
      contentResponse.url
    );
  } catch (error) {
    console.error("[Service Worker] Analysis error:", error);
    analysisInProgress.delete(tabId);
    sendResponse({ error: error.message });

    // Send error to side panel
    chrome.runtime
      .sendMessage({
        type: "ANALYSIS_ERROR",
        tabId,
        error: error.message,
      })
      .catch(() => {});
  }
}

// Analyze policy with OpenAI API
async function analyzeWithOpenAI(tabId, content, title, url) {
  const apiKey = await getApiKey();

  // Truncate content if too long - keep it reasonable for faster responses
  const maxLength = 50000; // ~12k tokens - balances speed and completeness
  const truncatedContent =
    content.length > maxLength
      ? content.substring(0, maxLength) +
        "\n\n[Content truncated due to length...]"
      : content;

  console.log(
    `[Service Worker] Analyzing policy: ${title} (${content.length} chars, truncated to ${truncatedContent.length})`
  );

  const systemPrompt = `You are a privacy policy analyst helping users understand complex legal documents. Your goal is to make privacy policies accessible and highlight important information that users should know before accepting terms.

Analyze the provided privacy policy and respond with a JSON object in the following format:
{
  "summary": "A clear, jargon-free 2-3 paragraph summary of what this policy means for users",
  "risks": [
    {
      "level": "HIGH|MEDIUM|LOW",
      "title": "Brief risk title",
      "description": "What this means for the user",
      "quote": "Exact quote from the policy that supports this risk"
    }
  ],
  "dataCollection": [
    {
      "type": "Type of data",
      "description": "How it's collected and used",
      "quote": "Supporting quote from policy"
    }
  ],
  "dataSharing": [
    {
      "recipient": "Who data is shared with",
      "purpose": "Why it's shared",
      "quote": "Supporting quote"
    }
  ],
  "userRights": [
    {
      "right": "Right name",
      "description": "How to exercise it",
      "quote": "Supporting quote"
    }
  ],
  "overallRating": "GOOD|MODERATE|CONCERNING",
  "ratingExplanation": "Brief explanation of the overall rating"
}

Important guidelines:
- Be objective and factual
- Include exact quotes that can be found in the document for each risk/item
- Highlight any unusual or concerning clauses
- Note any missing standard protections
- Consider GDPR, CCPA, and other privacy regulations
- Rate risks as HIGH (significant privacy concern), MEDIUM (notable but common), or LOW (minor or standard practice)
- Return ONLY the JSON object, no additional text`;

  const userPrompt = `Please analyze this privacy policy:

Title: ${title}
URL: ${url}

Content:
${truncatedContent}`;

  try {
    // Initialize conversation for this tab
    conversations.set(tabId, [
      {
        role: "user",
        content: userPrompt,
      },
    ]);

    // Call OpenAI API with streaming
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content;

            if (chunk) {
              fullResponse += chunk;

              // Send chunk to side panel
              chrome.runtime
                .sendMessage({
                  type: "STREAM_CHUNK",
                  tabId,
                  content: chunk,
                })
                .catch(() => {});
            }
          } catch (e) {
            // Skip unparseable chunks
          }
        }
      }
    }

    // Store the full response
    const conversation = conversations.get(tabId) || [];
    conversation.push({
      role: "assistant",
      content: fullResponse,
    });
    conversations.set(tabId, conversation);

    // Try to parse and store the analysis result
    try {
      // Extract JSON from the response (it might have markdown formatting)
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        analysisResults.set(tabId, analysis);
      }
    } catch (e) {
      console.warn("Could not parse analysis as JSON:", e);
    }

    // Clear in-progress status
    analysisInProgress.delete(tabId);

    // Notify completion
    chrome.runtime
      .sendMessage({
        type: "STREAM_COMPLETE",
        tabId,
        fullResponse,
      })
      .catch(() => {});
  } catch (error) {
    console.error("[Service Worker] OpenAI API error:", error);
    analysisInProgress.delete(tabId);
    chrome.runtime
      .sendMessage({
        type: "ANALYSIS_ERROR",
        tabId,
        error: error.message,
      })
      .catch(() => {});
  }
}

// Handle chat messages
async function handleChatMessage(message, sendResponse) {
  const { tabId, userMessage } = message;

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ error: "API key not configured" });
      return;
    }

    // Get existing conversation
    const conversation = conversations.get(tabId) || [];

    // Add user message
    conversation.push({
      role: "user",
      content: userMessage,
    });

    // Build messages array for OpenAI
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant answering follow-up questions about a privacy policy that was just analyzed. Be very concise and specific to the policy. Do not respond in more than 2-3 sentences.",
      },
      ...conversation,
    ];

    // Send to OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini-2025-08-07",
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let buffer = "";

    sendResponse({ status: "streaming" });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content;

            if (chunk) {
              fullResponse += chunk;

              chrome.runtime
                .sendMessage({
                  type: "CHAT_CHUNK",
                  tabId,
                  content: chunk,
                })
                .catch(() => {});
            }
          } catch (e) {}
        }
      }
    }

    // Update conversation
    conversation.push({
      role: "assistant",
      content: fullResponse,
    });
    conversations.set(tabId, conversation);

    chrome.runtime
      .sendMessage({
        type: "CHAT_COMPLETE",
        tabId,
        fullResponse,
      })
      .catch(() => {});
  } catch (error) {
    console.error("[Service Worker] Chat error:", error);
    sendResponse({ error: error.message });
  }
}

// Handle get analysis request
async function handleGetAnalysis(message, sendResponse) {
  const { tabId } = message;
  const analysis = analysisResults.get(tabId);

  if (analysis) {
    sendResponse({ success: true, analysis });
  } else {
    sendResponse({ success: false, error: "No analysis available" });
  }
}

// Get API key from storage
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["openaiApiKey"], (result) => {
      resolve(result.openaiApiKey || null);
    });
  });
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  conversations.delete(tabId);
  analysisResults.delete(tabId);
  notifiedTabs.delete(tabId);
  analysisInProgress.delete(tabId);
});

// Also reset notification when tab navigates to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    // Tab is navigating to a new URL, reset notification status
    notifiedTabs.delete(tabId);
  }
});

console.log("[Service Worker] Privacy Policy Parser service worker loaded");
