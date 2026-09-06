const { Innertube, Platform, Log, Parser } = require('youtubei.js');
const Fuse = require('fuse.js');
const fs = require('fs');
const db = require('./db');

// Suppress non-critical Innertube parser and text formatting warnings (TextBadge, MenuCustomIconItem, etc.)
try {
  if (Log && typeof Log.setLevel === 'function' && Log.Level) {
    Log.setLevel(Log.Level.ERROR);
  }
} catch (e) {
  // Ignore logger configuration errors
}

// Safely handle/catch non-critical Innertube parser mismatch and missing class errors
try {
  if (Parser && typeof Parser.setParserErrorHandler === 'function') {
    Parser.setParserErrorHandler(() => {
      // Intentionally suppress non-critical parser warnings so they don't break playback or flood stdout
    });
  }
} catch (e) {
  // Ignore parser error handler setup errors
}

// Alias ANDROID_MUSIC and WEB_REMIX in Constants and configure official YouTube Music stream headers
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

try {
  const Constants = require('youtubei.js/dist/src/utils/Constants.js');
  if (Constants && Array.isArray(Constants.SUPPORTED_CLIENTS)) {
    if (!Constants.SUPPORTED_CLIENTS.includes('ANDROID_MUSIC')) {
      Constants.SUPPORTED_CLIENTS.push('ANDROID_MUSIC');
      Constants.CLIENTS.ANDROID_MUSIC = Constants.CLIENTS.YTMUSIC_ANDROID;
    }
    if (!Constants.SUPPORTED_CLIENTS.includes('WEB_REMIX')) {
      Constants.SUPPORTED_CLIENTS.push('WEB_REMIX');
      Constants.CLIENTS.WEB_REMIX = Constants.CLIENTS.YTMUSIC;
    }
  }
  if (Constants && Constants.STREAM_HEADERS) {
    Constants.STREAM_HEADERS = {
      ...Constants.STREAM_HEADERS,
      'user-agent': DESKTOP_CHROME_UA,
      'client': 'WEB_REMIX',
      'x-youtube-client-name': '67',
      'origin': 'https://music.youtube.com',
      'referer': 'https://music.youtube.com'
    };
  }
} catch (e) {
  // Ignore if Constants internal path is resolved differently
}

// Client fallback chain priority: prioritize YouTube Music Web client (WEB_REMIX / YTMUSIC), then mobile
const CLIENT_FALLBACK_CHAIN = ['WEB_REMIX', 'YTMUSIC', 'ANDROID_MUSIC', 'IOS', 'WEB', 'ANDROID'];

function normalizeClientName(client) {
  if (!client) return 'YTMUSIC';
  const u = String(client).toUpperCase();
  if (u === 'WEB_REMIX') return 'YTMUSIC';
  if (u === 'ANDROID_MUSIC') return 'YTMUSIC_ANDROID';
  return u;
}

// Wrap Innertube actions.execute to normalize client name and video_id parameters
function wrapActionsExecute(yt) {
  if (!yt || !yt.actions || yt.actions._wrappedForClientOptions) return;
  const originalExecute = yt.actions.execute.bind(yt.actions);
  yt.actions.execute = async (endpoint, args) => {
    let cleanEndpoint = endpoint;
    if (cleanEndpoint === 'player') {
      cleanEndpoint = '/player';
    }
    const safeArgs = args && typeof args === 'object' ? { ...args } : args;
    if (safeArgs) {
      if (safeArgs.video_id && !safeArgs.videoId) {
        safeArgs.videoId = safeArgs.video_id;
      }
      if (safeArgs.client === 'ANDROID_MUSIC') {
        safeArgs.client = 'YTMUSIC_ANDROID';
      }
    }
    return originalExecute(cleanEndpoint, safeArgs);
  };
  yt.actions._wrappedForClientOptions = true;
}

// Inject custom JavaScript evaluator for youtubei.js deciphering
Platform.load({
  ...Platform.shim,
  eval: async (data, env) => {
    const fn = new Function(...Object.keys(env), data.output);
    return fn(...Object.values(env));
  }
});

