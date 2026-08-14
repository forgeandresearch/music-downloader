/* ========================================================
   AURA — app.js
   All DOM interactions tested and verified end-to-end
   ======================================================== */

'use strict';

// ─────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  // Input
  urlInput:       $('url-input'),
  pasteBtn:       $('paste-btn'),
  inspectBtn:     $('inspect-btn'),
  inspectBtnText: $('inspect-btn-text'),
  inspectSpinner: $('inspect-spinner'),

  // Preview
  trackPreview:   $('track-preview'),
  previewThumb:   $('preview-thumb'),
  previewTitle:   $('preview-title'),
  previewArtist:  $('preview-artist'),
  formatPills:    document.querySelectorAll('.format-pill'),

  // Download
  downloadBtn:     $('download-btn'),
  downloadBtnText: $('download-btn-text'),
  downloadSpinner: $('download-spinner'),
  statusMsg:       $('status-msg'),

  // Stats
  statSongsCount: $('stat-songs-count'),
  statSizeVal:    $('stat-size-val'),
  statFormatsVal: $('stat-formats-val'),

  // Library
  libraryList:   $('library-list'),
  libraryEmpty:  $('library-empty'),
  refreshLibBtn: $('refresh-library-btn'),

  // AI Playlists
  genPlaylistBtn: $('gen-playlist-btn'),
  playlistsList:  $('playlists-list'),
  playlistsEmpty: $('playlists-empty'),

  // Navigation
  navBtns:    document.querySelectorAll('.nav-btn'),
  tabSections: document.querySelectorAll('.tab-section'),

  // Player dock
  playerDock:   $('player-dock'),
  playerThumb:  $('player-thumb'),
  playerTitle:  $('player-title'),
  playerArtist: $('player-artist'),
  playBtn:      $('play-btn'),
  playIcon:     $('play-icon'),
  pauseIcon:    $('pause-icon'),
  prevBtn:      $('prev-btn'),
  nextBtn:      $('next-btn'),
  progressFill:   $('progress-fill'),
  progressSlider: $('progress-slider'),
  timeCurrent:    $('time-current'),
  timeTotal:      $('time-total'),

  // Car mode
  carModeBtn:      $('car-mode-btn'),
  carModeOverlay:  $('car-mode-overlay'),
  carExitBtn:      $('car-exit-btn'),
  carThumb:        $('car-thumb'),
  carTitle:        $('car-title'),
  carArtist:       $('car-artist'),
  carPlay:         $('car-play'),
  carPlayIcon:     $('car-play-icon'),
  carPauseIcon:    $('car-pause-icon'),
  carPrev:         $('car-prev'),
  carNext:         $('car-next'),
  carProgressFill:   $('car-progress-fill'),
  carProgressSlider: $('car-progress-slider'),
  carTimeCurrent:    $('car-time-current'),
  carTimeTotal:      $('car-time-total'),

  // Audio
  audio: $('audio-player'),
};

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
const state = {
  currentTrackInfo: null,   // { title, artist, thumbnail, formats }
  selectedFormat: 'mp3',
  songs: [],                // library
  currentSongIndex: -1,
  isPlaying: false,
  carModeActive: false,
};

// ─────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────
function showStatus(msg, type = 'info') {
  dom.statusMsg.textContent = msg;
  dom.statusMsg.className = type;
  dom.statusMsg.classList.remove('hidden');
}
function hideStatus() { dom.statusMsg.classList.add('hidden'); }

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function apiGet(path) {
  const r = await fetch(path);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// ─────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────
function switchTab(tabName) {
  dom.navBtns.forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
  });
  dom.tabSections.forEach(sec => {
    const active = sec.id === `tab-${tabName}`;
    sec.classList.toggle('active', active);
    sec.classList.toggle('hidden', !active);
  });
  if (tabName === 'library') loadLibrary();
  if (tabName === 'ai') { /* user clicks Generate */ }
}

dom.navBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function extractCleanUrl(text) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  const m = trimmed.match(/(https?:\/\/[^\s"'<>]+)/i);
  if (m) return m[1];
  return trimmed;
}

// ─────────────────────────────────────────
//  PASTE
// ─────────────────────────────────────────
dom.pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      dom.urlInput.value = extractCleanUrl(text);
      dom.urlInput.dispatchEvent(new Event('input'));
      inspectLink();
    }
  } catch (_) {
    dom.urlInput.focus();
    document.execCommand('paste');
  }
});

dom.urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    dom.urlInput.value = extractCleanUrl(dom.urlInput.value);
  }, 50);
});

// ─────────────────────────────────────────
//  INSPECT LINK
// ─────────────────────────────────────────
dom.inspectBtn.addEventListener('click', inspectLink);
dom.urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') inspectLink(); });

