const fs = require('fs');
const path = require('path');

let dataDir = __dirname;
try {
  const { app } = require('electron');
  if (app && typeof app.getPath === 'function') {
    dataDir = app.isPackaged ? app.getPath('userData') : __dirname;
  }
} catch (e) {}

// Ensure dataDir exists
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {}

const cacheFilePath = path.join(dataDir, 'cache.json');

// Default initial in-memory structure
let memoryCache = {
  auth_session: {},
  track_matches: {},
  offline_tracks: {}
};

// Safe synchronous initial load
function loadCacheFromDisk() {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const raw = fs.readFileSync(cacheFilePath, 'utf8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        memoryCache = {
          auth_session: (parsed && typeof parsed.auth_session === 'object' && parsed.auth_session !== null) ? parsed.auth_session : {},
          track_matches: (parsed && typeof parsed.track_matches === 'object' && parsed.track_matches !== null) ? parsed.track_matches : {},
          offline_tracks: (parsed && typeof parsed.offline_tracks === 'object' && parsed.offline_tracks !== null) ? parsed.offline_tracks : {}
        };
        return;
      }
    }
  } catch (err) {
    console.warn('Could not read cache.json (initializing fresh state):', err.message);
  }

  // If file doesn't exist or error, initialize fresh
  memoryCache = {
    auth_session: {},
    track_matches: {},
    offline_tracks: {}
  };
  saveCacheToDisk();
}

// Safe atomic write helper with try/catch so cache writes never crash or block
function saveCacheToDisk() {
  try {
    const dataStr = JSON.stringify(memoryCache, null, 2);
    const tempFilePath = `${cacheFilePath}.tmp`;

    fs.writeFileSync(tempFilePath, dataStr, 'utf8');
    try {
      fs.renameSync(tempFilePath, cacheFilePath);
    } catch (renameErr) {
      // Fallback direct write if atomic rename is busy on Windows
      fs.writeFileSync(cacheFilePath, dataStr, 'utf8');
    }
  } catch (err) {
    console.error('Safe cache write error caught in db.js:', err.message);
  }
}

// Initial load
loadCacheFromDisk();

// ---------------- Track Match Cache ----------------
function getMatch(trackId) {
  if (!trackId) return null;
  const match = memoryCache.track_matches[trackId];
  if (!match) return null;
  return {
    yt_video_id: match.yt_video_id,
    title: match.title || '',
    artist: match.artist || ''
  };
}

function saveMatch(trackId, ytVideoId, title = '', artist = '') {
  if (!trackId || !ytVideoId) return;
  memoryCache.track_matches[trackId] = {
    id: trackId,
    yt_video_id: ytVideoId,
    title: title || '',
    artist: artist || ''
  };
  saveCacheToDisk();
}

// ---------------- Google / YouTube Music Auth ----------------
function saveGoogleCookies(cookieStr) {
  if (!cookieStr) return;
  memoryCache.auth_session.google_cookies = cookieStr;
  saveCacheToDisk();
}

function getGoogleCookies() {
  return memoryCache.auth_session.google_cookies || null;
}

function saveGoogleProfile(profile) {
  if (!profile) return;
  memoryCache.auth_session.google_profile = JSON.stringify(profile);
  saveCacheToDisk();
}

function getGoogleProfile() {
  const raw = memoryCache.auth_session.google_profile;
  if (!raw) return null;
  try {
    return typeof raw === 'object' ? raw : JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearGoogleAuth() {
  delete memoryCache.auth_session.google_cookies;
  delete memoryCache.auth_session.google_profile;
  saveCacheToDisk();
}

// ---------------- Offline Downloads Storage ----------------
function saveOfflineTrack(track, localPath, fileSize = 0) {
  if (!track) return;
  const trackId = track.id || track.yt_video_id;
  const targetPath = localPath || track.local_path;
  const size = fileSize || track.file_size || 0;
  if (!trackId || !targetPath) return;

  const artistStr = track.artist || (Array.isArray(track.artists) ? track.artists.join(', ') : (track.artists || ''));
  memoryCache.offline_tracks[trackId] = {
    id: trackId,
    yt_video_id: track.yt_video_id || trackId,
    title: track.title || '',
    artist: artistStr,
    artists: artistStr ? artistStr.split(', ') : [],
    album: track.album || '',
    duration: Number(track.duration) || 0,
    artwork: track.artwork || '',
    local_path: targetPath,
    file_size: size,
    downloaded_at: Date.now()
  };
  saveCacheToDisk();
}

function getOfflineTracks() {
  const list = Object.values(memoryCache.offline_tracks || {});
  return list
    .sort((a, b) => (b.downloaded_at || 0) - (a.downloaded_at || 0))
    .map(r => ({
      id: r.id,
      yt_video_id: r.yt_video_id,
      title: r.title,
      artist: r.artist || '',
      artists: r.artist ? r.artist.split(', ') : (r.artists || []),
      album: r.album,
      duration: r.duration,
      artwork: r.artwork,
      local_path: r.local_path,
      file_size: r.file_size,
      downloaded_at: r.downloaded_at,
      isOffline: true
    }));
}

function getOfflineTrack(trackId) {
  if (!trackId) return null;
  const r = memoryCache.offline_tracks[trackId];
  if (!r) return null;
  return {
    id: r.id,
    yt_video_id: r.yt_video_id,
    title: r.title,
    artist: r.artist || '',
    artists: r.artist ? r.artist.split(', ') : (r.artists || []),
    album: r.album,
    duration: r.duration,
    artwork: r.artwork,
    local_path: r.local_path,
    file_size: r.file_size,
    downloaded_at: r.downloaded_at,
    isOffline: true
  };
}

function deleteOfflineTrack(trackId) {
  if (!trackId) return;
  delete memoryCache.offline_tracks[trackId];
  saveCacheToDisk();
}

// ---------------- Cache Management & Stats ----------------
function getCacheStats() {
  let dbSizeBytes = 0;
  try {
    if (fs.existsSync(cacheFilePath)) {
      dbSizeBytes = fs.statSync(cacheFilePath).size;
    }
  } catch (e) {}

  if (dbSizeBytes === 0) {
    try {
      dbSizeBytes = Buffer.byteLength(JSON.stringify(memoryCache), 'utf8');
    } catch (e) {}
  }

  const trackMatchesCount = Object.keys(memoryCache.track_matches || {}).length;
  const offlineTracksList = Object.values(memoryCache.offline_tracks || {});
  const offlineTracksCount = offlineTracksList.length;
  const offlineBytes = offlineTracksList.reduce((acc, t) => acc + (t.file_size || 0), 0);

  return {
    dbSizeBytes,
    trackMatchesCount,
    offlineTracksCount,
    offlineBytes
  };
}

function clearTrackMatchesCache() {
  try {
    memoryCache.track_matches = {};
    saveCacheToDisk();
    return { success: true };
  } catch (err) {
    console.error('Error clearing track matches cache:', err);
    return { success: false, error: err.message };
  }
}

function clearAllCache() {
  try {
    memoryCache.track_matches = {};
    saveCacheToDisk();
    return { success: true };
  } catch (err) {
    console.error('Error clearing all cache:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  db: null,
  cacheFilePath,
  getMatch,
  saveMatch,
  getCachedMatch: getMatch,
  cacheMatch: saveMatch,
  saveGoogleCookies,
  getGoogleCookies,
  saveGoogleProfile,
  getGoogleProfile,
  clearGoogleAuth,
  saveOfflineTrack,
  getOfflineTracks,
  getOfflineTrack,
  deleteOfflineTrack,
  getCacheStats,
  clearTrackMatchesCache,
  clearAllCache
};