let innertubeInstance = null;

// Validate standard 11-character playable YouTube video ID (e.g. dQw4w9WgXcQ)
function isPlayableVideoId(id) {
  if (typeof id !== 'string') return false;
  if (id.length !== 11) return false;
  if (/^(MPREb_|MPED_|VL|PL|RDCL|MPSP)/.test(id)) return false;
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

// Universal thumbnail URL extractor across all youtubei.js response variations
function extractThumbnailUrl(item) {
  if (!item) return '';
  if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
    const valid = item.thumbnail.find(t => t && t.url);
    if (valid) return valid.url;
  }
  if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
    const valid = item.thumbnails.find(t => t && t.url);
    if (valid) return valid.url;
  }
  if (item.thumbnail && Array.isArray(item.thumbnail.contents) && item.thumbnail.contents.length > 0) {
    const valid = item.thumbnail.contents.find(t => t && t.url);
    if (valid) return valid.url;
  }
  if (item.thumbnail && typeof item.thumbnail.url === 'string') return item.thumbnail.url;
  if (typeof item.thumbnail === 'string') return item.thumbnail;
  if (item.thumbnails && typeof item.thumbnails.url === 'string') return item.thumbnails.url;
  if (typeof item.artwork === 'string') return item.artwork;
  return '';
}

const CRITICAL_AUTH_COOKIES = ['SAPISID', '__Secure-3PAPISID', 'LOGIN_INFO', 'HSID', 'SSID', 'APISID'];

async function initInnertube(cookieStr = null) {
  const cookies = cookieStr !== null ? cookieStr : db.getGoogleCookies();

  if (cookies && typeof cookies === 'string' && cookies.trim().length > 0) {
    const formattedCookieString = cookies.trim();

    // Check which critical cookies are missing
    const missing = CRITICAL_AUTH_COOKIES.filter(c => !formattedCookieString.includes(`${c}=`));
    if (missing.length > 0) {
      console.warn(`[AUTH VALIDATION] Warning: Cookie string is missing auth tokens: ${missing.join(', ')}`);
    }

    try {
      // Ensure the cookie string is passed explicitly as { cookie: formattedCookieString }
      innertubeInstance = await Innertube.create({ cookie: formattedCookieString });
      wrapActionsExecute(innertubeInstance);

      // Authentication Validation: Check if the session is truly authenticated
      const isAuth = Boolean(innertubeInstance.session?.logged_in);
      if (isAuth) {
        console.log('[AUTH SUCCESS] Innertube initialized and authenticated successfully with session cookies.');
      } else {
        console.error(`[AUTH VALIDATION FAILED] Innertube session is NOT authenticated! Missing critical cookies: ${missing.length > 0 ? missing.join(', ') : 'Unknown cookie validation failure'}`);
      }

      return innertubeInstance;
    } catch (err) {
      console.error('[AUTH ERROR] Innertube initialization with cookies failed:', err.message);
      if (missing.length > 0) {
        console.error(`[AUTH ERROR] Missing critical auth cookies: ${missing.join(', ')}`);
      }
      // Re-throw so caller knows authentication failed instead of silently falling back to guest mode
      throw err;
    }
  }

  // Default guest session when no cookies are provided or stored
  console.log('[GUEST] Initializing guest Innertube instance (no cookies provided).');
  innertubeInstance = await Innertube.create();
  wrapActionsExecute(innertubeInstance);
  return innertubeInstance;
}

async function getInnertube() {
  if (!innertubeInstance) {
    await initInnertube();
  }
  return innertubeInstance;
}

