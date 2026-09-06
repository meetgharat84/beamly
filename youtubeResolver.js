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

// Helper utility: Upgrade low-res thumbnail URLs to crisp high-res dimensions (=w540-h540 / maxresdefault)
function getHighResThumbnail(url) {
  if (!url || typeof url !== 'string') return url;

  let transformed = url;

  // 1. Google / YouTube Music Usercontent Images (lh3.googleusercontent.com, yt3.ggpht.com, etc.)
  if (/googleusercontent\.com|ggpht\.com/i.test(transformed)) {
    if (/=w\d+-h\d+/i.test(transformed)) {
      transformed = transformed.replace(/=w\d+-h\d+[^?#]*/i, '=w540-h540-l90-rj');
    } else if (/=s\d+/i.test(transformed)) {
      transformed = transformed.replace(/=s\d+[^?#]*/i, '=w540-h540-l90-rj');
    }
  }

  // 2. Standard YouTube Video Thumbnail URLs (default.jpg, hqdefault.jpg -> maxresdefault.jpg)
  if (/(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/[^/]+\/(?:default|hqdefault|mqdefault|sddefault)\.jpg/i.test(transformed)) {
    transformed = transformed.replace(/(?:default|hqdefault|mqdefault|sddefault)\.jpg/i, 'maxresdefault.jpg');
  }

  return transformed;
}

// Universal thumbnail URL extractor across all youtubei.js response variations with high-res resolution
function extractThumbnailUrl(item) {
  if (!item) return '';
  let rawUrl = '';

  if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
    const valid = item.thumbnail.slice().reverse().find(t => t && t.url);
    if (valid) rawUrl = valid.url;
  } else if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
    const valid = item.thumbnails.slice().reverse().find(t => t && t.url);
    if (valid) rawUrl = valid.url;
  } else if (item.thumbnail && Array.isArray(item.thumbnail.contents) && item.thumbnail.contents.length > 0) {
    const valid = item.thumbnail.contents.slice().reverse().find(t => t && t.url);
    if (valid) rawUrl = valid.url;
  } else if (item.thumbnail && typeof item.thumbnail.url === 'string') {
    rawUrl = item.thumbnail.url;
  } else if (typeof item.thumbnail === 'string') {
    rawUrl = item.thumbnail;
  } else if (item.thumbnails && typeof item.thumbnails.url === 'string') {
    rawUrl = item.thumbnails.url;
  } else if (typeof item.artwork === 'string') {
    rawUrl = item.artwork;
  }

  return getHighResThumbnail(rawUrl);
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

// In-memory caches with automatic TTL for sub-500ms performance
const searchCache = new Map(); // key -> { data, timestamp }
const suggestionsCache = new Map();
const moodFeedCache = new Map();
const activeSearchContinuations = new Map(); // searchSessionId -> { continuation, query, type, seenTrackIds, timestamp }

const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;      // 15 minutes
const SUGGESTIONS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MOOD_FEED_CACHE_TTL_MS = 20 * 60 * 1000;   // 20 minutes
const CONTINUATION_TTL_MS = 20 * 60 * 1000;      // 20 minutes

function cleanupExpiredContinuations() {
  const now = Date.now();
  for (const [id, data] of activeSearchContinuations.entries()) {
    if (now - data.timestamp > CONTINUATION_TTL_MS) {
      activeSearchContinuations.delete(id);
    }
  }
}

// ---------------- Pure YouTube Music Search (Songs, Albums, Artists) ----------------
async function searchMusic(queryOrOptions, type = 'all') {
  let query = '';
  let searchType = type;

  if (typeof queryOrOptions === 'object' && queryOrOptions !== null) {
    query = queryOrOptions.query || '';
    searchType = queryOrOptions.type || type || 'all';
  } else {
    query = queryOrOptions || '';
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    const emptyArray = [];
    emptyArray.tracks = [];
    emptyArray.albums = [];
    emptyArray.artists = [];
    emptyArray.searchSessionId = null;
    emptyArray.hasMore = false;
    return emptyArray;
  }

  const trimmed = query.trim();
  const normalizedType = String(searchType || 'all').toLowerCase();
  const cacheKey = `${normalizedType}:${trimmed.toLowerCase()}`;

  // Check In-Memory Cache for sub-500ms (instant < 10ms) responses
  const cached = searchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS)) {
    return cached.data;
  }

  const tracks = [];
  const albums = [];
  const artists = [];
  const seenTrackIds = new Set();
  const seenAlbumIds = new Set();
  const seenArtistIds = new Set();
  let didYouMean = null;
  let lastContinuation = null;

  try {
    const yt = await getInnertube();

    // Helper: Parse track items from YTM search response with broader, resilient parsing
    const parseSongItems = (contents, markOfficial = true) => {
      if (!contents) return;
      const sections = Array.isArray(contents)
        ? contents
        : (contents.contents ? (Array.isArray(contents.contents) ? contents.contents : [contents.contents]) : [contents]);

      for (const section of sections) {
        const items = Array.isArray(section.contents)
          ? section.contents
          : (Array.isArray(section.items) ? section.items : (section.type === 'MusicResponsiveListItem' ? [section] : [section]));

        for (const item of items) {
          if (!item) continue;
          const itemId = item.id || item.video_id || item.endpoint?.payload?.videoId || item.overlay?.content?.endpoint?.payload?.videoId;
          if (itemId && isPlayableVideoId(itemId) && !seenTrackIds.has(itemId)) {
            let rawDuration = 0;
            if (item.duration?.seconds) {
              rawDuration = item.duration.seconds;
            } else if (typeof item.duration === 'number') {
              rawDuration = item.duration;
            } else if (typeof item.duration?.text === 'string') {
              const parts = item.duration.text.split(':').map(Number);
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                rawDuration = parts[0] * 60 + parts[1];
              } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                rawDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }

            // Broader Result Parsing: Only filter out extreme non-music clutter (e.g., > 30 mins) unless explicitly requested
            const hasMixIntent = /\b(mix|set|compilation|hours|hour|podcast|full)\b/i.test(trimmed);
            if (!hasMixIntent && rawDuration > 30 * 60) {
              continue;
            }

            seenTrackIds.add(itemId);
            const thumbUrl = extractThumbnailUrl(item);

            let artistName = '';
            if (Array.isArray(item.artists)) {
              artistName = item.artists.map(a => a.name || a.text || (typeof a === 'string' ? a : '')).filter(Boolean).join(', ');
            } else if (item.artists && typeof item.artists === 'object') {
              artistName = item.artists.name || item.artists.text || '';
            } else if (typeof item.artists === 'string') {
              artistName = item.artists;
            } else if (item.author?.name) {
              artistName = item.author.name;
            } else if (Array.isArray(item.authors)) {
              artistName = item.authors.map(a => a.name || a.text).filter(Boolean).join(', ');
            }

            let albumName = 'Single';
            if (item.album) {
              albumName = item.album.name || item.album.title || item.album.text || 'Single';
            }

            const titleStr = item.title?.text || (Array.isArray(item.title?.runs) ? item.title.runs.map(r => r.text).join('') : '') || item.title?.toString() || item.headline?.text || item.name || 'Unknown Title';

            tracks.push({
              id: itemId,
              yt_video_id: itemId,
              title: titleStr,
              artist: artistName || 'Unknown Artist',
              artists: artistName ? [artistName] : [],
              album: albumName,
              duration: rawDuration,
              artwork: thumbUrl,
              isOfficialSong: markOfficial
            });
          }
        }
      }
    };

    // 1. If type is 'all' or 'songs' or 'song' -> Prioritize official songs & auto-fetch initial 25-35+ batch
    if (normalizedType === 'all' || normalizedType === 'songs' || normalizedType === 'song') {
      try {
        const songRes = await yt.music.search(trimmed, { type: 'song' });
        if (songRes && songRes.contents) {
          parseSongItems(songRes.contents, true);
        }
        lastContinuation = songRes;

        // Automatically fetch page 2 immediately if continuation is available so initial batch is 25-35+ tracks!
        if (songRes?.has_continuation) {
          try {
            const page2 = await songRes.getContinuation();
            if (page2 && page2.contents) {
              parseSongItems(page2.contents, true);
              lastContinuation = page2;
            }
          } catch (contErr) {
            console.warn('[SEARCH] Initial continuation fetch error:', contErr.message);
          }
        }
      } catch (songErr) {
        console.warn('yt.music.search for songs error:', songErr.message);
      }
    }

    // 2. If type is 'all' or 'albums' or 'album'
    if (normalizedType === 'all' || normalizedType === 'albums' || normalizedType === 'album') {
      try {
        const albumRes = await yt.music.search(trimmed, { type: 'album' });
        if (albumRes && Array.isArray(albumRes.contents)) {
          for (const section of albumRes.contents) {
            const items = Array.isArray(section.contents) ? section.contents : (Array.isArray(section.items) ? section.items : [section]);
            for (const item of items) {
              const albumId = item.id || item.playlist_id;
              if (albumId && !seenAlbumIds.has(albumId)) {
                seenAlbumIds.add(albumId);
                const thumbUrl = extractThumbnailUrl(item);
                const artistName = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name || a.text || a).join(', ') : item.artists) : (item.author?.name || '');
                albums.push({
                  id: albumId,
                  name: item.title?.text || item.title?.toString() || 'Album',
                  title: item.title?.text || item.title?.toString() || 'Album',
                  artist: artistName || '',
                  year: item.year?.text || item.year || '',
                  artwork: thumbUrl,
                  type: 'album'
                });
              }
            }
          }
        }
      } catch (albumErr) {
        console.warn('yt.music.search for albums error:', albumErr.message);
      }
    }

    // 3. If type is 'all' or 'artists' or 'artist'
    if (normalizedType === 'all' || normalizedType === 'artists' || normalizedType === 'artist') {
      try {
        const artistRes = await yt.music.search(trimmed, { type: 'artist' });
        if (artistRes && Array.isArray(artistRes.contents)) {
          for (const section of artistRes.contents) {
            const items = Array.isArray(section.contents) ? section.contents : (Array.isArray(section.items) ? section.items : [section]);
            for (const item of items) {
              const artistId = item.id || item.channel_id;
              if (artistId && !seenArtistIds.has(artistId)) {
                seenArtistIds.add(artistId);
                const thumbUrl = extractThumbnailUrl(item);
                const name = item.name?.text || item.name?.toString() || item.title?.text || item.title?.toString() || 'Artist';
                artists.push({
                  id: artistId,
                  name: name,
                  title: name,
                  subscribers: item.subscribers?.text || '',
                  artwork: thumbUrl,
                  type: 'artist'
                });
              }
            }
          }
        }
      } catch (artistErr) {
        console.warn('yt.music.search for artists error:', artistErr.message);
      }
    }

    // 4. Fuzzy Search & Typo Resilience: If results are empty or very low (< 2 tracks)
    if (tracks.length < 2 && (normalizedType === 'all' || normalizedType === 'songs' || normalizedType === 'song')) {
      try {
        const typoSuggestions = await yt.getSearchSuggestions(trimmed);
        if (Array.isArray(typoSuggestions) && typoSuggestions.length > 0) {
          // Find the best alternative suggestion that is not identical to the query
          const altSuggestion = typoSuggestions.find(s => typeof s === 'string' && s.trim().toLowerCase() !== trimmed.toLowerCase());
          if (altSuggestion) {
            console.log(`[RESOLVER] Typo resilience triggered for "${trimmed}" -> retrying with "${altSuggestion}"`);
            const retryRes = await yt.music.search(altSuggestion.trim(), { type: 'song' });
            if (retryRes && Array.isArray(retryRes.contents)) {
              parseSongItems(retryRes.contents, true);
              if (tracks.length > 0) {
                didYouMean = altSuggestion.trim();
              }
            }
          }
        }
      } catch (typoErr) {
        console.warn('[RESOLVER] Typo suggestions check failed:', typoErr.message);
      }
    }

    // 5. General fallback if still empty
    if (tracks.length === 0 && (normalizedType === 'all' || normalizedType === 'songs' || normalizedType === 'song')) {
      try {
        const generalRes = await yt.music.search(trimmed);
        if (generalRes && generalRes.contents) {
          for (const section of generalRes.contents) {
            const items = section.contents || (section.type === 'MusicResponsiveListItem' ? [section] : []);
            for (const item of items) {
              const itemId = item.id || item.video_id;
              if (itemId && isPlayableVideoId(itemId) && !seenTrackIds.has(itemId)) {
                seenTrackIds.add(itemId);
                const thumbUrl = extractThumbnailUrl(item);
                const artistName = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : item.artists) : (item.author?.name || '');
                tracks.push({
                  id: itemId,
                  yt_video_id: itemId,
                  title: item.title?.text || item.title?.toString() || 'Unknown Title',
                  artist: artistName || 'Unknown Artist',
                  artists: artistName ? [artistName] : [],
                  album: item.album?.name || 'Single',
                  duration: item.duration?.seconds || 0,
                  artwork: thumbUrl,
                  isOfficialSong: false
                });
              }
            }
          }
        }
      } catch (genErr) {
        console.warn('General yt.music.search fallback error:', genErr.message);
      }
    }

    let searchSessionId = null;
    if (lastContinuation && lastContinuation.has_continuation) {
      cleanupExpiredContinuations();
      searchSessionId = 'search_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      activeSearchContinuations.set(searchSessionId, {
        continuation: lastContinuation,
        query: trimmed,
        type: normalizedType,
        seenTrackIds: new Set(seenTrackIds),
        timestamp: Date.now()
      });
    }

    // Array-like wrapper for backwards compatibility
    const responseArray = [...tracks];
    responseArray.tracks = tracks;
    responseArray.albums = albums;
    responseArray.artists = artists;
    responseArray.didYouMean = didYouMean;
    responseArray.searchSessionId = searchSessionId;
    responseArray.hasMore = Boolean(lastContinuation && lastContinuation.has_continuation);

    // Cache the response
    searchCache.set(cacheKey, { data: responseArray, timestamp: Date.now() });

    return responseArray;
  } catch (err) {
    console.error('searchMusic error:', err);
    const emptyArray = [];
    emptyArray.tracks = [];
    emptyArray.albums = [];
    emptyArray.artists = [];
    emptyArray.didYouMean = null;
    emptyArray.searchSessionId = null;
    emptyArray.hasMore = false;
    return emptyArray;
  }
}

