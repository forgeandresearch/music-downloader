const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3005;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['text/plain', 'text/*'] }));
app.use(express.static(path.join(__dirname, '../public')));

const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const DATA_DIR = path.join(__dirname, '../data');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');

[DOWNLOADS_DIR, DATA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(PLAYLISTS_FILE)) fs.writeFileSync(PLAYLISTS_FILE, '[]');

// ---------- TOOL DISCOVERY ----------
function findBin(name, extraPaths = []) {
  const candidates = [
    ...extraPaths,
    `/opt/homebrew/bin/${name}`,   // Homebrew (latest, Deno-enabled)
    `/usr/local/bin/${name}`,
    `${process.env.HOME}/Library/Python/3.11/bin/${name}`,
    `${process.env.HOME}/Library/Python/3.9/bin/${name}`,
    `${process.env.HOME}/.local/bin/${name}`,
    name
  ];
  for (const p of candidates) {
    try { if (p !== name && fs.existsSync(p)) return p; } catch (_) {}
  }
  return name;
}
const YTDLP = findBin('yt-dlp');
const FFMPEG = findBin('ffmpeg');
console.log('yt-dlp path:', YTDLP);
console.log('ffmpeg path:', FFMPEG);

// ---------- HELPERS ----------
function extractVideoId(u) {
  if (!u || typeof u !== 'string') return null;
  const str = u.trim();
  // If user passed just the 11 character ID directly
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  // Regex to extract video ID from any YouTube / YouTube Music URL (or text containing a URL)
  const m = str.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|music\.youtube\.com\/watch\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];

  try {
    const url = new URL(str);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('?')[0];
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/watch')) return url.searchParams.get('v');
      if (url.pathname.includes('/shorts/')) return url.pathname.split('/shorts/')[1].split('?')[0];
      if (url.pathname.includes('/embed/')) return url.pathname.split('/embed/')[1].split('?')[0];
    }
  } catch (_) {}
  return null;
}

function isValidYouTubeUrl(u) {
  return !!extractVideoId(u);
}

function extractUrlAndFormat(req) {
  let url = '';
  let format = 'mp3';

  // 1. Query parameters (GET or POST ?url=...&format=...)
  if (req.query) {
    if (req.query.url) url = req.query.url;
    else if (req.query.link) url = req.query.link;
    else if (req.query.q) url = req.query.q;
    if (req.query.format) format = req.query.format;
  }

  // 2. Request body if JSON / urlencoded object
  if (!url && req.body && typeof req.body === 'object') {
    url = req.body.url || req.body.link || req.body.videoUrl || req.body.query || '';
    if (req.body.format) format = req.body.format;
  }

  // 3. Request body if raw string / direct link
  if (!url && typeof req.body === 'string' && req.body.trim()) {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object') {
        url = parsed.url || parsed.link || '';
        if (parsed.format) format = parsed.format;
      }
    } catch (_) {
      url = req.body.trim();
    }
  }

  return {
    url: (url || '').trim(),
    format: (format || 'mp3').trim().toLowerCase()
  };
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

// ---------- API: /api/info (Supports POST JSON, POST raw link, GET ?url=...) ----------
app.all('/api/info', async (req, res) => {
  const { url } = extractUrlAndFormat(req);
  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Please enter a valid YouTube or YouTube Music link.' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Could not extract video ID from the URL.' });

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Try oEmbed instantly
  try {
    const r = await httpsGet(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
    if (r.status === 200) {
      const meta = JSON.parse(r.body);
      return res.json({
        id: videoId,
        title: meta.title || 'Unknown Title',
        artist: meta.author_name || 'YouTube',
        thumbnail: meta.thumbnail_url || thumb,
        videoId,
        formats: ['mp3', 'flac', 'm4a', 'wav', 'opus']
      });
    }
  } catch (e) { console.log('oEmbed failed, trying yt-dlp...'); }

  // Fallback: yt-dlp
  exec(`"${YTDLP}" --dump-json --no-playlist "${cleanUrl}"`, { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
    if (err || !stdout) {
      // Last resort: return metadata derived from URL
      return res.json({
        id: videoId,
        title: 'YouTube Track',
        artist: 'Unknown Artist',
        thumbnail: thumb,
        videoId,
        formats: ['mp3', 'flac', 'm4a', 'wav', 'opus']
      });
    }
    try {
      const d = JSON.parse(stdout);
      return res.json({
        id: d.id || videoId,
        title: d.title || d.fulltitle || 'YouTube Track',
        artist: d.artist || d.uploader || d.channel || 'Unknown Artist',
        thumbnail: d.thumbnail || thumb,
        videoId,
        formats: ['mp3', 'flac', 'm4a', 'wav', 'opus']
      });
    } catch (_) {
      return res.json({ id: videoId, title: 'YouTube Track', artist: 'Unknown', thumbnail: thumb, videoId, formats: ['mp3', 'flac', 'm4a', 'wav', 'opus'] });
    }
  });
});

