# ChatMap

A Chrome Manifest V3 extension that adds a floating right-side question navigator to ChatGPT web conversations. It scans the current conversation for user messages, lists them in order, and lets you jump back to any earlier question.

## Features

- Floating right sidebar that does not resize the conversation layout
- Extracts user questions from the current ChatGPT conversation
- Click-to-jump navigation with temporary highlight on the target question and answer
- Active question tracking while scrolling
- Resizable sidebar with collapsed state and width saved in local storage
- Local-only processing with no network requests

## Load In Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `/Users/edison/chatgpt/chat_map`

## Project Structure

- `manifest.json`: MV3 extension manifest
- `src/storage.js`: panel state persistence
- `src/extractor.js`: ChatGPT DOM adapter and question extraction
- `src/navigator.js`: scroll and highlight behavior
- `src/panel.js`: floating sidebar UI and resize handling
- `src/observer.js`: mutation and visibility observers
- `src/content.js`: startup and orchestration
- `src/styles.css`: sidebar and highlight styles

## Notes

- V1 targets ChatGPT web only.
- The DOM adapter is intentionally isolated so selector updates are localized if ChatGPT changes its markup.
- No search, AI title generation, or cross-conversation indexing is included in this version.
