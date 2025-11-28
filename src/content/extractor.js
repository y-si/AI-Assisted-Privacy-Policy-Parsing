// Text Extraction Module
// Extracts clean text from privacy policy pages using Readability and fallback methods

class PolicyExtractor {
  constructor() {
    this.minContentLength = 500;
  }

  async extract() {
    try {
      // Try Readability first
      const readabilityResult = this.extractWithReadability();
      if (readabilityResult && readabilityResult.textContent.length >= this.minContentLength) {
        return {
          success: true,
          method: 'readability',
          ...readabilityResult
        };
      }
    } catch (e) {
      console.warn('Readability extraction failed:', e);
    }

    // Fallback to DOM extraction
    try {
      const domResult = this.extractFromDOM();
      if (domResult && domResult.textContent.length >= this.minContentLength) {
        return {
          success: true,
          method: 'dom',
          ...domResult
        };
      }
    } catch (e) {
      console.warn('DOM extraction failed:', e);
    }

    // Last resort: get all body text
    return {
      success: true,
      method: 'body',
      title: document.title,
      textContent: document.body.innerText,
      content: document.body.innerHTML,
      excerpt: document.body.innerText.substring(0, 500)
    };
  }

  extractWithReadability() {
    // Check if Readability is available
    if (typeof Readability === 'undefined') {
      console.warn('Readability library not loaded');
      return null;
    }

    // Clone the document to avoid modifying the original
    const docClone = document.cloneNode(true);

    // Create Readability instance and parse
    const reader = new Readability(docClone, {
      charThreshold: 100,
      keepClasses: false
    });

    const article = reader.parse();

    if (!article) {
      return null;
    }

    // Sanitize the content with DOMPurify if available
    let sanitizedContent = article.content;
    if (typeof DOMPurify !== 'undefined') {
      sanitizedContent = DOMPurify.sanitize(article.content, {
        ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'br', 'div', 'span', 'table', 'tr', 'td', 'th', 'tbody', 'thead'],
        ALLOWED_ATTR: ['href']
      });
    }

    return {
      title: article.title || document.title,
      textContent: article.textContent,
      content: sanitizedContent,
      excerpt: article.excerpt || article.textContent.substring(0, 500),
      byline: article.byline,
      siteName: article.siteName
    };
  }

  extractFromDOM() {
    // Find main content container
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '#content',
      '#main',
      '.policy-content',
      '.legal-content',
      '.terms-content'
    ];

    let mainElement = null;
    for (const selector of mainSelectors) {
      mainElement = document.querySelector(selector);
      if (mainElement) break;
    }

    // If no main element found, use body
    if (!mainElement) {
      mainElement = document.body;
    }

    // Clone and clean the element
    const clone = mainElement.cloneNode(true);

    // Remove unwanted elements
    const unwantedSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      'aside',
      '.nav',
      '.navigation',
      '.menu',
      '.sidebar',
      '.advertisement',
      '.ad',
      '.social-share',
      '.comments',
      '#comments',
      '.cookie-banner',
      '.popup'
    ];

    unwantedSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Get text content
    const textContent = clone.innerText;

    // Sanitize HTML if DOMPurify is available
    let sanitizedContent = clone.innerHTML;
    if (typeof DOMPurify !== 'undefined') {
      sanitizedContent = DOMPurify.sanitize(clone.innerHTML, {
        ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'br', 'div', 'span', 'table', 'tr', 'td', 'th', 'tbody', 'thead'],
        ALLOWED_ATTR: ['href']
      });
    }

    return {
      title: document.title,
      textContent: textContent,
      content: sanitizedContent,
      excerpt: textContent.substring(0, 500)
    };
  }

  // Get structured sections from the policy
  extractSections() {
    const sections = [];
    const headings = document.querySelectorAll('h1, h2, h3, h4');

    headings.forEach((heading, index) => {
      const nextHeading = headings[index + 1];
      let content = '';

      // Get content between this heading and the next
      let sibling = heading.nextElementSibling;
      while (sibling && sibling !== nextHeading) {
        if (sibling.tagName !== 'H1' && sibling.tagName !== 'H2' && sibling.tagName !== 'H3' && sibling.tagName !== 'H4') {
          content += sibling.innerText + '\n';
        }
        sibling = sibling.nextElementSibling;
      }

      if (content.trim()) {
        sections.push({
          heading: heading.innerText.trim(),
          level: parseInt(heading.tagName.charAt(1)),
          content: content.trim(),
          element: heading
        });
      }
    });

    return sections;
  }
}

// Export for use in content script
window.PolicyExtractor = PolicyExtractor;