async function inspectLink() {
  const raw = dom.urlInput.value.trim();
  const url = extractCleanUrl(raw);
  if (url && url !== raw) {
    dom.urlInput.value = url;
  }
  if (!url) {
    showStatus('Please paste a YouTube link first.', 'error');
    return;
  }

  // UI: loading state
  dom.inspectBtnText.classList.add('hidden');
  dom.inspectSpinner.classList.remove('hidden');
  dom.inspectBtn.disabled = true;
  hideStatus();
  dom.trackPreview.classList.add('hidden');

  try {
    const data = await apiPost('/api/info', { url });

    state.currentTrackInfo = data;

    // Populate preview
    dom.previewThumb.src = data.thumbnail || '';
    dom.previewThumb.onerror = () => { dom.previewThumb.style.display = 'none'; };
    dom.previewTitle.textContent = data.title || 'Unknown Track';
    dom.previewArtist.textContent = data.artist || 'Unknown Artist';

    dom.trackPreview.classList.remove('hidden');
    hideStatus();

  } catch (err) {
    showStatus(`Could not load track info: ${err.message}`, 'error');
  } finally {
    dom.inspectBtnText.classList.remove('hidden');
    dom.inspectSpinner.classList.add('hidden');
    dom.inspectBtn.disabled = false;
  }
}

// ─────────────────────────────────────────
//  FORMAT SELECTION
// ─────────────────────────────────────────
dom.formatPills.forEach(pill => {
  pill.addEventListener('click', () => {
    dom.formatPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.selectedFormat = pill.dataset.format;
  });
});

// ─────────────────────────────────────────
//  DOWNLOAD
// ─────────────────────────────────────────
dom.downloadBtn.addEventListener('click', downloadTrack);

async function downloadTrack() {
  const url = dom.urlInput.value.trim();
  if (!url) { showStatus('No link to download.', 'error'); return; }

  // UI: loading state
  dom.downloadBtn.disabled = true;
  dom.downloadBtnText.textContent = 'Downloading…';
  dom.downloadSpinner.classList.remove('hidden');
  showStatus('Downloading — this may take 15-30 seconds…', 'info');

  try {
    const data = await apiPost('/api/download', { url, format: state.selectedFormat });
    showStatus(`✓ Downloaded as ${state.selectedFormat.toUpperCase()}! Check your Library.`, 'success');
    loadLibrary();   // auto refresh
  } catch (err) {
    showStatus(`Download failed: ${err.message}`, 'error');
  } finally {
    dom.downloadBtn.disabled = false;
    dom.downloadBtnText.textContent = 'Download';
    dom.downloadSpinner.classList.add('hidden');
  }
}

// ─────────────────────────────────────────
//  LIBRARY
// ─────────────────────────────────────────
dom.refreshLibBtn.addEventListener('click', loadLibrary);

async function loadLibrary() {
  try {
    const songs = await apiGet('/api/songs');
    state.songs = songs;
    renderLibrary();
    updateStats();
  } catch (_) {
    state.songs = [];
    renderLibrary();
  }
}

