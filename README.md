# AI-Assisted Privacy Policy Parsing

A Chrome Extension that uses AI to help users understand privacy policies and terms of service by providing automated summarization and Q&A capabilities.

## Features

- **Automatic Detection**: Automatically detects when you're viewing a privacy policy or terms of service page
- **AI-Powered Summaries**: Get clear, jargon-free summaries of complex legal documents
- **Risk Assessment**: Identifies and highlights key privacy risks with severity ratings
- **Data Insights**: See what data is collected, how it's used, and who it's shared with
- **Interactive Q&A**: Ask follow-up questions about the policy in a chat interface
- **Clause Highlighting**: Click on quotes to scroll to and highlight the relevant section in the original document

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/AI-Assisted-Privacy-Policy-Parsing.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the project folder

5. Configure your OpenAI API key:
   - Click on the extension icon in Chrome
   - Go to Settings (gear icon)
   - Enter your OpenAI API key
   - Click "Save Settings"

### Getting an API Key

This extension requires an OpenAI API key to function:

1. Visit [platform.openai.com](https://platform.openai.com)
2. Create an account or sign in
3. Navigate to API Keys in settings
4. Create a new API key
5. Copy the key and paste it in the extension settings

**Cost**: Uses GPT-4o-mini which costs ~$0.001-0.003 per policy analysis (very affordable).

## Usage

1. **Automatic Detection**: When you visit a privacy policy page, a banner will appear offering to analyze it
2. **Manual Analysis**: Click the extension icon to open the side panel, then click "Analyze Current Page"
3. **View Summary**: See the AI-generated summary with risk ratings and data practices
4. **Ask Questions**: Use the chat interface at the bottom to ask specific questions about the policy
5. **Highlight Clauses**: Click on any quoted text to scroll to that section in the original document

## Project Structure

```
AI-Assisted-Privacy-Policy-Parsing/
├── manifest.json              # Chrome Extension manifest (v3)
├── src/
│   ├── background/           # Service worker for API calls
│   ├── content/              # Content scripts for page interaction
│   ├── sidepanel/            # Side panel UI
│   ├── options/              # Settings page
│   └── lib/                  # Third-party libraries
├── assets/icons/             # Extension icons
└── styles/                   # CSS styles
```

## Technologies Used

- **Chrome Extension Manifest V3**: Modern extension architecture
- **Chrome Side Panel API**: Native side panel integration
- **OpenAI GPT-4o-mini**: AI-powered analysis and Q&A (cost-effective)
- **Mozilla Readability**: Content extraction from web pages
- **DOMPurify**: HTML sanitization for security

## Privacy

- Your API key is stored locally in Chrome's secure storage
- Policy content is sent only to OpenAI's API for analysis
- No data is collected or stored on external servers
- All processing happens locally in your browser

## Authors

- Brian Lin
- Jackson Moody
- Sein Yun

## Course

CS 1050: Privacy, Technology, and the Law
Harvard University

## License

This project is for educational purposes as part of the CS 1050 course.