// ---------------- Infinite Scroll Subsequent Batch Loader ----------------
async function searchMore(searchSessionId) {
  if (!searchSessionId || !activeSearchContinuations.has(searchSessionId)) {
    return { tracks: [], hasMore: false, searchSessionId };
  }

  const session = activeSearchContinuations.get(searchSessionId);
  const { continuation, seenTrackIds, query } = session;

  if (!continuation || !continuation.has_continuation) {
    activeSearchContinuations.delete(searchSessionId);
    return { tracks: [], hasMore: false, searchSessionId };
  }

  try {
    const nextContinuation = await continuation.getContinuation();
    const newTracks = [];

    const parseNextItems = (contents) => {
      if (!contents) return;
      const sections = Array.isArray(contents)
        ? contents
        : (contents.contents ? (Array.isArray(contents.contents) ? contents.contents : [contents.contents]) : [contents]);

      for (const section of sections) {
        const items = Array.isArray(section.contents)
          ? section.contents
          : (Array.isArray(section.items) ? section.items : (section.type === 'MusicResponsiveListItem' ? [section] : [section]));

        for (const item of items) {
          if (!item) continue;
          const itemId = item.id || item.video_id || item.endpoint?.payload?.videoId || item.overlay?.content?.endpoint?.payload?.videoId;
          if (itemId && isPlayableVideoId(itemId) && !seenTrackIds.has(itemId)) {
            let rawDuration = 0;
            if (item.duration?.seconds) {
              rawDuration = item.duration.seconds;
            } else if (typeof item.duration === 'number') {
              rawDuration = item.duration;
            } else if (typeof item.duration?.text === 'string') {
              const parts = item.duration.text.split(':').map(Number);
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                rawDuration = parts[0] * 60 + parts[1];
              } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                rawDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }

            const hasMixIntent = /\b(mix|set|compilation|hours|hour|podcast|full)\b/i.test(query);
            if (!hasMixIntent && rawDuration > 30 * 60) {
              continue;
            }

            seenTrackIds.add(itemId);
            const thumbUrl = extractThumbnailUrl(item);

            let artistName = '';
            if (Array.isArray(item.artists)) {
              artistName = item.artists.map(a => a.name || a.text || (typeof a === 'string' ? a : '')).filter(Boolean).join(', ');
            } else if (item.artists && typeof item.artists === 'object') {
              artistName = item.artists.name || item.artists.text || '';
            } else if (typeof item.artists === 'string') {
              artistName = item.artists;
            } else if (item.author?.name) {
              artistName = item.author.name;
            } else if (Array.isArray(item.authors)) {
              artistName = item.authors.map(a => a.name || a.text).filter(Boolean).join(', ');
            }

            let albumName = 'Single';
            if (item.album) {
              albumName = item.album.name || item.album.title || item.album.text || 'Single';
            }

            const titleStr = item.title?.text || (Array.isArray(item.title?.runs) ? item.title.runs.map(r => r.text).join('') : '') || item.title?.toString() || item.headline?.text || item.name || 'Unknown Title';

            newTracks.push({
              id: itemId,
              yt_video_id: itemId,
              title: titleStr,
              artist: artistName || 'Unknown Artist',
              artists: artistName ? [artistName] : [],
              album: albumName,
              duration: rawDuration,
              artwork: thumbUrl,
              isOfficialSong: true
            });
          }
        }
      }
    };

    if (nextContinuation && nextContinuation.contents) {
      parseNextItems(nextContinuation.contents);
    }

    const hasMore = Boolean(nextContinuation && nextContinuation.has_continuation);
    if (hasMore) {
      session.continuation = nextContinuation;
      session.timestamp = Date.now();
    } else {
      activeSearchContinuations.delete(searchSessionId);
    }

    return {
      tracks: newTracks,
      hasMore,
      searchSessionId
    };
  } catch (err) {
    console.error(`[RESOLVER] searchMore failed for session ${searchSessionId}:`, err.message);
    activeSearchContinuations.delete(searchSessionId);
    return { tracks: [], hasMore: false, searchSessionId };
  }
}