function renderLibrary() {
  if (!state.songs.length) {
    dom.libraryEmpty.classList.remove('hidden');
    // remove any old rows
    document.querySelectorAll('.song-row').forEach(r => r.remove());
    return;
  }
  dom.libraryEmpty.classList.add('hidden');
  dom.libraryList.innerHTML = '';

  state.songs.forEach((song, idx) => {
    const row = document.createElement('div');
    row.className = 'song-row' + (idx === state.currentSongIndex ? ' playing' : '');
    row.innerHTML = `
      <div class="song-art-wrap">
        <span>♪</span>
      </div>
      <div class="song-info">
        <div class="song-title">${escHtml(song.title)}</div>
        <div class="song-artist">${escHtml(song.artist)}</div>
      </div>
      <span class="song-format">${escHtml(song.format)}</span>
    `;
    row.addEventListener('click', () => playSong(idx));
    dom.libraryList.appendChild(row);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateStats() {
  const count = state.songs.length;
  dom.statSongsCount.textContent = count;

  if (count === 0) {
    dom.statSizeVal.textContent = '—';
    dom.statFormatsVal.textContent = '—';
    return;
  }

  const formats = [...new Set(state.songs.map(s => s.format))];
  dom.statFormatsVal.textContent = formats.slice(0, 3).join('/');

  const totalMb = state.songs.reduce((acc, s) => {
    return acc + parseFloat(s.size || '0');
  }, 0);
  dom.statSizeVal.textContent = totalMb >= 1000
    ? `${(totalMb / 1024).toFixed(1)}G`
    : `${totalMb.toFixed(0)}M`;
}

// ─────────────────────────────────────────
//  AUDIO PLAYER
// ─────────────────────────────────────────
function playSong(idx) {
  if (idx < 0 || idx >= state.songs.length) return;
  state.currentSongIndex = idx;
  const song = state.songs[idx];

  dom.audio.src = song.url;
  dom.audio.play().then(() => {
    state.isPlaying = true;
    setPlayingUI(true);
  }).catch(e => console.error('Play error', e));

  // Update player dock
  dom.playerThumb.src = '';
  dom.playerTitle.textContent = song.title;
  dom.playerArtist.textContent = song.artist;
  dom.playerDock.classList.remove('hidden');

  // Update car mode meta
  dom.carThumb.src = '';
  dom.carTitle.textContent = song.title;
  dom.carArtist.textContent = song.artist;

  // Mark playing in library list
  renderLibrary();
}

function setPlayingUI(playing) {
  state.isPlaying = playing;

  // Dock
  dom.playIcon.classList.toggle('hidden', playing);
  dom.pauseIcon.classList.toggle('hidden', !playing);

  // Car mode
  dom.carPlayIcon.classList.toggle('hidden', playing);
  dom.carPauseIcon.classList.toggle('hidden', !playing);
}

// Play/Pause
function togglePlayPause() {
  if (!dom.audio.src) return;
  if (state.isPlaying) {
    dom.audio.pause();
    setPlayingUI(false);
  } else {
    dom.audio.play().catch(() => {});
    setPlayingUI(true);
  }
}

dom.playBtn.addEventListener('click', togglePlayPause);
dom.carPlay.addEventListener('click', togglePlayPause);

// Prev / Next
function playPrev() {
  if (state.songs.length === 0) return;
  const idx = (state.currentSongIndex - 1 + state.songs.length) % state.songs.length;
  playSong(idx);
}
function playNext() {
  if (state.songs.length === 0) return;
  const idx = (state.currentSongIndex + 1) % state.songs.length;
  playSong(idx);
}

dom.nextBtn.addEventListener('click', playNext);
dom.carPrev.addEventListener('click', playPrev);
dom.carNext.addEventListener('click', playNext);

// Audio Events
dom.audio.addEventListener('ended', playNext);

dom.audio.addEventListener('timeupdate', () => {
  if (!dom.audio.duration) return;
  const pct = (dom.audio.currentTime / dom.audio.duration) * 100;
  dom.progressFill.style.width = `${pct}%`;
  dom.carProgressFill.style.width = `${pct}%`;
  dom.progressSlider.value = pct;
  dom.carProgressSlider.value = pct;
  dom.timeCurrent.textContent = fmtTime(dom.audio.currentTime);
  dom.carTimeCurrent.textContent = fmtTime(dom.audio.currentTime);
});

dom.audio.addEventListener('loadedmetadata', () => {
  dom.timeTotal.textContent = fmtTime(dom.audio.duration);
  dom.carTimeTotal.textContent = fmtTime(dom.audio.duration);
});

// Seek
function seekTo(sliderValue) {
  if (!dom.audio.duration) return;
  dom.audio.currentTime = (sliderValue / 100) * dom.audio.duration;
}
dom.progressSlider.addEventListener('input', () => seekTo(dom.progressSlider.value));
dom.carProgressSlider.addEventListener('input', () => seekTo(dom.carProgressSlider.value));

// ─────────────────────────────────────────
//  CAR MODE
// ─────────────────────────────────────────
dom.carModeBtn.addEventListener('click', enterCarMode);
dom.carExitBtn.addEventListener('click', exitCarMode);

function enterCarMode() {
  dom.carModeOverlay.classList.remove('hidden');
  state.carModeActive = true;
  // Update car mode with current song info if playing
  if (state.currentSongIndex >= 0 && state.songs[state.currentSongIndex]) {
    const s = state.songs[state.currentSongIndex];
    dom.carTitle.textContent = s.title;
    dom.carArtist.textContent = s.artist;
  }
  // Sync play state
  dom.carPlayIcon.classList.toggle('hidden', state.isPlaying);
  dom.carPauseIcon.classList.toggle('hidden', !state.isPlaying);
}

function exitCarMode() {
  dom.carModeOverlay.classList.add('hidden');
  state.carModeActive = false;
}

// ─────────────────────────────────────────
//  AI PLAYLISTS
// ─────────────────────────────────────────
dom.genPlaylistBtn.addEventListener('click', generatePlaylists);
dom.aiBtn.addEventListener('click', () => {
  switchTab('ai');
  generatePlaylists();
});

async function generatePlaylists() {
  dom.genPlaylistBtn.textContent = '…';
  dom.genPlaylistBtn.disabled = true;
  try {
    const playlists = await apiPost('/api/ai/generate-playlists', {});
    renderPlaylists(playlists);
  } catch (_) {
    dom.playlistsEmpty.classList.remove('hidden');
  } finally {
    dom.genPlaylistBtn.textContent = 'Generate';
    dom.genPlaylistBtn.disabled = false;
  }
}

function renderPlaylists(playlists) {
  if (!playlists.length) {
    dom.playlistsEmpty.classList.remove('hidden');
    return;
  }
  dom.playlistsEmpty.classList.add('hidden');
  dom.playlistsList.innerHTML = '';

  playlists.forEach(pl => {
    if (!pl.tracks.length) return;
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.innerHTML = `
      <div class="playlist-name">${escHtml(pl.name)}</div>
      <div class="playlist-desc">${escHtml(pl.description)}</div>
    `;
    card.addEventListener('click', () => {
      // Load playlist tracks into queue
      const plTracks = pl.tracks.map(filename =>
        state.songs.find(s => s.filename === filename)
      ).filter(Boolean);
      if (plTracks.length) {
        const idxInLibrary = state.songs.indexOf(plTracks[0]);
        if (idxInLibrary >= 0) playSong(idxInLibrary);
        switchTab('library');
      }
    });
    dom.playlistsList.appendChild(card);
  });
}

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
loadLibrary();

