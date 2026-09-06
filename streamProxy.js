const express = require('express');
const fs = require('fs');
const { Readable } = require('stream');
const db = require('./db');
const { isPlayableVideoId, getAudioDownloadStream, getAudioStreamUrl, CLIENT_FALLBACK_CHAIN } = require('./youtubeResolver');

let server = null;
let serverPort = 8888;

function startStreamProxy(preferredPort = 8888) {
  if (server) return Promise.resolve(serverPort);

  return new Promise((resolve, reject) => {
    const app = express();

    // CORS & Range headers middleware
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    // 1. Offline Stream Route: /offline/:trackId
    app.get('/offline/:trackId', (req, res) => {
      const trackId = req.params.trackId;
      const offlineTrack = db.getOfflineTrack(trackId);

      if (!offlineTrack || !offlineTrack.local_path || !fs.existsSync(offlineTrack.local_path)) {
        return res.status(404).json({ error: 'Offline file not found' });
      }

      const filePath = offlineTrack.local_path;
      const stat = fs.statSync(filePath);
      const totalSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (start >= totalSize || end >= totalSize) {
          res.status(416).set('Content-Range', `bytes */${totalSize}`);
          return res.end();
        }

        const chunkSize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        const isMp4 = filePath.endsWith('.m4a') || filePath.endsWith('.mp4');
        const offlineContentType = isMp4 ? 'audio/mp4' : 'audio/webm';

        res.status(206).set({
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': offlineContentType
        });

        fileStream.pipe(res);
      } else {
        const isMp4 = filePath.endsWith('.m4a') || filePath.endsWith('.mp4');
        const offlineContentType = isMp4 ? 'audio/mp4' : 'audio/webm';

        res.status(200).set({
          'Content-Length': totalSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': offlineContentType
        });

        fs.createReadStream(filePath).pipe(res);
      }
    });

    // 2. YouTube Audio Stream Route: /stream/:videoId
    app.get('/stream/:videoId', async (req, res) => {
      const videoId = req.params.videoId;

      // Ensure videoId is a valid 11-character YouTube video ID before proceeding
      if (!videoId || !isPlayableVideoId(videoId)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid videoId: "${videoId || ''}". Expected an 11-character YouTube video ID.`
        });
      }

      const clients = CLIENT_FALLBACK_CHAIN || ['ANDROID_MUSIC', 'WEB', 'IOS', 'ANDROID'];
      let lastError = null;

      // Fallback Client Strategy: Try ANDROID_MUSIC -> fallback to WEB or IOS before throwing 403
      for (const client of clients) {
        const abortController = new AbortController();
        const onClose = () => {
          try {
            abortController.abort();
          } catch (e) {}
        };
        req.on('close', onClose);

        try {
          // 1. Resolve deciphered googlevideo stream URL for current client
          const streamInfo = await getAudioStreamUrl(videoId, client);
          if (!streamInfo || !streamInfo.url) {
            req.off('close', onClose);
            continue;
          }

          // 2. Forward explicit client headers (Client: WEB_REMIX & custom User-Agent)
          const upstreamHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://music.youtube.com',
            'Origin': 'https://music.youtube.com',
            'Client': 'WEB_REMIX',
            'X-Youtube-Client-Name': '67',
            'Accept': '*/*'
          };

          if (req.headers.range) {
            upstreamHeaders['Range'] = req.headers.range;
          }

          const upstreamRes = await fetch(streamInfo.url, {
            headers: upstreamHeaders,
            signal: abortController.signal
          });

          // 3. Bypass 403 Forbidden: If upstream returns 403, fallback to WEB or IOS
          if (upstreamRes.status === 403) {
            console.warn(`[STREAM PROXY] Upstream returned 403 Forbidden with client "${client}" for video ${videoId}. Retrying with next client...`);
            req.off('close', onClose);
            continue;
          }

          // If upstream returns another non-successful status (and not 206 Partial Content)
          if (!upstreamRes.ok && upstreamRes.status !== 206) {
            console.warn(`[STREAM PROXY] Upstream returned HTTP ${upstreamRes.status} with client "${client}" for video ${videoId}. Retrying with next client...`);
            req.off('close', onClose);
            continue;
          }

          // 4. Forward response status (200 or 206) and headers
          res.status(upstreamRes.status);
          res.set({
            'Content-Type': upstreamRes.headers.get('content-type') || streamInfo.contentType || 'audio/webm',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
          });

          if (upstreamRes.headers.get('content-length')) {
            res.set('Content-Length', upstreamRes.headers.get('content-length'));
          }
          if (upstreamRes.headers.get('content-range')) {
            res.set('Content-Range', upstreamRes.headers.get('content-range'));
          }

          // 5. Pipe chunks directly to response
          const nodeStream = Readable.fromWeb(upstreamRes.body);

          nodeStream.on('error', (streamErr) => {
            req.off('close', onClose);
            if (!res.headersSent) {
              res.status(500).end();
            } else {
              res.end();
            }
          });

          nodeStream.on('end', () => {
            req.off('close', onClose);
          });

          nodeStream.pipe(res);
          return;
        } catch (err) {
          req.off('close', onClose);
          lastError = err;
          // Continue to next client in fallback strategy
        }
      }

      // Secondary fallback: yt.download stream if direct fetch encountered issues across clients
      try {
        const { stream, contentType } = await getAudioDownloadStream(videoId);

        res.status(200).set({
          'Content-Type': contentType || 'audio/webm',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });

        let clientClosed = false;
        req.on('close', () => {
          clientClosed = true;
          if (typeof stream.cancel === 'function') {
            stream.cancel().catch(() => {});
          }
        });

        for await (const chunk of stream) {
          if (clientClosed || res.writableEnded || res.destroyed) break;
          const canWrite = res.write(Buffer.from(chunk));
          if (!canWrite && !clientClosed && !res.writableEnded && !res.destroyed) {
            await new Promise(resolve => res.once('drain', resolve));
          }
        }

        res.end();
        return;
      } catch (dlErr) {
        lastError = dlErr;
      }

      console.error(`[STREAM PROXY ERROR] All fallback clients failed for video ${videoId}:`, lastError?.message);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Stream Error',
          message: lastError?.message || 'Failed to stream audio after all client fallbacks'
        });
      } else {
        res.end();
      }
    });

    // Query param fallback: /stream?id=:videoId
    app.get('/stream', (req, res) => {
      const videoId = req.query.id;
      if (videoId) {
        return res.redirect(`/stream/${encodeURIComponent(videoId)}`);
      }
      res.status(400).json({ error: 'Missing videoId query parameter' });
    });

    server = app.listen(preferredPort, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log(`Audio stream proxy running at http://127.0.0.1:${serverPort}/stream/:videoId`);
      resolve(serverPort);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && preferredPort !== 0) {
        console.warn(`Port ${preferredPort} is in use, falling back to random available port...`);
        server = app.listen(0, '127.0.0.1', () => {
          serverPort = server.address().port;
          console.log(`Audio stream proxy running at http://127.0.0.1:${serverPort}/stream/:videoId`);
          resolve(serverPort);
        });
      } else {
        reject(err);
      }
    });
  });
}

function getStreamUrl(videoId) {
  const port = serverPort || 8888;
  return `http://localhost:${port}/stream/${encodeURIComponent(videoId)}`;
}

function getOfflineStreamUrl(trackId) {
  const port = serverPort || 8888;
  return `http://localhost:${port}/offline/${encodeURIComponent(trackId)}`;
}

function getServerPort() {
  return serverPort;
}

function stopStreamProxy() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = {
  startStreamProxy,
  getStreamUrl,
  getOfflineStreamUrl,
  getServerPort,
  stopStreamProxy
};
