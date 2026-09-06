const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const db = require('./db');
const youtubeResolver = require('./youtubeResolver');
const downloader = require('./downloader');
const streamProxy = require('./streamProxy');
const castService = require('./castService');
const lyricsService = require('./lyricsService');

let mainWindow = null;
let tray = null;
let currentPlayingInfo = { title: 'Beamly Player', artist: 'No track playing', isPlaying: false };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#121212',
    icon: path.join(__dirname, 'assets/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Beamly - YouTube Music Desktop Player',
    autoHideMenuBar: true,
  });

  mainWindow.loadFile('index.html');

  // Initialize Cast service with callbacks forwarding to renderer
  castService.initCastService(
    devices => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cast:devices-updated', devices);
      }
    },
    status => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cast:status-updated', status);
      }
    }
  );

  mainWindow.on('minimize', (event) => {
    // Keep running in background
  });
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets/logo.png');
  try {
    tray = new Tray(iconPath);
    updateTrayMenu();
    tray.setToolTip('Beamly - YouTube Music Player');

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('Could not initialize system tray:', err.message);
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: `${currentPlayingInfo.title} - ${currentPlayingInfo.artist}`, enabled: false },
    { type: 'separator' },
    {
      label: currentPlayingInfo.isPlaying ? 'Pause' : 'Play',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player:toggle-play');
        }
      }
    },
    {
      label: 'Next Track',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player:next');
        }
      }
    },
    {
      label: 'Previous Track',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player:prev');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Open Beamly',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ---------------- Google / YouTube Music Authentication Flow ----------------

const CRITICAL_AUTH_COOKIES = ['SAPISID', '__Secure-3PAPISID', 'LOGIN_INFO', 'HSID', 'SSID', 'APISID'];

async function fetchSafeAccountProfile() {
  const genericProfile = { name: 'Google Account', avatar: 'assets/logo.png' };
  try {
    const yt = await youtubeResolver.getInnertube();
    if (!yt || !yt.account) return genericProfile;

    try {
      const accountInfo = await yt.account.getInfo();
      if (accountInfo) {
        const name = accountInfo.name?.text || accountInfo.name?.toString() || accountInfo.title?.text || genericProfile.name;
        let avatar = genericProfile.avatar;
        if (accountInfo.photo && Array.isArray(accountInfo.photo) && accountInfo.photo[0]?.url) {
          avatar = accountInfo.photo[0].url;
        } else if (accountInfo.thumbnails && Array.isArray(accountInfo.thumbnails) && accountInfo.thumbnails[0]?.url) {
          avatar = accountInfo.thumbnails[0].url;
        }
        return { name, avatar };
      }
    } catch (accountErr) {
      // Gracefully handles 'Page contents not found', 'You must be signed in', network issues, etc.
      console.warn('yt.account.getInfo error caught, falling back gracefully to generic signed-in state:', accountErr.message);
      return genericProfile;
    }
  } catch (err) {
    console.warn('Safe account fetch caught unexpected error, using generic signed-in state:', err.message);
    return genericProfile;
  }
  return genericProfile;
}

ipcMain.handle('google-login', async () => {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 640,
      height: 800,
      parent: mainWindow,
      modal: true,
      title: 'Sign In with Google / YouTube Music - Beamly',
      autoHideMenuBar: true,
      backgroundColor: '#0f0f0f',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    // Set genuine modern desktop Chrome User-Agent to prevent Google browser security blockage
    const desktopChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    loginWin.webContents.setUserAgent(desktopChromeUA);

    let authResolved = false;
    let checkInterval = null;

    async function checkGoogleCookies() {
      try {
        if (!loginWin || loginWin.isDestroyed()) return;

        // Retrieve all session cookies across music.youtube.com, .youtube.com, and .google.com
        const allCookies = await loginWin.webContents.session.cookies.get({});

        const cookieMap = new Map();
        for (const c of allCookies) {
          if (c && c.name && c.value) {
            cookieMap.set(c.name, c.value);
          }
        }

        const sapisid = cookieMap.get('SAPISID');
        const secure3 = cookieMap.get('__Secure-3PAPISID');
        const loginInfo = cookieMap.get('LOGIN_INFO');

        if (sapisid || secure3 || loginInfo) {
          if (authResolved) return;
          authResolved = true;
          clearInterval(checkInterval);

          // Proper Cookie String Formatting: Standard name1=value1; name2=value2; ...
          const formattedCookieString = Array.from(cookieMap.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');

          db.saveGoogleCookies(formattedCookieString);
          console.log('[AUTH] Captured Google / YouTube Music session cookies successfully!');

          // Check for critical auth tokens
          const missingCookies = CRITICAL_AUTH_COOKIES.filter(name => !cookieMap.has(name));
          if (missingCookies.length > 0) {
            console.warn(`[AUTH COOKIES] Warning: Captured cookies missing critical auth tokens: ${missingCookies.join(', ')}`);
          }

          // Pass cookie string correctly into Innertube initialization
          let yt = null;
          try {
            yt = await youtubeResolver.initInnertube(formattedCookieString);
          } catch (initErr) {
            console.error('[AUTH ERROR] Innertube initialization failed with cookie string:', initErr.message);
          }

          // Authentication Validation: Verify if session is truly authenticated
          const isAuth = Boolean(yt && yt.session?.logged_in);
          if (isAuth) {
            console.log('[AUTH VALIDATION SUCCESS] Innertube session is authenticated!');
          } else {
            console.error(`[AUTH VALIDATION FAILED] Innertube session is NOT authenticated! Missing cookies: ${missingCookies.join(', ') || 'Unknown auth failure'}`);
          }

          // Retrieve account profile info gracefully without crashing
          let profile = { name: 'Google Account', avatar: 'assets/logo.png' };
          try {
            profile = await fetchSafeAccountProfile();
          } catch (profileErr) {
            console.warn('Profile fetch error, using generic signed-in fallback:', profileErr.message);
          }

          db.saveGoogleProfile(profile);

          if (!loginWin.isDestroyed()) {
            loginWin.close();
          }

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('google:auth-changed', { loggedIn: true, profile });
          }

          resolve({ success: true, profile });
        }
      } catch (err) {
        console.error('Error checking Google session cookies:', err.message);
      }
    }

    loginWin.webContents.on('did-finish-load', checkGoogleCookies);
    checkInterval = setInterval(checkGoogleCookies, 1500);

    loginWin.on('closed', () => {
      clearInterval(checkInterval);
      if (!authResolved) {
        resolve({ success: false, error: 'Login window closed before completing authentication' });
      }
    });

    loginWin.loadURL('https://music.youtube.com');
  });
});

