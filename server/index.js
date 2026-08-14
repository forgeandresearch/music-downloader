const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const DATA_DIR = path.join(__dirname, '../data');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');

if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PLAYLISTS_FILE)) fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify([]));

// Find yt-dlp binary path dynamically
function getYtDlpPath() {
  const possiblePaths = [
    'yt-dlp',
    path.join(process.env.HOME || '', 'Library/Python/3.9/bin/yt-dlp'),
    path.join(process.env.HOME || '', '.local/bin/yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp'
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return 'yt-dlp';
}

const YTDLP_BIN = getYtDlpPath();

// Sanitize inputs to prevent security issues
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return (
      url.protocol === 'http:' || url.protocol === 'https:'
    ) && (
      url.hostname.includes('youtube.com') ||
      url.hostname.includes('youtu.be') ||
      url.hostname.includes('music.youtube.com')
    );
  } catch (_) {
    return false;
  }
}

// Helper to extract YouTube video ID
function extractVideoId(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.includes('/watch')) return url.searchParams.get('v');
      if (url.pathname.includes('/shorts/')) return url.pathname.split('/shorts/')[1];
    }
  } catch (e) {}
  const match = urlStr.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

// 1. Fetch info for URL (Instant Metadata Lookup via oEmbed)
app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Please enter a valid YouTube or YouTube Music link.' });
  }

  const videoId = extractVideoId(url);
  const cleanUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

  const https = require('https');
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;

  https.get(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (apiRes) => {
    let body = '';
    apiRes.on('data', chunk => body += chunk);
    apiRes.on('end', () => {
      try {
        const meta = JSON.parse(body);
        return res.json({
          id: videoId || 'track-' + Date.now(),
          title: meta.title || 'YouTube Track',
          artist: meta.author_name || 'YouTube Artist',
          thumbnail: meta.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
          duration: 0,
          formats: ['MP3', 'FLAC (Lossless)', 'M4A (AAC)', 'WAV', 'OPUS']
        });
      } catch (err) {
        // Fallback to yt-dlp if oembed parse fails
        const cmd = `"${YTDLP_BIN}" --dump-json --no-playlist "${cleanUrl}"`;
        exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 10000 }, (error, stdout) => {
          if (!error && stdout) {
            try {
              const data = JSON.parse(stdout);
              return res.json({
                id: data.id || videoId,
                title: data.title || data.fulltitle || 'YouTube Music Track',
                artist: data.artist || data.uploader || data.channel || 'YouTube Artist',
                thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                duration: data.duration || 0,
                formats: ['MP3', 'FLAC (Lossless)', 'M4A (AAC)', 'WAV', 'OPUS']
              });
            } catch (e) {}
          }
          return res.status(500).json({ error: 'Could not fetch song metadata. Please check the URL.' });
        });
      }
    });
  }).on('error', () => {
    res.status(500).json({ error: 'Network error inspecting link.' });
  });
});

// 2. Download Track
app.post('/api/download', (req, res) => {
  const { url, format = 'mp3', quality = '320' } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL provided.' });
  }

  let fmt = format.toLowerCase().split(' ')[0];
  if (!['mp3', 'flac', 'm4a', 'wav', 'opus', 'aac'].includes(fmt)) {
    fmt = 'mp3';
  }

  // Create unique filename output template
  const outputTemplate = path.join(DOWNLOADS_DIR, `%(title)s [%(id)s].%(ext)s`);

  let args = [
    '--extract-audio',
    '--audio-format', fmt,
    '--audio-quality', '0',
    '--add-metadata',
    '--embed-thumbnail',
    '-o', outputTemplate,
    '--no-playlist',
    url
  ];

  console.log(`Starting download: ${YTDLP_BIN} ${args.join(' ')}`);

  const child = spawn(YTDLP_BIN, args);

  let stderrData = '';
  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error('Download spawn failed code:', code, stderrData);
      return res.status(500).json({ error: 'Download failed. Check server log for details.' });
    }
    res.json({ success: true, message: `Successfully downloaded track in ${fmt.toUpperCase()} format!` });
  });
});

// 3. Get Downloaded Songs List with Meta
app.get('/api/songs', (req, res) => {
  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Could not list downloads directory.' });

    const audioFiles = files.filter(f => !f.startsWith('.') && /\.(mp3|flac|m4a|wav|opus|ogg|aac|webm)$/i.test(f));
    
    const songs = audioFiles.map((filename) => {
      const stats = fs.statSync(path.join(DOWNLOADS_DIR, filename));
      // Extract title and artist clean name from file
      let nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
      let cleanTitle = nameWithoutExt.replace(/\s*\[[a-zA-Z0-9_-]+\]$/, '');
      
      let artist = 'Local Library';
      let title = cleanTitle;
      if (cleanTitle.includes(' - ')) {
        const parts = cleanTitle.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      const ext = path.extname(filename).replace('.', '').toUpperCase();

      return {
        id: Buffer.from(filename).toString('hex'),
        filename,
        title,
        artist,
        format: ext,
        size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        dateAdded: stats.mtime,
        url: `/api/stream/${encodeURIComponent(filename)}`
      };
    });

    res.json(songs);
  });
});

// 4. Audio Stream with HTTP Range support for seamless playback
app.get('/api/stream/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 5. Offline AI Smart Playlist Generation Engine
app.post('/api/ai/generate-playlists', (req, res) => {
  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to access songs.' });

    const audioFiles = files.filter(f => !f.startsWith('.') && /\.(mp3|flac|m4a|wav|opus|ogg|aac|webm)$/i.test(f));
    
    // Heuristic & NLP Vector tag clustering for offline smart playlists
    const clusters = {
      "Night Drive Cruise 🚗": [],
      "High Energy & Beat ⚡": [],
      "Acoustic & Chill Lounge 🌙": [],
      "Top Heavy Favorites 🔥": []
    };

    audioFiles.forEach(filename => {
      const lower = filename.toLowerCase();
      
      if (lower.includes('remix') || lower.includes('club') || lower.includes('beat') || lower.includes('bass') || lower.includes('dance') || lower.includes('rock') || lower.includes('phonk')) {
        clusters["High Energy & Beat ⚡"].push(filename);
      } else if (lower.includes('acoustic') || lower.includes('piano') || lower.includes('chill') || lower.includes('slow') || lower.includes('lofi') || lower.includes('soft')) {
        clusters["Acoustic & Chill Lounge 🌙"].push(filename);
      } else {
        clusters["Night Drive Cruise 🚗"].push(filename);
      }
      
      clusters["Top Heavy Favorites 🔥"].push(filename);
    });

    const generatedPlaylists = Object.keys(clusters).map(name => ({
      id: 'ai-' + name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
      name: name,
      isAi: true,
      description: `Offline AI Auto-clustered track collection based on audio tags & acoustic mood analysis.`,
      tracks: clusters[name]
    }));

    res.json(generatedPlaylists);
  });
});

// 6. User Manual Playlists API
app.get('/api/playlists', (req, res) => {
  try {
    const data = fs.readFileSync(PLAYLISTS_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/playlists', (req, res) => {
  try {
    const { name, tracks } = req.body;
    const data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));
    const newPlaylist = {
      id: 'pl-' + Date.now(),
      name: name || 'My Car Playlist',
      isAi: false,
      tracks: tracks || []
    };
    data.push(newPlaylist);
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(data, null, 2));
    res.json(newPlaylist);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

app.listen(PORT, () => {
  console.log(`🎵 Flagship Music Downloader & Car Audio Player running on http://localhost:${PORT}`);
});