// Client Fallback: If ANDROID_MUSIC fails, automatically fallback to WEB or IOS before throwing error
async function getVideoInfoWithFallback(videoId, preferredClient = 'ANDROID_MUSIC') {
  if (!isPlayableVideoId(videoId)) {
    throw new Error(`Invalid videoId: "${videoId}". Must be a valid 11-character playable video ID.`);
  }

  const yt = await getInnertube();
  const clients = [preferredClient, ...CLIENT_FALLBACK_CHAIN.filter(c => c !== preferredClient)];
  let lastError = null;

  for (const client of clients) {
    try {
      const normalized = normalizeClientName(client);
      const info = await yt.getInfo(videoId, { client: normalized });
      if (info) return { info, client };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to retrieve info for video ${videoId} with all client fallbacks`);
}

// Call yt.actions.execute('player') with client options and automatic fallback
async function executePlayerWithFallback(videoId, preferredClient = 'ANDROID_MUSIC') {
  if (!isPlayableVideoId(videoId)) {
    throw new Error(`Invalid videoId: "${videoId}". Must be a valid 11-character playable video ID.`);
  }

  const yt = await getInnertube();
  const clients = [preferredClient, ...CLIENT_FALLBACK_CHAIN.filter(c => c !== preferredClient)];
  let lastError = null;

  for (const client of clients) {
    try {
      const normalized = normalizeClientName(client);
      const res = await yt.actions.execute('player', {
        video_id: videoId,
        videoId: videoId,
        client: normalized
      });
      if (res && res.data && res.data.playabilityStatus?.status !== 'UNPLAYABLE') {
        return { response: res, client };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Failed to execute player for video ${videoId} with all client fallbacks`);
}

// Extract and decipher direct audio stream URL with client fallback (WEB_REMIX -> YTMUSIC -> ANDROID_MUSIC -> IOS)
async function getAudioStreamUrl(videoId, preferredClient = 'WEB_REMIX') {
  if (!isPlayableVideoId(videoId)) {
    throw new Error(`Invalid videoId: "${videoId}". Must be a valid 11-character playable video ID.`);
  }

  const yt = await getInnertube();
  const clients = [preferredClient, ...CLIENT_FALLBACK_CHAIN.filter(c => c !== preferredClient)];
  let lastError = null;

  for (const client of clients) {
    try {
      const normalized = normalizeClientName(client);
      const info = await yt.getInfo(videoId, { client: normalized });
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      if (format) {
        let streamUrl = format.url;
        if (!streamUrl && typeof format.decipher === 'function') {
          streamUrl = await format.decipher(yt.session.player);
        }
        if (streamUrl) {
          return {
            url: streamUrl,
            format,
            contentType: format.mime_type?.split(';')[0] || 'audio/mp4',
            client,
            headers: {
              'User-Agent': DESKTOP_CHROME_UA,
              'Referer': 'https://music.youtube.com',
              'Origin': 'https://music.youtube.com',
              'Client': 'WEB_REMIX',
              'X-Youtube-Client-Name': '67'
            }
          };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Could not decipher audio stream for video ${videoId} across all fallback clients`);
}

// Stream download using yt.download with client fallback (WEB_REMIX -> YTMUSIC -> ANDROID_MUSIC -> IOS)
async function getAudioDownloadStream(videoId, preferredClient = 'WEB_REMIX') {
  if (!isPlayableVideoId(videoId)) {
    throw new Error(`Invalid videoId: "${videoId}". Expected an 11-character video ID.`);
  }

  const yt = await getInnertube();
  const clients = [preferredClient, ...CLIENT_FALLBACK_CHAIN.filter(c => c !== preferredClient)];
  let lastError = null;

  for (const client of clients) {
    try {
      const normalized = normalizeClientName(client);
      const stream = await yt.download(videoId, { type: 'audio', quality: 'best', client: normalized });
      if (stream) {
        return {
          stream,
          contentType: 'audio/mp4',
          client,
          headers: {
            'User-Agent': DESKTOP_CHROME_UA,
            'Referer': 'https://music.youtube.com',
            'Origin': 'https://music.youtube.com',
            'Client': 'WEB_REMIX',
            'X-Youtube-Client-Name': '67'
          }
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  // Fallback to direct format deciphering and fetch with official YouTube Music headers
  try {
    const streamInfo = await getAudioStreamUrl(videoId, preferredClient);
    const upstreamRes = await fetch(streamInfo.url, {
      headers: {
        'User-Agent': DESKTOP_CHROME_UA,
        'Referer': 'https://music.youtube.com',
        'Origin': 'https://music.youtube.com',
        'Client': 'WEB_REMIX',
        'X-Youtube-Client-Name': '67'
      }
    });

    if (!upstreamRes.ok) {
      throw new Error(`Upstream returned HTTP ${upstreamRes.status}`);
    }

    const { Readable } = require('stream');
    const nodeStream = Readable.fromWeb(upstreamRes.body);

    return {
      stream: nodeStream,
      contentType: upstreamRes.headers.get('content-type') || streamInfo.contentType || 'audio/mp4',
      client: streamInfo.client,
      headers: streamInfo.headers
    };
  } catch (err) {
    throw lastError || err;
  }
}

// ---------------- Pure YouTube Music Home Feed ----------------
async function getHomeFeed() {
  try {
    const yt = await getInnertube();
    const home = await yt.music.getHomeFeed();
    const playlists = [];
    let topTracks = [];
    const topArtists = [];

    if (home && home.sections) {
      for (const sec of home.sections) {
        const title = sec.title?.text || sec.header?.title?.text || 'Recommended';
        const items = sec.contents || [];
        for (const item of items) {
          const thumb = extractThumbnailUrl(item);
          const isSong = item.id && isPlayableVideoId(item.id);

          if (isSong) {
            const artistStr = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : item.artists) : (item.author?.name || '');
            topTracks.push({
              id: item.id,
              yt_video_id: item.id,
              title: item.title?.text || item.title?.toString() || 'Track',
              artist: artistStr,
              artists: [artistStr],
              duration: item.duration?.seconds || 0,
              artwork: thumb
            });
            if (artistStr && !topArtists.some(a => a.name === artistStr)) {
              topArtists.push({
                name: artistStr,
                artwork: thumb
              });
            }
          } else if (item.id) {
            playlists.push({
              id: item.id,
              name: item.title?.text || item.title?.toString() || 'Playlist',
              description: title,
              artwork: thumb,
              owner: 'YouTube Music'
            });
          }
        }
      }
    }

    // If topTracks was not in home shelves, expand the first playlist so tracks are immediately available to play
    if (topTracks.length === 0 && playlists.length > 0) {
      try {
        const firstPl = await yt.music.getPlaylist(playlists[0].id);
        if (firstPl && firstPl.items) {
          topTracks = firstPl.items.slice(0, 24).map(t => {
            const artistStr = t.artists ? (Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : t.artists) : (t.author?.name || 'Various Artists');
            const thumb = extractThumbnailUrl(t) || playlists[0].artwork;
            if (artistStr && !topArtists.some(a => a.name === artistStr)) {
              topArtists.push({ name: artistStr, artwork: thumb });
            }
            return {
              id: t.id,
              yt_video_id: t.id,
              title: t.title?.text || t.title?.toString() || 'Track',
              artist: artistStr,
              artists: [artistStr],
              album: t.album?.name || playlists[0].name,
              duration: t.duration?.seconds || 0,
              artwork: thumb
            };
          });
        }
      } catch (plErr) {
        console.warn('Could not populate topTracks from first playlist:', plErr.message);
      }
    }

    return {
      topTracks,
      topArtists: topArtists.slice(0, 15),
      playlists: playlists.slice(0, 20)
    };
  } catch (err) {
    console.error('getHomeFeed error:', err);
    return {
      topTracks: [],
      topArtists: [],
      playlists: []
    };
  }
}

// ---------------- Recursive ItemSection & Container Node Extractor ----------------
/**
 * Recursively extracts items (tracks and playlists) from nested Innertube section nodes,
 * safely handling ItemSection, Grid, MusicShelf, MusicPlaylistShelf, and SectionList without throwing errors.
 */
function extractItemsFromSectionNode(node, collected = { tracks: [], playlists: [] }, inheritedArt = '') {
  if (!node) return collected;

  // 1. If node is an Array, iterate each item
  if (Array.isArray(node)) {
    for (const child of node) {
      extractItemsFromSectionNode(child, collected, inheritedArt);
    }
    return collected;
  }

  // 2. Unpack wrapper containers (ItemSection, Grid, MusicShelf, SectionList, etc.)
  const nodeType = node.type || (node.constructor && node.constructor.type) || '';
  const isContainer = nodeType === 'ItemSection'
    || nodeType === 'Grid'
    || nodeType === 'MusicShelf'
    || nodeType === 'MusicPlaylistShelf'
    || nodeType === 'MusicCarouselShelf'
    || nodeType === 'SectionList'
    || (node.is && typeof node.is === 'function' && (node.is('ItemSection') || node.is('Grid') || node.is('MusicShelf')));

  // Safely extract nested children
  const children = Array.isArray(node.contents)
    ? node.contents
    : (Array.isArray(node.items)
      ? node.items
      : (node.contents && Array.isArray(node.contents.contents)
        ? node.contents.contents
        : (node.contents && Array.isArray(node.contents.items) ? node.contents.items : null)));

  if (Array.isArray(children) && children.length > 0) {
    const currentArt = extractThumbnailUrl(node) || inheritedArt;
    for (const child of children) {
      extractItemsFromSectionNode(child, collected, currentArt);
    }
    if (isContainer) return collected;
  }

  // 3. Inspect individual item
  const itemId = node.id || node.video_id || node.videoId || node.playlist_id || node.playlistId;
  if (!itemId) return collected;

  const thumb = extractThumbnailUrl(node) || inheritedArt;

  // Determine if it's a song/video or a playlist/album container
  const isPlayableSong = (isPlayableVideoId(itemId) && !itemId.startsWith('VL') && !itemId.startsWith('PL') && !itemId.startsWith('MPREb_') && !itemId.startsWith('MPED_'))
    || nodeType === 'MusicResponsiveListItem'
    || (node.endpoint && node.endpoint.payload && node.endpoint.payload.videoId);

  if (isPlayableSong && isPlayableVideoId(itemId)) {
    const artistStr = node.artists
      ? (Array.isArray(node.artists) ? node.artists.map(a => a.name || a.text || a).join(', ') : (node.artists.name || node.artists))
      : (node.author?.name || node.author?.text || node.subtitle?.text || 'Various Artists');
    const title = node.title?.text || node.title?.toString() || node.name || 'Track';
    const albumName = node.album?.name || node.album?.text || 'YouTube Music';
    const durationSec = node.duration?.seconds || (typeof node.duration === 'number' ? node.duration : 0);

    collected.tracks.push({
      id: itemId,
      yt_video_id: itemId,
      title,
      artist: artistStr,
      artists: [artistStr],
      album: albumName,
      duration: durationSec,
      artwork: thumb
    });
  } else {
    // Playlist or Album
    const title = node.title?.text || node.title?.toString() || node.name || 'Playlist';
    const desc = node.subtitle?.text || node.description?.text || node.description?.toString() || 'YouTube Music Playlist';
    const ownerName = node.author?.name || node.author?.text || 'YouTube Music';

    collected.playlists.push({
      id: itemId,
      name: title,
      title: title,
      description: desc,
      artwork: thumb,
      owner: ownerName
    });
  }

  return collected;
}

// ---------------- Pure YouTube Music Library ----------------
async function getLibrary() {
  try {
    let playlists = [];
    let likedSongs = [];

    const cookies = db.getGoogleCookies();
    // Strict Authentication Enforcement: If no cookies or not logged in, return unauthenticated state immediately
    if (!cookies || typeof cookies !== 'string' || !cookies.trim()) {
      console.log('[LIBRARY] User is unauthenticated (no cookies). Returning empty state.');
      return {
        authenticated: false,
        playlists: [],
        likedSongs: [],
        offlineTracks: db.getOfflineTracks()
      };
    }

    const missing = CRITICAL_AUTH_COOKIES.filter(c => !cookies.includes(`${c}=`));
    if (missing.length > 0) {
      console.warn(`[LIBRARY] Saved cookies are missing critical auth tokens: ${missing.join(', ')}. Returning unauthenticated state.`);
      return {
        authenticated: false,
        error: `Missing critical authentication tokens: ${missing.join(', ')}`,
        playlists: [],
        likedSongs: [],
        offlineTracks: db.getOfflineTracks()
      };
    }

    const yt = await getInnertube();

    // Check if session is truly authenticated
    if (!yt.session?.logged_in) {
      console.log('[LIBRARY] Innertube session was not logged in, initializing with saved cookies...');
      await initInnertube(cookies);
    }

    if (!yt.session?.logged_in) {
      console.warn('[LIBRARY] Session is not authenticated after init. Returning unauthenticated state.');
      return {
        authenticated: false,
        error: 'Authentication failed: session not logged in',
        playlists: [],
        likedSongs: [],
        offlineTracks: db.getOfflineTracks()
      };
    }

    let libData = null;

    // Strictly execute yt.music.getLibrary() using authenticated session
    try {
      libData = await yt.music.getLibrary();
    } catch (libErr) {
      console.error('[LIBRARY ERROR] yt.music.getLibrary() failed for authenticated session:', libErr.message);
      // Attempt authenticated direct browse fallback without falling back to guest mode
      try {
        if (yt.actions) {
          const rawBrowse = await yt.actions.execute('/browse', {
            client: 'YTMUSIC',
            browseId: 'FEmusic_library_landing'
          });
          const { Parser } = require('youtubei.js');
          libData = Parser.parseResponse(rawBrowse.data);
        }
      } catch (browseErr) {
        console.error('[LIBRARY ERROR] Authenticated direct browse fallback failed:', browseErr.message);
      }
    }

    if (libData) {
      const collected = { tracks: [], playlists: [] };

      // Extract from libData.contents or libData.sections or libData.page
      const sections = libData.contents || libData.sections || (libData.page && libData.page.contents) || [];
      extractItemsFromSectionNode(sections, collected);

      // If libData supports filtering by 'Playlists', fetch all user personal playlists
      if (typeof libData.applyFilter === 'function' && Array.isArray(libData.filters) && libData.filters.includes('Playlists')) {
        try {
          const plLib = await libData.applyFilter('Playlists');
          if (plLib && plLib.contents) {
            extractItemsFromSectionNode(plLib.contents, collected);
          }
        } catch (filterErr) {
          console.warn('[LIBRARY] Personal playlists filter fetch:', filterErr.message);
        }
      }

      // Safely check for array existence on libData.playlists
      if (libData.playlists) {
        const plList = Array.isArray(libData.playlists.contents)
          ? libData.playlists.contents
          : (Array.isArray(libData.playlists.items)
            ? libData.playlists.items
            : (Array.isArray(libData.playlists) ? libData.playlists : []));

        if (Array.isArray(plList) && plList.length > 0) {
          extractItemsFromSectionNode(plList, collected);
        }
      }

      // Fetch user's Liked Music (LM) if none were found on landing
      if (collected.tracks.length === 0) {
        try {
          const likedPl = await yt.music.getPlaylist('LM');
          if (likedPl && (Array.isArray(likedPl.items) || Array.isArray(likedPl.contents))) {
            extractItemsFromSectionNode(likedPl.items || likedPl.contents, collected);
          }
        } catch (lmErr) {
          // Liked music playlist may be empty or uninitialized
        }
      }

      // Deduplicate playlists safely
      const seenPl = new Set();
      playlists = collected.playlists.filter(p => {
        if (!p.id || seenPl.has(p.id)) return false;
        seenPl.add(p.id);
        return true;
      });

      // Deduplicate tracks safely
      const seenTrack = new Set();
      likedSongs = collected.tracks.filter(t => {
        if (!t.id || seenTrack.has(t.id)) return false;
        seenTrack.add(t.id);
        return true;
      });

      console.log(`[LIBRARY] Authenticated library loaded: ${playlists.length} playlists, ${likedSongs.length} tracks.`);
    }

    // STRICT: Return authenticated library state without any random playlist or home feed fallback
    return {
      authenticated: true,
      playlists,
      likedSongs,
      offlineTracks: db.getOfflineTracks()
    };
  } catch (err) {
    console.error('[LIBRARY ERROR] Unexpected error in getLibrary:', err);
    return {
      authenticated: false,
      error: err.message,
      playlists: [],
      likedSongs: [],
      offlineTracks: db.getOfflineTracks()
    };
  }
}

// ---------------- Pure YouTube Music Playlist Details ----------------
async function getPlaylistDetails(playlistId) {
  try {
    const yt = await getInnertube();
    let pl = null;

    try {
      pl = await yt.music.getPlaylist(playlistId);
    } catch (plErr) {
      console.warn(`yt.music.getPlaylist(${playlistId}) failed, attempting yt.getPlaylist fallback:`, plErr.message);
      try {
        pl = await yt.getPlaylist(playlistId);
      } catch (ytErr) {
        console.warn(`yt.getPlaylist(${playlistId}) fallback failed:`, ytErr.message);
      }
    }

    if (!pl) return null;

    const playlistTitle = pl.header?.title?.text || pl.title?.text || pl.title || pl.name || 'Playlist';
    const playlistDesc = pl.header?.description?.text || pl.description?.text || pl.description || 'YouTube Music Playlist';
    const playlistArt = extractThumbnailUrl(pl.header) || extractThumbnailUrl(pl) || '';
    const playlistAuthor = pl.header?.author?.name || pl.author?.name || 'YouTube Music';

    const tracks = [];
    const seenIds = new Set();

    // Check items or contents array safely
    const rawItems = Array.isArray(pl.items)
      ? pl.items
      : (Array.isArray(pl.contents)
        ? pl.contents
        : (Array.isArray(pl.sections) ? pl.sections : []));

    if (Array.isArray(rawItems) && rawItems.length > 0) {
      // Use recursive extractor to handle ItemSection nodes alongside MusicPlaylistShelf and Grid
      const collected = { tracks: [], playlists: [] };
      extractItemsFromSectionNode(rawItems, collected, playlistArt);

      for (const t of collected.tracks) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          if (!t.artwork) t.artwork = playlistArt;
          if (!t.album) t.album = playlistTitle;
          tracks.push(t);
        }
      }
    }

    return {
      id: playlistId,
      name: playlistTitle,
      title: playlistTitle,
      description: playlistDesc,
      artwork: playlistArt,
      owner: playlistAuthor,
      tracks
    };
  } catch (err) {
    console.error('getPlaylistDetails error:', err);
    return null;
  }
}

// ---------------- Pure YouTube Music Search ----------------
async function searchMusic(query) {
  if (!query || !query.trim()) return [];

  const trimmed = query.trim();
  const results = [];
  const seenIds = new Set();

  try {
    const yt = await getInnertube();
    const searchRes = await yt.music.search(trimmed);

    if (searchRes && searchRes.contents) {
      for (const section of searchRes.contents) {
        const items = section.contents || (section.type === 'MusicResponsiveListItem' ? [section] : []);
        for (const item of items) {
          const itemId = item.id;
          if (itemId && isPlayableVideoId(itemId) && !seenIds.has(itemId)) {
            seenIds.add(itemId);
            const thumbUrl = extractThumbnailUrl(item);
            const artistName = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : item.artists) : (item.author?.name || '');
            results.push({
              id: itemId,
              yt_video_id: itemId,
              title: item.title?.text || item.title?.toString() || 'Unknown Title',
              artist: artistName,
              artists: [artistName],
              album: item.album?.name || 'Single',
              duration: item.duration?.seconds || 0,
              artwork: thumbUrl
            });
          }
        }
      }
    }

    // Supplement with standard YouTube search to guarantee minimum 10 playable results
    if (results.length < 10) {
      try {
        const general = await yt.search(trimmed, { type: 'video' });
        if (general && general.videos) {
          for (const v of general.videos) {
            if (v.id && isPlayableVideoId(v.id) && !seenIds.has(v.id)) {
              seenIds.add(v.id);
              results.push({
                id: v.id,
                yt_video_id: v.id,
                title: v.title?.text || v.title?.toString() || '',
                artist: v.author?.name || '',
                artists: [v.author?.name || ''],
                album: 'YouTube Video',
                duration: v.duration?.seconds || 0,
                artwork: extractThumbnailUrl(v)
              });
            }
          }
        }
      } catch (gErr) {
        console.warn('General video search supplement skipped:', gErr.message);
      }
    }

    return results;
  } catch (err) {
    console.error('searchMusic error:', err);
    return [];
  }
}

// ---------------- Direct Audio Stream Resolution ----------------
async function resolveTrackAudio(track) {
  if (!track || (!track.id && !track.yt_video_id && !track.title)) {
    throw new Error('Invalid track object provided');
  }

  const trackId = track.id || track.yt_video_id;

  // 1. Check if track is already downloaded offline on disk
  const offline = db.getOfflineTrack(trackId);
  if (offline && offline.local_path && fs.existsSync(offline.local_path)) {
    return {
      yt_video_id: offline.yt_video_id || trackId,
      track: offline,
      isOffline: true,
      fromOffline: true
    };
  }

  // 2. If track already has an 11-char playable video ID, use directly!
  if (isPlayableVideoId(trackId)) {
    return {
      yt_video_id: trackId,
      track: { ...track, yt_video_id: trackId },
      isOffline: false,
      fromDirect: true
    };
  }

  if (track.yt_video_id && isPlayableVideoId(track.yt_video_id)) {
    return {
      yt_video_id: track.yt_video_id,
      track,
      isOffline: false,
      fromDirect: true
    };
  }

  // 3. Check JSON cache.json
  const cached = db.getMatch(trackId);
  if (cached && cached.yt_video_id && isPlayableVideoId(cached.yt_video_id)) {
    return {
      yt_video_id: cached.yt_video_id,
      track: { ...track, yt_video_id: cached.yt_video_id },
      isOffline: false,
      fromCache: true
    };
  }

  // 4. Fallback search on YouTube Music
  const yt = await getInnertube();
  const artistStr = Array.isArray(track.artists) ? track.artists.join(', ') : (track.artists || track.artist || '');
  const searchQuery = `${track.title} ${artistStr}`.trim();

  const candidates = await searchMusic(searchQuery);
  if (candidates.length === 0) {
    throw new Error(`No YouTube audio matches found for "${searchQuery}"`);
  }

  // 5. Use Fuse.js to match closest track
  const fuse = new Fuse(candidates, {
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'artist', weight: 0.3 }
    ],
    threshold: 0.6
  });

  const fuseResults = fuse.search(searchQuery);
  const bestMatch = (fuseResults.length > 0 && fuseResults[0].item) ? fuseResults[0].item : candidates[0];

  // 6. Save match to SQLite cache
  db.saveMatch(trackId, bestMatch.yt_video_id || bestMatch.id, track.title, artistStr);

  return {
    yt_video_id: bestMatch.yt_video_id || bestMatch.id,
    track: { ...track, yt_video_id: bestMatch.yt_video_id || bestMatch.id },
    isOffline: false,
    fromCache: false
  };
}

module.exports = {
  CLIENT_FALLBACK_CHAIN,
  isPlayableVideoId,
  extractThumbnailUrl,
  extractItemsFromSectionNode,
  initInnertube,
  getInnertube,
  getVideoInfoWithFallback,
  executePlayerWithFallback,
  getAudioStreamUrl,
  getAudioDownloadStream,
  getHomeFeed,
  getLibrary,
  getPlaylistDetails,
  searchMusic,
  resolveTrackAudio
};
