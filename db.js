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
  offline_tracks: {},
  local_playlists: {},
  last_played_track: null
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
          offline_tracks: (parsed && typeof parsed.offline_tracks === 'object' && parsed.offline_tracks !== null) ? parsed.offline_tracks : {},
          local_playlists: (parsed && typeof parsed.local_playlists === 'object' && parsed.local_playlists !== null) ? parsed.local_playlists : {},
          last_played_track: (parsed && typeof parsed.last_played_track === 'object') ? parsed.last_played_track : null
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
    offline_tracks: {},
    local_playlists: {},
    last_played_track: null
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

// ---------------- Local User Playlists ----------------
function createLocalPlaylist(nameOrData, description = '') {
  let name = '';
  let desc = '';
  let initialTracks = [];
  let thumbnail = '';

  if (typeof nameOrData === 'object' && nameOrData !== null) {
    name = nameOrData.name || nameOrData.title || '';
    desc = nameOrData.description || '';
    initialTracks = Array.isArray(nameOrData.tracks) ? nameOrData.tracks : [];
    thumbnail = nameOrData.thumbnail || nameOrData.artwork || '';
  } else {
    name = nameOrData || '';
    desc = description || '';
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Playlist name cannot be empty');
  }
  const id = `local_pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newPl = {
    id,
    name: name.trim(),
    title: name.trim(),
    description: desc ? desc.trim() : 'User created local playlist',
    artwork: thumbnail || (initialTracks.length > 0 ? (initialTracks[0].artwork || initialTracks[0].thumbnail || '') : ''),
    owner: 'You',
    isLocal: true,
    tracks: initialTracks,
    created_at: Date.now(),
    updated_at: Date.now()
  };
  if (!memoryCache.local_playlists) memoryCache.local_playlists = {};
  memoryCache.local_playlists[id] = newPl;
  saveCacheToDisk();
  return newPl;
}

function getLocalPlaylists() {
  const list = Object.values(memoryCache.local_playlists || {});
  return list.sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));
}

function getLocalPlaylist(playlistId) {
  if (!playlistId) return null;
  return memoryCache.local_playlists?.[playlistId] || null;
}

function addTrackToLocalPlaylist(playlistId, track) {
  if (!playlistId || !track) return { success: false, error: 'Invalid parameters' };
  if (!memoryCache.local_playlists?.[playlistId]) {
    return { success: false, error: 'Playlist not found' };
  }
  const pl = memoryCache.local_playlists[playlistId];
  if (!Array.isArray(pl.tracks)) pl.tracks = [];

  const trackId = track.id || track.yt_video_id;
  if (pl.tracks.some(t => (t.id || t.yt_video_id) === trackId)) {
    return { success: true, message: 'Track already in playlist', playlist: pl };
  }

  const cleanTrack = {
    id: trackId,
    yt_video_id: track.yt_video_id || trackId,
    title: track.title || 'Track',
    artist: track.artist || (Array.isArray(track.artists) ? track.artists.join(', ') : (track.artists || 'Various Artists')),
    artists: Array.isArray(track.artists) ? track.artists : [track.artist || 'Various Artists'],
    album: track.album || pl.name,
    duration: Number(track.duration) || 0,
    artwork: track.artwork || ''
  };

  pl.tracks.push(cleanTrack);
  if (!pl.artwork && cleanTrack.artwork) {
    pl.artwork = cleanTrack.artwork;
  }
  pl.updated_at = Date.now();
  saveCacheToDisk();
  return { success: true, playlist: pl };
}

function removeTrackFromLocalPlaylist(playlistId, trackId) {
  if (!playlistId || !trackId) return { success: false, error: 'Invalid parameters' };
  if (!memoryCache.local_playlists?.[playlistId]) {
    return { success: false, error: 'Playlist not found' };
  }
  const pl = memoryCache.local_playlists[playlistId];
  if (Array.isArray(pl.tracks)) {
    pl.tracks = pl.tracks.filter(t => (t.id || t.yt_video_id) !== trackId);
    if (pl.tracks.length > 0) {
      pl.artwork = pl.tracks[0].artwork || '';
    } else {
      pl.artwork = '';
    }
  }
  pl.updated_at = Date.now();
  saveCacheToDisk();
  return { success: true, playlist: pl };
}

function deleteLocalPlaylist(playlistId) {
  if (!playlistId || !memoryCache.local_playlists?.[playlistId]) {
    return { success: false, error: 'Playlist not found' };
  }
  delete memoryCache.local_playlists[playlistId];
  saveCacheToDisk();
  return { success: true };
}

// ---------------- Last Played Track Reference ----------------
function saveLastPlayedTrack(track) {
  if (!track) return;
  memoryCache.last_played_track = {
    id: track.id || track.yt_video_id,
    yt_video_id: track.yt_video_id || track.id,
    title: track.title || 'Unknown Title',
    artist: track.artist || (Array.isArray(track.artists) ? track.artists.join(', ') : (track.artists || 'Unknown Artist')),
    artists: Array.isArray(track.artists) ? track.artists : [track.artist || 'Unknown Artist'],
    artwork: track.artwork || '',
    played_at: Date.now()
  };
  saveCacheToDisk();
}

function getLastPlayedTrack() {
  return memoryCache.last_played_track || null;
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
  clearAllCache,
  createLocalPlaylist,
  getLocalPlaylists,
  getLocalPlaylist,
  addTrackToLocalPlaylist,
  removeTrackFromLocalPlaylist,
  deleteLocalPlaylist,
  saveLastPlayedTrack,
  getLastPlayedTrack
};
