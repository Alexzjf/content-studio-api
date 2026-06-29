# Chrome Web Store — cheatXtwitter

## 1. One-time: developer account

1. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay **$5** one-time registration (Google account)
3. Accept developer agreement

## 2. Build the zip

```bash
cd /Users/olexander/Desktop/twitter-post-extension
npm run build          # offscreen.js + wasm (if changed)
npm run package:webstore
```

Output: `dist/cheatxtwitter-1.45.0.zip` (~33 MB)

The script **excludes**: `server/`, `node_modules/`, `auth-config.local.js` (secrets), dev scripts.

## 3. Privacy policy URL (required)

Host the policy publicly. After deploying the server:

**https://content-studio-api-1.onrender.com/privacy**

(File: `store/privacy-policy.html` — served by API after deploy.)

Or upload `store/privacy-policy.html` to GitHub Pages / your site.

## 4. Upload extension

1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **New item**
2. Upload `dist/cheatxtwitter-*.zip`
3. Fill listing (see below)
4. **Privacy** → paste privacy policy URL
5. **Distribution** → Public (or Unlisted for testing)
6. Submit for review (usually 1–3 business days)

## 5. Listing text (copy-paste)

### Name
`cheatXtwitter`

### Summary (132 chars max)
```
AI assistant for X/Twitter: turn video, audio, text & images into posts. Draft replies on your posts. You review & publish.
```

### Description
```
cheatXtwitter helps you create and reply on X (Twitter) faster.

• Add sources — video, audio, images, or pasted text
• Local speech-to-text (Whisper) for video/audio
• AI ghostwriter — posts, threads, Q&A from your sources
• cheatX button on X — draft comments; you publish manually
• Reply to comments under your own posts
• Sign in: email, Google, Telegram, or X
• English & Ukrainian UI

You always review and publish yourself. We do not auto-post.

Optional: use your own API keys (OpenAI, Anthropic, Gemini, etc.) or the shared cloud assistant.
```

### Category
**Social & Communication** or **Productivity**

### Single purpose
```
Help users draft X/Twitter posts and replies using AI from user-provided content.
```

### Permission justifications (if asked)

| Permission | Why |
|------------|-----|
| storage | Settings, chat history, auth session |
| activeTab | Insert drafted text into X compose box |
| scripting | Fill reply composer on x.com |
| tabs / windows / sidePanel | Panel, fullscreen, dock modes |
| offscreen | Local Whisper transcription |
| identity | Google / X OAuth sign-in |
| host: x.com, twitter.com | cheatX buttons, compose injection |
| host: AI APIs | User's own API keys or hosted assistant |
| host: all URLs | Optional in-tab side panel on any site |

## 6. After first upload — Google OAuth

1. `chrome://extensions` → enable extension from store (or unpacked) → copy **Extension ID**
2. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client → **Chrome Extension**
3. Item ID = your extension ID
4. Same Client ID must be in `manifest.json` → `oauth2.client_id`

## 7. Screenshots

Prepare in Chrome (1280×800 or 640×400):

1. Main chat with sources
2. Generated post with copy button
3. cheatX button on X post
4. Settings / sign-in

Upload at least **1 screenshot** in the dashboard.

## 8. Updates

Bump `version` in `manifest.json` and `app.js` (`APP_VERSION`), then:

```bash
npm run package:webstore
```

Upload new zip in Developer Dashboard → your item → **Package** → Upload new version.

## Checklist before submit

- [ ] No `auth-config.local.js` with secrets in zip
- [ ] `server/` not in zip
- [ ] Privacy policy URL live
- [ ] Screenshots uploaded
- [ ] Support email set in dashboard
- [ ] Hosted API running (`content-studio-api-1.onrender.com`)
