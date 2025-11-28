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
        background: linear-gradient(120deg, #ffeaa7 0%, #fdcb6e 100%) !important;
        padding: 2px 4px !important;
        border-radius: 3px !important;
        box-shadow: 0 2px 8px rgba(253, 203, 110, 0.4) !important;
        animation: privacy-parser-pulse 1.5s ease-in-out infinite !important;
      }

      @keyframes privacy-parser-pulse {
        0%, 100% {
          box-shadow: 0 2px 8px rgba(253, 203, 110, 0.4);
        }
        50% {
          box-shadow: 0 2px 16px rgba(253, 203, 110, 0.8);
        }
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
      duration = this.highlightDuration,
      fuzzyMatch = true
    } = options;

    // Clean up the search text
    const searchText = this.normalizeText(clauseText);

    if (searchText.length < 20) {
      console.warn('Clause text too short for reliable matching');
      return false;
    }

    // Find the text in the page
    const match = this.findTextInPage(searchText, fuzzyMatch);

    if (!match) {
      console.warn('Could not find clause text in page:', searchText.substring(0, 50) + '...');
      return false;
    }

    // Create highlight
    const highlight = this.createHighlight(match);

    if (!highlight) {
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

  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[""'']/g, '"')
      .replace(/[–—]/g, '-')
      .trim();
  }

  findTextInPage(searchText, fuzzyMatch = true) {
    // Use TreeWalker to find text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script, style, and hidden elements
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    // Collect all text nodes and their content
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      const text = this.normalizeText(node.textContent);
      if (text.length > 0) {
        textNodes.push({ node, text });
      }
    }

    // Build a combined text string to search through
    let combinedText = '';
    const nodeMap = []; // Maps character positions to nodes

    for (const { node, text } of textNodes) {
      const startPos = combinedText.length;
      combinedText += text + ' ';
      nodeMap.push({
        node,
        start: startPos,
        end: startPos + text.length
      });
    }

    // Search for the text
    let matchStart = combinedText.indexOf(searchText);

    // If exact match not found and fuzzy matching enabled, try substring matching
    if (matchStart === -1 && fuzzyMatch) {
      // Try finding a significant portion of the text
      const words = searchText.split(' ').filter(w => w.length > 3);
      const significantPortion = words.slice(0, Math.min(10, words.length)).join(' ');

      if (significantPortion.length >= 20) {
        matchStart = combinedText.indexOf(significantPortion);
      }
    }

    if (matchStart === -1) {
      return null;
    }

    // Find which nodes contain the match
    const matchEnd = matchStart + searchText.length;
    const matchingNodes = nodeMap.filter(
      nm => nm.start < matchEnd && nm.end > matchStart
    );

    if (matchingNodes.length === 0) {
      return null;
    }

    return {
      nodes: matchingNodes.map(nm => nm.node),
      startOffset: matchStart - matchingNodes[0].start,
      text: searchText
    };
  }

  createHighlight(match) {
    const { nodes, startOffset, text } = match;

    if (nodes.length === 0) return null;

    // For simplicity, wrap the first matching node's parent
    const firstNode = nodes[0];
    const parent = firstNode.parentElement;

    if (!parent) return null;

    // Create a wrapper span
    const wrapper = document.createElement('span');
    wrapper.className = this.highlightClass;
    wrapper.setAttribute('data-privacy-parser', 'highlight');

    // If it's a single node and we can wrap it precisely
    if (nodes.length === 1) {
      try {
        const range = document.createRange();
        range.setStart(firstNode, Math.max(0, startOffset));
        range.setEnd(firstNode, Math.min(firstNode.length, startOffset + text.length));
        range.surroundContents(wrapper);
        return wrapper;
      } catch (e) {
        // Fall back to highlighting the parent
      }
    }

    // Fallback: add highlight class to parent element
    parent.classList.add(this.highlightClass);
    return parent;
  }

  removeHighlight(element) {
    if (!element) return;

    // Add fade animation
    element.classList.add(`${this.highlightClass}-fade`);

    setTimeout(() => {
      // If it's our wrapper span, unwrap it
      if (element.getAttribute('data-privacy-parser') === 'highlight') {
        const parent = element.parentNode;
        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
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
