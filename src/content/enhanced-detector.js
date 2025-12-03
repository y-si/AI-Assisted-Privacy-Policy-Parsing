// Enhanced Detection Module
// Detects cookie consent popups, dark patterns, and manipulative consent UIs

class EnhancedDetector {
  constructor() {
    this.detectedIssues = [];
    this.cookiePopupDetected = false;
    this.darkPatternsFound = [];
  }

  // ============================================
  // Cookie Consent Popup Detection
  // ============================================

  // Common selectors for cookie consent popups
  static COOKIE_POPUP_SELECTORS = [
    // ID patterns
    '#cookie-banner', '#cookie-consent', '#cookie-notice', '#cookie-popup',
    '#cookieConsent', '#cookieNotice', '#cookieBanner', '#cookies-banner',
    '#gdpr-banner', '#gdpr-consent', '#gdpr-popup', '#gdpr-notice',
    '#consent-banner', '#consent-popup', '#consent-modal',
    '#privacy-banner', '#privacy-popup', '#privacy-notice',
    '#onetrust-banner-sdk', '#onetrust-consent-sdk',
    '#CybotCookiebotDialog', '#CybotCookiebotDialogBody',
    '#cc-main', '#cc_div',
    // Class patterns
    '.cookie-banner', '.cookie-consent', '.cookie-notice', '.cookie-popup',
    '.cookie-bar', '.cookie-modal', '.cookie-overlay',
    '.gdpr-banner', '.gdpr-consent', '.gdpr-popup',
    '.consent-banner', '.consent-popup', '.consent-modal', '.consent-wrapper',
    '.privacy-banner', '.privacy-popup', '.privacy-notice',
    // Aria patterns
    '[aria-label*="cookie" i]', '[aria-label*="consent" i]', '[aria-label*="gdpr" i]',
    '[role="dialog"][aria-label*="privacy" i]',
    // Common cookie consent libraries
    '.cc-banner', '.cc-window', '.cc-dialog',
    '.osano-cm-dialog', '.osano-cm-window',
    '.iubenda-cs-container',
    '.truste-consent-track',
    '.qc-cmp2-container',
    '.evidon-consent-banner',
    '[class*="CookieConsent"]', '[class*="cookie-consent"]',
    '[class*="CookieBanner"]', '[class*="cookie-banner"]',
  ];

  // Text patterns that indicate a cookie popup
  static COOKIE_POPUP_TEXT_PATTERNS = [
    /we use cookies/i,
    /this (website|site) uses cookies/i,
    /cookies? (are|is) used/i,
    /cookie (policy|preferences|settings)/i,
    /accept (all )?cookies/i,
    /manage (cookie )?preferences/i,
    /cookie consent/i,
    /gdpr/i,
    /consent to (the use of )?cookies/i,
    /personalize(d)? (ads|content|experience)/i,
    /third[- ]party cookies/i,
    /analytics cookies/i,
    /functional cookies/i,
    /essential cookies/i,
    /necessary cookies/i,
  ];

  detectCookiePopup() {
    const results = {
      detected: false,
      element: null,
      type: null,
      buttons: [],
      darkPatterns: [],
      policyLinks: []  // Links to privacy policy, terms, etc.
    };

    // First try selector-based detection
    for (const selector of EnhancedDetector.COOKIE_POPUP_SELECTORS) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isVisible(element)) {
          results.detected = true;
          results.element = element;
          results.type = 'selector';
          break;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // If not found by selector, try content-based detection
    if (!results.detected) {
      const popupCandidate = this.findCookiePopupByContent();
      if (popupCandidate) {
        results.detected = true;
        results.element = popupCandidate;
        results.type = 'content';
      }
    }

    // Analyze the popup for dark patterns and extract policy links
    if (results.detected && results.element) {
      results.buttons = this.analyzeCookieButtons(results.element);
      results.darkPatterns = this.detectDarkPatterns(results.element, results.buttons);
      results.policyLinks = this.extractPolicyLinks(results.element);
      this.cookiePopupDetected = true;
      this.darkPatternsFound = results.darkPatterns;
      this.policyLinks = results.policyLinks;
    }

    return results;
  }

