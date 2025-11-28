// Privacy Policy Detection Module
// Detects privacy policies and terms of service pages using multiple signals

const URL_PATTERNS = [
  /privacy[-_]?policy/i,
  /terms[-_]?(of[-_]?service|and[-_]?conditions|of[-_]?use)/i,
  /legal\/(privacy|terms|tos)/i,
  /\/tos(\/|\?|$)/i,
  /\/privacy(\/|\?|$)/i,
  /\/eula(\/|\?|$)/i,
  /cookie[-_]?policy/i,
  /data[-_]?protection/i,
  /\/legal(\/|\?|$)/i,
  /\/terms(\/|\?|$)/i,
  /policies.*\/privacy/i,  // For Google-style URLs like policies.google.com/privacy
  /\/privacypolicy/i,
  /\/user-agreement/i
];

const TITLE_KEYWORDS = [
  'privacy policy',
  'privacy notice',
  'privacy & terms',
  'privacy –',
  'terms of service',
  'terms and conditions',
  'terms of use',
  'user agreement',
  'data policy',
  'cookie policy',
  'eula',
  'end user license agreement',
  'data protection',
  'legal notice',
  'privacy statement'
];

const CONTENT_SIGNALS = [
  'we collect',
  'personal data',
  'personal information',
  'data protection',
  'third party',
  'third-party',
  'cookies',
  'your rights',
  'opt out',
  'opt-out',
  'data subject',
  'gdpr',
  'ccpa',
  'california consumer privacy',
  'data controller',
  'data processor',
  'privacy shield',
  'information we collect',
  'how we use',
  'share your information',
  'retain your data',
  'delete your data'
];

const HEADING_KEYWORDS = [
  'privacy policy',
  'privacy notice',
  'terms of service',
  'terms and conditions',
  'data protection',
  'cookie policy',
  'information we collect',
  'how we use your information',
  'your privacy rights'
];

class PolicyDetector {
  constructor() {
    this.confidenceThreshold = 0.6;
  }

  detect() {
    const scores = {
      url: this.checkUrl(),
      title: this.checkTitle(),
      meta: this.checkMeta(),
      headings: this.checkHeadings(),
      content: this.checkContent()
    };

    // Weighted confidence calculation
    const weights = {
      url: 0.35,
      title: 0.25,
      meta: 0.1,
      headings: 0.15,
      content: 0.15
    };

    let totalScore = 0;
    for (const [key, score] of Object.entries(scores)) {
      totalScore += score * weights[key];
    }

    return {
      isPolicy: totalScore >= this.confidenceThreshold,
      confidence: totalScore,
      scores: scores
    };
  }

  checkUrl() {
    const url = window.location.href.toLowerCase();
    for (const pattern of URL_PATTERNS) {
      if (pattern.test(url)) {
        return 1.0;
      }
    }
    return 0;
  }

  checkTitle() {
    const title = document.title.toLowerCase();
    for (const keyword of TITLE_KEYWORDS) {
      if (title.includes(keyword)) {
        return 1.0;
      }
    }
    return 0;
  }

  checkMeta() {
    const metaTags = document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"]');
    let found = false;

    metaTags.forEach(meta => {
      const content = (meta.getAttribute('content') || '').toLowerCase();
      for (const keyword of TITLE_KEYWORDS) {
        if (content.includes(keyword)) {
          found = true;
          break;
        }
      }
    });

    return found ? 1.0 : 0;
  }

  checkHeadings() {
    const headings = document.querySelectorAll('h1, h2, h3');
    let matchCount = 0;

    headings.forEach(heading => {
      const text = heading.textContent.toLowerCase();
      for (const keyword of HEADING_KEYWORDS) {
        if (text.includes(keyword)) {
          matchCount++;
          break;
        }
      }
    });

    // Score based on number of matching headings
    if (matchCount >= 3) return 1.0;
    if (matchCount >= 2) return 0.7;
    if (matchCount >= 1) return 0.4;
    return 0;
  }

  checkContent() {
    // Get visible text content
    const bodyText = document.body.innerText.toLowerCase();
    const textLength = bodyText.length;

    // Skip if page has very little content
    if (textLength < 1000) return 0;

    let matchCount = 0;
    for (const signal of CONTENT_SIGNALS) {
      if (bodyText.includes(signal)) {
        matchCount++;
      }
    }

    // Calculate keyword density score
    const density = matchCount / CONTENT_SIGNALS.length;

    // Score based on how many signals are present
    if (density >= 0.5) return 1.0;
    if (density >= 0.3) return 0.7;
    if (density >= 0.15) return 0.4;
    return 0;
  }
}

// Export for use in content script
window.PolicyDetector = PolicyDetector;
