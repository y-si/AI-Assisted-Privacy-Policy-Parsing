// Overlay UI Module
// Creates a Shadow DOM overlay to notify users about detected privacy policies

class PolicyOverlay {
  constructor() {
    this.overlayId = "privacy-parser-overlay";
    this.isVisible = false;
    this.shadowRoot = null;
  }

  show(confidence, autoOpening = false) {
    if (this.isVisible) return;

    // Create host element
    const host = document.createElement("div");
    host.id = this.overlayId;

    // Attach shadow DOM for style isolation
    this.shadowRoot = host.attachShadow({ mode: "closed" });

    const statusMessage = autoOpening
      ? `<p>Opening the analysis panel... Check the side panel to analyze this policy.</p>`
      : `<p>This page appears to contain a privacy policy or terms of service. Would you like a summary of the key privacy implications?</p>`;

    const actionButtons = autoOpening
      ? `<button class="btn btn-primary" id="analyze-btn">Analyze Now</button>`
      : `<button class="btn btn-primary" id="analyze-btn">Analyze Policy</button>
         <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>`;

    // Inject styles and HTML
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .overlay-banner {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #649eff;
          color: white;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          z-index: 2147483647;
          max-width: 380px;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .overlay-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .overlay-icon {
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .overlay-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .overlay-subtitle {
          font-size: 12px;
          opacity: 0.9;
          margin: 0;
        }

        .overlay-body {
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 16px;
          opacity: 0.95;
        }

        .overlay-confidence {
          display: inline-block;
          background: rgba(255, 255, 255, 0.2);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-top: 4px;
        }

        .overlay-actions {
          display: flex;
          gap: 10px;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary {
          background: white;
          color: #649eff;
        }

        .btn-primary:hover {
          background: #f0f0f0;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .close-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.7;
          padding: 4px;
          line-height: 1;
        }

        .close-btn:hover {
          opacity: 1;
        }
      </style>

      <div class="overlay-banner">
        <button class="close-btn" aria-label="Close">&times;</button>

        <div class="overlay-header">
          <div class="overlay-icon">&#128274;</div>
          <div>
            <h3 class="overlay-title">Privacy Policy Detected</h3>
            <p class="overlay-subtitle">${
              autoOpening ? "Side Panel Opening..." : ""
            }</p>
          </div>
        </div>

        <div class="overlay-body">
          ${statusMessage}
        </div>

        <div class="overlay-actions">
          ${actionButtons}
        </div>
      </div>
    `;

    // Add event listeners - MUST be async to preserve user gesture for side panel
    this.shadowRoot
      .getElementById("analyze-btn")
      .addEventListener("click", async () => {
        // IMPORTANT: Open side panel FIRST, immediately on click
        // This preserves the user gesture context required by Chrome
        try {
          await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
        } catch (e) {
          console.log("Could not open side panel:", e);
        }

        // Then trigger analysis
        chrome.runtime.sendMessage({
          type: "ANALYZE_POLICY",
          url: window.location.href,
        });

        // Update overlay to show analyzing state
        this.showAnalyzingState();
      });

    const dismissBtn = this.shadowRoot.getElementById("dismiss-btn");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        this.hide();
      });
    }

    this.shadowRoot
      .querySelector(".close-btn")
      .addEventListener("click", () => {
        this.hide();
      });

    // Append to body
    document.body.appendChild(host);
    this.isVisible = true;

    // Auto-hide after 10 seconds if auto-opening
    if (autoOpening) {
      setTimeout(() => {
        this.hide();
      }, 10000);
    }
  }

  hide() {
    const host = document.getElementById(this.overlayId);
    if (host) {
      host.remove();
    }
    this.isVisible = false;
    this.shadowRoot = null;
  }

  showAnalyzingState() {
    const banner = this.shadowRoot.querySelector(".overlay-banner");
    if (banner) {
      banner.innerHTML = `
        <button class="close-btn" aria-label="Close">&times;</button>

        <div class="overlay-header">
          <div class="overlay-icon">&#128270;</div>
          <div>
            <h3 class="overlay-title">Analysis Started!</h3>
            <p class="overlay-subtitle">Check the side panel →</p>
          </div>
        </div>

        <div class="overlay-body">
          <p>The side panel should now be open with the analysis.</p>
        </div>
      `;

      // Re-attach close button listener
      this.shadowRoot
        .querySelector(".close-btn")
        .addEventListener("click", () => {
          this.hide();
        });

      // Auto-hide after 5 seconds
      setTimeout(() => {
        this.hide();
      }, 5000);
    }
  }

  // Show a notification when user clicks an agreement button
  showAgreementNotification(buttonText, policyLinks = []) {
    // Remove any existing overlay first
    this.hide();

    // Also remove any existing agreement overlay
    const existingAgreement = document.getElementById(
      this.overlayId + "-agreement"
    );
    if (existingAgreement) {
      existingAgreement.remove();
    }

    // Create host element
    const host = document.createElement("div");
    host.id = this.overlayId + "-agreement";

    // Attach shadow DOM for style isolation
    const shadow = host.attachShadow({ mode: "closed" });

    const hasLinks = policyLinks && policyLinks.length > 0;

    // Build policy link buttons if we have links
    const policyButtons = hasLinks
      ? policyLinks.slice(0, 3).map(link => {
          const icon = link.type === 'privacy' ? '🔒' : link.type === 'terms' ? '📜' : '🍪';
          return `<button class="policy-btn" data-url="${link.url}" data-type="${link.type}">
            ${icon} Analyze ${link.text}
          </button>`;
        }).join('')
      : '';

    shadow.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .overlay-banner {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #f59e0b;
          color: white;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          z-index: 2147483647;
          max-width: 400px;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .overlay-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .overlay-icon {
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .overlay-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }

        .overlay-subtitle {
          font-size: 12px;
          opacity: 0.9;
          margin: 0;
        }

        .overlay-body {
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 14px;
          opacity: 0.95;
        }

        .policy-buttons {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .policy-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .policy-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: translateX(4px);
        }

        .overlay-actions {
          display: flex;
          gap: 10px;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary {
          background: white;
          color: #d97706;
        }

        .btn-primary:hover {
          background: #fef3c7;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .close-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.7;
          padding: 4px;
          line-height: 1;
        }

        .close-btn:hover {
          opacity: 1;
        }

        .hint-text {
          font-size: 11px;
          opacity: 0.8;
          margin-top: 12px;
          margin-bottom: 0;
          text-align: center;
        }
      </style>

      <div class="overlay-banner">
        <button class="close-btn" aria-label="Close">&times;</button>

        <div class="overlay-header">
          <div class="overlay-icon">⚠️</div>
          <div>
            <h3 class="overlay-title">Wait! Review Before Agreeing</h3>
          </div>
        </div>

        <div class="overlay-body">
          <p>You're about to agree to a privacy policy/terms of service. Review the policy first to understand what data is collected and how it will be used.</p>
        </div>

        ${hasLinks ? `
          <div class="policy-buttons">
            ${policyButtons}
          </div>
          <div class="overlay-actions">
            <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
          </div>
          <p class="hint-text">Click a policy above to analyze it before agreeing</p>
        ` : `
          <div class="overlay-actions">
            <button class="btn btn-primary" id="review-btn">📋 Review Current Page</button>
            <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
          </div>
        `}
      </div>
    `;

    // Policy link button clicks - analyze the linked policy
    shadow.querySelectorAll(".policy-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const url = btn.dataset.url;
        const type = btn.dataset.type;

        try {
          // Open side panel and request analysis of the external URL
          await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
          await chrome.runtime.sendMessage({
            type: "ANALYZE_EXTERNAL_POLICY",
            url: url,
            policyType: type
          });
        } catch (e) {
          console.log("Could not analyze policy:", e);
        }

        host.remove();
      });
    });

    // Review button (only shown if no policy links found) - opens side panel and starts analysis
    const reviewBtn = shadow.getElementById("review-btn");
    if (reviewBtn) {
      reviewBtn.addEventListener("click", async () => {
        try {
          await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
        } catch (e) {
          console.log("Could not open side panel:", e);
        }

        chrome.runtime.sendMessage({
          type: "ANALYZE_POLICY",
          url: window.location.href,
        });

        host.remove();
      });
    }

    // Dismiss button
    shadow.getElementById("dismiss-btn").addEventListener("click", () => {
      host.remove();
    });

    shadow.querySelector(".close-btn").addEventListener("click", () => {
      host.remove();
    });

    document.body.appendChild(host);

    // Auto-hide after 20 seconds (longer since user needs to make a decision about which policy to analyze)
    setTimeout(() => {
      if (host.parentElement) {
        host.remove();
      }
    }, 20000);
  }

