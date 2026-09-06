const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('./db');
const youtubeResolver = require('./youtubeResolver');

function getDownloadsDir() {
  let baseDir = __dirname;
  try {
    if (app && typeof app.getPath === 'function') {
      baseDir = app.getPath('userData');
    }
  } catch (e) {}

  const downloadsDir = path.join(baseDir, 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  return downloadsDir;
}

async function downloadTrack(track, onProgress = null) {
  if (!track || (!track.id && !track.yt_video_id)) {
    throw new Error('Track object with a valid ID is required');
  }

  const trackId = track.id || track.yt_video_id;

  // 1. Resolve to a playable YouTube video ID
  const resolved = await youtubeResolver.resolveTrackAudio(track);
  const videoId = resolved.yt_video_id || trackId;

  if (!videoId || !youtubeResolver.isPlayableVideoId(videoId)) {
    throw new Error(`Could not resolve a playable YouTube video for "${track.title}"`);
  }

  // 2. Obtain stream from youtubeResolver
  const { stream, contentType } = await youtubeResolver.getAudioDownloadStream(videoId);
  const ext = contentType && contentType.includes('mp4') ? 'm4a' : 'webm';

  const downloadsDir = getDownloadsDir();
  const filePath = path.join(downloadsDir, `${trackId}.${ext}`);
  const fileWriteStream = fs.createWriteStream(filePath);

  console.log(`Starting offline download for track "${track.title}" (${trackId}) -> ${filePath}...`);

  let totalBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.from(chunk);
    fileWriteStream.write(buf);
    totalBytes += buf.length;
    if (onProgress) {
      onProgress(totalBytes);
    }
  }

  await new Promise((resolve, reject) => {
    fileWriteStream.end(() => resolve());
    fileWriteStream.on('error', reject);
  });

  console.log(`Finished offline download: ${totalBytes} bytes written.`);

  // 3. Save to database
  const offlineTrackData = {
    ...track,
    id: trackId,
    yt_video_id: videoId
  };
  db.saveOfflineTrack(offlineTrackData, filePath, totalBytes);

  return {
    success: true,
    localPath: filePath,
    fileSize: totalBytes,
    track: {
      ...offlineTrackData,
      local_path: filePath,
      isOffline: true
    }
  };
}

function deleteDownloadedTrack(trackId) {
  if (!trackId) return { success: false };

  const existing = db.getOfflineTrack(trackId);
  if (existing && existing.local_path && fs.existsSync(existing.local_path)) {
    try {
      fs.unlinkSync(existing.local_path);
    } catch (err) {
      console.warn('Could not delete physical offline file:', err.message);
    }
  }

  db.deleteOfflineTrack(trackId);
  return { success: true };
}

function isTrackDownloaded(trackId) {
  const existing = db.getOfflineTrack(trackId);
  if (!existing) return false;
  return fs.existsSync(existing.local_path);
}

module.exports = {
  getDownloadsDir,
  downloadTrack,
  deleteDownloadedTrack,
  isTrackDownloaded
};
