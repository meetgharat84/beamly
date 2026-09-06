// Synced lyrics service interfacing with lrclib.net

function parseLrc(lrcContent) {
  if (!lrcContent || typeof lrcContent !== 'string') return [];

  const lines = lrcContent.split('\n');
  const parsed = [];
  // Regex to match [mm:ss.xx] or [mm:ss.xxx]
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
        time: timeInSeconds,
        text: text
      });
    }
  }

  // Sort chronologically
  return parsed.sort((a, b) => a.time - b.time);
}

async function fetchLyrics(trackName, artistName, duration) {
  if (!trackName) return { synced: [], plain: '', error: 'Missing track name' };

  const cleanTrack = trackName.replace(/\(.*\)|\[.*\]/g, '').trim();
  const cleanArtist = (artistName || '').replace(/,\s*.*/, '').trim();
  const dur = Math.round(Number(duration) || 0);

  // 1. Try exact endpoint: /api/get
  try {
    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (dur > 0) {
      url += `&duration=${dur}`;
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Beamly Music Player (https://github.com/Beamly)'
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        return {
          synced: parseLrc(data.syncedLyrics),
          plain: data.plainLyrics || '',
          rawLrc: data.syncedLyrics,
          syncedLyrics: data.syncedLyrics,
          plainLyrics: data.plainLyrics || ''
        };
      }
      if (data.plainLyrics) {
        return {
          synced: [],
          plain: data.plainLyrics,
          rawLrc: '',
          syncedLyrics: '',
          plainLyrics: data.plainLyrics
        };
      }
    }
  } catch (err) {
    console.warn('Exact LRCLIB search error:', err.message);
  }

  // 2. Fallback search endpoint: /api/search?q=...
  try {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTrack} ${cleanArtist}`)}`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Beamly Music Player (https://github.com/Beamly)'
      }
    });

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const itemWithSynced = results.find(r => r.syncedLyrics) || results[0];
        return {
          synced: itemWithSynced.syncedLyrics ? parseLrc(itemWithSynced.syncedLyrics) : [],
          plain: itemWithSynced.plainLyrics || '',
          rawLrc: itemWithSynced.syncedLyrics || '',
          syncedLyrics: itemWithSynced.syncedLyrics || '',
          plainLyrics: itemWithSynced.plainLyrics || ''
        };
      }
    }
  } catch (err) {
    console.warn('Fallback LRCLIB search error:', err.message);
  }

  return { synced: [], plain: '', rawLrc: '', syncedLyrics: '', plainLyrics: '', error: 'No lyrics found for this song.' };
}

module.exports = {
  fetchLyrics,
  parseLrc
};
