document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentSongs = [];
  let currentTrackIndex = -1;
  let isPlaying = false;
  let pendingDownloadUrl = '';

  // Elements
  const audioElement = document.getElementById('audioElement');
  const songsGrid = document.getElementById('songsGrid');
  const trackCountPill = document.getElementById('trackCountPill');
  const searchInput = document.getElementById('searchInput');

  // Player Elements
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const dockTitle = document.getElementById('dockTitle');
  const dockArtist = document.getElementById('dockArtist');
  const progressBar = document.getElementById('progressBar');
  const progressWrapper = document.getElementById('progressWrapper');
  const currentTimeEl = document.getElementById('currentTime');
  const durationTimeEl = document.getElementById('durationTime');
  const volumeSlider = document.getElementById('volumeSlider');

  // Downloader Elements
  const directUrlInput = document.getElementById('directUrlInput');
  const fetchLinkInfoBtn = document.getElementById('fetchLinkInfoBtn');
  const downloadModal = document.getElementById('downloadModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelDownloadBtn = document.getElementById('cancelDownloadBtn');
  const startDownloadBtn = document.getElementById('startDownloadBtn');
  const modalMetaPreview = document.getElementById('modalMetaPreview');
  const formatSelect = document.getElementById('formatSelect');
  const downloadProgressBox = document.getElementById('downloadProgressBox');

  // Car Mode Elements
  const toggleCarModeBtn = document.getElementById('toggleCarModeBtn');
  const dockCarBtn = document.getElementById('dockCarBtn');
  const carModeDashboard = document.getElementById('carModeDashboard');
  const exitCarModeBtn = document.getElementById('exitCarModeBtn');
  const carTitle = document.getElementById('carTitle');
  const carArtist = document.getElementById('carArtist');
  const carPlayBtn = document.getElementById('carPlayBtn');
  const carPrevBtn = document.getElementById('carPrevBtn');
  const carNextBtn = document.getElementById('carNextBtn');
  const carProgressBar = document.getElementById('carProgressBar');
  const carProgressWrapper = document.getElementById('carProgressWrapper');

  // Tabs Navigation (Desktop & Mobile)
  const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const aiPlaylistsGrid = document.getElementById('aiPlaylistsGrid');
  const userPlaylistsGrid = document.getElementById('userPlaylistsGrid');
  const refreshAiBtn = document.getElementById('refreshAiBtn');
  const createPlaylistBtn = document.getElementById('createPlaylistBtn');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));
      
      const tabName = item.dataset.tab;
      document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(el => el.classList.add('active'));
      
      const tabId = 'tab-' + tabName;
      document.getElementById(tabId).classList.add('active');
    });
  });

  // 2. Fetch Songs
  async function loadSongs() {
    try {
      const res = await fetch('/api/songs');
      currentSongs = await res.json();
      renderSongs(currentSongs);
    } catch (e) {
      console.error('Failed to load songs', e);
    }
  }

  function renderSongs(songs) {
    trackCountPill.textContent = `${songs.length} Tracks`;
    if (songs.length === 0) {
      songsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">
          <i class="fa-solid fa-cloud-arrow-down" style="font-size: 48px; margin-bottom: 16px;"></i>
          <h3>No tracks downloaded yet</h3>
          <p style="margin-top: 8px;">Paste a YouTube or YouTube Music link in Downloader tab to start!</p>
        </div>
      `;
      return;
    }

    songsGrid.innerHTML = songs.map((song, idx) => `
      <div class="song-card" data-index="${idx}">
        <div class="song-thumb">
          <i class="fa-solid fa-music"></i>
        </div>
        <div class="song-info">
          <div class="song-title">${escapeHtml(song.title)}</div>
          <div class="song-artist">${escapeHtml(song.artist)}</div>
          <span class="format-badge">${song.format} • ${song.size}</span>
        </div>
        <button class="ctrl-btn" style="color: var(--accent-neon);"><i class="fa-solid fa-circle-play" style="font-size: 24px;"></i></button>
      </div>
    `).join('');

    // Attach click
    document.querySelectorAll('.song-card').forEach(card => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.index);
        playTrack(index);
      });
    });
  }

  function escapeHtml(text) {
    return text ? text.replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    }) : '';
  }

  // 3. Audio Controls
  function playTrack(index) {
    if (index < 0 || index >= currentSongs.length) return;
    currentTrackIndex = index;
    const track = currentSongs[index];

    audioElement.src = track.url;
    audioElement.play();
    isPlaying = true;

    // Update Dock
    dockTitle.textContent = track.title;
    dockArtist.textContent = track.artist;
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';

    // Update Car Dashboard
    carTitle.textContent = track.title;
    carArtist.textContent = track.artist;
    carPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  }

  playPauseBtn.addEventListener('click', togglePlay);
  carPlayBtn.addEventListener('click', togglePlay);

  function togglePlay() {
    if (!audioElement.src) {
      if (currentSongs.length > 0) playTrack(0);
      return;
    }
    if (isPlaying) {
      audioElement.pause();
      isPlaying = false;
      playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      carPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    } else {
      audioElement.play();
      isPlaying = true;
      playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      carPlayBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    }
  }

  prevBtn.addEventListener('click', () => playTrack(currentTrackIndex - 1));
  carPrevBtn.addEventListener('click', () => playTrack(currentTrackIndex - 1));

  nextBtn.addEventListener('click', () => playTrack(currentTrackIndex + 1));
  carNextBtn.addEventListener('click', () => playTrack(currentTrackIndex + 1));

  audioElement.addEventListener('ended', () => {
    if (currentTrackIndex + 1 < currentSongs.length) {
      playTrack(currentTrackIndex + 1);
    } else {
      isPlaying = false;
      playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      carPlayBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
  });

  audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) {
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      progressBar.style.width = pct + '%';
      carProgressBar.style.width = pct + '%';
      currentTimeEl.textContent = formatTime(audioElement.currentTime);
      durationTimeEl.textContent = formatTime(audioElement.duration);
    }
  });

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  progressWrapper.addEventListener('click', (e) => {
    const rect = progressWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    if (audioElement.duration) {
      audioElement.currentTime = pct * audioElement.duration;
    }
  });

  carProgressWrapper.addEventListener('click', (e) => {
    const rect = carProgressWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    if (audioElement.duration) {
      audioElement.currentTime = pct * audioElement.duration;
    }
  });

  volumeSlider.addEventListener('input', (e) => {
    audioElement.volume = e.target.value;
  });

  // 4. Downloader Flow
  fetchLinkInfoBtn.addEventListener('click', () => handleUrlExtraction(directUrlInput.value));
  document.getElementById('openDownloadModalBtn').addEventListener('click', () => {
    downloadModal.classList.add('active');
  });

  closeModalBtn.addEventListener('click', () => downloadModal.classList.remove('active'));
  cancelDownloadBtn.addEventListener('click', () => downloadModal.classList.remove('active'));

  async function handleUrlExtraction(url) {
    if (!url || !url.trim()) {
      alert('Please enter a YouTube link.');
      return;
    }
    pendingDownloadUrl = url.trim();
    downloadModal.classList.add('active');
    modalMetaPreview.innerHTML = `<p style="color: var(--accent-neon);"><i class="fa-solid fa-spinner fa-spin"></i> Fetching track info from YouTube...</p>`;

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pendingDownloadUrl })
      });
      const data = await res.json();
      if (data.error) {
        modalMetaPreview.innerHTML = `<p style="color: #ef4444;">${data.error}</p>`;
      } else {
        modalMetaPreview.innerHTML = `
          <div style="display: flex; gap: 14px; align-items: center;">
            <img src="${data.thumbnail}" style="width: 70px; height: 70px; border-radius: 10px; object-fit: cover;">
            <div>
              <strong style="font-size: 15px;">${escapeHtml(data.title)}</strong>
              <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">${escapeHtml(data.artist)}</div>
            </div>
          </div>
        `;
      }
    } catch (e) {
      modalMetaPreview.innerHTML = `<p style="color: #ef4444;">Error inspecting link.</p>`;
    }
  }

  startDownloadBtn.addEventListener('click', async () => {
    const format = formatSelect.value;
    downloadProgressBox.classList.remove('hidden');
    startDownloadBtn.disabled = true;

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pendingDownloadUrl, format })
      });
      const data = await res.json();

      if (data.success) {
        downloadProgressBox.classList.add('hidden');
        downloadModal.classList.remove('active');
        startDownloadBtn.disabled = false;
        directUrlInput.value = '';
        alert(data.message);
        loadSongs();
        loadAiPlaylists();
      } else {
        alert(data.error || 'Download failed.');
        downloadProgressBox.classList.add('hidden');
        startDownloadBtn.disabled = false;
      }
    } catch (e) {
      alert('Network error while requesting download.');
      downloadProgressBox.classList.add('hidden');
      startDownloadBtn.disabled = false;
    }
  });

  // 5. Offline AI Playlists
  async function loadAiPlaylists() {
    try {
      const res = await fetch('/api/ai/generate-playlists', { method: 'POST' });
      const playlists = await res.json();

      aiPlaylistsGrid.innerHTML = playlists.map(pl => `
        <div class="playlist-card" onclick="alert('Playing AI Playlist: ${pl.name}')">
          <div class="playlist-icon" style="color: var(--accent-neon);"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <div>
            <div class="playlist-name">${pl.name}</div>
            <div class="playlist-desc">${pl.tracks.length} tracks • ${pl.description}</div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      console.error('AI Playlist load error', e);
    }
  }

  refreshAiBtn.addEventListener('click', loadAiPlaylists);

  // 6. Car Mode Toggle
  toggleCarModeBtn.addEventListener('click', () => carModeDashboard.classList.remove('hidden'));
  dockCarBtn.addEventListener('click', () => carModeDashboard.classList.remove('hidden'));
  exitCarModeBtn.addEventListener('click', () => carModeDashboard.classList.add('hidden'));

  // Initial loads
  loadSongs();
  loadAiPlaylists();
});