ipcMain.handle('google-logout', async () => {
  db.clearGoogleAuth();
  await youtubeResolver.initInnertube(null);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('google:auth-changed', { loggedIn: false, profile: null });
  }
  return { success: true };
});

ipcMain.handle('google:get-auth-status', async () => {
  const cookieStr = db.getGoogleCookies();
  const profile = db.getGoogleProfile();
  return {
    loggedIn: Boolean(cookieStr),
    profile: profile || (cookieStr ? { name: 'Google Account', avatar: 'assets/logo.png' } : null)
  };
});

// ---------------- Pure YouTube Music Content Handlers ----------------

ipcMain.handle('ytmusic:get-home', async () => {
  try {
    return await youtubeResolver.getHomeFeed();
  } catch (err) {
    console.error('ytmusic:get-home error:', err);
    return { topTracks: [], topArtists: [], playlists: [] };
  }
});

ipcMain.handle('ytmusic:get-library', async () => {
  try {
    return await youtubeResolver.getLibrary();
  } catch (err) {
    console.error('ytmusic:get-library error:', err);
    return { playlists: [], likedSongs: [], offlineTracks: db.getOfflineTracks() };
  }
});

ipcMain.handle('ytmusic:get-playlist', async (event, playlistId) => {
  try {
    return await youtubeResolver.getPlaylistDetails(playlistId);
  } catch (err) {
    console.error('ytmusic:get-playlist error:', err);
    return null;
  }
});

