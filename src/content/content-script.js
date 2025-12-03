// Main Content Script
// Coordinates detection, extraction, overlay, and highlighting

(async function () {
  "use strict";

  // Wait for page to be fully loaded
  if (document.readyState !== "complete") {
    await new Promise((resolve) => window.addEventListener("load", resolve));
  }

  // Initialize components
  const detector = new PolicyDetector();
  const enhancedDetector = new EnhancedDetector();
  const extractor = new PolicyExtractor();
  const overlay = new PolicyOverlay();
  const highlighter = new ClauseHighlighter();

  // Store extracted content for later use
  let extractedContent = null;

  // Store enhanced detection results
  let enhancedDetectionResults = null;

  // Track if agreement button detection has been set up
  let agreementDetectionEnabled = false;

  // Track checkboxes we've already notified about (to prevent duplicates)
  const notifiedCheckboxes = new Set();

  // Patterns for detecting "I agree" / "Accept" buttons
  const AGREEMENT_BUTTON_PATTERNS = [
    /^i agree$/i,
    /^agree$/i,
    /^accept$/i,
    /^i accept$/i,
    /^accept all$/i,
    /^accept terms$/i,
    /^accept and continue$/i,
    /^i have read and agree$/i,
    /^continue$/i,
    /^got it$/i,
    /^ok$/i,
    /^okay$/i,
    /^submit$/i,
    /^confirm$/i,
    /^i consent$/i,
    /^consent$/i,
    /^agree and continue$/i,
    /^accept cookies$/i,
    /^allow all$/i,
    /^allow cookies$/i,
  ];

  // Patterns for detecting agreement checkboxes (text near the checkbox)
  const AGREEMENT_CHECKBOX_PATTERNS = [
    /i have read and agree/i,
    /i agree to/i,
    /i accept the/i,
    /i consent to/i,
    /agree to the terms/i,
    /accept the terms/i,
    /terms of service/i,
    /terms and conditions/i,
    /privacy policy/i,
    /privacy statement/i,
    /privacy notice/i,
    /user agreement/i,
    /terms of use/i,
    /by checking this box/i,
    /by clicking/i,
    /i acknowledge/i,
  ];

  // Patterns for detecting implicit agreement text (like on Yelp signup)
  const IMPLICIT_AGREEMENT_PATTERNS = [
    /by continuing,?\s*(you\s+)?agree\s+to/i,
    /by signing up,?\s*(you\s+)?agree\s+to/i,
    /by clicking,?\s*(you\s+)?agree\s+to/i,
    /by creating an account,?\s*(you\s+)?agree\s+to/i,
    /by registering,?\s*(you\s+)?agree\s+to/i,
    /by using this,?\s*(you\s+)?agree\s+to/i,
    /by accessing,?\s*(you\s+)?agree\s+to/i,
    /by proceeding,?\s*(you\s+)?agree\s+to/i,
    /by submitting,?\s*(you\s+)?agree\s+to/i,
    /clicking .* (means|indicates) you agree/i,
    /continuing (means|indicates) you agree/i,
    /you agree to our/i,
    /you acknowledge .* (terms|privacy|policy)/i,
    /acknowledge (and|&) agree/i,
  ];

  // Track if we've already shown the implicit agreement notification
  let implicitAgreementNotified = false;

  // Run detection
  async function runDetection() {
    const result = detector.detect();

    console.log("[Privacy Parser] Detection result:", result);

    if (result.isPolicy) {
      // Show overlay notification
      overlay.show(result.confidence);

      // Pre-extract content for faster analysis
      extractedContent = await extractor.extract();
      console.log(
        "[Privacy Parser] Content extracted:",
        extractedContent.method
      );

      // Notify service worker to auto-open side panel
      try {
        const response = await chrome.runtime.sendMessage({
          type: "POLICY_DETECTED",
          confidence: result.confidence,
          url: window.location.href,
        });
        console.log(
          "[Privacy Parser] Policy detection notification sent:",
          response
        );
      } catch (error) {
        console.log(
          "[Privacy Parser] Could not notify service worker:",
          error.message
        );
      }

      // Set up agreement button detection for this page
      setupAgreementButtonDetection();
    }

    // Also check for implicit agreement text (like "By continuing, you agree to...")
    checkForImplicitAgreement();

    // Run enhanced detection for cookie popups and dark patterns
    runEnhancedDetection();
  }

  // Run enhanced detection for cookie popups, dark patterns, etc.
  async function runEnhancedDetection() {
    enhancedDetectionResults = enhancedDetector.runFullDetection();

    console.log("[Privacy Parser] Enhanced detection results:", enhancedDetectionResults);

    // If cookie popup detected, show appropriate notification
    if (enhancedDetectionResults.cookiePopup.detected) {
      const darkPatterns = enhancedDetectionResults.cookiePopup.darkPatterns;
      const policyLinks = enhancedDetectionResults.cookiePopup.policyLinks;

      console.log("[Privacy Parser] Cookie popup detected with links:", policyLinks);

      // Show the cookie popup notification with policy links
      if (policyLinks.length > 0 || darkPatterns.length > 0) {
        overlay.showCookiePopupNotification(policyLinks, darkPatterns);
      }

      // Notify service worker about cookie popup detection
      try {
        await chrome.runtime.sendMessage({
          type: "COOKIE_POPUP_DETECTED",
          hasDarkPatterns: darkPatterns.length > 0,
          darkPatternCount: darkPatterns.length,
          patterns: darkPatterns.map(p => ({ id: p.id, name: p.name, severity: p.severity })),
          policyLinks: policyLinks.map(l => ({ url: l.url, text: l.text, type: l.type })),
          url: window.location.href,
        });
      } catch (error) {
        console.log("[Privacy Parser] Could not notify about cookie popup:", error.message);
      }
    }

    // Check for signup agreements
    if (enhancedDetectionResults.signupAgreements.length > 0) {
      console.log("[Privacy Parser] Signup agreements found:", enhancedDetectionResults.signupAgreements);

      // Notify about implicit agreements
      const implicitAgreements = enhancedDetectionResults.signupAgreements.filter(a => a.isImplicit);
      if (implicitAgreements.length > 0) {
        try {
          await chrome.runtime.sendMessage({
            type: "SIGNUP_AGREEMENT_DETECTED",
            isImplicit: true,
            count: implicitAgreements.length,
            url: window.location.href,
          });
        } catch (error) {
          console.log("[Privacy Parser] Could not notify about signup agreement:", error.message);
        }
      }
    }
  }

  // Check for implicit agreement text on the page
  function checkForImplicitAgreement() {
    if (implicitAgreementNotified) return;

    // Get all text content from the page
    const bodyText = document.body.innerText;

    // Check each pattern
    for (const pattern of IMPLICIT_AGREEMENT_PATTERNS) {
      if (pattern.test(bodyText)) {
        console.log("[Privacy Parser] Found implicit agreement text:", pattern);
        
        // Find the element containing this text
        const element = findElementWithText(pattern);
        if (element) {
          implicitAgreementNotified = true;
          
          // Show the agreement notification
          overlay.showAgreementNotification("By continuing, you agree to Terms/Privacy Policy");
          
          // Notify service worker
          chrome.runtime.sendMessage({
            type: "POLICY_AGREEMENT_CLICKED",
            buttonText: "Implicit agreement detected",
            url: window.location.href,
          }).catch(() => {});
          
          // Set up detection for continue/signup buttons near this text
          setupImplicitAgreementButtonDetection(element);
        }
        break;
      }
    }
  }

  // Find the DOM element containing text matching the pattern
  function findElementWithText(pattern) {
    // Look for common containers that might have agreement text
    const selectors = [
      'p', 'span', 'div', 'label', 'small', 'footer',
      '[class*="terms"]', '[class*="agreement"]', '[class*="legal"]',
      '[class*="consent"]', '[class*="policy"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent || '';
        if (pattern.test(text) && text.length < 500) {
          return el;
        }
      }
    }
    return null;
  }

  // Set up detection for buttons that would trigger implicit agreement
  function setupImplicitAgreementButtonDetection(agreementElement) {
    // Find buttons that are likely to be "continue" or "sign up" buttons
    const continueButtonPatterns = [
      /continue/i,
      /sign up/i,
      /sign in/i,
      /log in/i,
      /login/i,
      /create account/i,
      /register/i,
      /get started/i,
      /join/i,
      /submit/i,
      /next/i,
    ];

    // Find the parent container
    const container = agreementElement.closest('form, [role="dialog"], .modal, [class*="modal"], [class*="signup"], [class*="login"], [class*="register"], section, main') || document.body;

    // Look for buttons in the same container
    const buttons = container.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="btn"], a[class*="button"]');
    
    buttons.forEach(button => {
      const buttonText = (button.textContent || button.value || '').trim();
      
      for (const pattern of continueButtonPatterns) {
        if (pattern.test(buttonText)) {
          console.log("[Privacy Parser] Found continue button:", buttonText);
          
          // Add a click listener to warn the user
          button.addEventListener('click', async (event) => {
            console.log("[Privacy Parser] Continue button clicked (implicit agreement):", buttonText);
            
            // Show warning overlay
            overlay.showAgreementNotification(`Clicking "${buttonText}" agrees to Terms/Privacy`);
            
            // Notify service worker
            try {
              await chrome.runtime.sendMessage({
                type: "POLICY_AGREEMENT_CLICKED",
                buttonText: buttonText,
                url: window.location.href,
              });
            } catch (error) {
              console.log("[Privacy Parser] Could not notify:", error.message);
            }
          }, { capture: true, once: true });
          
          break;
        }
      }
    });
  }

  // Detect and monitor "I agree" / "Accept" buttons
  function setupAgreementButtonDetection() {
    // Only set up once
    if (agreementDetectionEnabled) return;
    agreementDetectionEnabled = true;

    // Find potential agreement buttons
    const findAgreementButtons = () => {
      const selectors = [
        "button",
        'input[type="submit"]',
        'input[type="button"]',
        'a[role="button"]',
        '[role="button"]',
        ".btn",
        ".button",
      ];

      const elements = document.querySelectorAll(selectors.join(", "));
      const agreementButtons = [];

      elements.forEach((el) => {
        const text = (el.textContent || el.value || "").trim();

        // Check if button text matches agreement patterns
        for (const pattern of AGREEMENT_BUTTON_PATTERNS) {
          if (pattern.test(text)) {
            agreementButtons.push({ element: el, text });
            break;
          }
        }
      });

      return agreementButtons;
    };

    // Handle agreement button click
    const handleAgreementClick = async (event) => {
      const clickedElement = event.target;
      const text = (
        clickedElement.textContent ||
        clickedElement.value ||
        ""
      ).trim();

      // Check if this matches an agreement pattern
      let isAgreementButton = false;
      for (const pattern of AGREEMENT_BUTTON_PATTERNS) {
        if (pattern.test(text)) {
          isAgreementButton = true;
          break;
        }
      }

      // Also check parent elements (for buttons with nested text)
      if (!isAgreementButton) {
        let parent = clickedElement.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const parentText = (parent.textContent || "").trim();
          for (const pattern of AGREEMENT_BUTTON_PATTERNS) {
            if (pattern.test(parentText) && parentText.length < 50) {
              isAgreementButton = true;
              break;
            }
          }
          if (isAgreementButton) break;
          parent = parent.parentElement;
        }
      }

      if (isAgreementButton) {
        console.log("[Privacy Parser] Agreement button clicked:", text);

        // Show warning overlay
        overlay.showAgreementNotification(text);

        // Notify service worker
        try {
          const response = await chrome.runtime.sendMessage({
            type: "POLICY_AGREEMENT_CLICKED",
            buttonText: text,
            url: window.location.href,
          });
          console.log(
            "[Privacy Parser] Agreement notification sent:",
            response
          );
        } catch (error) {
          console.log(
            "[Privacy Parser] Could not notify service worker:",
            error.message
          );
        }
      }
    };

    // Add click listener to document (capturing phase to catch early)
    document.addEventListener("click", handleAgreementClick, true);

    // Handle agreement checkbox changes
    const handleCheckboxChange = async (event) => {
      const checkbox = event.target;

      // Only trigger on checking the box (not unchecking)
      if (!checkbox.checked) return;

      // Create a unique identifier for this checkbox
      const checkboxId =
        checkbox.id || checkbox.name || Math.random().toString();

      // Prevent duplicate notifications for the same checkbox
      if (notifiedCheckboxes.has(checkboxId)) {
        console.log(
          "[Privacy Parser] Already notified for checkbox:",
          checkboxId
        );
        return;
      }

      // Get the text associated with this checkbox
      const associatedText = getCheckboxAssociatedText(checkbox);
      console.log(
        "[Privacy Parser] Checkbox associated text:",
        associatedText.substring(0, 200)
      );

      // Check if this is an agreement checkbox
      let isAgreementCheckbox = false;
      for (const pattern of AGREEMENT_CHECKBOX_PATTERNS) {
        if (pattern.test(associatedText)) {
          isAgreementCheckbox = true;
          console.log("[Privacy Parser] Matched pattern:", pattern);
          break;
        }
      }

      if (isAgreementCheckbox) {
        // Mark this checkbox as notified
        notifiedCheckboxes.add(checkboxId);

        console.log(
          "[Privacy Parser] Agreement checkbox checked:",
          associatedText.substring(0, 100)
        );

        // Show warning overlay
        overlay.showAgreementNotification("I agree to Terms/Privacy Policy");

        // Notify service worker
        try {
          const response = await chrome.runtime.sendMessage({
            type: "POLICY_AGREEMENT_CLICKED",
            buttonText: "Checkbox: " + associatedText.substring(0, 50),
            url: window.location.href,
          });
          console.log(
            "[Privacy Parser] Checkbox agreement notification sent:",
            response
          );
        } catch (error) {
          console.log(
            "[Privacy Parser] Could not notify service worker:",
            error.message
          );
        }

        // Clear the notification flag after 5 seconds (in case user unchecks and rechecks)
        setTimeout(() => {
          notifiedCheckboxes.delete(checkboxId);
        }, 5000);
      }
    };

    // Get text associated with a checkbox (label, nearby text, etc.)
    function getCheckboxAssociatedText(checkbox) {
      let text = "";

      // Check for associated label via 'for' attribute
      if (checkbox.id) {
        const label = document.querySelector(`label[for="${checkbox.id}"]`);
        if (label) {
          text += " " + label.textContent;
        }
      }

      // Check for parent label element
      const parentLabel = checkbox.closest("label");
      if (parentLabel) {
        text += " " + parentLabel.textContent;
      }

      // Check for nearby text in parent container
      const parent = checkbox.parentElement;
      if (parent) {
        text += " " + parent.textContent;
      }

      // Check grandparent too (for nested structures)
      const grandparent = parent?.parentElement;
      if (grandparent) {
        // Only get direct text, not too much
        const grandparentText = grandparent.textContent || "";
        if (grandparentText.length < 500) {
          text += " " + grandparentText;
        }
      }

      // Also check for aria-label
      if (checkbox.getAttribute("aria-label")) {
        text += " " + checkbox.getAttribute("aria-label");
      }

      return text.trim();
    }

    // Listen for checkbox changes
    document.addEventListener(
      "change",
      (event) => {
        if (event.target.type === "checkbox") {
          console.log(
            "[Privacy Parser] Checkbox change detected:",
            event.target.id
          );
          handleCheckboxChange(event);
        }
      },
      true
    );

    // Also listen for clicks on labels (for custom checkbox implementations)
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;

        // Check if clicked on a label or inside a label
        const label = target.closest("label");
        if (label) {
          // Find the associated checkbox
          let checkbox = null;

          // Check for 'for' attribute
          if (label.htmlFor) {
            checkbox = document.getElementById(label.htmlFor);
          }

          // Check for checkbox inside the label
          if (!checkbox) {
            checkbox = label.querySelector('input[type="checkbox"]');
          }

          if (checkbox) {
            console.log(
              "[Privacy Parser] Label click detected for checkbox:",
              checkbox.id
            );
            // Small delay to let the checkbox state update
            setTimeout(() => {
              if (checkbox.checked) {
                handleCheckboxChange({ target: checkbox });
              }
            }, 50);
          }
        }

        // Also check if clicked directly on a checkbox
        if (target.type === "checkbox") {
          console.log("[Privacy Parser] Direct checkbox click:", target.id);
          setTimeout(() => {
            if (target.checked) {
              handleCheckboxChange({ target: target });
            }
          }, 50);
        }
      },
      true
    );

    console.log(
      "[Privacy Parser] Agreement button and checkbox detection enabled"
    );
  }

  // Handle messages from service worker and side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Privacy Parser] Received message:", message.type);

    switch (message.type) {
      case "GET_POLICY_CONTENT":
        handleGetContent(sendResponse);
        return true; // Keep channel open for async response

      case "HIGHLIGHT_CLAUSE":
        handleHighlightClause(message);
        sendResponse({ success: true });
        break;

      case "CLEAR_HIGHLIGHTS":
        highlighter.clearAllHighlights();
        sendResponse({ success: true });
        break;

      case "CHECK_POLICY":
        const detection = detector.detect();
        sendResponse(detection);
        break;

      case "SHOW_OVERLAY":
        overlay.show(message.confidence || 0.8);
        sendResponse({ success: true });
        break;

      case "GET_ENHANCED_DETECTION":
        // Return enhanced detection results
        if (!enhancedDetectionResults) {
          enhancedDetectionResults = enhancedDetector.runFullDetection();
        }
        sendResponse({
          success: true,
          results: {
            hasCookiePopup: enhancedDetectionResults.cookiePopup.detected,
            darkPatterns: enhancedDetectionResults.cookiePopup.darkPatterns || [],
            signupAgreements: enhancedDetectionResults.signupAgreements.length,
            summary: enhancedDetectionResults.summary
          }
        });
        break;

      default:
        sendResponse({ error: "Unknown message type" });
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
        method: extractedContent.method,
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
      });
    }
  }

  function handleHighlightClause(message) {
    const { quote, clauseId } = message;

    if (quote) {
      highlighter.highlightClause(quote, {
        scrollIntoView: true,
        duration: 5000,
      });
    }
  }

  // Watch for dynamic content changes (for SPAs)
  const observer = new MutationObserver(
    debounce(() => {
      // Re-run detection if significant DOM changes occur
      if (!overlay.isVisible) {
        const result = detector.detect();
        if (result.isPolicy && result.confidence > 0.7) {
          overlay.showMinimalIndicator();
        }
      }
      
      // Also check for implicit agreement text that might have loaded dynamically
      if (!implicitAgreementNotified) {
        checkForImplicitAgreement();
      }
    }, 2000)
  );

  // Observe body for major changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
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

  // Always set up agreement button detection (for cookie banners, modals, etc.)
  // even if the page isn't a dedicated policy page
  setTimeout(() => {
    setupAgreementButtonDetection();
  }, 1000);

  // Check for implicit agreement text (like "By continuing, you agree to...")
  // This runs separately to catch signup/login pages that aren't policy pages
  setTimeout(() => {
    if (!implicitAgreementNotified) {
      checkForImplicitAgreement();
    }
  }, 1500);

  // Notify service worker that content script is ready
  chrome.runtime.sendMessage({
    type: "CONTENT_SCRIPT_READY",
    url: window.location.href,
  });
})();
