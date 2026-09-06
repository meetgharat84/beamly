const chromecastsFactory = require('chromecasts');

let chromecasts = null;
let currentDevice = null;
let currentMediaUrl = null;
let currentMetadata = null;
let statusCallback = null;

function initCastService(onDeviceUpdate, onStatusChange) {
  statusCallback = onStatusChange;
  if (!chromecasts) {
    try {
      chromecasts = chromecastsFactory();
      chromecasts.on('update', device => {
        console.log('Discovered Cast device:', device.friendlyName || device.name);
        if (onDeviceUpdate) {
          onDeviceUpdate(getDevices());
        }
      });
    } catch (err) {
      console.warn('Failed to initialize chromecasts scanner:', err.message);
    }
  }
}

function getDevices() {
  if (!chromecasts || !chromecasts.devices) {
    return [];
  }
  return chromecasts.devices.map(d => ({
    id: d.name,
    name: d.friendlyName || d.name,
    host: d.host
  }));
}

async function castToDevice(deviceId, mediaUrl, metadata = {}) {
  if (!chromecasts) {
    throw new Error('Cast service not initialized');
  }

  const device = chromecasts.devices.find(d => d.name === deviceId || d.friendlyName === deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  currentDevice = device;
  currentMediaUrl = mediaUrl;
  currentMetadata = metadata;

  return new Promise((resolve, reject) => {
    const mediaOptions = {
      title: metadata.title || 'Beamly Audio',
      type: 'audio/mp4',
      media: {
        metadata: {
          metadataType: 3, // Music track
          title: metadata.title || '',
          artist: metadata.artist || '',
          images: metadata.artwork ? [{ url: metadata.artwork }] : []
        }
      }
    };

    device.play(mediaUrl, mediaOptions, (err, status) => {
      if (err) {
        console.error('Error casting to device:', err);
        return reject(err);
      }

      console.log('Successfully playing on Cast device:', device.friendlyName || device.name);

      device.on('status', status => {
        if (statusCallback) {
          statusCallback({
            deviceId: device.name,
            deviceName: device.friendlyName || device.name,
            status: status?.playerState || 'UNKNOWN',
            currentTime: status?.currentTime || 0
          });
        }
      });

      resolve({
        success: true,
        deviceId: device.name,
        deviceName: device.friendlyName || device.name
      });
    });
  });
}

function pause() {
  if (currentDevice && typeof currentDevice.pause === 'function') {
    currentDevice.pause();
  }
}

function resume() {
  if (currentDevice && typeof currentDevice.resume === 'function') {
    currentDevice.resume();
  }
}

function seek(seconds) {
  if (currentDevice && typeof currentDevice.seek === 'function') {
    currentDevice.seek(seconds);
  }
}

function stop() {
  if (currentDevice && typeof currentDevice.stop === 'function') {
    currentDevice.stop();
  }
  currentDevice = null;
  currentMediaUrl = null;
  currentMetadata = null;
}

function getActiveDevice() {
  if (!currentDevice) return null;
  return {
    id: currentDevice.name,
    name: currentDevice.friendlyName || currentDevice.name
  };
}

module.exports = {
  initCastService,
  getDevices,
  castToDevice,
  pause,
  resume,
  seek,
  stop,
  getActiveDevice
};
