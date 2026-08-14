# AURA Music Studio — YouTube Downloader & Car Audio Player (Android App)

A flagship-grade minimalist dark mode Android mobile app for personal YouTube & YouTube Music audio downloading, multi-format audio conversion (`MP3`, `FLAC`, `M4A`, `WAV`, `OPUS`), Car Play Dashboard UI, and offline AI smart playlist auto-generation.

---

## ⚡ Automated APK Build via GitHub Actions

This repository is configured with **GitHub Actions CI/CD**. 

Whenever you push code to `main` / `master` branch or manually trigger the workflow:
1. GitHub Actions automatically installs Java JDK 17 & Node.js.
2. Compiles the mobile app code using Capacitor & Gradle.
3. Generates the downloadable `.apk` file under GitHub Actions **Artifacts**.

### How to download your APK from GitHub:
1. Push this repository to your GitHub account.
2. Go to the **Actions** tab on your GitHub repository.
3. Click on the latest workflow run: **Build Android APK**.
4. Scroll down to **Artifacts** and click **`aura-music-downloader-debug-apk`** to download your ready-to-install Android APK file!

---

## 📱 App Highlights

- **Direct YouTube & YouTube Music Link Extraction**: Downloads high-fidelity audio streams.
- **Audio Format Selector**: Choose from `MP3 (320kbps)`, `FLAC (Lossless)`, `M4A`, `WAV`, `OPUS` on link paste.
- **Car Dashboard Mode**: Ultra-large touch controls and high contrast layout for car phone mounts.
- **Offline AI Smart Playlists**: Automatically groups tracks into vibe playlists locally.
- **100% Data Privacy & Security**: No tracking, telemetries, or cloud uploads.

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Sync Capacitor assets
npx cap sync

# Run server locally
npm start
```