// ---------------- Live Search Suggestions & Autocomplete ----------------
async function getSearchSuggestions(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { queries: [], entities: [] };
  }

  const trimmed = query.trim();
  const cacheKey = trimmed.toLowerCase();
  const cached = suggestionsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < SUGGESTIONS_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const yt = await getInnertube();
    const [textRes, musicRes] = await Promise.allSettled([
      yt.getSearchSuggestions(trimmed),
      yt.music.getSearchSuggestions(trimmed)
    ]);

    const queries = [];
    if (textRes.status === 'fulfilled' && Array.isArray(textRes.value)) {
      textRes.value.forEach(q => {
        if (typeof q === 'string' && q.trim() && !queries.includes(q.trim())) {
          queries.push(q.trim());
        }
      });
    }

    const entities = [];
    const seenEntityIds = new Set();
    if (musicRes.status === 'fulfilled' && Array.isArray(musicRes.value)) {
      for (const section of musicRes.value) {
        const items = section.contents || [];
        for (const item of items) {
          // Check query suggestion
          const suggText = item.suggestion?.text || item.endpoint?.payload?.query;
          if (suggText && typeof suggText === 'string' && !queries.includes(suggText.trim())) {
            queries.push(suggText.trim());
          }

          // Check direct entity match (song, artist, album)
          const entityId = item.id || item.video_id;
          if (entityId && !seenEntityIds.has(entityId)) {
            seenEntityIds.add(entityId);
            const title = item.title?.text || item.title?.toString() || item.name?.text || item.name?.toString() || '';
            const artist = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : item.artists) : (item.author?.name || '');
            let type = item.item_type || (item.artists ? 'song' : (item.subscribers ? 'artist' : 'album'));
            if (isPlayableVideoId(entityId)) type = 'song';

            const thumb = extractThumbnailUrl(item);

            entities.push({
              id: entityId,
              yt_video_id: entityId,
              title: title || (type === 'artist' ? artist : 'Unknown Item'),
              artist: artist || (type === 'artist' ? title : ''),
              album: item.album?.name || '',
              duration: item.duration?.seconds || 0,
              artwork: thumb,
              type: type || 'song'
            });
          }
        }
      }
    }

    const result = {
      queries: queries.slice(0, 8),
      entities: entities.slice(0, 5)
    };

    suggestionsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error('getSearchSuggestions error:', err.message);
    return { queries: [], entities: [] };
  }
}

