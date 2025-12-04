// Service Worker
// Handles API calls to OpenAI, message routing, and side panel management

// Store conversation history per tab
const conversations = new Map();

// Store analysis results per tab (includes the policy URL that was analyzed)
const analysisResults = new Map();

// Store the URL of the policy that was analyzed (may differ from tab URL for external policies)
const analyzedPolicyUrls = new Map();

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
      sendResponse({ success: true });
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

    case "SIMPLIFY_ANALYSIS":
      handleSimplifyAnalysis(message, sendResponse);
      return true;

    case "EXTRACT_KEYPOINTS":
      handleExtractKeyPoints(message, sendResponse);
      return true;

    case "ANALYZE_EXTERNAL_POLICY":
      handleAnalyzeExternalPolicy(message, sender, sendResponse);
      return true;

    case "GET_POLICY_URL":
      // Return the URL of the policy that was analyzed for this tab
      const policyUrl = analyzedPolicyUrls.get(message.tabId);
      sendResponse({ success: !!policyUrl, url: policyUrl || null });
      break;

    case "OPEN_POLICY_WITH_HIGHLIGHT":
      // Open the policy URL in a new tab and highlight a quote
      handleOpenPolicyWithHighlight(message, sendResponse);
      return true;

    default:
      sendResponse({ error: "Unknown message type" });
  }
});

// Handle content script ready
async function handleContentScriptReady(tab) {
  console.log("[Service Worker] Content script ready on tab:", tab.id, tab.url);

  // Check if there's a pending highlight for this tab
  const pendingQuote = pendingHighlights.get(tab.id);
  if (pendingQuote) {
    console.log("[Service Worker] Sending pending highlight to tab:", tab.id);

    // Wait a moment for the page to fully render
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "HIGHLIGHT_CLAUSE",
        quote: pendingQuote,
      });
      console.log("[Service Worker] Pending highlight sent successfully");
    } catch (error) {
      console.log("[Service Worker] Could not send pending highlight:", error.message);
    }

    // Remove the pending highlight
    pendingHighlights.delete(tab.id);
  }
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

    // Store the URL being analyzed (same as tab URL for regular analysis)
    analyzedPolicyUrls.set(tabId, contentResponse.url);

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

// Handle simplify analysis request
async function handleSimplifyAnalysis(message, sendResponse) {
  const { tabId, analysis } = message;

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ error: "API key not configured" });
      chrome.runtime
        .sendMessage({
          type: "SIMPLIFY_ERROR",
          tabId,
          error: "API key not configured",
        })
        .catch(() => {});
      return;
    }

    sendResponse({ status: "processing" });

    const systemPrompt = `You are an expert at making complex legal language accessible to everyone. Your task is to simplify a privacy policy analysis so that it can be understood by a 5th grader (10-11 years old).

Rules for simplification:
1. Use simple, everyday words (no legal jargon)
2. Keep sentences short (under 15 words when possible)
3. Use concrete examples when helpful
4. Explain what things mean for the reader personally
5. Keep the same JSON structure as the input
6. Maintain accuracy while simplifying

Return ONLY a valid JSON object with the same structure as the input, but with simplified text.`;

    const userPrompt = `Please simplify this privacy policy analysis for a 5th grade reading level:

${JSON.stringify(analysis, null, 2)}

Remember: Return ONLY the JSON object with simplified text, keeping the exact same structure.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the simplified analysis
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const simplifiedAnalysis = JSON.parse(jsonMatch[0]);
      chrome.runtime
        .sendMessage({
          type: "SIMPLIFY_COMPLETE",
          tabId,
          simplifiedAnalysis,
        })
        .catch(() => {});
    } else {
      throw new Error("Could not parse simplified analysis");
    }
  } catch (error) {
    console.error("[Service Worker] Simplify error:", error);
    chrome.runtime
      .sendMessage({
        type: "SIMPLIFY_ERROR",
        tabId,
        error: error.message,
      })
      .catch(() => {});
  }
}

// Handle key points extraction request
async function handleExtractKeyPoints(message, sendResponse) {
  const { tabId, analysis } = message;

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ error: "API key not configured" });
      chrome.runtime
        .sendMessage({
          type: "KEYPOINTS_ERROR",
          tabId,
          error: "API key not configured",
        })
        .catch(() => {});
      return;
    }

    sendResponse({ status: "processing" });

    const systemPrompt = `You are an expert at distilling complex privacy policies into their most essential points. Your task is to extract two types of information from a privacy policy analysis:

1. **Most Important Points**: The 3-5 things every user MUST know before accepting this policy. Focus on:
   - What data is collected
   - How data is used/shared
   - Key rights users have or don't have
   - Important limitations or conditions

2. **Unusual or Standout Clauses**: 2-4 things that are unusual, surprising, or different from typical privacy policies. These could be:
   - Unusually broad data collection
   - Surprising third-party sharing
   - Uncommon restrictions on user rights
   - Particularly good or bad practices
   - Anything that would make someone say "wait, really?"

