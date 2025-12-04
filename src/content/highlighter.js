// Clause Highlighter Module
// Highlights and scrolls to specific clauses in the privacy policy

class ClauseHighlighter {
  constructor() {
    this.highlightClass = 'privacy-parser-highlight';
    this.activeHighlights = [];
    this.highlightDuration = 5000; // 5 seconds
    this.injectStyles();
  }

  injectStyles() {
    // Check if styles already injected
    if (document.getElementById('privacy-parser-highlight-styles')) return;

    const style = document.createElement('style');
    style.id = 'privacy-parser-highlight-styles';
    style.textContent = `
      .${this.highlightClass} {
        background: #ffeaa7 !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        box-shadow: 0 2px 8px rgba(253, 203, 110, 0.4) !important;
        transition: background 0.3s ease !important;
      }

      .${this.highlightClass}-fade {
        animation: privacy-parser-fade 0.5s ease-out forwards !important;
      }

      @keyframes privacy-parser-fade {
        to {
          background: transparent;
          box-shadow: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Highlight a specific clause by searching for its text
  highlightClause(clauseText, options = {}) {
    const {
      scrollIntoView = true,
      duration = this.highlightDuration
    } = options;

    if (!clauseText || clauseText.length < 10) {
      console.warn('[Highlighter] Clause text too short for reliable matching');
      return false;
    }

    console.log('[Highlighter] Searching for:', clauseText.substring(0, 80) + '...');

    // Try multiple matching strategies
    let match = null;

    // Strategy 1: Exact normalized match
    match = this.findTextInPage(clauseText, 'exact');
    if (match) {
      console.log('[Highlighter] Found with exact match');
    }

    // Strategy 2: Fuzzy word-based match (first N words)
    if (!match) {
      match = this.findTextInPage(clauseText, 'startWords');
      if (match) {
        console.log('[Highlighter] Found with start words match');
      }
    }

    // Strategy 3: Key phrase extraction
    if (!match) {
      match = this.findTextInPage(clauseText, 'keyPhrase');
      if (match) {
        console.log('[Highlighter] Found with key phrase match');
      }
    }

    // Strategy 4: Longest common substring
    if (!match) {
      match = this.findTextInPage(clauseText, 'substring');
      if (match) {
        console.log('[Highlighter] Found with substring match');
      }
    }

    // Strategy 5: Use browser's built-in find (window.find)
    if (!match) {
      match = this.findWithBrowserAPI(clauseText);
      if (match) {
        console.log('[Highlighter] Found with browser find API');
      }
    }

    if (!match) {
      console.warn('[Highlighter] Could not find clause text in page after all strategies');
      console.warn('[Highlighter] Searched for:', clauseText.substring(0, 100));
      return false;
    }

    // Create highlight
    const highlight = this.createHighlight(match);

    if (!highlight) {
      console.warn('[Highlighter] Could not create highlight element');
      return false;
    }

    // Scroll into view
    if (scrollIntoView) {
      highlight.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }

    // Store reference for cleanup
    this.activeHighlights.push(highlight);

    // Auto-remove highlight after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeHighlight(highlight);
      }, duration);
    }

    return true;
  }

  // Normalize text for comparison
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')           // Collapse whitespace
      .replace(/[""''„"«»]/g, '"')    // Normalize quotes
      .replace(/[–—―]/g, '-')         // Normalize dashes
      .replace(/[…]/g, '...')         // Normalize ellipsis
      .replace(/\u00A0/g, ' ')        // Non-breaking space
      .replace(/\r\n/g, ' ')          // Windows line breaks
      .replace(/[\r\n]/g, ' ')        // Line breaks
      .trim();
  }

  // Extract significant words from text (removes common stop words)
  getSignificantWords(text) {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
      'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'you',
      'your', 'they', 'their', 'which', 'who', 'whom', 'whose', 'what',
      'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'each',
      'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
      'very', 'just', 'also', 'any'
    ]);

    const words = this.normalizeText(text).split(' ');
    return words.filter(w => w.length > 2 && !stopWords.has(w));
  }

  // Build combined text from all visible text nodes
  buildPageText() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe', 'svg'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if visible
          try {
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              return NodeFilter.FILTER_REJECT;
            }
          } catch (e) {
            // If getComputedStyle fails, include the node
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent;
      if (text && text.trim().length > 0) {
        textNodes.push({ node, text, normalizedText: this.normalizeText(text) });
      }
    }

    // Build combined normalized text with position mapping
    let combinedText = '';
    const nodeMap = [];

    for (const { node, normalizedText } of textNodes) {
      if (normalizedText.length > 0) {
        const startPos = combinedText.length;
        combinedText += normalizedText + ' ';
        nodeMap.push({
          node,
          start: startPos,
          end: startPos + normalizedText.length
        });
      }
    }

    return { combinedText, nodeMap, textNodes };
  }

  findTextInPage(clauseText, strategy) {
    const { combinedText, nodeMap } = this.buildPageText();
    const normalizedClause = this.normalizeText(clauseText);

    let matchStart = -1;
    let matchLength = normalizedClause.length;

    switch (strategy) {
      case 'exact':
        matchStart = combinedText.indexOf(normalizedClause);
        break;

      case 'startWords': {
        // Try matching first 5-15 words
        const words = normalizedClause.split(' ');
        for (let wordCount = Math.min(15, words.length); wordCount >= 5; wordCount--) {
          const phrase = words.slice(0, wordCount).join(' ');
          if (phrase.length >= 20) {
            matchStart = combinedText.indexOf(phrase);
            if (matchStart !== -1) {
              matchLength = phrase.length;
              break;
            }
          }
        }
        break;
      }

      case 'keyPhrase': {
        // Try matching significant words as a phrase
        const sigWords = this.getSignificantWords(clauseText);
        // Try consecutive significant words
        for (let count = Math.min(8, sigWords.length); count >= 3; count--) {
          for (let start = 0; start <= sigWords.length - count; start++) {
            const phrase = sigWords.slice(start, start + count).join(' ');
            if (phrase.length >= 15) {
              // Search with flexible spacing
              const flexPattern = sigWords.slice(start, start + count).join('\\s+');
              const regex = new RegExp(flexPattern, 'i');
              const match = combinedText.match(regex);
              if (match) {
                matchStart = match.index;
                matchLength = match[0].length;
                break;
              }
            }
          }
          if (matchStart !== -1) break;
        }
        break;
      }

      case 'substring': {
        // Find any substantial substring that matches
        const words = normalizedClause.split(' ');
        // Try middle portions too
        for (let len = Math.min(12, words.length); len >= 4; len--) {
          for (let start = 0; start <= words.length - len; start++) {
            const phrase = words.slice(start, start + len).join(' ');
            if (phrase.length >= 20) {
              matchStart = combinedText.indexOf(phrase);
              if (matchStart !== -1) {
                matchLength = phrase.length;
                break;
              }
            }
          }
          if (matchStart !== -1) break;
        }
        break;
      }
    }

    if (matchStart === -1) {
      return null;
    }

    // Find which nodes contain the match
    const matchEnd = matchStart + matchLength;
    const matchingNodes = nodeMap.filter(
      nm => nm.start < matchEnd && nm.end > matchStart
    );

    if (matchingNodes.length === 0) {
      return null;
    }

    return {
      nodes: matchingNodes.map(nm => nm.node),
      startOffset: Math.max(0, matchStart - matchingNodes[0].start),
      length: matchLength,
      text: combinedText.substring(matchStart, matchEnd)
    };
  }

  // Use browser's built-in find functionality
  findWithBrowserAPI(clauseText) {
    // Try to find using window.find for shorter phrases
    const words = this.normalizeText(clauseText).split(' ');
    
    // Try different phrase lengths
    for (let len = Math.min(8, words.length); len >= 3; len--) {
      const phrase = words.slice(0, len).join(' ');
      
      // Use window.find if available (may not work in all contexts)
      if (typeof window.find === 'function') {
        try {
          // Clear any existing selection
          window.getSelection()?.removeAllRanges();
          
          // Try to find the text
          const found = window.find(phrase, false, false, true, false, false, false);
          
          if (found) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const container = range.commonAncestorContainer;
              
              // Get the element to highlight
              const element = container.nodeType === Node.TEXT_NODE 
                ? container.parentElement 
                : container;
              
              // Clear selection
              selection.removeAllRanges();
              
              if (element) {
                return {
                  element: element,
                  useElementDirectly: true
                };
              }
            }
          }
        } catch (e) {
          console.log('[Highlighter] Browser find failed:', e);
        }
      }
    }

    return null;
  }

  createHighlight(match) {
    // If we got an element directly from browser find
    if (match.useElementDirectly && match.element) {
      match.element.classList.add(this.highlightClass);
      return match.element;
    }

    const { nodes, startOffset, length, text } = match;

    if (!nodes || nodes.length === 0) return null;

    // For simplicity, wrap the first matching node's parent
    const firstNode = nodes[0];
    const parent = firstNode.parentElement;

    if (!parent) return null;

    // Create a wrapper span
    const wrapper = document.createElement('span');
    wrapper.className = this.highlightClass;
    wrapper.setAttribute('data-privacy-parser', 'highlight');

    // If it's a single node and we can wrap it precisely
    if (nodes.length === 1 && firstNode.nodeType === Node.TEXT_NODE) {
      try {
        const range = document.createRange();
        const endOffset = Math.min(firstNode.length, startOffset + length);
        range.setStart(firstNode, Math.max(0, startOffset));
        range.setEnd(firstNode, endOffset);
        range.surroundContents(wrapper);
        return wrapper;
      } catch (e) {
        // Fall back to highlighting the parent
        console.log('[Highlighter] Range wrap failed, using parent element');
      }
    }

    // Fallback: add highlight class to parent element
    // Find the most specific parent that contains the text
    let targetElement = parent;
    
    // Try to find a more specific element that contains the matched text
    const matchedText = text || '';
    if (matchedText.length > 10) {
      let current = parent;
      while (current && current !== document.body) {
        const parentText = this.normalizeText(current.textContent || '');
        const currentText = this.normalizeText(current.textContent || '');
        
        // If the parent has much more text, use the current element
        if (current.parentElement) {
          const parentFullText = this.normalizeText(current.parentElement.textContent || '');
          if (parentFullText.length > currentText.length * 3) {
            break;
          }
        }
        
        targetElement = current;
        current = current.parentElement;
      }
    }

    targetElement.classList.add(this.highlightClass);
    return targetElement;
  }

  removeHighlight(element) {
    if (!element) return;

    // Add fade animation
    element.classList.add(`${this.highlightClass}-fade`);

    setTimeout(() => {
      // If it's our wrapper span, unwrap it
      if (element.getAttribute('data-privacy-parser') === 'highlight') {
        const parent = element.parentNode;
        if (parent) {
          while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
          }
          parent.removeChild(element);
        }
      } else {
        // Just remove the class
        element.classList.remove(this.highlightClass);
        element.classList.remove(`${this.highlightClass}-fade`);
      }

      // Remove from active highlights
      const index = this.activeHighlights.indexOf(element);
      if (index > -1) {
        this.activeHighlights.splice(index, 1);
      }
    }, 500);
  }

  // Clear all active highlights
  clearAllHighlights() {
    this.activeHighlights.forEach(highlight => {
      this.removeHighlight(highlight);
    });
    this.activeHighlights = [];
  }
}

// Export for use in content script
window.ClauseHighlighter = ClauseHighlighter;