// ---------------- Context-Aware Native YTM Radio / Up-Next Queue ----------------
async function getRelatedTracks(videoId) {
  if (!videoId || !isPlayableVideoId(videoId)) return [];

  try {
    const yt = await getInnertube();
    const related = [];
    const seen = new Set([videoId]);

    // 1. Primary: Native YouTube Music Up Next Endpoint
    try {
      const upNext = await yt.music.getUpNext(videoId);
      if (upNext && Array.isArray(upNext.contents) && upNext.contents.length > 0) {
        for (const item of upNext.contents) {
          const vId = item.video_id || item.id;
          if (vId && isPlayableVideoId(vId) && !seen.has(vId)) {
            seen.add(vId);
            const title = item.title?.text || item.title?.runs?.[0]?.text || item.title?.toString() || 'Track';
            const artist = item.author || (item.artists?.[0]?.name) || 'Artist';
            const album = item.album?.name || 'YouTube Music';
            const durationSec = item.duration?.seconds || 0;
            const thumb = (item.thumbnail && Array.isArray(item.thumbnail) && item.thumbnail.length > 0)
              ? item.thumbnail[item.thumbnail.length - 1].url
              : extractThumbnailUrl(item);

            related.push({
              id: vId,
              yt_video_id: vId,
              title,
              artist,
              artists: [artist],
              album,
              duration: durationSec,
              artwork: thumb,
              isRelatedAutoplay: true
            });
          }
        }
      }
    } catch (upNextErr) {
      console.warn(`[RESOLVER] yt.music.getUpNext failed for ${videoId}:`, upNextErr.message);
    }

    // 2. Fallback: InnerTube /next action endpoint
    if (related.length === 0) {
      try {
        const radioRes = await yt.actions.execute('/next', {
          client: 'YTMUSIC',
          videoId: videoId,
          playlistId: 'RDAMVM' + videoId
        });

        const queueRenderer = radioRes.data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer;
        const items = queueRenderer?.content?.playlistPanelRenderer?.contents || [];

        for (const item of items) {
          const v = item.playlistPanelVideoRenderer;
          if (v && v.videoId && isPlayableVideoId(v.videoId) && !seen.has(v.videoId)) {
            seen.add(v.videoId);
            const title = v.title?.runs?.[0]?.text || v.title?.text || 'Track';
            const artist = v.shortBylineText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || 'Artist';
            const album = v.longBylineText?.runs?.[2]?.text || 'YouTube Music';

            let durationSec = 0;
            const durationStr = v.lengthText?.runs?.[0]?.text || '';
            if (durationStr) {
              const parts = durationStr.split(':').map(Number);
              if (parts.length === 2) durationSec = (parts[0] * 60) + parts[1];
              else if (parts.length === 3) durationSec = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
            }

            const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || (v.thumbnail?.thumbnails?.[0]?.url || '');

            related.push({
              id: v.videoId,
              yt_video_id: v.videoId,
              title,
              artist,
              artists: [artist],
              album,
              duration: durationSec,
              artwork: thumb,
              isRelatedAutoplay: true
            });
          }
        }
      } catch (nextErr) {
        console.warn(`[RESOLVER] /next fallback failed for ${videoId}:`, nextErr.message);
      }
    }

    return related;
  } catch (err) {
    console.error(`getRelatedTracks error for ${videoId}:`, err.message);
    return [];
  }
}