Return a JSON object in this exact format:
{
  "importantPoints": [
    {
      "title": "Brief title (5-8 words)",
      "description": "One sentence explanation of why this matters",
      "category": "data_collection|data_sharing|data_retention|user_rights|security|cookies|third_party"
    }
  ],
  "standoutPoints": [
    {
      "title": "Brief title (5-8 words)",
      "description": "One sentence explanation of what's unusual about this",
      "isConcerning": true/false
    }
  ]
}

Be concise. Each description should be ONE sentence maximum. Focus on what actually matters to users.`;

    const userPrompt = `Extract the key points and standout clauses from this privacy policy analysis:

${JSON.stringify(analysis, null, 2)}

Remember: Return ONLY the JSON object. Be very concise - one sentence per description maximum.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the key points
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const keyPoints = JSON.parse(jsonMatch[0]);
      chrome.runtime
        .sendMessage({
          type: "KEYPOINTS_COMPLETE",
          tabId,
          keyPoints,
        })
        .catch(() => {});
    } else {
      throw new Error("Could not parse key points");
    }
  } catch (error) {
    console.error("[Service Worker] Key points error:", error);
    chrome.runtime
      .sendMessage({
        type: "KEYPOINTS_ERROR",
        tabId,
        error: error.message,
      })
      .catch(() => {});
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

// Handle analyzing an external policy URL (from cookie banner links)
async function handleAnalyzeExternalPolicy(message, sender, sendResponse) {
  const { url, policyType } = message;
  const tabId = sender.tab?.id;

  if (!tabId) {
    sendResponse({ error: "No tab ID" });
    return;
  }

  console.log("[Service Worker] Analyzing external policy:", url, policyType);

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ error: "API key not configured" });
      chrome.runtime.sendMessage({
        type: "ANALYSIS_ERROR",
        tabId,
        error: "API key not configured. Please set your OpenAI API key in the extension settings.",
      }).catch(() => {});
      return;
    }

    sendResponse({ status: "fetching" });

    // Notify side panel that we're fetching the external policy
    chrome.runtime.sendMessage({
      type: "EXTERNAL_POLICY_LOADING",
      tabId,
      url,
      policyType,
    }).catch(() => {});

    // Fetch the external policy page content
    let policyContent;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PrivacyPolicyHelper/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch policy: HTTP ${response.status}`);
      }

      const html = await response.text();

      // Extract text content from HTML
      policyContent = extractTextFromHtml(html);

      if (!policyContent || policyContent.length < 200) {
        throw new Error("Could not extract sufficient content from the policy page");
      }
    } catch (fetchError) {
      console.error("[Service Worker] Fetch error:", fetchError);
      chrome.runtime.sendMessage({
        type: "ANALYSIS_ERROR",
        tabId,
        error: `Could not fetch the policy page: ${fetchError.message}. The site may block external requests.`,
      }).catch(() => {});
      return;
    }

    // Truncate if too long
    const maxLength = 50000;
    if (policyContent.length > maxLength) {
      policyContent = policyContent.substring(0, maxLength) + "\n[Content truncated due to length]";
    }

    // Now analyze with streaming
    analysisInProgress.add(tabId);

    // Store the external URL being analyzed (different from tab URL)
    analyzedPolicyUrls.set(tabId, url);

    // Generate a title based on policy type
    const policyTypeLabels = {
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      cookie: 'Cookie Policy',
      policy: 'Policy'
    };
    const title = policyTypeLabels[policyType] || 'External Policy';

    chrome.runtime.sendMessage({
      type: "ANALYSIS_STARTED",
      tabId,
      url,
      isExternalPolicy: true,
      policyType,
    }).catch(() => {});

    // Use the same analysis logic as regular policies
    await analyzeWithOpenAI(tabId, policyContent, title, url);

  } catch (error) {
    console.error("[Service Worker] External policy analysis error:", error);
    chrome.runtime.sendMessage({
      type: "ANALYSIS_ERROR",
      tabId,
      error: error.message,
    }).catch(() => {});
  }
}

// Extract text content from HTML
function extractTextFromHtml(html) {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// Get API key from storage
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["openaiApiKey"], (result) => {
      resolve(result.openaiApiKey || null);
    });
  });
}

// Store pending highlights for new tabs (quote to highlight when page loads)
const pendingHighlights = new Map();

// Handle opening a policy URL in a new tab with a highlight
async function handleOpenPolicyWithHighlight(message, sendResponse) {
  const { url, quote } = message;

  try {
    // Create a new tab with the policy URL
    const newTab = await chrome.tabs.create({ url: url });

    // Store the pending highlight for this tab
    if (quote) {
      pendingHighlights.set(newTab.id, quote);
    }

    sendResponse({ success: true, tabId: newTab.id });
  } catch (error) {
    console.error("[Service Worker] Error opening policy with highlight:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  conversations.delete(tabId);
  analysisResults.delete(tabId);
  analyzedPolicyUrls.delete(tabId);
  notifiedTabs.delete(tabId);
  analysisInProgress.delete(tabId);
  pendingHighlights.delete(tabId);
});

// Also reset notification when tab navigates to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    // Tab is navigating to a new URL, reset notification status
    notifiedTabs.delete(tabId);
  }
});

console.log("[Service Worker] Privacy Policy Parser service worker loaded");
