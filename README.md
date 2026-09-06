# Beamly 🎵
### *The Sleek, Ad-Free YouTube Music Desktop Player*

[![Electron](https://img.shields.io/badge/Electron-44.2.0-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![YouTube Music](https://img.shields.io/badge/YouTube%20Music-Pure%20Client-FF0000?style=for-the-badge&logo=youtubemusic&logoColor=white)](https://music.youtube.com/)
[![JSON Cache](https://img.shields.io/badge/Storage-JSON%20File%20Cache-003B57?style=for-the-badge&logo=json&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)

Beamly is a modern, high-performance desktop client for **YouTube Music**, engineered with **Electron**, **youtubei.js**, **Express**, and a lightweight **JSON File Cache**. It offers an ad-free listening experience, rich Material 3 aesthetics, live synced karaoke lyrics, local offline storage, Google Cast support, and an isolated local stream proxy.

---

## 🌟 Key Features

### 🎧 100% Pure YouTube Music Engine
- Powered by `youtubei.js` without any external third-party streaming dependencies.
- Explore curated **Trending & Quick Picks**, **Popular Artists**, and algorithmic **Playlists You'll Love**.
- Fast, instant search for tracks, albums, artists, and community playlists.

### 🔑 Native Google / YouTube Music Sign-In
- Secure, native Google sign-in window ([music.youtube.com](https://music.youtube.com)) that captures essential session tokens (`SAPISID`, `__Secure-3PAPISID`, `LOGIN_INFO`).
- Instant synchronization of your private YouTube Music library, saved playlists, and **Liked Music** (`LM`).
- Graceful error recovery: keeps you signed in even if profile metadata parsing encounters unexpected Google payloads.

### 🛡️ Local Stream Proxy (Zero 403 Forbidden)
- Integrated local HTTP audio streaming proxy running on `http://127.0.0.1:8888/stream/:videoId`.
- Automatically injects Android Music client headers (`User-Agent: com.google.android.apps.youtubemusic`, `Origin: https://music.youtube.com`) into chunk requests to bypass YouTube's 403 Forbidden throttling and IP blocks.

### 🎤 Live Synced LRC Lyrics
- Real-time synced lyrics fetched via LRCLIB with chunk-based asynchronous regex parsing.
- Interactive karaoke-style view: click any line to instantly seek audio without stuttering or DOM freezing.

### 💾 Offline Downloads & JSON File Caching
- Download your favorite songs locally with one click for uninterrupted offline listening.
- High-speed local caching using a safe JSON file cache (`cache.json`) inside `app.getPath('userData')` to store track queries, authentication session, and offline metadata.

### 📡 Google Cast & Smart Speaker Support
- Automatic Wi-Fi discovery of Google Cast, Nest Hub, and Chromecast Audio devices on your local network.
- Seamless stream handoff to your home sound system.

### ⚙️ Comprehensive Settings & Preferences
- **Audio Quality Selection**: Switch between **High (256 kbps)**, **Normal (128 kbps)**, and **Data Saver (64 kbps)**.
- **Theme Customization**: Toggle between **Material 3 Deep Dark** and **Clean Light** modes with smooth transitions.
- **Storage & Cache Diagnostics**: Real-time database size and query count metrics, with one-click buttons to clear query cache or purge all local data safely.
- **Account Disconnect**: Safe Google account logout directly from the settings panel.

### 🌙 Smart Sleep Timer
- Set a timer for 15m, 30m, 45m, 1 hour, or until the end of the current track.
- Features a smooth 4-second audio fade-out to ensure a gentle transition into sleep.

---

## 🏗️ Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       Beamly Renderer UI                    │
│   (HTML5 Audio + Material 3 CSS + DOM Event Coalescing)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC Bridge (preload.js)
┌──────────────────────────────▼──────────────────────────────┐
│                    Electron Main Process                    │
│                                                             │
│  ┌───────────────────────┐       ┌────────────────────────┐ │
│  │   youtubeResolver.js  │       │     streamProxy.js     │ │
│  │   (youtubei.js client)│       │  (Express on port 8888)│ │
│  └───────────┬───────────┘       └───────────┬────────────┘ │
│              │                               │              │
│  ┌───────────▼───────────┐       ┌───────────▼────────────┐ │
│  │   JSON Cache (db.js)  │       │   Google Video Chunks  │ │
│  │ (Auth & Match Caches) │       │ (Android client bypass)│ │
│  └───────────────────────┘       └────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: Version `18.0.0` or higher installed.
- **npm** or **yarn** package manager.
- Windows, macOS, or Linux operating system.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/meetgharat84/beamly.git
   cd beamly
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application in development mode**:
   ```bash
   npm start
   ```

---

## 📦 Building & Packaging

Beamly uses `electron-builder` to package portable executables and installers.

### Windows (NSIS Installer & Portable)
```bash
npm run build
```
or to explicitly target Windows:
```bash
npm run dist
```
The compiled installers will be located in the `dist/` directory.

---

## ⌨️ Keyboard Shortcuts & Controls

| Shortcut / Action | Function |
| :--- | :--- |
| <kbd>Space</kbd> | Toggle Play / Pause |
| <kbd>Escape</kbd> | Close Settings modal, Lyrics panel, or Playback Queue |
| <kbd>Click Progress Bar</kbd> | Seek to specific audio timestamp |
| <kbd>Click Lyric Line</kbd> | Instantly jump playback to that lyric line |
| <kbd>Volume Slider</kbd> | Adjust player volume (persisted across sessions) |
| <kbd>Mute Button</kbd> | Mute / unmute audio |

---

## 🛠️ Project Structure

```
Beamly/
├── assets/                  # Logos, icons, and media assets
├── db.js                    # File-backed JSON cache storage, auth & stats
├── main.js                  # Electron lifecycle, IPC handlers, tray integration
├── preload.js               # Context isolation security bridge
├── index.html               # Semantic Material 3 UI layout & dialogs
├── styles.css               # Material 3 CSS tokens, glassmorphism & styling
├── renderer.js              # State management, audio controllers, event wiring
├── youtubeResolver.js       # Innertube / youtubei.js integration & stream resolution
├── streamProxy.js           # Local HTTP chunk proxy on port 8888
├── lyricsService.js         # LRCLIB API synced & plain lyrics fetcher
├── castService.js           # Google Cast discovery and playback handoff
├── downloader.js            # Offline track streaming and file persistence
├── package.json             # Project dependencies and build scripts
└── README.md                # Project documentation
```

---

## 🔧 Troubleshooting & Tips

### 1. Audio Fails to Play or Shows 403 Forbidden
Beamly automatically routes playback through `http://127.0.0.1:8888/stream/:videoId`. Ensure that port `8888` is not blocked by your local firewall or used by another background process.

### 2. Google Sign-In Window Closes Early
Google's authentication requires completing the login flow inside the popup until `music.youtube.com` loads completely. Beamly will automatically detect the cookies and close the window when authentication succeeds.

### 3. Clearing Cache
If track thumbnails or stream links become stale, open **Settings** (<kbd>⚙</kbd>) and click **Clear Track Match Cache** or **Purge Cache Database**. Your signed-in account remains safe and intact.

---

## 📄 License & Disclaimer

This project is licensed under the **ISC License**.

> **Disclaimer**: Beamly is an independent, open-source project created for educational and personal use. It is not affiliated with, endorsed by, or associated with Google LLC or YouTube Music. All trademarks and registered trademarks are the property of their respective owners.
