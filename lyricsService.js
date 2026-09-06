// Synced lyrics service interfacing with lrclib.net

/**
 * Clean track title by stripping extra tags:
 * (Official Video), [Lyrics], (Official Audio), ft. ..., HD, 4K, Visualizer, etc.
 */
function cleanTrackTitle(title) {
  if (!title || typeof title !== 'string') return '';
  let clean = title.trim();

  // Strip common YouTube tags in parentheses or brackets:
  // e.g. (Official Video), [Lyrics], (Official Audio), (HD), (4K), (Visualizer), (Official Music Video), (Lyric Video)
  clean = clean.replace(/\s*[\(\[](?:official\s*(?:video|music\s*video|audio|visualizer|lyric\s*video|stream)?|audio|video|visualizer|lyrics?|hd|4k|remastered|explicit|clean|live|extended)[\)\]]/gi, '');

  // Strip feature tags: (ft. ...), [feat. ...], or trailing ft. ... / feat. ...
  clean = clean.replace(/\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+[^()\]]+[\)\]]/gi, '');
  clean = clean.replace(/\s+\b(?:feat\.?|ft\.?|featuring)\s+.*$/gi, '');

  // Strip extra tags containing common keywords inside brackets
  clean = clean.replace(/\s*[\(\[](?:[^\)\]]*(?:video|audio|visualizer|lyrics|hd|4k|remastered))[^\)\]]*[\)\]]/gi, '');

  // Strip trailing " - Single", " - EP", " - Deluxe", etc.
  clean = clean.replace(/\s*-\s*(?:single|ep|deluxe)$/gi, '');

  // If artist was prepended: "Artist - Title", keep title if it exists
  const dashMatch = clean.match(/^[^-]+-\s*(.+)$/);
  if (dashMatch && dashMatch[1].trim().length > 1) {
    clean = dashMatch[1].trim();
  }

  // Remove empty brackets and multiple spaces
  clean = clean.replace(/\(\s*\)|\[\s*\]/g, '');
  return clean.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Clean artist name by removing featured artists and extracting the primary artist
 */
function cleanArtistName(artist) {
  if (!artist || typeof artist !== 'string') return '';
  let clean = artist.trim();
  clean = clean.replace(/\s*[\(\[](?:feat\.?|ft\.?|featuring)\s+[^()\]]+[\)\]]/gi, '');
  clean = clean.replace(/\s+\b(?:feat\.?|ft\.?|featuring)\s+.*$/gi, '');
  clean = clean.split(/[,&/]/)[0].trim();
  return clean;
}

/**
 * Clean album name
 */
function cleanAlbumName(album) {
  if (!album || typeof album !== 'string') return '';
  let clean = album.trim();
  clean = clean.replace(/\s*[\(\[](?:deluxe|remastered|expanded|anniversary|single|ep)[\)\]]/gi, '');
  return clean.trim();
}

/**
 * Convert seconds or "mm:ss" string to integer seconds
 */
function parseDurationToSeconds(duration) {
  if (typeof duration === 'number') {
    return Math.round(duration > 0 ? duration : 0);
  }
  if (typeof duration === 'string') {
    if (duration.includes(':')) {
      const parts = duration.split(':').map(p => parseFloat(p) || 0);
      if (parts.length === 2) {
        return Math.round(parts[0] * 60 + parts[1]);
      } else if (parts.length === 3) {
        return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
    }
    const num = parseFloat(duration);
    if (!isNaN(num) && num > 0) return Math.round(num);
  }
  return 0;
}

/**
 * LRC Timestamp Parser:
 * Parses [mm:ss.xx] or [mm:ss.xxx] timestamps into an array of { time: seconds, text: string }
 */
function parseLrc(lrcContent) {
  if (!lrcContent || typeof lrcContent !== 'string') return [];

  const lines = lrcContent.split(/\r?\n/);
  const parsed = [];
  // Regex to match [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]
  const lrcRegex = /^\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(lrcRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const timeInSeconds = minutes * 60 + seconds;
      const text = match[3].trim();
      parsed.push({
        time: Math.round(timeInSeconds * 100) / 100,
        text: text
      });
    }
  }

  // Sort chronologically
  return parsed.sort((a, b) => a.time - b.time);
}

/**
 * Fetches lyrics from LRCLIB (https://lrclib.net/api/get) with query parameters:
 * track_name, artist_name, album_name, and duration.
 * Includes resilient multi-tier fallback matching.
 */
async function fetchLyrics(trackName, artistName, duration, albumName) {
  if (!trackName) {
    return {
      synced: [],
      plain: '',
      rawLrc: '',
      syncedLyrics: '',
      plainLyrics: '',
      error: 'No lyrics available for this track'
    };
  }

  const cleanTrack = cleanTrackTitle(trackName);
  const cleanArtist = cleanArtistName(artistName);
  const cleanAlbum = cleanAlbumName(albumName);
  const dur = parseDurationToSeconds(duration);

  const headers = {
    'User-Agent': 'Beamly Music Player (https://github.com/meetgharat84/beamly)'
  };

  // Helper to query LRCLIB /api/get
  const tryGetEndpoint = async (withAlbum = true) => {
    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (withAlbum && cleanAlbum) {
      url += `&album_name=${encodeURIComponent(cleanAlbum)}`;
    }
    if (dur > 0) {
      url += `&duration=${dur}`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        return data;
      }
    }
    return null;
  };

  // 1. Try exact /api/get with album_name if provided
  try {
    if (cleanAlbum) {
      const exactWithAlbum = await tryGetEndpoint(true);
      if (exactWithAlbum) {
        return formatResponse(exactWithAlbum);
      }
    }
  } catch (err) {
    console.warn('LRCLIB /api/get with album failed:', err.message);
  }

  // 2. Try exact /api/get without album_name (matches songs regardless of album edition)
  try {
    const exactWithoutAlbum = await tryGetEndpoint(false);
    if (exactWithoutAlbum) {
      return formatResponse(exactWithoutAlbum);
    }
  } catch (err) {
    console.warn('LRCLIB /api/get without album failed:', err.message);
  }

  // 3. Fallback search endpoint: /api/search?q=...
  try {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTrack} ${cleanArtist}`)}`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000), headers });

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        // Find best match: prioritized with synced lyrics
        const bestMatch = results.find(r => r.syncedLyrics) || results[0];
        if (bestMatch && (bestMatch.syncedLyrics || bestMatch.plainLyrics)) {
          return formatResponse(bestMatch);
        }
      }
    }
  } catch (err) {
    console.warn('LRCLIB /api/search fallback failed:', err.message);
  }

  return {
    synced: [],
    plain: '',
    rawLrc: '',
    syncedLyrics: '',
    plainLyrics: '',
    error: 'No lyrics available for this track'
  };
}

function formatResponse(data) {
  const syncedLrc = data.syncedLyrics || '';
  const plainText = data.plainLyrics || '';
  const parsedSynced = syncedLrc ? parseLrc(syncedLrc) : [];

  return {
    synced: parsedSynced,
    plain: plainText,
    rawLrc: syncedLrc,
    syncedLyrics: syncedLrc,
    plainLyrics: plainText,
    trackName: data.trackName || '',
    artistName: data.artistName || '',
    albumName: data.albumName || '',
    duration: data.duration || 0
  };
}

module.exports = {
  fetchLyrics,
  parseLrc,
  cleanTrackTitle,
  cleanArtistName,
  cleanAlbumName,
  parseDurationToSeconds
};