ipcMain.handle('ytmusic:search', async (event, args) => {
  try {
    const query = typeof args === 'object' && args !== null ? args.query : args;
    const type = typeof args === 'object' && args !== null ? (args.type || 'all') : 'all';
    return await youtubeResolver.searchMusic(query, type);
  } catch (err) {
    console.error('ytmusic:search error:', err);
    return [];
  }
});

ipcMain.handle('ytmusic:search-more', async (event, searchSessionId) => {
  try {
    const id = typeof searchSessionId === 'object' && searchSessionId !== null
      ? (searchSessionId.searchSessionId || searchSessionId.id)
      : searchSessionId;
    return await youtubeResolver.searchMore(id);
  } catch (err) {
    console.error('ytmusic:search-more error:', err);
    return { tracks: [], hasMore: false };
  }
});

ipcMain.handle('ytmusic:search-suggestions', async (event, query) => {
  try {
    const q = typeof query === 'object' && query !== null ? query.query : query;
    return await youtubeResolver.getSearchSuggestions(q);
  } catch (err) {
    console.error('ytmusic:search-suggestions error:', err);
    return { queries: [], entities: [] };
  }
});

ipcMain.handle('ytmusic:get-mood-feed', async (event, mood) => {
  try {
    const m = typeof mood === 'object' && mood !== null ? mood.mood : mood;
    return await youtubeResolver.getMoodFeed(m);
  } catch (err) {
    console.error('ytmusic:get-mood-feed error:', err);
    return { mood: 'Chill', playlists: [], tracks: [] };
  }
});

// Alias for backwards compatibility
ipcMain.handle('search-music', async (event, args) => {
  const query = typeof args === 'object' && args !== null ? args.query : args;
  const type = typeof args === 'object' && args !== null ? (args.type || 'all') : 'all';
  return await youtubeResolver.searchMusic(query, type);
});

ipcMain.handle('ytmusic:get-related', async (event, videoId) => {
  try {
    return await youtubeResolver.getRelatedTracks(videoId);
  } catch (err) {
    console.error('ytmusic:get-related error:', err);
    return [];
  }
});

ipcMain.handle('ytmusic:get-curated-home', async () => {
  try {
    return await youtubeResolver.getCuratedHome();
  } catch (err) {
    console.error('ytmusic:get-curated-home error:', err);
    return {
      similarSection: { title: 'Recommended For You', seedTrack: null, tracks: [] },
      topCharts: [],
      trending: [],
      topArtists: [],
      playlists: []
    };
  }
});

ipcMain.handle('ytmusic:import-playlist', async (event, urlOrId) => {
  try {
    console.log('[IPC] ytmusic:import-playlist received URL/ID:', urlOrId);
    const result = await youtubeResolver.importPlaylistFromUrl(urlOrId);
    console.log(`[IPC] ytmusic:import-playlist successfully resolved "${result.title}" with ${result.tracks?.length || 0} tracks.`);
    return result;
  } catch (err) {
    console.error('[IPC] ytmusic:import-playlist error:', err.message);
    throw err;
  }
});

// ---------------- Local Playlists Management ----------------