// ---------------- Curated Mood Feeds (Chill, Focus, Workout, etc.) ----------------
async function getMoodFeed(mood = 'Chill') {
  const normMood = (mood || 'Chill').trim();
  const cacheKey = normMood.toLowerCase();
  const cached = moodFeedCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < MOOD_FEED_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const yt = await getInnertube();
    const [playlistRes, songRes] = await Promise.allSettled([
      yt.music.search(`${normMood} Music`, { type: 'playlist' }),
      yt.music.search(`${normMood} Songs`, { type: 'song' })
    ]);

    const playlists = [];
    const seenPlIds = new Set();
    if (playlistRes.status === 'fulfilled' && playlistRes.value?.contents) {
      for (const sec of playlistRes.value.contents) {
        const items = sec.contents || (Array.isArray(sec) ? sec : [sec]);
        for (const it of items) {
          const plId = it.id || it.playlist_id;
          if (plId && !seenPlIds.has(plId)) {
            seenPlIds.add(plId);
            playlists.push({
              id: plId,
              name: it.title?.text || it.title?.toString() || `${normMood} Playlist`,
              description: it.author?.name || it.author?.toString() || `${normMood} collection`,
              artwork: extractThumbnailUrl(it),
              owner: it.author?.name || 'YouTube Music'
            });
          }
        }
      }
    }

    const tracks = [];
    const seenTrackIds = new Set();
    if (songRes.status === 'fulfilled' && songRes.value?.contents) {
      for (const sec of songRes.value.contents) {
        const items = sec.contents || (Array.isArray(sec) ? sec : [sec]);
        for (const it of items) {
          const tId = it.id || it.video_id;
          if (tId && isPlayableVideoId(tId) && !seenTrackIds.has(tId)) {
            seenTrackIds.add(tId);
            const artistStr = it.artists ? (Array.isArray(it.artists) ? it.artists.map(a => a.name).join(', ') : it.artists) : (it.author?.name || '');
            tracks.push({
              id: tId,
              yt_video_id: tId,
              title: it.title?.text || it.title?.toString() || 'Track',
              artist: artistStr,
              artists: [artistStr],
              album: it.album?.name || `${normMood} Mix`,
              duration: it.duration?.seconds || 0,
              artwork: extractThumbnailUrl(it)
            });
          }
        }
      }
    }

    const result = {
      mood: normMood,
      playlists: playlists.slice(0, 16),
      tracks: tracks.slice(0, 20)
    };

    moodFeedCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error(`getMoodFeed(${mood}) error:`, err.message);
    return { mood: normMood, playlists: [], tracks: [] };
  }
}