  // Show notification for cookie popup with policy links
  showCookiePopupNotification(policyLinks, darkPatterns) {
    // Don't show if already showing something
    const existing = document.getElementById(this.overlayId + "-cookie");
    if (existing) return;

    const host = document.createElement("div");
    host.id = this.overlayId + "-cookie";

    const shadow = host.attachShadow({ mode: "closed" });

    const hasDarkPatterns = darkPatterns && darkPatterns.length > 0;
    const hasLinks = policyLinks && policyLinks.length > 0;

    // Build policy link buttons
    const policyButtons = hasLinks
      ? policyLinks.slice(0, 3).map(link => {
          const icon = link.type === 'privacy' ? '🔒' : link.type === 'terms' ? '📜' : '🍪';
          return `<button class="policy-btn" data-url="${link.url}" data-type="${link.type}">
            ${icon} Analyze ${link.text}
          </button>`;
        }).join('')
      : '';

    // Dark pattern summary
    const darkPatternSummary = hasDarkPatterns
      ? `<div class="dark-pattern-alert">
          <span class="alert-icon">⚠️</span>
          <span>${darkPatterns.length} dark pattern${darkPatterns.length > 1 ? 's' : ''} detected</span>
          <button class="view-patterns-btn">View</button>
        </div>`
      : '';

    shadow.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .overlay-banner {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #1e40af;
          color: white;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          z-index: 2147483647;
          max-width: 400px;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .overlay-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .overlay-icon {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .overlay-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
        }

        .overlay-subtitle {
          font-size: 12px;
          opacity: 0.9;
          margin: 0;
        }

        .overlay-body {
          font-size: 13px;
          line-height: 1.5;
          margin-bottom: 14px;
          opacity: 0.95;
        }

        .dark-pattern-alert {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(239, 68, 68, 0.3);
          padding: 8px 10px;
          border-radius: 6px;
          margin-bottom: 12px;
          font-size: 12px;
        }

        .alert-icon {
          font-size: 14px;
        }

        .view-patterns-btn {
          margin-left: auto;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11px;
          cursor: pointer;
        }

        .view-patterns-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .policy-buttons {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .policy-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .policy-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          transform: translateX(4px);
        }

        .overlay-actions {
          display: flex;
          gap: 8px;
        }

        .btn {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          opacity: 0.7;
          padding: 4px;
          line-height: 1;
        }

        .close-btn:hover {
          opacity: 1;
        }

        .hint-text {
          font-size: 11px;
          opacity: 0.7;
          text-align: center;
          margin-top: 10px;
        }
      </style>

      <div class="overlay-banner">
        <button class="close-btn" aria-label="Close">&times;</button>

        <div class="overlay-header">
          <div class="overlay-icon">🍪</div>
          <div>
            <h3 class="overlay-title">Cookie Consent Detected</h3>
            <p class="overlay-subtitle">Review before accepting</p>
          </div>
        </div>

        ${darkPatternSummary}

        ${hasLinks ? `
          <div class="overlay-body">
            <strong>Understand what you're agreeing to:</strong>
          </div>
          <div class="policy-buttons">
            ${policyButtons}
          </div>
        ` : `
          <div class="overlay-body">
            This site is asking for cookie consent. No policy links were found in the banner.
          </div>
        `}

        <div class="overlay-actions">
          <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
        </div>

        <p class="hint-text">Click a policy to analyze it before accepting cookies</p>
      </div>
    `;

    // Event listeners
    shadow.querySelector(".close-btn").addEventListener("click", () => {
      host.remove();
    });

    shadow.getElementById("dismiss-btn").addEventListener("click", () => {
      host.remove();
    });

    // Policy button clicks - analyze the linked policy
    shadow.querySelectorAll(".policy-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const url = btn.dataset.url;
        const type = btn.dataset.type;

        try {
          // Open side panel and request analysis of the external URL
          await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
          await chrome.runtime.sendMessage({
            type: "ANALYZE_EXTERNAL_POLICY",
            url: url,
            policyType: type
          });
        } catch (e) {
          console.log("Could not analyze policy:", e);
        }

        host.remove();
      });
    });

    // View dark patterns button
    const viewPatternsBtn = shadow.querySelector(".view-patterns-btn");
    if (viewPatternsBtn) {
      viewPatternsBtn.addEventListener("click", async () => {
        try {
          await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
          await chrome.runtime.sendMessage({
            type: "SHOW_DARK_PATTERNS",
            patterns: darkPatterns
          });
        } catch (e) {
          console.log("Could not show dark patterns:", e);
        }
        host.remove();
      });
    }

    document.body.appendChild(host);

    // Auto-hide after 30 seconds (longer since user needs to make decisions)
    setTimeout(() => {
      if (host.parentElement) {
        host.remove();
      }
    }, 30000);
  }

  // Show a warning about detected dark patterns
  showDarkPatternWarning(darkPatterns) {
    // Don't show if already showing something
    const existing = document.getElementById(this.overlayId + "-darkpattern");
    if (existing) return;

    const host = document.createElement("div");
    host.id = this.overlayId + "-darkpattern";

    const shadow = host.attachShadow({ mode: "closed" });

    const highSeverity = darkPatterns.filter(p => p.severity === 'high');
    const patternList = darkPatterns.slice(0, 3).map(p =>
      `<div class="pattern-item ${p.severity}">
        <span class="pattern-icon">${p.severity === 'high' ? '🚨' : '⚠️'}</span>
        <div class="pattern-text">
          <strong>${p.name}</strong>
          <span>${p.details || p.description}</span>
        </div>
      </div>`
    ).join('');

    shadow.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .overlay-banner {
          position: fixed;
          top: 20px;
          right: 20px;
          background: ${highSeverity.length > 0 ? '#dc2626' : '#d97706'};
          color: white;
          padding: 16px 20px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          z-index: 2147483647;
          max-width: 400px;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .overlay-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }

        .overlay-icon {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .overlay-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
        }

        .overlay-subtitle {
          font-size: 12px;
          opacity: 0.9;
          margin: 0;
        }

        .pattern-list {
          margin-bottom: 12px;
        }

        .pattern-item {
          display: flex;
          gap: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          margin-bottom: 6px;
          align-items: flex-start;
        }

        .pattern-item:last-child {
          margin-bottom: 0;
        }

        .pattern-item.high {
          background: rgba(255, 255, 255, 0.2);
        }

        .pattern-icon {
          font-size: 14px;
          flex-shrink: 0;
        }

        .pattern-text {
          font-size: 12px;
          line-height: 1.3;
        }

        .pattern-text strong {
          display: block;
          margin-bottom: 2px;
        }

        .pattern-text span {
          opacity: 0.9;
        }

        .overlay-footer {
          font-size: 11px;
          opacity: 0.8;
          text-align: center;
          margin-top: 8px;
        }

        .close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          opacity: 0.7;
          padding: 4px;
          line-height: 1;
        }

        .close-btn:hover {
          opacity: 1;
        }

        .overlay-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .btn {
          flex: 1;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-align: center;
        }

        .btn-primary {
          background: white;
          color: ${highSeverity.length > 0 ? '#dc2626' : '#d97706'};
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
      </style>

      <div class="overlay-banner">
        <button class="close-btn" aria-label="Close">&times;</button>

        <div class="overlay-header">
          <div class="overlay-icon">🕵️</div>
          <div>
            <h3 class="overlay-title">Dark Patterns Detected!</h3>
            <p class="overlay-subtitle">${darkPatterns.length} manipulative design${darkPatterns.length > 1 ? 's' : ''} found</p>
          </div>
        </div>

        <div class="pattern-list">
          ${patternList}
        </div>

        <div class="overlay-actions">
          <button class="btn btn-primary" id="learn-more-btn">Learn More</button>
          <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
        </div>

        <div class="overlay-footer">
          This cookie banner uses tricks to make you accept tracking
        </div>
      </div>
    `;

    // Event listeners
    shadow.querySelector(".close-btn").addEventListener("click", () => {
      host.remove();
    });

    shadow.getElementById("dismiss-btn").addEventListener("click", () => {
      host.remove();
    });

    shadow.getElementById("learn-more-btn").addEventListener("click", async () => {
      // Open side panel with dark pattern info
      try {
        await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
        await chrome.runtime.sendMessage({
          type: "SHOW_DARK_PATTERNS",
          patterns: darkPatterns
        });
      } catch (e) {
        console.log("Could not open side panel:", e);
      }
      host.remove();
    });

    document.body.appendChild(host);

    // Auto-hide after 20 seconds
    setTimeout(() => {
      if (host.parentElement) {
        host.remove();
      }
    }, 20000);
  }

  // Show a minimal persistent indicator
  showMinimalIndicator() {
    const indicator = document.createElement("div");
    indicator.id = "privacy-parser-indicator";

    const shadow = indicator.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .indicator {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 48px;
          height: 48px;
          background: #649eff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 2147483647;
          transition: transform 0.2s ease;
          font-size: 20px;
        }

        .indicator:hover {
          transform: scale(1.1);
        }
      </style>
      <div class="indicator" title="Click to analyze privacy policy">&#128274;</div>
    `;

    shadow.querySelector(".indicator").addEventListener("click", () => {
      indicator.remove();
      this.show(0.8);
    });

    document.body.appendChild(indicator);
  }
}

// Export for use in content script
window.PolicyOverlay = PolicyOverlay;
