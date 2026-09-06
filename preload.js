const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beamly', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Google / YouTube Music Authentication
  googleLogin: () => ipcRenderer.invoke('google-login'),
  googleLogout: () => ipcRenderer.invoke('google-logout'),
  getGoogleAuthStatus: () => ipcRenderer.invoke('google:get-auth-status'),
  onGoogleAuthChanged: (callback) => {
    ipcRenderer.on('google:auth-changed', (event, data) => callback(data));
  },

  // YouTube Music Content Discovery & Library
  getHome: () => ipcRenderer.invoke('ytmusic:get-home'),
  getCuratedHome: () => ipcRenderer.invoke('ytmusic:get-curated-home'),
  getRelatedTracks: (videoId) => ipcRenderer.invoke('ytmusic:get-related', videoId),
  getLibrary: () => ipcRenderer.invoke('ytmusic:get-library'),
  getPlaylist: (playlistId) => ipcRenderer.invoke('ytmusic:get-playlist', playlistId),
  importPlaylist: (urlOrId) => ipcRenderer.invoke('ytmusic:import-playlist', urlOrId),
  search: (query, type = 'all') => ipcRenderer.invoke('ytmusic:search', { query, type }),

  // Local Playlists Management
  createLocalPlaylist: (name, description) => ipcRenderer.invoke('playlists:create-local', { name, description }),
  getLocalPlaylists: () => ipcRenderer.invoke('playlists:get-local'),
  getLocalPlaylist: (playlistId) => ipcRenderer.invoke('playlists:get-local-by-id', playlistId),
  addTrackToLocalPlaylist: (playlistId, track) => ipcRenderer.invoke('playlists:add-track', { playlistId, track }),
  removeTrackFromLocalPlaylist: (playlistId, trackId) => ipcRenderer.invoke('playlists:remove-track', { playlistId, trackId }),
  deleteLocalPlaylist: (playlistId) => ipcRenderer.invoke('playlists:delete-local', playlistId),

  // Playback History & Last Played
  saveLastPlayedTrack: (track) => ipcRenderer.invoke('playback:save-last-played', track),
  getLastPlayedTrack: () => ipcRenderer.invoke('playback:get-last-played'),

  // Audio Playback (YouTube Music Resolver + Stream Proxy)
  playTrack: (track) => ipcRenderer.invoke('play-track', track),

  // Offline Downloads
  downloadTrack: (track) => ipcRenderer.invoke('offline:download-track', track),
  getOfflineTracks: () => ipcRenderer.invoke('offline:get-tracks'),
  deleteOfflineTrack: (trackId) => ipcRenderer.invoke('offline:delete-track', trackId),

  // Tray / System Status Update
  updatePlayerStatus: (data) => ipcRenderer.invoke('player:status-update', data),

  // Google Cast Integration
  getCastDevices: () => ipcRenderer.invoke('get-cast-devices'),
  castToDevice: (deviceId, mediaUrl, metadata) => ipcRenderer.invoke('cast-to-device', { deviceId, mediaUrl, metadata }),
  castControl: (action, value) => ipcRenderer.invoke('cast-control', { action, value }),

  // Synced Lyrics
  getLyrics: (title, artist, duration) => ipcRenderer.invoke('lyrics:get-synced', { title, artist, duration }),

  // Cache & Diagnostics
  getCacheStats: () => ipcRenderer.invoke('cache:get-stats'),
  clearTrackMatchesCache: () => ipcRenderer.invoke('cache:clear-track-matches'),
  clearAllCache: () => ipcRenderer.invoke('cache:clear-all'),

  // Event Listeners
  onPlayerTogglePlay: (callback) => {
    ipcRenderer.on('player:toggle-play', () => callback());
  },
  onPlayerNext: (callback) => {
    ipcRenderer.on('player:next', () => callback());
  },
  onPlayerPrev: (callback) => {
    ipcRenderer.on('player:prev', () => callback());
  },
  onCastDevicesUpdated: (callback) => {
    ipcRenderer.on('cast:devices-updated', (event, devices) => callback(devices));
  },
  onCastStatusUpdated: (callback) => {
    ipcRenderer.on('cast:status-updated', (event, status) => callback(status));
  }
});