  // Extract privacy policy and terms links from a cookie popup
  extractPolicyLinks(popup) {
    const links = [];
    const seenUrls = new Set();

    // Patterns for identifying policy links
    const linkPatterns = [
      { pattern: /privacy\s*(policy|notice|statement)?/i, type: 'privacy' },
      { pattern: /terms\s*(of\s*(service|use)|and\s*conditions)?/i, type: 'terms' },
      { pattern: /cookie\s*(policy|notice|statement)/i, type: 'cookie' },
      { pattern: /data\s*(protection|policy)/i, type: 'privacy' },
      { pattern: /legal\s*(notice|terms)/i, type: 'terms' },
      { pattern: /gdpr/i, type: 'privacy' },
    ];

    // Find all links in the popup
    const anchorElements = popup.querySelectorAll('a[href]');

    for (const anchor of anchorElements) {
      const href = anchor.href;
      const text = (anchor.textContent || '').trim();

      // Skip empty or javascript links
      if (!href || href.startsWith('javascript:') || href === '#') continue;

      // Skip if we've already seen this URL
      if (seenUrls.has(href)) continue;

      // Check link text and href against patterns
      for (const { pattern, type } of linkPatterns) {
        if (pattern.test(text) || pattern.test(href)) {
          seenUrls.add(href);
          links.push({
            url: href,
            text: text || this.getLinkTypeLabel(type),
            type: type,
            element: anchor
          });
          break;
        }
      }
    }

    // Also check for links in the broader popup area that might be policy links
    // Sometimes they're in nested containers
    if (links.length === 0) {
      // Look for any link containing policy-related keywords in the URL
      const allLinks = popup.querySelectorAll('a[href*="privacy"], a[href*="policy"], a[href*="terms"], a[href*="legal"], a[href*="cookie"]');
      for (const anchor of allLinks) {
        const href = anchor.href;
        if (seenUrls.has(href)) continue;

        let type = 'policy';
        if (/privacy|gdpr|data/i.test(href)) type = 'privacy';
        else if (/terms|legal|tos/i.test(href)) type = 'terms';
        else if (/cookie/i.test(href)) type = 'cookie';

        seenUrls.add(href);
        links.push({
          url: href,
          text: (anchor.textContent || '').trim() || this.getLinkTypeLabel(type),
          type: type,
          element: anchor
        });
      }
    }

    return links;
  }

  getLinkTypeLabel(type) {
    const labels = {
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      cookie: 'Cookie Policy',
      policy: 'Policy'
    };
    return labels[type] || 'Policy';
  }

  findCookiePopupByContent() {
    // Look for fixed/sticky positioned elements that might be cookie popups
    const candidates = document.querySelectorAll(
      '[style*="position: fixed"], [style*="position:fixed"], ' +
      '[style*="position: sticky"], [style*="position:sticky"], ' +
      '.fixed, .sticky, [class*="modal"], [class*="popup"], [class*="overlay"], ' +
      '[role="dialog"], [role="alertdialog"]'
    );

    for (const element of candidates) {
      if (!this.isVisible(element)) continue;

      const text = element.textContent || '';
      if (text.length > 5000) continue; // Too much text, probably not a popup

      for (const pattern of EnhancedDetector.COOKIE_POPUP_TEXT_PATTERNS) {
        if (pattern.test(text)) {
          return element;
        }
      }
    }

    return null;
  }

  isVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  }

  // ============================================
  // Cookie Button Analysis
  // ============================================

  analyzeCookieButtons(popup) {
    const buttons = [];
    const buttonElements = popup.querySelectorAll(
      'button, [role="button"], a.btn, a.button, input[type="button"], input[type="submit"], ' +
      '[class*="btn"], [class*="button"]'
    );

    for (const btn of buttonElements) {
      if (!this.isVisible(btn)) continue;

      const text = (btn.textContent || btn.value || '').trim().toLowerCase();
      const style = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();

      const buttonInfo = {
        element: btn,
        text: text,
        type: this.classifyButton(text),
        style: {
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          padding: style.padding,
          border: style.border,
          width: rect.width,
          height: rect.height,
        },
        isProminent: this.isButtonProminent(style, rect),
      };

      buttons.push(buttonInfo);
    }

    return buttons;
  }

  classifyButton(text) {
    const acceptPatterns = [
      /^accept( all)?$/i, /^agree$/i, /^allow( all)?$/i, /^ok$/i, /^got it$/i,
      /^i agree$/i, /^yes/i, /^enable/i, /^continue$/i
    ];
    const rejectPatterns = [
      /^reject( all)?$/i, /^decline$/i, /^deny$/i, /^no( thanks)?$/i,
      /^refuse$/i, /^disable/i
    ];
    const settingsPatterns = [
      /^(manage|customize|preferences|settings|options)/i,
      /^more (options|info)/i, /^learn more$/i
    ];
    const necessaryOnlyPatterns = [
      /^(only )?(necessary|essential|required)( only)?$/i,
      /^save (my )?preferences$/i
    ];

    for (const pattern of acceptPatterns) {
      if (pattern.test(text)) return 'accept';
    }
    for (const pattern of rejectPatterns) {
      if (pattern.test(text)) return 'reject';
    }
    for (const pattern of settingsPatterns) {
      if (pattern.test(text)) return 'settings';
    }
    for (const pattern of necessaryOnlyPatterns) {
      if (pattern.test(text)) return 'necessary-only';
    }

    return 'unknown';
  }

  isButtonProminent(style, rect) {
    // Check if button has prominent styling (larger, colored, etc.)
    const bgColor = style.backgroundColor;
    const hasColoredBg = bgColor && bgColor !== 'transparent' &&
                         bgColor !== 'rgba(0, 0, 0, 0)' &&
                         bgColor !== 'rgb(255, 255, 255)';
    const isLarge = rect.width > 100 || rect.height > 40;
    const isBold = parseInt(style.fontWeight) >= 600;

    return hasColoredBg || isLarge || isBold;
  }

  // ============================================
  // Dark Pattern Detection
  // ============================================

  static DARK_PATTERNS = {
    HIDDEN_REJECT: {
      id: 'hidden-reject',
      name: 'Hidden Reject Option',
      description: 'The option to reject cookies is hidden or hard to find',
      severity: 'high'
    },
    ASYMMETRIC_BUTTONS: {
      id: 'asymmetric-buttons',
      name: 'Asymmetric Button Design',
      description: 'Accept button is more prominent than reject/settings options',
      severity: 'medium'
    },
    PRESELECTED_OPTIONS: {
      id: 'preselected-options',
      name: 'Pre-selected Options',
      description: 'Optional cookies are pre-selected by default',
      severity: 'medium'
    },
    CONFUSING_LANGUAGE: {
      id: 'confusing-language',
      name: 'Confusing Language',
      description: 'Uses double negatives or confusing wording',
      severity: 'medium'
    },
    CONFIRM_SHAMING: {
      id: 'confirm-shaming',
      name: 'Confirm Shaming',
      description: 'Uses guilt-inducing language to discourage rejecting',
      severity: 'high'
    },
    FORCED_ACTION: {
      id: 'forced-action',
      name: 'Forced Action',
      description: 'No way to dismiss without accepting',
      severity: 'high'
    },
    MISDIRECTION: {
      id: 'misdirection',
      name: 'Visual Misdirection',
      description: 'Uses visual design to draw attention away from privacy options',
      severity: 'medium'
    },
    EXTRA_STEPS: {
      id: 'extra-steps',
      name: 'Extra Steps to Reject',
      description: 'Requires more clicks to reject than to accept',
      severity: 'medium'
    }
  };

  detectDarkPatterns(popup, buttons) {
    const patterns = [];

    // 1. Check for hidden reject option
    const rejectButton = buttons.find(b => b.type === 'reject');
    const acceptButton = buttons.find(b => b.type === 'accept');

    if (!rejectButton && acceptButton) {
      patterns.push({
        ...EnhancedDetector.DARK_PATTERNS.HIDDEN_REJECT,
        details: 'No reject button found, only accept option is visible'
      });
    }

    // 2. Check for asymmetric button design
    if (acceptButton && (rejectButton || buttons.find(b => b.type === 'settings'))) {
      const otherButton = rejectButton || buttons.find(b => b.type === 'settings');

      if (acceptButton.isProminent && !otherButton.isProminent) {
        patterns.push({
          ...EnhancedDetector.DARK_PATTERNS.ASYMMETRIC_BUTTONS,
          details: 'Accept button is visually more prominent than alternatives'
        });
      }

      // Check size difference
      if (acceptButton.style.width > otherButton.style.width * 1.5) {
        patterns.push({
          ...EnhancedDetector.DARK_PATTERNS.ASYMMETRIC_BUTTONS,
          details: 'Accept button is significantly larger than alternatives'
        });
      }
    }

    // 3. Check for pre-selected options
    const checkboxes = popup.querySelectorAll('input[type="checkbox"]');
    let preselectedCount = 0;
    checkboxes.forEach(cb => {
      if (cb.checked) preselectedCount++;
    });

    if (preselectedCount > 1) {
      patterns.push({
        ...EnhancedDetector.DARK_PATTERNS.PRESELECTED_OPTIONS,
        details: `${preselectedCount} cookie options are pre-selected`
      });
    }

    // 4. Check for confirm shaming
    const shamingPatterns = [
      /no,? i (don'?t )?prefer/i,
      /i (don'?t )?(want|like) (relevant|personalized)/i,
      /i'?ll miss out/i,
      /no thanks,? (i'?ll|i will)/i,
      /continue without/i,
      /i (accept|understand) (that )?(i'?ll|the site)/i
    ];

    const popupText = popup.textContent || '';
    for (const pattern of shamingPatterns) {
      if (pattern.test(popupText)) {
        patterns.push({
          ...EnhancedDetector.DARK_PATTERNS.CONFIRM_SHAMING,
          details: 'Uses guilt-inducing language for reject option'
        });
        break;
      }
    }

    // 5. Check for confusing language
    const confusingPatterns = [
      /don'?t not/i,
      /disable enabling/i,
      /opt[- ]?out of opting/i,
      /reject accepting/i,
    ];

    for (const pattern of confusingPatterns) {
      if (pattern.test(popupText)) {
        patterns.push({
          ...EnhancedDetector.DARK_PATTERNS.CONFUSING_LANGUAGE,
          details: 'Uses confusing double negatives or contradictory language'
        });
        break;
      }
    }

    // 6. Check for forced action (no close/dismiss option)
    const hasCloseButton = popup.querySelector(
      '[class*="close"], [aria-label*="close" i], [aria-label*="dismiss" i], ' +
      'button[class*="x"], .dismiss, #close, #dismiss'
    );
    const hasRejectOption = rejectButton || buttons.find(b => b.type === 'necessary-only');

    if (!hasCloseButton && !hasRejectOption) {
      patterns.push({
        ...EnhancedDetector.DARK_PATTERNS.FORCED_ACTION,
        details: 'No way to dismiss the popup without accepting cookies'
      });
    }

    // 7. Check if reject requires extra steps (links to another page/modal)
    if (rejectButton || buttons.find(b => b.type === 'settings')) {
      const settingsBtn = buttons.find(b => b.type === 'settings');
      if (settingsBtn && !rejectButton) {
        // Only settings option means extra steps needed
        patterns.push({
          ...EnhancedDetector.DARK_PATTERNS.EXTRA_STEPS,
          details: 'Must go through settings to reject cookies (no direct reject option)'
        });
      }
    }

    return patterns;
  }

  // ============================================
  // Signup Form Agreement Detection
  // ============================================

  detectSignupAgreements() {
    const agreements = [];

    // Find forms that might be signup/registration forms
    const forms = document.querySelectorAll('form');

    for (const form of forms) {
      const formText = form.textContent || '';

      // Check if it's likely a signup form
      const isSignupForm = /sign ?up|register|create (an )?account|join/i.test(formText) ||
                          form.querySelector('input[type="password"]');

      if (!isSignupForm) continue;

      // Look for agreement text
      const agreementPatterns = [
        { pattern: /by (signing up|registering|creating|clicking)/i, type: 'implicit' },
        { pattern: /i agree to/i, type: 'explicit' },
        { pattern: /i have read and agree/i, type: 'explicit' },
        { pattern: /terms (of service|and conditions|of use)/i, type: 'terms' },
        { pattern: /privacy (policy|notice|statement)/i, type: 'privacy' },
      ];

      const foundPatterns = [];
      for (const { pattern, type } of agreementPatterns) {
        if (pattern.test(formText)) {
          foundPatterns.push({ pattern: pattern.source, type });
        }
      }

      if (foundPatterns.length > 0) {
        // Check for linked policies
        const policyLinks = form.querySelectorAll('a[href*="privacy"], a[href*="terms"], a[href*="policy"]');

        agreements.push({
          form: form,
          patterns: foundPatterns,
          hasCheckbox: !!form.querySelector('input[type="checkbox"]'),
          policyLinks: Array.from(policyLinks).map(link => ({
            text: link.textContent?.trim(),
            href: link.href
          })),
          isImplicit: foundPatterns.some(p => p.type === 'implicit')
        });
      }
    }

    return agreements;
  }

  // ============================================
  // Main Detection Method
  // ============================================

  runFullDetection() {
    const results = {
      cookiePopup: this.detectCookiePopup(),
      signupAgreements: this.detectSignupAgreements(),
      totalDarkPatterns: [],
      summary: {
        hasCookiePopup: false,
        hasSignupAgreements: false,
        darkPatternCount: 0,
        highSeverityCount: 0
      }
    };

    // Aggregate dark patterns
    if (results.cookiePopup.detected) {
      results.totalDarkPatterns.push(...results.cookiePopup.darkPatterns);
      results.summary.hasCookiePopup = true;
    }

    results.summary.hasSignupAgreements = results.signupAgreements.length > 0;
    results.summary.darkPatternCount = results.totalDarkPatterns.length;
    results.summary.highSeverityCount = results.totalDarkPatterns.filter(
      p => p.severity === 'high'
    ).length;

    return results;
  }

  // Get issues for display
  getDetectedIssues() {
    return {
      cookiePopupDetected: this.cookiePopupDetected,
      darkPatterns: this.darkPatternsFound,
      darkPatternCount: this.darkPatternsFound.length
    };
  }
}

// Export for use in content script
window.EnhancedDetector = EnhancedDetector;
