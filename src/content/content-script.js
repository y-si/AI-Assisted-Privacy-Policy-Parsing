// Main Content Script
// Coordinates detection, extraction, overlay, and highlighting

(async function() {
  'use strict';

  // Wait for page to be fully loaded
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve));
  }

  // Initialize components
  const detector = new PolicyDetector();
  const extractor = new PolicyExtractor();
  const overlay = new PolicyOverlay();
  const highlighter = new ClauseHighlighter();

  // Store extracted content for later use
  let extractedContent = null;

  // Run detection
  async function runDetection() {
    const result = detector.detect();

    console.log('[Privacy Parser] Detection result:', result);

    if (result.isPolicy) {
      // Show overlay notification
      overlay.show(result.confidence);

      // Pre-extract content for faster analysis
      extractedContent = await extractor.extract();
      console.log('[Privacy Parser] Content extracted:', extractedContent.method);
    }
  }

  // Handle messages from service worker and side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Privacy Parser] Received message:', message.type);

    switch (message.type) {
      case 'GET_POLICY_CONTENT':
        handleGetContent(sendResponse);
        return true; // Keep channel open for async response

      case 'HIGHLIGHT_CLAUSE':
        handleHighlightClause(message);
        sendResponse({ success: true });
        break;

      case 'CLEAR_HIGHLIGHTS':
        highlighter.clearAllHighlights();
        sendResponse({ success: true });
        break;

      case 'CHECK_POLICY':
        const detection = detector.detect();
        sendResponse(detection);
        break;

      case 'SHOW_OVERLAY':
        overlay.show(message.confidence || 0.8);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  });

  async function handleGetContent(sendResponse) {
    try {
      // Use cached content if available, otherwise extract
      if (!extractedContent) {
        extractedContent = await extractor.extract();
      }

      sendResponse({
        success: true,
        content: extractedContent.textContent,
        title: extractedContent.title,
        url: window.location.href,
        method: extractedContent.method
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  function handleHighlightClause(message) {
    const { quote, clauseId } = message;

    if (quote) {
      highlighter.highlightClause(quote, {
        scrollIntoView: true,
        duration: 5000
      });
    }
  }

  // Watch for dynamic content changes (for SPAs)
  const observer = new MutationObserver(debounce(() => {
    // Re-run detection if significant DOM changes occur
    if (!overlay.isVisible) {
      const result = detector.detect();
      if (result.isPolicy && result.confidence > 0.7) {
        overlay.showMinimalIndicator();
      }
    }
  }, 2000));

  // Observe body for major changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Utility: Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Run initial detection with a small delay to ensure page is stable
  setTimeout(runDetection, 500);

  // Notify service worker that content script is ready
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    url: window.location.href
  });

})();