// ---------- API: /api/download (Supports POST JSON, POST raw link, GET ?url=...&format=...) ----------
app.all('/api/download', (req, res) => {
  let { url, format } = extractUrlAndFormat(req);
  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL.' });
  }

  const safeFormats = ['mp3', 'flac', 'm4a', 'wav', 'opus'];
  format = safeFormats.includes(format) ? format : 'mp3';

  const videoId = extractVideoId(url);
  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s');

  const args = [
    '--extract-audio',
    '--audio-format', format,
    '--audio-quality', '0',
    '--add-metadata',
    '--embed-thumbnail',
    '--no-playlist',
    '-o', outputTemplate,
    '--ffmpeg-location', FFMPEG !== 'ffmpeg' ? path.dirname(FFMPEG) : '/opt/homebrew/bin',
    cleanUrl
  ];

  console.log('Download command:', YTDLP, args.join(' '));

  let stderr = '';
  const child = spawn(YTDLP, args);
  child.stderr.on('data', d => { stderr += d.toString(); console.log('[yt-dlp]', d.toString().trim()); });
  child.stdout.on('data', d => console.log('[yt-dlp stdout]', d.toString().trim()));

  child.on('close', code => {
    if (code !== 0) {
      console.error('Download failed, code:', code, stderr);
      return res.status(500).json({ error: 'Download failed. Check server logs.' });
    }
    res.json({ success: true, message: `Downloaded in ${format.toUpperCase()} format!` });
  });
});

// ---------- API: /api/songs ----------
app.get('/api/songs', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f =>
      !f.startsWith('.') && /\.(mp3|flac|m4a|wav|opus|ogg|aac|webm)$/i.test(f)
    );
    const songs = files.map(filename => {
      const stats = fs.statSync(path.join(DOWNLOADS_DIR, filename));
      const ext = path.extname(filename).replace('.', '').toUpperCase();
      const nameNoExt = path.basename(filename, path.extname(filename));
      let title = nameNoExt, artist = 'Local Library';
      if (nameNoExt.includes(' - ')) {
        const parts = nameNoExt.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }
      return {
        id: Buffer.from(filename).toString('hex').slice(0, 16),
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
  } catch (e) {
    res.json([]);
  }
});

// ---------- API: /api/stream/:filename ----------
app.get('/api/stream/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(DOWNLOADS_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.opus': 'audio/ogg', '.ogg': 'audio/ogg' };
  const contentType = mimeMap[ext] || 'audio/mpeg';

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': contentType });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ---------- API: /api/ai/generate-playlists ----------
app.post('/api/ai/generate-playlists', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f =>
      !f.startsWith('.') && /\.(mp3|flac|m4a|wav|opus|ogg|aac|webm)$/i.test(f)
    );

    const clusters = {
      "Night Drive Cruise 🚗": [],
      "High Energy & Beats ⚡": [],
      "Chill & Acoustic 🌙": [],
      "All Favorites 🔥": []
    };

    files.forEach(f => {
      const low = f.toLowerCase();
      clusters["All Favorites 🔥"].push(f);
      if (/remix|club|beat|bass|dance|rock|phonk|trap|drill/.test(low)) clusters["High Energy & Beats ⚡"].push(f);
      else if (/acoustic|piano|chill|slow|lofi|soft|jazz|calm/.test(low)) clusters["Chill & Acoustic 🌙"].push(f);
      else clusters["Night Drive Cruise 🚗"].push(f);
    });

    res.json(Object.entries(clusters).map(([name, tracks]) => ({
      id: 'ai-' + name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
      name, tracks,
      description: `${tracks.length} tracks`
    })));
  } catch (e) {
    res.json([]);
  }
});

// ---------- API: Playlists CRUD ----------
app.get('/api/playlists', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'))); }
  catch (_) { res.json([]); }
});

app.post('/api/playlists', (req, res) => {
  try {
    const { name, tracks } = req.body;
    const data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));
    const pl = { id: 'pl-' + Date.now(), name: name || 'My Playlist', tracks: tracks || [] };
    data.push(pl);
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(data, null, 2));
    res.json(pl);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Health Check ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ytdlp: YTDLP, ffmpeg: FFMPEG, downloads: DOWNLOADS_DIR });
});

app.listen(PORT, () => console.log(`🎵 AURA Server running at http://localhost:${PORT}`));
