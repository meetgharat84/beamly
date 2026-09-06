<div align="center">

  <img src="assets/logo.png" alt="Beamly Logo" width="160" />

  # Beamly 🎵
  ### *The Modern, Ad-Free YouTube Music Desktop Experience*

  [![Stars](https://img.shields.io/github/stars/meetgharat84/beamly?style=for-the-badge&logo=github&color=FF5722)](https://github.com/meetgharat84/beamly/stargazers)
  [![Forks](https://img.shields.io/github/forks/meetgharat84/beamly?style=for-the-badge&logo=github&color=00BCD4)](https://github.com/meetgharat84/beamly/network/members)
  [![Issues](https://img.shields.io/github/issues/meetgharat84/beamly?style=for-the-badge&color=blue)](https://github.com/meetgharat84/beamly/issues)
  [![Electron](https://img.shields.io/badge/Electron-44.2.0-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](https://github.com/meetgharat84/beamly/pulls)

  <p align="center">
    <strong>Beamly</strong> is a sleek, ultra-fast YouTube Music desktop client engineered with <strong>Electron</strong>, <strong>youtubei.js</strong>, and <strong>Material 3</strong> design. Enjoy continuous, ad-free music, real-time synchronized karaoke lyrics, native Google account library sync, local caching, and seamless Google Cast streaming.
  </p>

  <p align="center">
    <a href="#-key-features">Key Features</a> •
    <a href="#%EF%B8%8F-architecture--data-flow">Architecture</a> •
    <a href="#-getting-started">Getting Started</a> •
    <a href="#-building--packaging">Packaging</a> •
    <a href="#%EF%B8%8F-keyboard-shortcuts">Shortcuts</a> •
    <a href="#%EF%B8%8F-troubleshooting--faq">Troubleshooting</a> •
    <a href="#-license--credits">Credits</a>
  </p>

</div>

---

## 🌟 Key Features

### 🚫 100% Ad-Free Listening
Experience continuous, uninterrupted music playback without intrusive video or audio advertisements, banners, or sponsored breaks.

### 🛡️ 403 Forbidden Smart Stream Proxy
- **Local Proxy Engine**: Routes media playback through an isolated local proxy (`http://127.0.0.1:8888/stream/:videoId`).
- **Client Header Masquerading**: Automatically injects official mobile and web headers (`User-Agent: com.google.android.apps.youtubemusic`, `Referer: https://music.youtube.com`) to prevent Google Video chunk blocks and rate limiting.
- **Multi-Client Fallback**: If an `ANDROID_MUSIC` stream encounters an issue, the pipeline automatically falls back across `WEB_REMIX`, `IOS`, and `WEB` client parameters before reporting an error.

### 🎤 Real-Time Synced Karaoke Lyrics
- **Live Synced LRC**: Fetches word- and line-synchronized lyrics via LRCLIB.
- **Interactive Karaoke Mode**: Click any lyric line to jump playback directly to that exact moment.
- **High-Performance Rendering**: Non-blocking asynchronous DOM updates ensure silky-smooth animations and zero UI thread freezes during playback.

### 🔑 Native Google Account & Library Sync
- **Secure Authentication**: Built-in Google sign-in window capturing secure session cookies (`SAPISID`, `__Secure-3PAPISID`, `LOGIN_INFO`).
- **Strict Private Library**: Directly synchronizes your playlists, subscriptions, and **Liked Music** (`LM`).
- **Privacy-First**: Zero unauthenticated public fallbacks—when logged in, Beamly strictly respects your private account context.

### 💾 Zero-Native-Dependency JSON File Cache
- **Lightweight & Fast**: Eliminates bulky native C++ database dependencies (`better-sqlite3`) in favor of atomic, safe JSON file storage (`cache.json`).
- **Persistence**: Caches search matches, playback history, session tokens, and preferences inside `app.getPath('userData')`.
- **Hassle-Free Builds**: Guarantees fast, cross-platform packaging with zero native rebuild failures (`npmRebuild: false`).

### 📡 Google Cast & Smart Speaker Handoff
- Automatic local Wi-Fi discovery of Chromecast, Google Nest Hub, and Cast-enabled smart TVs.
- Switch seamlessly between desktop speakers and your home sound system with one click.

### ⚙️ Customizable Settings & Sleep Timer
- **Audio Quality Control**: Choose between **High (256 kbps)**, **Normal (128 kbps)**, and **Data Saver (64 kbps)**.
- **Theme Switcher**: Instant switching between **Material 3 Deep Dark** and **Clean Light** themes.
- **Cache Management**: Monitor real-time cache sizes and purge track history with a single tap.
- **Smart Sleep Timer**: Set a timer for 15, 30, 45, or 60 minutes, or stop after the current song with a gentle **4-second audio fade-out**.

---

## 🏗️ Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Beamly Renderer UI                     │
│  (HTML5 Audio • Material 3 Design • Synced Lyrics View)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC Bridge (preload.js)
┌──────────────────────────────▼──────────────────────────────┐
│                    Electron Main Process                    │
│                                                             │
│  ┌───────────────────────┐       ┌────────────────────────┐ │
│  │   youtubeResolver.js  │       │     streamProxy.js     │ │
│  │  (youtubei.js client) │       │  (Express on port 8888)│ │
│  └───────────┬───────────┘       └───────────┬────────────┘ │
│              │                               │              │
│  ┌───────────▼───────────┐       ┌───────────▼────────────┐ │
│  │   JSON Cache (db.js)  │       │   Google Video Chunks  │ │
│  │ (Auth & Match Caches) │       │ (Multi-Client Fallback)│ │
│  └───────────────────────┘       └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop Runtime** | [Electron 44](https://www.electronjs.org/) with secure IPC context isolation |
| **YouTube Music Engine** | [youtubei.js (Innertube)](https://github.com/LuanRT/YouTube.js) |
| **Audio Streaming Proxy** | [Express](https://expressjs.com/) HTTP chunk-streaming proxy |
| **User Interface** | Semantic HTML5, Material 3 Design, Vanilla CSS Glassmorphism |
| **Lyrics Provider** | [LRCLIB API](https://lrclib.net/) synced LRC parser |
| **Network Casting** | [chromecasts](https://github.com/mafintosh/chromecasts) (mDNS / SSDP discovery) |
| **Data Storage** | Native Node.js atomic JSON file storage |
| **Packaging** | [electron-builder](https://www.electron.build/) (NSIS Windows installer & portable) |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher (or `yarn` / `pnpm`)
- **Git**: Installed and configured

### Installation & Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/meetgharat84/beamly.git
   cd beamly
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Launch in development mode**:
   ```bash
   npm start
   ```

---

## 📦 Building & Packaging

Beamly is configured with `electron-builder` to produce standalone installers without requiring native compiler toolchains.

### Windows (NSIS Installer)
```bash
npm run build
```
Or to build explicitly for Windows:
```bash
npm run dist
```
The output executable will be created in the `dist/` directory:
- `dist/Beamly Setup 1.0.0.exe` (One-click NSIS installer)

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause audio |
| <kbd>Esc</kbd> | Close Lyrics view, Settings modal, or Queue drawer |
| <kbd>Click Progress Bar</kbd> | Seek to timestamp |
| <kbd>Click Lyric Line</kbd> | Jump playback directly to lyric position |
| <kbd>Volume Slider</kbd> | Smooth volume adjustment (persisted across sessions) |
| <kbd>Mute Button</kbd> | Toggle audio mute |

---

## ⚙️ Settings & Configuration

Beamly stores all local preferences, session tokens, and cached track queries in your platform's standard application data directory:

- **Windows**: `%APPDATA%\Beamly\cache.json`
- **macOS**: `~/Library/Application Support/Beamly/cache.json`
- **Linux**: `~/.config/Beamly/cache.json`

### Available Settings:
- **Audio Streaming Quality**:
  - `High`: 256 kbps (best audio fidelity)
  - `Normal`: 128 kbps (balanced bandwidth)
  - `Low`: 64 kbps (data-saver mode)
- **Theme**: Dark Mode / Light Mode toggle with dynamic accent colors.
- **Cache Cleaner**: One-click purge to refresh metadata without losing account authentication.
- **Account Disconnect**: Clear session cookies and sign out safely.

---

## 📁 Project Structure

```
Beamly/
├── assets/                  # Application icons (icon.ico) & brand logos (logo.png)
├── db.js                    # Atomic JSON file cache, auth session & query persistence
├── main.js                  # Electron application lifecycle, IPC, and tray handlers
├── preload.js               # Context-isolated security bridge exposing safe APIs
├── index.html               # Responsive Material 3 layout, modals, and views
├── styles.css               # Glassmorphism tokens, CSS variables, and layout rules
├── renderer.js              # State management, audio playback engine, lyrics scroll
├── youtubeResolver.js       # Innertube client handler with multi-client stream fallbacks
├── streamProxy.js           # Local Express proxy forwarding stream chunks with mobile headers
├── lyricsService.js         # LRCLIB synced lyrics search and LRC timestamp parser
├── castService.js           # Chromecast device discovery and media dispatch
├── downloader.js            # Offline music downloader and track storage
├── package.json             # App manifest, dependencies, and build configuration
├── .gitignore               # Excludes node_modules, cache.json, auth.json, dist
└── README.md                # Comprehensive project documentation
```

---

## 🔧 Troubleshooting & FAQ

<details>
<summary><strong>1. Audio fails to play or stops immediately</strong></summary>
<br>
Beamly streams audio via a local HTTP proxy running at <code>http://127.0.0.1:8888</code>. Ensure that another application is not occupying port <code>8888</code> and that your local firewall is not blocking localhost loopback connections.
</details>

<details>
<summary><strong>2. YouTube returns 403 Forbidden on audio tracks</strong></summary>
<br>
Beamly includes automatic client masquerading and fallback routines (<code>ANDROID_MUSIC</code> → <code>WEB_REMIX</code> → <code>IOS</code> → <code>WEB</code>). If you encounter persistent 403 errors, open <strong>Settings (⚙)</strong> and click <strong>Clear Track Match Cache</strong> to renew stream URLs.
</details>

<details>
<summary><strong>3. Google Sign-In closes without logging in</strong></summary>
<br>
Ensure you complete the sign-in process until the main YouTube Music homepage (<code>music.youtube.com</code>) finishes loading. Beamly listens for the required session cookies and will automatically capture the session and close the window upon successful authentication.
</details>

<details>
<summary><strong>4. How do I completely reset the app state?</strong></summary>
<br>
Open <strong>Settings (⚙)</strong> and click <strong>Purge Cache Database</strong>, or close Beamly and manually delete the <code>cache.json</code> file located in your application data directory.
</details>

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project (`https://github.com/meetgharat84/beamly/fork`)
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License & Credits

Distributed under the **ISC License**. See `LICENSE` for more information.

### 👤 Author
- **Meet Gharat** - [@meetgharat84](https://github.com/meetgharat84)

---

> **Disclaimer**: Beamly is an independent open-source client developed for personal and educational purposes. It is not affiliated with, maintained by, or endorsed by Google LLC or YouTube Music. All product names, logos, and brands are property of their respective owners.
