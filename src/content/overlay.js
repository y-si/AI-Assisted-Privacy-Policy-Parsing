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
  showAgreementNotification(buttonText) {
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

        <div class="overlay-actions">
          <button class="btn btn-primary" id="review-btn">📋 Review Policy</button>
          <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
        </div>
      </div>
    `;

    // Review button - opens side panel and starts analysis
    shadow.getElementById("review-btn").addEventListener("click", async () => {
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

    // Dismiss button
    shadow.getElementById("dismiss-btn").addEventListener("click", () => {
      host.remove();
    });

    shadow.querySelector(".close-btn").addEventListener("click", () => {
      host.remove();
    });

    document.body.appendChild(host);

    // Auto-hide after 15 seconds (longer since user needs to make a decision)
    setTimeout(() => {
      if (host.parentElement) {
        host.remove();
      }
    }, 15000);
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