ipcMain.handle('playlists:create-local', async (event, data) => {
  try {
    const plName = typeof data === 'object' ? (data?.name || data?.title) : data;
    console.log('[IPC] playlists:create-local request for:', plName);
    const pl = db.createLocalPlaylist(data);
    console.log('[IPC] playlists:create-local created:', pl.id, pl.name);
    return { success: true, playlist: pl };
  } catch (err) {
    console.error('[IPC] playlists:create-local error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('playlists:get-local', async () => {
  try {
    const lists = db.getLocalPlaylists();
    console.log(`[IPC] playlists:get-local returning ${lists.length} local playlists.`);
    return lists;
  } catch (err) {
    console.error('[IPC] playlists:get-local error:', err.message);
    return [];
  }
});

ipcMain.handle('playlists:get-local-by-id', async (event, playlistId) => {
  try {
    console.log('[IPC] playlists:get-local-by-id:', playlistId);
    return db.getLocalPlaylist(playlistId);
  } catch (err) {
    console.error('[IPC] playlists:get-local-by-id error:', err.message);
    return null;
  }
});

ipcMain.handle('playlists:add-track', async (event, { playlistId, track }) => {
  try {
    console.log(`[IPC] playlists:add-track to "${playlistId}": "${track?.title}" (${track?.id})`);
    const result = db.addTrackToLocalPlaylist(playlistId, track);
    return result;
  } catch (err) {
    console.error('[IPC] playlists:add-track error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('playlists:remove-track', async (event, { playlistId, trackId }) => {
  try {
    console.log(`[IPC] playlists:remove-track from "${playlistId}": track ${trackId}`);
    return db.removeTrackFromLocalPlaylist(playlistId, trackId);
  } catch (err) {
    console.error('[IPC] playlists:remove-track error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('playlists:delete-local', async (event, playlistId) => {
  try {
    console.log('[IPC] playlists:delete-local:', playlistId);
    return db.deleteLocalPlaylist(playlistId);
  } catch (err) {
    console.error('[IPC] playlists:delete-local error:', err.message);
    return { success: false, error: err.message };
  }
});

// ---------------- Liked (Favorite) Songs Collection ----------------

ipcMain.handle('likes:toggle', async (event, track) => {
  try {
    const trackId = track?.id || track?.yt_video_id || track?.videoId;
    console.log(`[IPC] likes:toggle for "${track?.title}" (${trackId})`);
    const result = db.toggleLikeTrack(track);
    return result;
  } catch (err) {
    console.error('[IPC] likes:toggle error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('likes:is-liked', async (event, trackId) => {
  try {
    return db.isTrackLiked(trackId);
  } catch (err) {
    console.error('[IPC] likes:is-liked error:', err.message);
    return false;
  }
});

ipcMain.handle('likes:get-all', async () => {
  try {
    const list = db.getLikedTracks();
    console.log(`[IPC] likes:get-all returning ${list.length} liked tracks.`);
    return list;
  } catch (err) {
    console.error('[IPC] likes:get-all error:', err.message);
    return [];
  }
});

// ---------------- Playback History & Last Played Track ----------------

ipcMain.handle('playback:save-last-played', async (event, track) => {
  try {
    db.saveLastPlayedTrack(track);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('playback:get-last-played', async () => {
  try {
    return db.getLastPlayedTrack();
  } catch (err) {
    return null;
  }
});

// ---------------- Offline Downloads ----------------

ipcMain.handle('offline:download-track', async (event, track) => {
  try {
    return await downloader.downloadTrack(track);
  } catch (err) {
    console.error('Download error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('offline:get-tracks', async () => {
  return db.getOfflineTracks();
});

ipcMain.handle('offline:delete-track', async (event, trackId) => {
  return downloader.deleteDownloadedTrack(trackId);
});

// ---------------- Audio Playback via YouTube Music Proxy ----------------

ipcMain.handle('play-track', async (event, track) => {
  try {
    const result = await youtubeResolver.resolveTrackAudio(track);

    let streamUrl = '';
    if (result.isOffline) {
      // Stream directly from local downloaded file on disk
      streamUrl = streamProxy.getOfflineStreamUrl(result.track?.id || track.id);
    } else {
      // Stream from YouTube Music via local proxy (http://localhost:8888/stream/:videoId)
      streamUrl = streamProxy.getStreamUrl(result.yt_video_id);
    }

    currentPlayingInfo = {
      title: track.title || 'Unknown Title',
      artist: Array.isArray(track.artists) ? track.artists.join(', ') : (track.artists || track.artist || 'Unknown Artist'),
      isPlaying: true
    };
    updateTrayMenu();

    return {
      success: true,
      streamUrl,
      yt_video_id: result.yt_video_id,
      isOffline: result.isOffline,
      fromCache: result.fromCache,
      track: result.track
    };
  } catch (err) {
    console.error('Error in play-track resolver:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// ---------------- Player State Sync for Tray ----------------

ipcMain.handle('player:status-update', (event, { isPlaying, title, artist }) => {
  currentPlayingInfo = {
    title: title || currentPlayingInfo.title,
    artist: artist || currentPlayingInfo.artist,
    isPlaying: Boolean(isPlaying)
  };
  updateTrayMenu();
  return { success: true };
});

// ---------------- Google Cast Integration ----------------

ipcMain.handle('get-cast-devices', async () => {
  return castService.getDevices();
});

ipcMain.handle('cast-to-device', async (event, { deviceId, mediaUrl, metadata }) => {
  try {
    return await castService.castToDevice(deviceId, mediaUrl, metadata);
  } catch (err) {
    console.error('Error in cast-to-device:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cast-control', async (event, { action, value }) => {
  switch (action) {
    case 'pause':
      castService.pause();
      break;
    case 'resume':
      castService.resume();
      break;
    case 'seek':
      castService.seek(Number(value) || 0);
      break;
    case 'stop':
      castService.stop();
      break;
  }
  return { success: true };
});

// ---------------- Synced Lyrics ----------------

ipcMain.handle('lyrics:get-synced', async (event, { title, artist, duration, album }) => {
  try {
    return await lyricsService.fetchLyrics(title, artist, duration, album);
  } catch (err) {
    console.error('Error in lyrics:get-synced:', err);
    return { synced: [], plain: '', error: err.message };
  }
});

// ---------------- Cache Management & Diagnostics ----------------

ipcMain.handle('cache:get-stats', async () => {
  try {
    return db.getCacheStats();
  } catch (err) {
    console.error('Error in cache:get-stats:', err);
    return { dbSizeBytes: 0, trackMatchesCount: 0, offlineTracksCount: 0, offlineBytes: 0, error: err.message };
  }
});

ipcMain.handle('cache:clear-track-matches', async () => {
  try {
    return db.clearTrackMatchesCache();
  } catch (err) {
    console.error('Error in cache:clear-track-matches:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cache:clear-all', async () => {
  try {
    return db.clearAllCache();
  } catch (err) {
    console.error('Error in cache:clear-all:', err);
    return { success: false, error: err.message };
  }
});

// ---------------- Lifecycle ----------------

app.whenReady().then(async () => {
  // Start local HTTP audio stream proxy on port 8888
  try {
    await streamProxy.startStreamProxy(8888);
  } catch (err) {
    console.error('Failed to start stream proxy server:', err);
  }

  // Pre-initialize YouTube Music resolver
  try {
    await youtubeResolver.initInnertube();
  } catch (err) {
    console.error('Innertube startup error:', err);
  }

  // Gracefully verify account info if user was already logged in, without crashing startup
  try {
    const savedCookies = db.getGoogleCookies();
    if (savedCookies) {
      const existingProfile = db.getGoogleProfile();
      if (!existingProfile || !existingProfile.name) {
        const profile = await fetchSafeAccountProfile();
        db.saveGoogleProfile(profile);
      }
    }
  } catch (accountSyncErr) {
    console.warn('Startup account sync error caught (generic signed-in state preserved):', accountSyncErr.message);
  }

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  castService.stop();
  streamProxy.stopStreamProxy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
