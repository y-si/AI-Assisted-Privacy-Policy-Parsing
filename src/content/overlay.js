// Overlay UI Module
// Creates a Shadow DOM overlay to notify users about detected privacy policies

class PolicyOverlay {
  constructor() {
    this.overlayId = 'privacy-parser-overlay';
    this.isVisible = false;
    this.shadowRoot = null;
  }

  show(confidence) {
    if (this.isVisible) return;

    // Create host element
    const host = document.createElement('div');
    host.id = this.overlayId;

    // Attach shadow DOM for style isolation
    this.shadowRoot = host.attachShadow({ mode: 'closed' });

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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          color: #667eea;
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
            <p class="overlay-subtitle">AI-Assisted Analysis Available</p>
          </div>
        </div>

        <div class="overlay-body">
          <p>This page appears to contain a privacy policy or terms of service. Would you like an AI-generated summary of the key privacy implications?</p>
          <span class="overlay-confidence">Confidence: ${Math.round(confidence * 100)}%</span>
        </div>

        <div class="overlay-actions">
          <button class="btn btn-primary" id="analyze-btn">Analyze Policy</button>
          <button class="btn btn-secondary" id="dismiss-btn">Dismiss</button>
        </div>
      </div>
    `;

    // Add event listeners
    this.shadowRoot.getElementById('analyze-btn').addEventListener('click', () => {
      this.onAnalyze();
    });

    this.shadowRoot.getElementById('dismiss-btn').addEventListener('click', () => {
      this.hide();
    });

    this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => {
      this.hide();
    });

    // Append to body
    document.body.appendChild(host);
    this.isVisible = true;
  }

  hide() {
    const host = document.getElementById(this.overlayId);
    if (host) {
      host.remove();
    }
    this.isVisible = false;
    this.shadowRoot = null;
  }

  onAnalyze() {
    // Update button to show loading state
    const btn = this.shadowRoot.getElementById('analyze-btn');
    btn.textContent = 'Analyzing...';
    btn.disabled = true;

    // Send message to trigger analysis
    chrome.runtime.sendMessage({
      type: 'ANALYZE_POLICY',
      url: window.location.href
    });

    // Update overlay to show instructions
    this.showAnalyzingState();
  }

  showAnalyzingState() {
    const banner = this.shadowRoot.querySelector('.overlay-banner');
    if (banner) {
      banner.innerHTML = `
        <button class="close-btn" aria-label="Close">&times;</button>

        <div class="overlay-header">
          <div class="overlay-icon" style="animation: pulse 1.5s infinite;">&#128270;</div>
          <div>
            <h3 class="overlay-title">Analysis Started!</h3>
            <p class="overlay-subtitle">Opening results panel...</p>
          </div>
        </div>

        <div class="overlay-body">
          <p><strong>Click the extension icon</strong> in your browser toolbar to view the analysis results.</p>
          <p style="font-size: 12px; opacity: 0.8; margin-top: 8px;">Look for the 🔐 icon in your extensions area (top-right of browser)</p>
        </div>

        <style>
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
        </style>
      `;

      // Re-attach close button listener
      this.shadowRoot.querySelector('.close-btn').addEventListener('click', () => {
        this.hide();
      });

      // Auto-hide after 8 seconds
      setTimeout(() => {
        this.hide();
      }, 8000);
    }
  }

  // Show a minimal persistent indicator
  showMinimalIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'privacy-parser-indicator';

    const shadow = indicator.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        .indicator {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
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

    shadow.querySelector('.indicator').addEventListener('click', () => {
      indicator.remove();
      this.show(0.8);
    });

    document.body.appendChild(indicator);
  }
}

// Export for use in content script
window.PolicyOverlay = PolicyOverlay;