// ---------------- Curated Home Recommendations ----------------
async function getCuratedHome() {
  try {
    const yt = await getInnertube();
    const lastPlayed = db.getLastPlayedTrack();

    let similarSection = {
      title: lastPlayed ? `Similar to "${lastPlayed.title}"` : 'Recommended For You',
      seedTrack: lastPlayed || null,
      tracks: []
    };

    // 1. Fetch Similar to Last Played (or seed track)
    const seedVideoId = lastPlayed?.id || lastPlayed?.yt_video_id;
    if (seedVideoId && isPlayableVideoId(seedVideoId)) {
      try {
        const related = await getRelatedTracks(seedVideoId);
        similarSection.tracks = related.slice(0, 20);
      } catch (relErr) {
        console.warn('Similar to last played fetch error:', relErr.message);
      }
    }

    // 2. Fetch Top Charts & Trending
    let topChartsTracks = [];
    let trendingTracks = [];
    let topArtists = [];
    let curatedPlaylists = [];

    // Explore: Trending
    try {
      const explore = await yt.music.getExplore();
      if (explore && Array.isArray(explore.sections)) {
        for (const sec of explore.sections) {
          const title = (sec.title?.text || sec.header?.title?.text || '').toLowerCase();
          const items = sec.contents || sec.items || [];
          if (title.includes('trending') || title.includes('hot')) {
            for (const item of items) {
              if (item.id && isPlayableVideoId(item.id)) {
                const artistStr = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : item.artists) : (item.author?.name || '');
                trendingTracks.push({
                  id: item.id,
                  yt_video_id: item.id,
                  title: item.title?.text || item.title?.toString() || 'Track',
                  artist: artistStr,
                  artists: [artistStr],
                  album: item.album?.name || 'Trending',
                  duration: item.duration?.seconds || 0,
                  artwork: extractThumbnailUrl(item)
                });
              }
            }
          }
        }
      }
    } catch (expErr) {
      console.warn('Explore fetch in curated home:', expErr.message);
    }

    // Home feed: Charts & Top tracks
    try {
      const home = await yt.music.getHomeFeed();
      if (home && home.sections) {
        for (const sec of home.sections) {
          const secTitle = sec.title?.text || sec.header?.title?.text || '';
          const items = sec.contents || [];
          for (const item of items) {
            const thumb = extractThumbnailUrl(item);
            const isSong = item.id && isPlayableVideoId(item.id);
            if (isSong) {
              const artistStr = item.artists ? (Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : item.artists) : (item.author?.name || '');
              const trackObj = {
                id: item.id,
                yt_video_id: item.id,
                title: item.title?.text || item.title?.toString() || 'Track',
                artist: artistStr,
                artists: [artistStr],
                album: item.album?.name || 'Top Hit',
                duration: item.duration?.seconds || 0,
                artwork: thumb
              };
              if (topChartsTracks.length < 24) {
                topChartsTracks.push(trackObj);
              }
              if (artistStr && !topArtists.some(a => a.name === artistStr)) {
                topArtists.push({ name: artistStr, artwork: thumb });
              }
            } else if (item.id && !item.id.startsWith('MPREb_')) {
              if (!curatedPlaylists.some(p => p.id === item.id)) {
                curatedPlaylists.push({
                  id: item.id,
                  name: item.title?.text || item.title?.toString() || 'Playlist',
                  description: secTitle,
                  artwork: thumb,
                  owner: 'YouTube Music'
                });
              }
            }
          }
        }
      }
    } catch (homeErr) {
      console.warn('Home feed fetch in curated home:', homeErr.message);
    }

    // If similarSection had no seed track, seed from the first top chart track
    if (similarSection.tracks.length === 0 && topChartsTracks.length > 0) {
      const seed = topChartsTracks[0];
      similarSection.title = `Similar to "${seed.title}"`;
      similarSection.seedTrack = seed;
      try {
        const related = await getRelatedTracks(seed.id);
        similarSection.tracks = related.slice(0, 20);
      } catch (e) {}
    }

    // Fallback if trending was empty
    if (trendingTracks.length === 0) {
      trendingTracks = topChartsTracks.slice(10, 24);
    }

    return {
      similarSection,
      topCharts: topChartsTracks.slice(0, 20),
      trending: trendingTracks.slice(0, 20),
      topArtists: topArtists.slice(0, 15),
      playlists: curatedPlaylists.slice(0, 20)
    };
  } catch (err) {
    console.error('getCuratedHome error:', err);
    return {
      similarSection: { title: 'Recommended For You', seedTrack: null, tracks: [] },
      topCharts: [],
      trending: [],
      topArtists: [],
      playlists: []
    };
  }
}

// ---------------- Import Playlist From YouTube / YouTube Music URL ----------------
function extractPlaylistIdFromUrl(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const str = urlOrId.trim();

  // Try parsing as standard URL first
  try {
    const urlObj = new URL(str.startsWith('http') ? str : `https://${str}`);
    const listParam = urlObj.searchParams.get('list');
    if (listParam && /^[a-zA-Z0-9_-]{8,}$/.test(listParam)) {
      return listParam;
    }
  } catch (e) {}

  // Regex fallback: URL or query string with list=...
  const listMatch = str.match(/[?&]?list=([a-zA-Z0-9_-]+)/i);
  if (listMatch && listMatch[1]) {
    return listMatch[1];
  }

  // Direct raw playlist ID (e.g., PL..., RD..., VL..., OLAK5uy_...)
  if (/^[a-zA-Z0-9_-]{8,}$/.test(str)) {
    return str;
  }

  return null;
}

async function importPlaylistFromUrl(urlOrId) {
  console.log('[RESOLVER] importPlaylistFromUrl received input:', urlOrId);
  const playlistId = extractPlaylistIdFromUrl(urlOrId);
  if (!playlistId) {
    throw new Error('Invalid YouTube or YouTube Music playlist link or ID. Please provide a link with ?list=... or a playlist ID.');
  }

  console.log('[RESOLVER] Extracted playlist ID:', playlistId);
  const details = await getPlaylistDetails(playlistId);
  if (!details) {
    throw new Error(`Could not load playlist "${playlistId}". Please check that the playlist is public or unlisted.`);
  }

  console.log(`[RESOLVER] Successfully resolved "${details.title}" with ${details.tracks?.length || 0} tracks.`);
  return details;
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
  getHighResThumbnail,
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
  searchMore,
  getSearchSuggestions,
  getRelatedTracks,
  getMoodFeed,
  getCuratedHome,
  extractPlaylistIdFromUrl,
  importPlaylistFromUrl,
  resolveTrackAudio
};
