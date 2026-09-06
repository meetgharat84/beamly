// ===================================================================
// Beamly - 100% Pure YouTube Music Desktop Client
// Material 3 UI Renderer Controller
// ===================================================================

// -------------------------------------------------------------------
// 1. Application State
// -------------------------------------------------------------------
const state = {
  // Theme
  theme: localStorage.getItem('beamly_theme') || 'dark',

  // Authentication & User
  googleUser: {
    loggedIn: false,
    user: null
  },

  // Playback & Queue
  currentTrack: null,
  isPlaying: false,
  isShuffle: false,
  isRepeat: false,
  currentTracklist: [],
  currentTrackIndex: -1,
  activePlaylist: null,
  volume: parseFloat(localStorage.getItem('beamly_volume') || '0.8'),
  isMuted: false,

  // Offline Tracks
  offlineTrackIds: new Set(),
  offlineTracks: [],
  downloadingTrackIds: new Set(),

  // Sleep Timer
  sleepTimer: {
    minutes: 0,
    targetTimestamp: null,
    intervalId: null,
    isEndOfTrack: false
  },

  // Synced Lyrics
  currentLyrics: [],
  activeLyricIndex: -1,
  isLyricsOpen: false,

  // Playback Queue & Context-Aware Autoplay
  queue: [],
  relatedQueue: [],
  isFetchingRelated: false,
  isQueueOpen: false,

  // Search Filters
  searchCategory: 'all',

  // Local Playlists Management
  localPlaylists: [],
  targetTrackForPlaylist: null,

  // Google Cast
  castDevices: [],
  activeCastDevice: null,

  // Settings & Preferences
  audioQuality: localStorage.getItem('beamly_audio_quality') || 'normal',
  isSettingsOpen: false,

  // Navigation History
  currentView: 'home',
  navHistory: [{ view: 'home', data: null }],
  navHistoryIndex: 0,

  // Debounce Timers
  searchDebounceTimer: null
};

// -------------------------------------------------------------------
// 2. DOM Elements
// -------------------------------------------------------------------
const el = {
  audio: document.getElementById('audio-player'),

  // Navigation
  navHome: document.getElementById('nav-home'),
  navSearch: document.getElementById('nav-search'),
  navLibrary: document.getElementById('nav-library'),
  navOffline: document.getElementById('nav-offline'),
  navSettings: document.getElementById('nav-settings'),
  btnNavBack: document.getElementById('btn-nav-back'),
  btnNavForward: document.getElementById('btn-nav-forward'),
  topbarSearchBox: document.getElementById('topbar-search-box'),
  searchInput: document.getElementById('main-search-input') || document.getElementById('spotify-search-input'),

  // Sleep Timer & Theme
  btnSleepTimer: document.getElementById('btn-sleep-timer'),
  sleepTimerLabel: document.getElementById('sleep-timer-label'),
  sleepTimerDialog: document.getElementById('sleep-timer-dialog'),
  btnCloseTimerDialog: document.getElementById('btn-close-timer-dialog'),
  timerOptionBtns: document.querySelectorAll('.timer-option-btn'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeIconSun: document.getElementById('theme-icon-sun'),
  themeIconMoon: document.getElementById('theme-icon-moon'),

  // Auth UI (Google / YouTube Music)
  btnGoogleLogin: document.getElementById('btn-google-login'),
  sidebarGoogleCard: document.getElementById('sidebar-google-card'),
  btnSidebarGoogleLogin: document.getElementById('btn-sidebar-google-login'),
  profilePill: document.getElementById('profile-pill'),
  userAvatar: document.getElementById('user-avatar'),
  userDisplayName: document.getElementById('user-display-name'),
  btnUserLogout: document.getElementById('btn-user-logout'),

  // Sidebar Library
  chipAll: document.getElementById('chip-all'),
  chipPlaylists: document.getElementById('chip-playlists'),
  chipLiked: document.getElementById('chip-liked'),
  sidebarItemLiked: document.getElementById('sidebar-item-liked'),
  sidebarPlaylistsContainer: document.getElementById('sidebar-playlists-container'),
  btnCreatePlaylistTrigger: document.getElementById('btn-create-playlist-trigger'),

  // Views
  viewHome: document.getElementById('view-home'),
  viewSearch: document.getElementById('view-search'),
  viewLibrary: document.getElementById('view-library'),
  viewOffline: document.getElementById('view-offline'),
  viewPlaylist: document.getElementById('view-playlist'),
  mainContent: document.getElementById('main-content'),

  // Home View Categorized Containers
  greetingHeader: document.getElementById('greeting-header'),
  homeSimilarSection: document.getElementById('home-similar-section'),
  homeSimilarTitle: document.getElementById('home-similar-title'),
  homeSimilarRow: document.getElementById('home-similar-row'),
  homeTopChartsSection: document.getElementById('home-top-charts-section'),
  homeTopChartsTitle: document.getElementById('home-top-charts-title'),
  homeTopChartsRow: document.getElementById('home-top-charts-row'),
  homeTrendingSection: document.getElementById('home-trending-section'),
  homeTrendingTitle: document.getElementById('home-trending-title'),
  homeTrendingRow: document.getElementById('home-trending-row'),
  homeTopArtistsTitle: document.getElementById('home-top-artists-title'),
  homeTopArtistsRow: document.getElementById('home-top-artists-row'),
  homePlaylistsRow: document.getElementById('home-playlists-row'),

  // Search View Containers & Filters
  searchTitle: document.getElementById('search-title'),
  searchTracksWrapper: document.getElementById('search-tracks-wrapper'),
  searchTracksContainer: document.getElementById('search-tracks-container'),
  searchAlbumsSection: document.getElementById('search-albums-section'),
  searchAlbumsRow: document.getElementById('search-albums-row'),
  searchArtistsSection: document.getElementById('search-artists-section'),
  searchArtistsRow: document.getElementById('search-artists-row'),

  // Library View
  libraryPlaylistsGrid: document.getElementById('library-playlists-grid'),

  // Offline View
  offlineStats: document.getElementById('offline-stats'),
  offlineTracksContainer: document.getElementById('offline-tracks-container'),

  // Dedicated Playlist View
  plHeroArt: document.getElementById('pl-hero-art'),
  plHeroTitle: document.getElementById('pl-hero-title'),
  plHeroDesc: document.getElementById('pl-hero-desc'),
  plCreator: document.getElementById('pl-creator'),
  plTrackCount: document.getElementById('pl-track-count'),
  plPlayAllBtn: document.getElementById('pl-play-all-btn'),
  plDownloadAllBtn: document.getElementById('pl-download-all-btn'),
  plTracksContainer: document.getElementById('pl-tracks-container'),

  // Synced Lyrics Overlay
  lyricsOverlay: document.getElementById('lyrics-overlay'),
  lyricsSongThumb: document.getElementById('lyrics-song-thumb'),
  lyricsSongTitle: document.getElementById('lyrics-song-title'),
  lyricsSongArtist: document.getElementById('lyrics-song-artist'),
  lyricsCloseBtn: document.getElementById('lyrics-close-btn'),
  lyricsScrollBody: document.getElementById('lyrics-scroll-body'),

  // Playback Queue Drawer Overlay
  queueOverlay: document.getElementById('queue-overlay'),
  queueCloseBtn: document.getElementById('queue-close-btn'),
  btnClearQueue: document.getElementById('btn-clear-queue'),
  queueCountTag: document.getElementById('queue-count-tag'),
  queueNowPlaying: document.getElementById('queue-now-playing'),
  queueListContainer: document.getElementById('queue-list-container'),
  queueAutoplayContainer: document.getElementById('queue-autoplay-container'),

  // Player Bar Controls
  pCover: document.getElementById('p-cover'),
  pTitle: document.getElementById('p-title'),
  pArtist: document.getElementById('p-artist'),
  pStatusBadge: document.getElementById('p-status-badge'),
  pOfflineBadge: document.getElementById('p-offline-badge'),
  pHeartBtn: document.getElementById('p-heart-btn'),
  pShuffleBtn: document.getElementById('p-shuffle-btn'),
  pPrevBtn: document.getElementById('p-prev-btn'),
  pPlayBtn: document.getElementById('p-play-btn'),
  pPlayIcon: document.getElementById('p-play-icon'),
  pNextBtn: document.getElementById('p-next-btn'),
  pRepeatBtn: document.getElementById('p-repeat-btn'),
  pCurrentTime: document.getElementById('p-current-time'),
  pDurationTime: document.getElementById('p-duration-time'),
  pProgressTrack: document.getElementById('p-progress-track'),
  pProgressFill: document.getElementById('p-progress-fill'),
  pProgressSlider: document.getElementById('p-progress-slider'),

  // Right Actions
  rDownloadBtn: document.getElementById('r-download-btn'),
  rLyricsBtn: document.getElementById('r-lyrics-btn'),
  rQueueBtn: document.getElementById('r-queue-btn'),
  rCastBtn: document.getElementById('r-cast-btn'),
  rVolIconBtn: document.getElementById('r-vol-icon-btn'),
  rVolIcon: document.getElementById('r-vol-icon'),
  pVolumeTrack: document.getElementById('p-volume-track'),
  pVolumeFill: document.getElementById('p-volume-fill'),
  pVolumeSlider: document.getElementById('p-volume-slider'),
  rCastPopover: document.getElementById('r-cast-popover'),
  rCastDevicesList: document.getElementById('r-cast-devices-list'),

  // Playlist Management Modals
  playlistModal: document.getElementById('playlist-modal'),
  btnClosePlaylistModal: document.getElementById('btn-close-playlist-modal'),
  tabBtnCreatePl: document.getElementById('tab-btn-create-pl'),
  tabBtnImportPl: document.getElementById('tab-btn-import-pl'),
  tabContentCreatePl: document.getElementById('tab-content-create-pl'),
  tabContentImportPl: document.getElementById('tab-content-import-pl'),
  inputNewPlName: document.getElementById('input-new-pl-name'),
  inputNewPlDesc: document.getElementById('input-new-pl-desc'),
  btnCancelCreatePl: document.getElementById('btn-cancel-create-pl'),
  btnConfirmCreatePl: document.getElementById('btn-confirm-create-pl'),
  inputImportPlUrl: document.getElementById('input-import-pl-url'),
  btnCancelImportPl: document.getElementById('btn-cancel-import-pl'),
  btnConfirmImportPl: document.getElementById('btn-confirm-import-pl'),
  importPlBtnText: document.getElementById('import-pl-btn-text'),
  addToPlaylistModal: document.getElementById('add-to-playlist-modal'),
  btnCloseAddToPlModal: document.getElementById('btn-close-add-to-pl-modal'),
  addToPlTrackInfo: document.getElementById('add-to-pl-track-info'),
  addToPlList: document.getElementById('add-to-pl-list'),
  btnAddToNewPlTrigger: document.getElementById('btn-add-to-new-pl-trigger'),
  btnCancelAddToPl: document.getElementById('btn-cancel-add-to-pl'),

  // Settings Modal & Preferences
  btnTopbarSettings: document.getElementById('btn-topbar-settings'),
  settingsModal: document.getElementById('settings-modal'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSettingsDone: document.getElementById('btn-settings-done'),
  settingsUserAvatar: document.getElementById('settings-user-avatar'),
  settingsUserName: document.getElementById('settings-user-name'),
  settingsUserStatus: document.getElementById('settings-user-status'),
  btnSettingsAuthAction: document.getElementById('btn-settings-auth-action'),
  audioQualitySegmented: document.getElementById('audio-quality-segmented'),
  themeSegmented: document.getElementById('theme-segmented'),
  btnThemeSegDark: document.getElementById('btn-theme-seg-dark'),
  btnThemeSegLight: document.getElementById('btn-theme-seg-light'),
  statDbSize: document.getElementById('stat-db-size'),
  statMatchesCount: document.getElementById('stat-matches-count'),
  statOfflineCount: document.getElementById('stat-offline-count'),
  btnSettingsClearMatches: document.getElementById('btn-settings-clear-matches'),
  btnSettingsClearAll: document.getElementById('btn-settings-clear-all')
};

// -------------------------------------------------------------------
// 3. Helper Utilities & Image Resolvers
// -------------------------------------------------------------------

const FALLBACK_NOTE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%23282828'%3E%3Crect width='100' height='100' rx='12' fill='%231f1f1f'/%3E%3Cpath d='M40 30v32.55c-1.59-.91-3.41-1.55-5.5-1.55-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10V46h24v16.55c-1.59-.91-3.41-1.55-5.5-1.55-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10V30H40z' fill='%23727272'/%3E%3C/svg%3E";

function getArtworkUrl(item) {
  if (!item) return FALLBACK_NOTE_ICON;
  if (typeof item === 'string') {
    if (item.startsWith('http') || item.startsWith('data:') || item.startsWith('assets/')) return item;
    return FALLBACK_NOTE_ICON;
  }
  // 1. Direct string properties
  if (item.artwork && typeof item.artwork === 'string') return item.artwork;
  if (item.thumbnail && typeof item.thumbnail === 'string') return item.thumbnail;
  if (item.thumbnail && typeof item.thumbnail.url === 'string') return item.thumbnail.url;
  
  // 2. youtubei.js thumbnail objects or contents array
  if (item.thumbnail && Array.isArray(item.thumbnail.contents) && item.thumbnail.contents.length > 0) {
    const valid = item.thumbnail.contents.find(t => t && t.url);
    if (valid) return valid.url;
  }
  if (item.thumbnails && typeof item.thumbnails.url === 'string') {
    return item.thumbnails.url;
  }
  if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
    const valid = item.thumbnails.slice().reverse().find(t => t && (t.url || typeof t === 'string')) || item.thumbnails[0];
    if (valid) return valid.url || valid;
  }
  if (item.thumbnails && Array.isArray(item.thumbnails.contents) && item.thumbnails.contents.length > 0) {
    const valid = item.thumbnails.contents.find(t => t && t.url);
    if (valid) return valid.url;
  }

  // 3. Album or images array
  if (item.album && item.album.images && Array.isArray(item.album.images) && item.album.images.length > 0) {
    return item.album.images[0].url;
  }
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images[0]?.url || FALLBACK_NOTE_ICON;
  }

  return 'assets/logo.png';
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, duration = 3000) {
  let toastContainer = document.getElementById('m3-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'm3-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 108px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: var(--md-sys-color-inverse-surface, #313033);
    color: var(--md-sys-color-inverse-on-surface, #f4eff4);
    padding: 12px 20px;
    border-radius: 9999px;
    font-size: 0.88rem;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: toastFadeIn 0.25s ease-out forwards;
    pointer-events: auto;
  `;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// -------------------------------------------------------------------
// 4. Material 3 Theme Management
// -------------------------------------------------------------------

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('beamly_theme', theme);

  if (theme === 'dark') {
    if (el.themeIconSun) el.themeIconSun.style.display = 'block';
    if (el.themeIconMoon) el.themeIconMoon.style.display = 'none';
  } else {
    if (el.themeIconSun) el.themeIconSun.style.display = 'none';
    if (el.themeIconMoon) el.themeIconMoon.style.display = 'block';
  }

  // Synchronize Settings Modal Segmented Control
  if (el.btnThemeSegDark && el.btnThemeSegLight) {
    el.btnThemeSegDark.classList.toggle('active', theme === 'dark');
    el.btnThemeSegLight.classList.toggle('active', theme === 'light');
  }
}

function toggleTheme() {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

// -------------------------------------------------------------------
// 5. Dynamic Greeting
// -------------------------------------------------------------------

function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon';
  }
  if (el.greetingHeader) {
    el.greetingHeader.textContent = greeting;
  }
}

// -------------------------------------------------------------------
// 6. Navigation and Views
// -------------------------------------------------------------------

function navigateTo(viewName, data = null, pushToHistory = true) {
  state.currentView = viewName;

  // Update Nav links
  [el.navHome, el.navSearch, el.navLibrary, el.navOffline].forEach(btn => btn?.classList.remove('active'));
  if (viewName === 'home') el.navHome?.classList.add('active');
  if (viewName === 'search') el.navSearch?.classList.add('active');
  if (viewName === 'library') el.navLibrary?.classList.add('active');
  if (viewName === 'offline') el.navOffline?.classList.add('active');

  // Hide all views
  [el.viewHome, el.viewSearch, el.viewLibrary, el.viewOffline, el.viewPlaylist].forEach(v => {
    if (v) v.style.display = 'none';
  });

  // Show target view
  if (viewName === 'home') {
    el.viewHome.style.display = 'block';
    loadHomeContent();
  } else if (viewName === 'search') {
    el.viewSearch.style.display = 'block';
    if (el.searchInput) el.searchInput.focus();
  } else if (viewName === 'library') {
    el.viewLibrary.style.display = 'block';
    loadLibraryContent();
  } else if (viewName === 'offline') {
    el.viewOffline.style.display = 'block';
    loadOfflineContent();
  } else if (viewName === 'playlist' && data) {
    el.viewPlaylist.style.display = 'block';
    renderPlaylistView(data);
  }

  // Push to history
  if (pushToHistory) {
    state.navHistory = state.navHistory.slice(0, state.navHistoryIndex + 1);
    state.navHistory.push({ view: viewName, data });
    state.navHistoryIndex = state.navHistory.length - 1;
  }

  // Update Back / Forward state
  updateNavButtons();
}

function updateNavButtons() {
  if (el.btnNavBack) {
    el.btnNavBack.disabled = state.navHistoryIndex <= 0;
    el.btnNavBack.style.opacity = state.navHistoryIndex <= 0 ? '0.4' : '1';
  }
  if (el.btnNavForward) {
    el.btnNavForward.disabled = state.navHistoryIndex >= state.navHistory.length - 1;
    el.btnNavForward.style.opacity = state.navHistoryIndex >= state.navHistory.length - 1 ? '0.4' : '1';
  }
}

function goBack() {
  if (state.navHistoryIndex > 0) {
    state.navHistoryIndex--;
    const step = state.navHistory[state.navHistoryIndex];
    navigateTo(step.view, step.data, false);
  }
}

function goForward() {
  if (state.navHistoryIndex < state.navHistory.length - 1) {
    state.navHistoryIndex++;
    const step = state.navHistory[state.navHistoryIndex];
    navigateTo(step.view, step.data, false);
  }
}

// -------------------------------------------------------------------
// 7. Google / YouTube Music Authentication & Library Loading
// -------------------------------------------------------------------

async function checkAuthStatus() {
  try {
    const googleStatus = await window.beamly.getGoogleAuthStatus();
    state.googleUser = googleStatus || { loggedIn: false, profile: null };

    const gUser = googleStatus?.profile;
    if (googleStatus?.loggedIn && gUser) {
      if (el.btnGoogleLogin) el.btnGoogleLogin.style.display = 'none';
      if (el.sidebarGoogleCard) el.sidebarGoogleCard.style.display = 'none';
      if (el.profilePill) {
        el.profilePill.style.display = 'flex';
        if (el.userDisplayName) el.userDisplayName.textContent = gUser.name || 'Google Account';
        if (el.userAvatar) {
          el.userAvatar.src = gUser.avatar || 'assets/logo.png';
          el.userAvatar.onerror = () => { el.userAvatar.onerror = null; el.userAvatar.src = 'assets/logo.png'; };
        }
      }
    } else {
      if (el.btnGoogleLogin) el.btnGoogleLogin.style.display = 'inline-flex';
      if (el.sidebarGoogleCard) el.sidebarGoogleCard.style.display = 'flex';
      if (el.profilePill) el.profilePill.style.display = 'none';
    }

    // Keep Settings UI in sync
    if (typeof updateSettingsAccountUI === 'function') {
      updateSettingsAccountUI();
    }

    // Refresh Home & Library content from YouTube Music
    await loadHomeContent();
    await loadSidebarLibrary();
  } catch (err) {
    console.error('Failed to check auth status:', err);
  }
}

async function triggerGoogleLogin() {
  try {
    showToast('Opening Google / YouTube Music sign-in popup...');
    const result = await window.beamly.googleLogin();
    if (result && result.success) {
      showToast(`Signed in as ${result.profile?.name || 'Google Account'}!`);
      await checkAuthStatus();
    } else if (result && result.error) {
      showToast(`Sign in cancelled: ${result.error}`);
    }
  } catch (err) {
    console.error('Error during Google login:', err);
    showToast('Google login window closed.');
  }
}

async function triggerUserLogout() {
  try {
    await window.beamly.googleLogout();
    showToast('Signed out of Google account.');
    await checkAuthStatus();
  } catch (err) {
    console.error('Error logging out:', err);
  }
}

// -------------------------------------------------------------------
// 8. Content Renderers (Home, Playlists, Tracks, Artists)
// -------------------------------------------------------------------

async function loadHomeContent() {
  try {
    const curated = await window.beamly.getCuratedHome();
    if (!curated) return;

    // 1. Render Similar to Last Played Section
    if (el.homeSimilarSection && el.homeSimilarRow) {
      const sim = curated.similarSection;
      if (sim && Array.isArray(sim.tracks) && sim.tracks.length > 0) {
        if (el.homeSimilarTitle) el.homeSimilarTitle.textContent = sim.title || 'Similar to your last played';
        el.homeSimilarRow.innerHTML = '';
        sim.tracks.forEach((track, idx) => {
          const card = createTrackCard(track, sim.tracks, idx);
          el.homeSimilarRow.appendChild(card);
        });
        el.homeSimilarSection.style.display = 'block';
      } else {
        el.homeSimilarSection.style.display = 'none';
      }
    }

    // 2. Render Top Charts shelf
    if (el.homeTopChartsRow && Array.isArray(curated.topCharts)) {
      el.homeTopChartsRow.innerHTML = '';
      curated.topCharts.forEach((track, idx) => {
        const card = createTrackCard(track, curated.topCharts, idx);
        el.homeTopChartsRow.appendChild(card);
      });
    }

    // 3. Render Trending Now shelf
    if (el.homeTrendingRow && Array.isArray(curated.trending)) {
      el.homeTrendingRow.innerHTML = '';
      curated.trending.forEach((track, idx) => {
        const card = createTrackCard(track, curated.trending, idx);
        el.homeTrendingRow.appendChild(card);
      });
    }

    // 4. Render Favorite Artists shelf
    if (el.homeTopArtistsRow && Array.isArray(curated.topArtists)) {
      el.homeTopArtistsRow.innerHTML = '';
      curated.topArtists.forEach(artist => {
        const card = createArtistCard(artist);
        el.homeTopArtistsRow.appendChild(card);
      });
    }

    // 5. Render Playlists shelf
    if (el.homePlaylistsRow && Array.isArray(curated.playlists)) {
      el.homePlaylistsRow.innerHTML = '';
      curated.playlists.forEach(pl => {
        const card = createPlaylistCard(pl);
        el.homePlaylistsRow.appendChild(card);
      });
    }
  } catch (err) {
    console.error('Failed to load curated home content:', err);
  }
}

function createArtistCard(artist) {
  const card = document.createElement('div');
  card.className = 'm3-artist-card';
  const artUrl = getArtworkUrl(artist);
  card.innerHTML = `
    <div class="m3-artist-art-wrap">
      <img class="m3-artist-art" src="${escapeHtml(artUrl)}" alt="${escapeHtml(artist.name)}" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
    </div>
    <div class="m3-artist-name">${escapeHtml(artist.name)}</div>
    <div class="m3-artist-tag">Artist</div>
  `;

  card.addEventListener('click', () => {
    if (el.searchInput) {
      el.searchInput.value = artist.name;
    }
    navigateTo('search');
    executeSearch(artist.name);
  });

  return card;
}

async function loadSidebarLibrary() {
  try {
    if (!el.sidebarPlaylistsContainer) return;
    el.sidebarPlaylistsContainer.innerHTML = '';

    // 1. Fetch user's local playlists
    let localPlaylists = [];
    try {
      localPlaylists = await window.beamly.getLocalPlaylists();
      state.localPlaylists = localPlaylists || [];
    } catch (localErr) {
      console.warn('Failed to load local playlists:', localErr);
    }

    if (Array.isArray(localPlaylists) && localPlaylists.length > 0) {
      localPlaylists.forEach(pl => {
        const item = document.createElement('div');
        item.className = 'library-item';
        const artUrl = getArtworkUrl(pl);
        const plTitle = pl.name || pl.title || 'Playlist';
        item.innerHTML = `
          <img class="library-item-thumb" src="${escapeHtml(artUrl)}" alt="Cover" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
          <div class="library-item-info">
            <div style="display: flex; align-items: center;">
              <span class="library-item-title">${escapeHtml(plTitle)}</span>
              <span class="sidebar-item-local-tag">Local</span>
            </div>
            <span class="library-item-sub">${pl.tracks?.length || 0} tracks • You</span>
          </div>
        `;
        item.addEventListener('click', () => openPlaylist(pl.id));
        el.sidebarPlaylistsContainer.appendChild(item);
      });
    }

    // 2. Fetch authenticated YouTube Music library playlists
    const library = await window.beamly.getLibrary();

    if (!state.googleUser.loggedIn || (library && library.authenticated === false)) {
      if (!localPlaylists || localPlaylists.length === 0) {
        const authCard = document.createElement('div');
        authCard.className = 'sidebar-auth-empty';
        authCard.innerHTML = `
          <div class="sidebar-auth-icon">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
          </div>
          <div class="sidebar-auth-text">Sign in to sync cloud playlists</div>
          <button class="m3-btn-primary sidebar-auth-btn" id="btn-sidebar-auth-prompt">Sign In</button>
        `;
        authCard.querySelector('#btn-sidebar-auth-prompt')?.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerGoogleLogin();
        });
        el.sidebarPlaylistsContainer.appendChild(authCard);
      }
      return;
    }

    const playlists = (library && Array.isArray(library.playlists)) ? library.playlists : [];

    playlists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'library-item';
      const artUrl = getArtworkUrl(pl);
      const plTitle = pl.name || pl.title || 'Playlist';
      item.innerHTML = `
        <img class="library-item-thumb" src="${escapeHtml(artUrl)}" alt="Cover" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
        <div class="library-item-info">
          <span class="library-item-title">${escapeHtml(plTitle)}</span>
          <span class="library-item-sub">Playlist • ${escapeHtml(pl.owner || 'YouTube Music')}</span>
        </div>
      `;
      item.addEventListener('click', () => openPlaylist(pl.id));
      el.sidebarPlaylistsContainer.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load sidebar library:', err);
  }
}

async function loadLibraryContent() {
  try {
    if (!el.libraryPlaylistsGrid) return;
    el.libraryPlaylistsGrid.innerHTML = '';

    const library = await window.beamly.getLibrary();

    // Strict Authentication Enforcement: If unauthenticated, show empty state with clear Google sign-in prompt
    if (!state.googleUser.loggedIn || (library && library.authenticated === false)) {
      const emptyContainer = document.createElement('div');
      emptyContainer.className = 'library-empty-state';
      emptyContainer.innerHTML = `
        <div class="library-empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        </div>
        <h2 class="library-empty-title">Please Sign In with Google</h2>
        <p class="library-empty-desc">Sign in with your Google / YouTube Music account to view your personal playlists, saved albums, and Liked Music directly in Beamly.</p>
        <button class="m3-btn-primary library-signin-btn" id="btn-library-signin-action">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M21.35 11.1h-9.17v2.98h5.27c-.23 1.23-.94 2.27-2 2.98v2.47h3.24c1.89-1.74 2.98-4.31 2.98-7.35 0-.71-.06-1.4-.32-2.08z"/><path fill="currentColor" d="M12.18 20.48c2.7 0 4.96-.89 6.62-2.43l-3.24-2.47c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.59-4.11H3.25v2.55c1.64 3.25 5 5.5 8.93 5.5z"/><path fill="currentColor" d="M6.59 12.43c-.2-.6-.32-1.24-.32-1.9 0-.66.12-1.3.32-1.9V6.08H3.25C2.58 7.41 2.2 8.91 2.2 10.53s.38 3.12 1.05 4.45l3.34-2.55z"/><path fill="currentColor" d="M12.18 3.58c1.47 0 2.78.51 3.82 1.5l2.86-2.86C17.13.75 14.88 0 12.18 0 8.25 0 4.89 2.25 3.25 5.5l3.34 2.55c.79-2.36 2.99-4.11 5.59-4.11z"/></svg>
          Sign In with Google
        </button>
      `;

      emptyContainer.querySelector('#btn-library-signin-action')?.addEventListener('click', () => {
        triggerGoogleLogin();
      });

      el.libraryPlaylistsGrid.appendChild(emptyContainer);
      return;
    }

    const playlists = (library && Array.isArray(library.playlists)) ? library.playlists : [];

    if (playlists.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'library-empty-state';
      emptyState.innerHTML = `
        <div class="library-empty-icon">
          <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
        </div>
        <h2 class="library-empty-title">Your Library is Empty</h2>
        <p class="library-empty-desc">You don't have any playlists in your YouTube Music library yet. Create or add playlists on YouTube Music to access them here.</p>
      `;
      el.libraryPlaylistsGrid.appendChild(emptyState);
      return;
    }

    playlists.forEach(pl => {
      const card = createPlaylistCard(pl);
      el.libraryPlaylistsGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load library content:', err);
  }
}

function createTrackCard(track, tracklist = [], index = 0) {
  const card = document.createElement('div');
  card.className = 'm3-card';
  const artUrl = getArtworkUrl(track);
  card.innerHTML = `
    <div class="m3-card-art-wrap">
      <img class="m3-card-art" src="${escapeHtml(artUrl)}" alt="${escapeHtml(track.title)}" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
      <button class="m3-card-play-btn" title="Play ${escapeHtml(track.title)}">
        <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
      </button>
    </div>
    <div class="m3-card-title">${escapeHtml(track.title)}</div>
    <div class="m3-card-sub">${escapeHtml(track.artist)}</div>
  `;

  card.addEventListener('click', () => {
    playTrack(track, tracklist, index);
  });

  return card;
}

function createPlaylistCard(pl) {
  const card = document.createElement('div');
  card.className = 'm3-card';
  const artUrl = getArtworkUrl(pl);
  const plTitle = pl.name || pl.title || 'Playlist';
  card.innerHTML = `
    <div class="m3-card-art-wrap">
      <img class="m3-card-art" src="${escapeHtml(artUrl)}" alt="${escapeHtml(plTitle)}" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
      <button class="m3-card-play-btn" title="Open ${escapeHtml(plTitle)}">
        <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
      </button>
    </div>
    <div class="m3-card-title">${escapeHtml(plTitle)}</div>
    <div class="m3-card-sub">${escapeHtml(pl.description || `By ${pl.owner || 'Beamly'}`)}</div>
  `;

  card.addEventListener('click', () => {
    openPlaylist(pl.id);
  });

  return card;
}

function createAlbumCard(album) {
  const card = document.createElement('div');
  card.className = 'm3-card';
  const artUrl = getArtworkUrl(album);
  const albumTitle = album.name || album.title || 'Album';
  card.innerHTML = `
    <div class="m3-card-art-wrap">
      <img class="m3-card-art" src="${escapeHtml(artUrl)}" alt="${escapeHtml(albumTitle)}" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
      <button class="m3-card-play-btn" title="Open ${escapeHtml(albumTitle)}">
        <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
      </button>
    </div>
    <div class="m3-card-title">${escapeHtml(albumTitle)}</div>
    <div class="m3-card-sub">${escapeHtml(album.artist || album.year || 'Album')}</div>
  `;

  card.addEventListener('click', () => {
    if (album.id) {
      openPlaylist(album.id);
    }
  });

  return card;
}

async function openPlaylist(playlistId) {
  try {
    showToast('Loading playlist...');
    let plData = null;
    if (String(playlistId).startsWith('local_')) {
      plData = await window.beamly.getLocalPlaylist(playlistId);
    } else {
      plData = await window.beamly.getPlaylist(playlistId);
    }
    if (!plData) {
      showToast('Could not load playlist.');
      return;
    }
    navigateTo('playlist', plData);
  } catch (err) {
    console.error('Failed to open playlist:', err);
    showToast('Failed to load playlist.');
  }
}

function renderPlaylistView(plData) {
  state.activePlaylist = plData;
  const artUrl = getArtworkUrl(plData);
  el.plHeroArt.src = artUrl;
  el.plHeroArt.onerror = () => { el.plHeroArt.onerror = null; el.plHeroArt.src = FALLBACK_NOTE_ICON; };
  el.plHeroTitle.textContent = plData.name || 'Playlist';
  el.plHeroDesc.textContent = plData.description || '';
  el.plCreator.textContent = plData.owner || 'Beamly';
  el.plTrackCount.textContent = `${(plData.tracks || []).length} songs`;

  // Render tracks
  renderTrackTable(el.plTracksContainer, plData.tracks || [], plData.tracks || []);

  // Play all button
  el.plPlayAllBtn.onclick = () => {
    if (plData.tracks && plData.tracks.length > 0) {
      playTrack(plData.tracks[0], plData.tracks, 0);
    }
  };

  // Download all button
  el.plDownloadAllBtn.onclick = async () => {
    if (!plData.tracks || plData.tracks.length === 0) return;
    showToast(`Starting download for ${plData.tracks.length} tracks...`);
    for (const t of plData.tracks) {
      if (!state.offlineTrackIds.has(t.id)) {
        await downloadSingleTrack(t);
      }
    }
    showToast('All tracks downloaded for offline listening!');
    refreshOfflineStatus();
  };
}

// -------------------------------------------------------------------
// 9. Tracks Table Renderer (Search, Playlist, Offline)
// -------------------------------------------------------------------

function renderTrackTable(container, tracks, tracklist = [], isOfflineView = false) {
  if (!container) return;
  container.innerHTML = '';

  if (!tracks || tracks.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 0.92rem;">
        No tracks to display.
      </div>
    `;
    return;
  }

  tracks.forEach((track, idx) => {
    const isDownloaded = state.offlineTrackIds.has(track.id) || track.isOffline;
    const isDownloading = state.downloadingTrackIds.has(track.id);
    const isCurrentActive = state.currentTrack && state.currentTrack.id === track.id;

    const row = document.createElement('div');
    row.className = `track-row ${isCurrentActive ? 'active' : ''}`;
    row.dataset.trackId = track.id;

    // Column 4: Download / Delete Action Button
    let actionBtnHtml = '';
    if (isOfflineView) {
      actionBtnHtml = `
        <button class="track-row-action-btn delete-btn" title="Delete offline download" data-action="delete">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="track-row-action-btn ${isDownloaded ? 'downloaded' : ''} ${isDownloading ? 'downloading' : ''}" 
                title="${isDownloaded ? 'Downloaded (Click to re-check)' : 'Download offline'}" 
                data-action="download">
          ${isDownloaded 
            ? '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' 
            : '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'}
        </button>
      `;
    }

    row.innerHTML = `
      <div class="track-row-num">
        <span class="row-num-text">${idx + 1}</span>
        <button class="row-play-btn" title="Play">
          <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
        </button>
      </div>
      <div class="track-row-title-col">
        <img class="track-row-thumb" src="${escapeHtml(getArtworkUrl(track))}" alt="Art" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
        <div class="track-row-meta">
          <span class="track-title-text">${escapeHtml(track.title)}</span>
          <span class="track-artist-text">${escapeHtml(track.artist)}</span>
        </div>
      </div>
      <div class="track-row-album-col">${escapeHtml(track.album || 'Single')}</div>
      <div class="track-row-action-col">
        ${actionBtnHtml}
        <button class="t-add-btn" title="Add to Playlist" data-action="add-to-pl">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
        <button class="t-queue-btn" title="Add to Queue" data-action="queue">
          <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
        </button>
      </div>
      <div class="track-row-duration-col">${formatDuration(track.duration)}</div>
    `;

    // Row Click (Play Track)
    row.addEventListener('click', (e) => {
      // If clicked on download, delete, queue or add-to-pl button, handle accordingly
      const actionTarget = e.target.closest('[data-action]');
      if (actionTarget) {
        e.stopPropagation();
        const action = actionTarget.dataset.action;
        if (action === 'download') {
          downloadSingleTrack(track);
        } else if (action === 'delete') {
          deleteSingleOfflineTrack(track.id);
        } else if (action === 'add-to-pl') {
          openAddToPlaylistModal(track);
        } else if (action === 'queue') {
          addToQueue(track);
        }
        return;
      }

      playTrack(track, tracklist, idx);
    });

    container.appendChild(row);
  });
}

// -------------------------------------------------------------------
// 10. Search Functionality (YouTube Music Catalog)
// -------------------------------------------------------------------

function setupSearch() {
  if (el.searchInput) {
    el.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      clearTimeout(state.searchDebounceTimer);

      if (!query) {
        if (el.searchTracksContainer) el.searchTracksContainer.innerHTML = '';
        if (el.searchAlbumsRow) el.searchAlbumsRow.innerHTML = '';
        if (el.searchArtistsRow) el.searchArtistsRow.innerHTML = '';
        if (el.searchTitle) el.searchTitle.textContent = 'Search Results';
        return;
      }

      state.searchDebounceTimer = setTimeout(async () => {
        if (state.currentView !== 'search') {
          navigateTo('search');
        }
        executeSearch(query);
      }, 350);
    });
  }

  // Bind Search Filter Chips (All, Songs, Albums, Artists)
  const chips = document.querySelectorAll('#search-filter-chips .filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.searchCategory = chip.dataset.category || 'all';

      const currentQuery = el.searchInput ? el.searchInput.value.trim() : '';
      if (currentQuery) {
        executeSearch(currentQuery);
      }
    });
  });
}

async function executeSearch(query) {
  if (!query) return;

  try {
    const category = state.searchCategory || 'all';
    const catLabel = category === 'all' ? '' : ` (${category})`;
    if (el.searchTitle) el.searchTitle.textContent = `Searching "${query}" on YouTube Music${catLabel}...`;

    const results = await window.beamly.search({ query, type: category });

    if (el.searchTitle) el.searchTitle.textContent = `Search results for "${query}"`;

    const tracks = (results && results.tracks) ? results.tracks : (Array.isArray(results) ? results : []);
    const albums = results?.albums || [];
    const artists = results?.artists || [];

    // 1. Render Tracks
    if (category === 'albums' || category === 'artists') {
      if (el.searchTracksWrapper) el.searchTracksWrapper.style.display = 'none';
    } else {
      if (el.searchTracksWrapper) el.searchTracksWrapper.style.display = 'block';
      renderTrackTable(el.searchTracksContainer, tracks, tracks);
    }

    // 2. Render Albums
    if (category === 'songs' || category === 'artists' || !albums || albums.length === 0) {
      if (el.searchAlbumsSection) el.searchAlbumsSection.style.display = 'none';
    } else {
      if (el.searchAlbumsSection) el.searchAlbumsSection.style.display = 'block';
      if (el.searchAlbumsRow) {
        el.searchAlbumsRow.innerHTML = '';
        albums.forEach(album => {
          const card = createAlbumCard(album);
          el.searchAlbumsRow.appendChild(card);
        });
      }
    }

    // 3. Render Artists
    if (category === 'songs' || category === 'albums' || !artists || artists.length === 0) {
      if (el.searchArtistsSection) el.searchArtistsSection.style.display = 'none';
    } else {
      if (el.searchArtistsSection) el.searchArtistsSection.style.display = 'block';
      if (el.searchArtistsRow) {
        el.searchArtistsRow.innerHTML = '';
        artists.forEach(artist => {
          const card = createArtistCard(artist);
          el.searchArtistsRow.appendChild(card);
        });
      }
    }
  } catch (err) {
    console.error('Failed to perform search:', err);
    if (el.searchTitle) el.searchTitle.textContent = 'Error fetching search results';
  }
}

// -------------------------------------------------------------------
// 11. Audio Playback Engine (YouTube Resolver + Stream Proxy)
// -------------------------------------------------------------------

let currentPlaybackRequestId = 0;

async function fetchRelatedQueue(videoId) {
  if (!videoId || state.isFetchingRelated) return;
  state.isFetchingRelated = true;
  try {
    const related = await window.beamly.getRelatedTracks(videoId);
    if (Array.isArray(related) && related.length > 0) {
      state.relatedQueue = related.filter(t => t && t.id !== videoId);
      updateQueueUI();
    }
  } catch (err) {
    console.warn('Failed to fetch context-aware related queue:', err.message);
  } finally {
    state.isFetchingRelated = false;
  }
}

async function playTrack(track, tracklist = [], index = 0) {
  if (!track) return;

  currentPlaybackRequestId++;
  const thisRequestId = currentPlaybackRequestId;

  try {
    state.currentTrack = track;
    state.currentTracklist = tracklist.length > 0 ? tracklist : [track];
    state.currentTrackIndex = index;
    state.isResolving = true;

    // Update Player UI Immediately with resolving state
    el.pTitle.textContent = track.title || 'Unknown Title';
    el.pArtist.textContent = track.artist || 'Unknown Artist';
    const coverUrl = getArtworkUrl(track);
    el.pCover.src = coverUrl;
    el.pCover.onerror = () => { el.pCover.onerror = null; el.pCover.src = FALLBACK_NOTE_ICON; };
    el.pStatusBadge.textContent = 'Resolving audio...';
    el.pStatusBadge.className = 'player-badge resolving';
    el.pOfflineBadge.style.display = 'none';

    // Show loading spinner on play toggle button
    el.pPlayBtn.classList.add('resolving');
    if (el.pPlayIcon) {
      el.pPlayIcon.innerHTML = `
        <svg viewBox="0 0 24 24" style="animation: spin 1s linear infinite; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 3;">
          <circle cx="12" cy="12" r="9" stroke-dasharray="28 28" />
        </svg>
      `;
    }

    // Highlight row across tables & show spinner on active row play button
    document.querySelectorAll('.track-row').forEach(row => {
      const rowId = row.dataset.trackId;
      const isActive = rowId === track.id || rowId === track.yt_video_id;
      row.classList.toggle('active', isActive);
      const rowPlayBtn = row.querySelector('.row-play-btn');
      if (rowPlayBtn) {
        if (isActive) {
          rowPlayBtn.classList.add('resolving');
          rowPlayBtn.innerHTML = `
            <svg viewBox="0 0 24 24" style="animation: spin 1s linear infinite; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 3;">
              <circle cx="12" cy="12" r="8" stroke-dasharray="24 24" />
            </svg>
          `;
        } else {
          rowPlayBtn.classList.remove('resolving');
          rowPlayBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
        }
      }
    });

    // Check offline state
    const isDownloaded = state.offlineTrackIds.has(track.id) || track.isOffline;
    if (isDownloaded) {
      el.pOfflineBadge.style.display = 'inline-flex';
      el.rDownloadBtn.classList.add('downloaded');
      el.rDownloadBtn.title = 'Downloaded offline';
    } else {
      el.rDownloadBtn.classList.remove('downloaded');
      el.rDownloadBtn.title = 'Download song for offline listening';
    }

    // Update queue now playing card
    updateQueueUI();

    // Call IPC to resolve audio stream (Offline or YouTube Music Proxy)
    const result = await window.beamly.playTrack(track);

    // If another track was selected while this was resolving, abort stale resolution
    if (thisRequestId !== currentPlaybackRequestId) {
      return;
    }

    if (!result || !result.streamUrl) {
      throw new Error(result?.error || 'Failed to resolve audio stream');
    }

    // Configure Audio Source
    el.audio.src = result.streamUrl;
    el.audio.volume = state.volume;

    try {
      await el.audio.play();
    } catch (playErr) {
      console.warn('Auto-play caught:', playErr.message);
    }

    state.isPlaying = !el.audio.paused;
    state.isResolving = false;
    el.pPlayBtn.classList.remove('resolving');
    updatePlayPauseIcons(state.isPlaying);

    // Update row play button to active playing pause bars
    document.querySelectorAll('.track-row.active .row-play-btn').forEach(btn => {
      btn.classList.remove('resolving');
      btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    });

    if (result.isOffline) {
      el.pStatusBadge.textContent = 'Playing Offline';
      el.pStatusBadge.className = 'player-badge offline';
      el.pOfflineBadge.style.display = 'inline-flex';
    } else {
      el.pStatusBadge.textContent = 'YouTube Audio';
      el.pStatusBadge.className = 'player-badge';
    }

    // Fetch Live Synced Lyrics asynchronously in the background (non-blocking)
    setTimeout(() => {
      fetchAndDisplayLyrics(track);
    }, 0);

    // Setup MediaSession & System Tray
    setupMediaSession(track);
    window.beamly.updatePlayerStatus({
      isPlaying: true,
      trackTitle: track.title,
      artist: track.artist,
      position: 0,
      duration: track.duration || 0
    });

    // Save last played track for curated home & fetch related autoplay queue
    window.beamly.saveLastPlayedTrack(track).catch(() => {});
    const vidId = track.id || track.yt_video_id;
    if (vidId) {
      fetchRelatedQueue(vidId);
    }

  } catch (err) {
    if (thisRequestId !== currentPlaybackRequestId) return;

    console.error('Audio playback failed:', err);
    state.isResolving = false;
    el.pPlayBtn.classList.remove('resolving');
    updatePlayPauseIcons(false);
    document.querySelectorAll('.track-row.active .row-play-btn').forEach(btn => {
      btn.classList.remove('resolving');
      btn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
    });
    el.pStatusBadge.textContent = 'Playback Failed';
    el.pStatusBadge.className = 'player-badge error';
    showToast(`Could not play track: ${err.message}`);
  }
}

async function togglePlayPause() {
  if (!state.currentTrack || state.isResolving) return;

  try {
    if (el.audio.paused) {
      state.isPlaying = true;
      updatePlayPauseIcons(true);
      await el.audio.play();
      window.beamly.updatePlayerStatus({
        isPlaying: true,
        trackTitle: state.currentTrack.title,
        artist: state.currentTrack.artist
      });
    } else {
      state.isPlaying = false;
      updatePlayPauseIcons(false);
      el.audio.pause();
      window.beamly.updatePlayerStatus({
        isPlaying: false,
        trackTitle: state.currentTrack.title,
        artist: state.currentTrack.artist
      });
    }
  } catch (err) {
    console.warn('Play error:', err.message);
    state.isPlaying = false;
    updatePlayPauseIcons(false);
  }
}

function updatePlayPauseIcons(playing) {
  if (el.pPlayIcon) {
    el.pPlayIcon.innerHTML = playing
      ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>'
      : '<polygon points="6 4 20 12 6 20 6 4"></polygon>';
  }
}

async function playNextTrack() {
  // 1. If user has manually queued tracks, play the next queued track first!
  if (state.queue.length > 0) {
    const nextTrack = state.queue.shift();
    updateQueueUI();
    await playTrack(nextTrack, state.currentTracklist, state.currentTrackIndex);
    return;
  }

  // 2. Play next track from current playlist or album
  if (state.currentTracklist.length > 0) {
    let nextIndex = state.currentTrackIndex + 1;
    if (state.isShuffle) {
      nextIndex = Math.floor(Math.random() * state.currentTracklist.length);
    } else if (nextIndex >= state.currentTracklist.length) {
      nextIndex = state.isRepeat ? 0 : -1;
    }

    if (nextIndex >= 0 && nextIndex < state.currentTracklist.length) {
      await playTrack(state.currentTracklist[nextIndex], state.currentTracklist, nextIndex);
      return;
    }
  }

  // 3. Context-Aware Autoplay: Seamlessly continue with YouTube Music Radio recommendations
  if (!state.isRepeat && state.relatedQueue && state.relatedQueue.length > 0) {
    const nextRadioTrack = state.relatedQueue.shift();
    updateQueueUI();
    showToast(`Autoplay: Playing "${nextRadioTrack.title}"`);
    await playTrack(nextRadioTrack, [nextRadioTrack], 0);
  }
}

async function playPrevTrack() {
  if (state.currentTracklist.length === 0) return;

  // If track played > 3 seconds, restart current track
  if (el.audio.currentTime > 3) {
    el.audio.currentTime = 0;
    return;
  }

  let prevIndex = state.currentTrackIndex - 1;
  if (prevIndex < 0) {
    prevIndex = state.currentTracklist.length - 1;
  }
  await playTrack(state.currentTracklist[prevIndex], state.currentTracklist, prevIndex);
}

// -------------------------------------------------------------------
// 11.1 Queue Management
// -------------------------------------------------------------------

function toggleQueueOverlay() {
  state.isQueueOpen = !state.isQueueOpen;
  if (el.queueOverlay) el.queueOverlay.classList.toggle('active', state.isQueueOpen);
  if (el.rQueueBtn) el.rQueueBtn.classList.toggle('active', state.isQueueOpen);
  if (state.isQueueOpen) {
    updateQueueUI();
  }
}

function closeQueueOverlay() {
  state.isQueueOpen = false;
  if (el.queueOverlay) el.queueOverlay.classList.remove('active');
  if (el.rQueueBtn) el.rQueueBtn.classList.remove('active');
}

function addToQueue(track) {
  if (!track) return;
  state.queue.push(track);
  showToast(`Added "${track.title}" to queue`);
  updateQueueUI();
}

function removeFromQueue(index) {
  if (index >= 0 && index < state.queue.length) {
    const removed = state.queue.splice(index, 1)[0];
    showToast(`Removed "${removed.title}" from queue`);
    updateQueueUI();
  }
}

function clearQueue() {
  state.queue = [];
  showToast('Playback queue cleared');
  updateQueueUI();
}

function playQueueTrack(index) {
  if (index >= 0 && index < state.queue.length) {
    const track = state.queue.splice(index, 1)[0];
    playTrack(track, state.currentTracklist, state.currentTrackIndex);
    updateQueueUI();
  }
}

function updateQueueUI() {
  if (el.queueCountTag) {
    el.queueCountTag.textContent = `${state.queue.length} song${state.queue.length === 1 ? '' : 's'}`;
  }

  // Now Playing card
  if (el.queueNowPlaying) {
    if (state.currentTrack) {
      const artUrl = getArtworkUrl(state.currentTrack);
      el.queueNowPlaying.innerHTML = `
        <img class="queue-now-playing-thumb" src="${escapeHtml(artUrl)}" alt="Art" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
        <div class="queue-now-playing-info">
          <span class="queue-now-playing-title">${escapeHtml(state.currentTrack.title)}</span>
          <span class="queue-now-playing-artist">${escapeHtml(state.currentTrack.artist)}</span>
        </div>
      `;
    } else {
      el.queueNowPlaying.innerHTML = '<div style="color: var(--md-sys-color-on-surface-variant); font-size: 0.88rem; padding: 12px 0;">No track playing</div>';
    }
  }

  // Next in Queue list
  if (el.queueListContainer) {
    if (state.queue.length === 0) {
      el.queueListContainer.innerHTML = '<div style="color: var(--md-sys-color-on-surface-variant); font-size: 0.85rem; padding: 12px 0;">Queue is empty. Click "+ Queue" on any track.</div>';
      return;
    }

    el.queueListContainer.innerHTML = '';
    state.queue.forEach((track, idx) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      const itemArt = getArtworkUrl(track);
      item.innerHTML = `
        <span style="font-size: 0.78rem; font-weight: 600; color: var(--md-sys-color-on-surface-variant); width: 16px;">${idx + 1}</span>
        <img class="queue-item-thumb" src="${escapeHtml(itemArt)}" alt="Thumb" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
        <div class="queue-item-info">
          <span class="queue-item-title">${escapeHtml(track.title)}</span>
          <span class="queue-item-artist">${escapeHtml(track.artist)}</span>
        </div>
        <button class="queue-item-remove-btn" title="Remove from queue" data-queue-remove="${idx}">✕</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-queue-remove]')) {
          e.stopPropagation();
          removeFromQueue(idx);
          return;
        }
        playQueueTrack(idx);
      });

      el.queueListContainer.appendChild(item);
    });
  }

  // Autoplay / Radio Queue recommendations
  if (el.queueAutoplayContainer) {
    if (!state.relatedQueue || state.relatedQueue.length === 0) {
      el.queueAutoplayContainer.innerHTML = '<div style="color: var(--md-sys-color-on-surface-variant); font-size: 0.85rem; padding: 12px 0;">Autoplay radio will generate recommendations when a track plays.</div>';
    } else {
      el.queueAutoplayContainer.innerHTML = '';
      state.relatedQueue.slice(0, 15).forEach((track, idx) => {
        const item = document.createElement('div');
        item.className = 'queue-item autoplay-item';
        const itemArt = getArtworkUrl(track);
        item.innerHTML = `
          <span style="font-size: 0.78rem; font-weight: 600; color: var(--md-sys-color-on-surface-variant); width: 16px;">${idx + 1}</span>
          <img class="queue-item-thumb" src="${escapeHtml(itemArt)}" alt="Thumb" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
          <div class="queue-item-info">
            <span class="queue-item-title">${escapeHtml(track.title)}</span>
            <span class="queue-item-artist">${escapeHtml(track.artist)}</span>
          </div>
          <button class="queue-item-remove-btn" title="Add to manual queue" data-action="promote-to-queue">＋</button>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.closest('[data-action="promote-to-queue"]')) {
            e.stopPropagation();
            state.relatedQueue.splice(idx, 1);
            addToQueue(track);
            return;
          }
          // Play directly from radio
          state.relatedQueue.splice(idx, 1);
          playTrack(track, [track], 0);
        });

        el.queueAutoplayContainer.appendChild(item);
      });
    }
  }
}

// -------------------------------------------------------------------
// 12. Offline Downloads Management
// -------------------------------------------------------------------

async function loadOfflineContent() {
  try {
    const tracks = await window.beamly.getOfflineTracks();
    state.offlineTracks = tracks || [];
    state.offlineTrackIds = new Set(state.offlineTracks.map(t => t.id));

    if (el.offlineStats) {
      el.offlineStats.textContent = `${state.offlineTracks.length} tracks downloaded`;
    }

    renderTrackTable(el.offlineTracksContainer, state.offlineTracks, state.offlineTracks, true);
  } catch (err) {
    console.error('Failed to load offline tracks:', err);
  }
}

async function refreshOfflineStatus() {
  try {
    const tracks = await window.beamly.getOfflineTracks();
    state.offlineTracks = tracks || [];
    state.offlineTrackIds = new Set(state.offlineTracks.map(t => t.id));

    if (state.currentTrack && state.offlineTrackIds.has(state.currentTrack.id)) {
      el.pOfflineBadge.style.display = 'inline-flex';
      el.rDownloadBtn.classList.add('downloaded');
    }

    if (state.currentView === 'offline') {
      loadOfflineContent();
    }
  } catch (err) {
    console.error('Failed to refresh offline status:', err);
  }
}

async function downloadSingleTrack(track) {
  if (!track || !track.id) return;
  if (state.downloadingTrackIds.has(track.id)) return;

  try {
    state.downloadingTrackIds.add(track.id);
    showToast(`Downloading "${track.title}" for offline listening...`);

    // Re-render matching button states
    updateDownloadBtnStates(track.id, 'downloading');

    const result = await window.beamly.downloadTrack(track);

    state.downloadingTrackIds.delete(track.id);

    if (result && result.success) {
      state.offlineTrackIds.add(track.id);
      showToast(`Downloaded "${track.title}"! Available offline.`);
      updateDownloadBtnStates(track.id, 'downloaded');
      refreshOfflineStatus();
    } else {
      throw new Error(result?.error || 'Download error');
    }
  } catch (err) {
    state.downloadingTrackIds.delete(track.id);
    updateDownloadBtnStates(track.id, 'error');
    console.error('Download failed:', err);
    showToast(`Failed to download "${track.title}": ${err.message}`);
  }
}

function updateDownloadBtnStates(trackId, status) {
  // Update Player Bar Download button if active track
  if (state.currentTrack && (state.currentTrack.id === trackId || state.currentTrack.yt_video_id === trackId)) {
    if (status === 'downloaded') {
      el.rDownloadBtn.classList.add('downloaded');
      el.rDownloadBtn.classList.remove('downloading');
      el.pOfflineBadge.style.display = 'inline-flex';
    } else if (status === 'downloading') {
      el.rDownloadBtn.classList.add('downloading');
    } else {
      el.rDownloadBtn.classList.remove('downloading');
    }
  }

  // Update rows in view
  document.querySelectorAll(`.track-row[data-track-id="${trackId}"]`).forEach(row => {
    const btn = row.querySelector('.track-row-action-btn');
    if (!btn) return;
    if (status === 'downloaded') {
      btn.className = 'track-row-action-btn downloaded';
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
      btn.title = 'Downloaded';
    } else if (status === 'downloading') {
      btn.className = 'track-row-action-btn downloading';
    }
  });
}

async function deleteSingleOfflineTrack(trackId) {
  try {
    const result = await window.beamly.deleteOfflineTrack(trackId);
    if (result && result.success) {
      state.offlineTrackIds.delete(trackId);
      showToast('Track removed from offline downloads.');
      loadOfflineContent();
    }
  } catch (err) {
    console.error('Failed to delete offline track:', err);
    showToast('Failed to remove download.');
  }
}

// -------------------------------------------------------------------
// 13. Sleep Timer System
// -------------------------------------------------------------------

function openSleepTimerDialog() {
  if (el.sleepTimerDialog) {
    el.sleepTimerDialog.classList.add('active');
  }
}

function closeSleepTimerDialog() {
  if (el.sleepTimerDialog) {
    el.sleepTimerDialog.classList.remove('active');
  }
}

function setSleepTimer(minutes) {
  clearInterval(state.sleepTimer.intervalId);

  if (minutes === 0) {
    // Turn off
    state.sleepTimer.minutes = 0;
    state.sleepTimer.targetTimestamp = null;
    state.sleepTimer.isEndOfTrack = false;
    el.sleepTimerLabel.textContent = 'Timer';
    el.btnSleepTimer.classList.remove('active');
    showToast('Sleep timer turned off.');
    closeSleepTimerDialog();
    return;
  }

  if (minutes === 'end_of_track') {
    state.sleepTimer.isEndOfTrack = true;
    state.sleepTimer.minutes = 'end_of_track';
    el.sleepTimerLabel.textContent = 'End of Track';
    el.btnSleepTimer.classList.add('active');
    showToast('Playback will stop at the end of this track.');
    closeSleepTimerDialog();
    return;
  }

  const mins = parseInt(minutes, 10);
  const targetMs = Date.now() + mins * 60 * 1000;
  state.sleepTimer.minutes = mins;
  state.sleepTimer.targetTimestamp = targetMs;
  state.sleepTimer.isEndOfTrack = false;
  el.btnSleepTimer.classList.add('active');

  showToast(`Sleep timer set for ${mins} minutes.`);
  closeSleepTimerDialog();

  updateSleepTimerCountdown();
  state.sleepTimer.intervalId = setInterval(updateSleepTimerCountdown, 1000);
}

function updateSleepTimerCountdown() {
  if (!state.sleepTimer.targetTimestamp) return;

  const remainingMs = state.sleepTimer.targetTimestamp - Date.now();
  if (remainingMs <= 0) {
    triggerSleepTimerExpiration();
    return;
  }

  const remMins = Math.ceil(remainingMs / (60 * 1000));
  el.sleepTimerLabel.textContent = `${remMins}m`;
}

function triggerSleepTimerExpiration() {
  clearInterval(state.sleepTimer.intervalId);
  state.sleepTimer.targetTimestamp = null;
  el.sleepTimerLabel.textContent = 'Timer';
  el.btnSleepTimer.classList.remove('active');

  // Gentle fade-out over 4 seconds
  fadeAudioOutAndPause(4000);
}

function fadeAudioOutAndPause(durationMs = 4000) {
  const startVolume = el.audio.volume;
  const startTime = Date.now();

  const fadeInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    el.audio.volume = Math.max(0, startVolume * (1 - progress));

    if (progress >= 1) {
      clearInterval(fadeInterval);
      el.audio.pause();
      state.isPlaying = false;
      updatePlayPauseIcons(false);
      el.audio.volume = state.volume; // Restore original volume for next play
      showToast('Sleep timer expired. Goodnight! 🌙');
    }
  }, 100);
}

// -------------------------------------------------------------------
// 14. Live Synced Lyrics (lrclib.net)
// -------------------------------------------------------------------

async function fetchAndDisplayLyrics(track) {
  if (!track) return;
  state.currentLyrics = [];
  state.activeLyricIndex = -1;
  state.activeLyricEl = null;

  if (el.lyricsSongTitle) el.lyricsSongTitle.textContent = track.title;
  if (el.lyricsSongArtist) el.lyricsSongArtist.textContent = track.artist;
  const lArtUrl = getArtworkUrl(track);
  if (el.lyricsSongThumb) {
    el.lyricsSongThumb.src = lArtUrl;
    el.lyricsSongThumb.onerror = () => { el.lyricsSongThumb.onerror = null; el.lyricsSongThumb.src = FALLBACK_NOTE_ICON; };
  }
  if (el.lyricsScrollBody) {
    el.lyricsScrollBody.innerHTML = '<div class="lyrics-msg">Searching synchronized lyrics...</div>';
  }

  try {
    const lyricsData = await window.beamly.getLyrics(track.title, track.artist, track.duration);
    const rawSynced = lyricsData?.syncedLyrics || lyricsData?.rawLrc;
    const rawPlain = lyricsData?.plainLyrics || lyricsData?.plain;

    if (!lyricsData || (!rawSynced && !rawPlain)) {
      if (el.lyricsScrollBody) {
        el.lyricsScrollBody.innerHTML = '<div class="lyrics-msg">No lyrics available for this song.</div>';
      }
      return;
    }

    if (rawSynced) {
      // Parse LRC format in non-blocking asynchronous chunks to avoid freezing the DOM
      state.currentLyrics = await parseLrcAsync(rawSynced);
      await renderSyncedLyrics(state.currentLyrics);
    } else if (rawPlain) {
      renderPlainLyrics(rawPlain);
    }
  } catch (err) {
    console.error('Lyrics fetch error:', err);
    if (el.lyricsScrollBody) {
      el.lyricsScrollBody.innerHTML = '<div class="lyrics-msg">Could not load lyrics.</div>';
    }
  }
}

async function parseLrcAsync(lrcText) {
  if (!lrcText) return [];
  const rawLines = lrcText.split(/\r?\n/);
  const parsed = [];
  const timeTagRegex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\]/g;
  const chunkSize = 30;

  for (let i = 0; i < rawLines.length; i += chunkSize) {
    const chunk = rawLines.slice(i, i + chunkSize);
    for (const line of chunk) {
      const matches = [...line.matchAll(timeTagRegex)];
      if (matches.length > 0) {
        const text = line.replace(timeTagRegex, '').trim();
        for (const match of matches) {
          const minutes = parseInt(match[1], 10);
          const seconds = parseFloat(match[2]);
          const timeInSec = minutes * 60 + seconds;
          parsed.push({ time: timeInSec, text });
        }
      }
    }
    // Yield to the browser event loop so UI and buttons stay 100% responsive
    if (i + chunkSize < rawLines.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return parsed.sort((a, b) => a.time - b.time);
}

async function renderSyncedLyrics(lyricsList) {
  if (!el.lyricsScrollBody) return;
  el.lyricsScrollBody.innerHTML = '';
  state.activeLyricEl = null;

  if (!lyricsList || lyricsList.length === 0) {
    el.lyricsScrollBody.innerHTML = '<div class="lyrics-msg">No synced lyrics available.</div>';
    return;
  }

  // Use DocumentFragment to batch DOM inserts and yield in chunks for very long tracks
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < lyricsList.length; i++) {
    const item = lyricsList[i];
    const lineEl = document.createElement('div');
    lineEl.className = 'lyric-line';
    lineEl.dataset.index = i;
    lineEl.dataset.time = item.time;
    lineEl.textContent = item.text || '♪';

    // Click line to jump audio timestamp non-blockingly
    lineEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.audio.currentTime = item.time;
      queueSyncActiveLyricLine(item.time);
    });

    fragment.appendChild(lineEl);

    // Yield every 50 lines to prevent DOM blocking on long songs
    if (i > 0 && i % 50 === 0) {
      el.lyricsScrollBody.appendChild(fragment);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  if (fragment.childNodes.length > 0) {
    el.lyricsScrollBody.appendChild(fragment);
  }

  // If lyrics view is already open, sync current playback position immediately
  if (state.isLyricsOpen && el.audio && el.audio.currentTime) {
    queueSyncActiveLyricLine(el.audio.currentTime);
  }
}

function renderPlainLyrics(plainText) {
  if (!el.lyricsScrollBody) return;
  el.lyricsScrollBody.innerHTML = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'white-space: pre-wrap; font-family: inherit; font-size: 1.15rem; line-height: 1.8; text-align: center; color: var(--md-sys-color-on-surface);';
  pre.textContent = plainText;
  el.lyricsScrollBody.appendChild(pre);
}

// User scroll tracking to avoid fighting manual lyrics scrolling
let isUserInteractingWithLyrics = false;
let userLyricsScrollTimeout = null;

if (el.lyricsScrollBody) {
  const onUserScrollLyrics = () => {
    isUserInteractingWithLyrics = true;
    clearTimeout(userLyricsScrollTimeout);
    userLyricsScrollTimeout = setTimeout(() => {
      isUserInteractingWithLyrics = false;
    }, 2500);
  };
  el.lyricsScrollBody.addEventListener('wheel', onUserScrollLyrics, { passive: true });
  el.lyricsScrollBody.addEventListener('touchmove', onUserScrollLyrics, { passive: true });
  el.lyricsScrollBody.addEventListener('pointerdown', onUserScrollLyrics, { passive: true });
}

// Fast binary search for matching lyric line O(log N)
function findActiveLyricIndex(currentTime) {
  const lyrics = state.currentLyrics;
  if (!lyrics || lyrics.length === 0) return -1;
  if (currentTime < lyrics[0].time) return -1;

  let low = 0;
  let high = lyrics.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= currentTime) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

// Localized scroll without full document layout reflow
function scrollToActiveLyric(activeEl, immediate = false) {
  if (!activeEl || !el.lyricsScrollBody) return;
  const containerHeight = el.lyricsScrollBody.clientHeight;
  const targetTop = Math.max(0, activeEl.offsetTop - (containerHeight / 2) + (activeEl.clientHeight / 2));

  el.lyricsScrollBody.scrollTo({
    top: targetTop,
    behavior: immediate ? 'auto' : 'smooth'
  });
}

// Non-blocking RAF-coalesced DOM updater
let syncLyricsRafPending = false;

function queueSyncActiveLyricLine(currentTime) {
  // If lyrics panel is closed or empty, exit immediately in 0ms without touching DOM
  if (!state.isLyricsOpen || state.currentLyrics.length === 0) return;

  const newIdx = findActiveLyricIndex(currentTime);
  // If active lyric hasn't changed, zero DOM operations needed
  if (newIdx === state.activeLyricIndex) return;

  if (syncLyricsRafPending) return;
  syncLyricsRafPending = true;

  requestAnimationFrame(() => {
    syncLyricsRafPending = false;
    updateActiveLyricDOM(newIdx);
  });
}

function updateActiveLyricDOM(activeIdx) {
  if (!state.isLyricsOpen || !el.lyricsScrollBody) return;

  state.activeLyricIndex = activeIdx;

  // Remove previous highlight in O(1)
  if (state.activeLyricEl) {
    state.activeLyricEl.classList.remove('active');
    state.activeLyricEl = null;
  }

  if (activeIdx >= 0 && el.lyricsScrollBody.children[activeIdx]) {
    const newActive = el.lyricsScrollBody.children[activeIdx];
    newActive.classList.add('active');
    state.activeLyricEl = newActive;

    // Smoothly center without fighting user manual scrolling
    if (!isUserInteractingWithLyrics) {
      scrollToActiveLyric(newActive);
    }
  }
}

// Dedicated Lyrics Overlay Controllers
function closeLyricsOverlay(e) {
  if (e) {
    e.preventDefault?.();
    e.stopPropagation?.();
  }
  state.isLyricsOpen = false;
  if (el.lyricsOverlay) {
    el.lyricsOverlay.classList.remove('active', 'open');
  }
  if (el.rLyricsBtn) {
    el.rLyricsBtn.classList.remove('active');
  }
}

function openLyricsOverlay() {
  state.isLyricsOpen = true;
  if (el.lyricsOverlay) {
    el.lyricsOverlay.classList.add('active');
  }
  if (el.rLyricsBtn) {
    el.rLyricsBtn.classList.add('active');
  }
  // Immediately position active lyric line when opening without lag
  if (state.activeLyricEl && el.lyricsScrollBody) {
    requestAnimationFrame(() => {
      scrollToActiveLyric(state.activeLyricEl, true);
    });
  }
}

function toggleLyricsOverlay(e) {
  if (e) {
    e.preventDefault?.();
    e.stopPropagation?.();
  }
  if (state.isLyricsOpen) {
    closeLyricsOverlay();
  } else {
    openLyricsOverlay();
  }
}

// -------------------------------------------------------------------
// 15. Google Cast Integration
// -------------------------------------------------------------------

async function updateCastDevices() {
  try {
    const devices = await window.beamly.getCastDevices();
    state.castDevices = devices || [];
    renderCastDevicesPopover();
  } catch (err) {
    console.error('Failed to get Cast devices:', err);
  }
}

function renderCastDevicesPopover() {
  if (!el.rCastDevicesList) return;
  el.rCastDevicesList.innerHTML = '';

  if (state.castDevices.length === 0) {
    el.rCastDevicesList.innerHTML = `
      <div style="font-size: 0.82rem; color: var(--md-sys-color-on-surface-variant); padding: 8px 0;">
        Scanning local Wi-Fi for Google Cast & Nest devices...
      </div>
    `;
    return;
  }

  state.castDevices.forEach(device => {
    const item = document.createElement('div');
    item.className = 'cast-device-item';
    const isCurrentActive = state.activeCastDevice && state.activeCastDevice.id === device.id;
    item.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
      <span>${escapeHtml(device.name)}</span>
      ${isCurrentActive ? '<span style="margin-left: auto; color: var(--md-sys-color-primary); font-size: 0.8rem; font-weight: 700;">Connected</span>' : ''}
    `;
    item.addEventListener('click', () => connectToCastDevice(device));
    el.rCastDevicesList.appendChild(item);
  });
}

async function connectToCastDevice(device) {
  try {
    showToast(`Connecting to ${device.name}...`);
    state.activeCastDevice = device;
    el.rCastBtn.classList.add('active');

    // If audio is currently playing, hand off current stream to Cast
    if (state.currentTrack && el.audio.src) {
      await window.beamly.castToDevice(device.id, el.audio.src, {
        title: state.currentTrack.title,
        artist: state.currentTrack.artist,
        artwork: state.currentTrack.artwork
      });
      showToast(`Casting to ${device.name}`);
    }

    el.rCastPopover.classList.remove('active');
  } catch (err) {
    console.error('Cast connection failed:', err);
    showToast(`Failed to connect to ${device.name}`);
  }
}

// -------------------------------------------------------------------
// 15b. Settings & Preferences Modal Controller
// -------------------------------------------------------------------

async function openSettingsModal() {
  state.isSettingsOpen = true;
  if (el.settingsModal) {
    el.settingsModal.classList.add('open');
  }
  updateSettingsAccountUI();
  updateSettingsAudioQualityUI();
  updateSettingsThemeUI();
  await refreshSettingsCacheStats();
}

function closeSettingsModal() {
  state.isSettingsOpen = false;
  if (el.settingsModal) {
    el.settingsModal.classList.remove('open');
  }
}

function updateSettingsAccountUI() {
  if (!el.settingsUserName) return;
  const isLogged = state.googleUser && state.googleUser.loggedIn;
  const profile = state.googleUser?.profile;

  if (isLogged && profile) {
    el.settingsUserName.textContent = profile.name || 'Google Account';
    if (el.settingsUserStatus) el.settingsUserStatus.textContent = 'Connected to YouTube Music';
    if (el.settingsUserAvatar) {
      el.settingsUserAvatar.src = profile.avatar || 'assets/logo.png';
      el.settingsUserAvatar.onerror = () => { el.settingsUserAvatar.src = 'assets/logo.png'; };
    }
    if (el.btnSettingsAuthAction) {
      el.btnSettingsAuthAction.textContent = 'Sign Out';
      el.btnSettingsAuthAction.classList.add('logout-mode');
    }
  } else {
    el.settingsUserName.textContent = 'Guest User';
    if (el.settingsUserStatus) el.settingsUserStatus.textContent = 'Not Connected';
    if (el.settingsUserAvatar) {
      el.settingsUserAvatar.src = 'assets/logo.png';
    }
    if (el.btnSettingsAuthAction) {
      el.btnSettingsAuthAction.textContent = 'Sign In with Google';
      el.btnSettingsAuthAction.classList.remove('logout-mode');
    }
  }
}

function updateSettingsAudioQualityUI() {
  if (!el.audioQualitySegmented) return;
  const currentQuality = state.audioQuality || 'normal';
  const buttons = el.audioQualitySegmented.querySelectorAll('.seg-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.quality === currentQuality);
  });
}

function setAudioQuality(quality) {
  state.audioQuality = quality;
  localStorage.setItem('beamly_audio_quality', quality);
  updateSettingsAudioQualityUI();
  const labelMap = { low: 'Data Saver (64 kbps)', normal: 'Normal (128 kbps)', high: 'High (256 kbps)' };
  showToast(`Audio Quality set to ${labelMap[quality] || quality}`);
}

function updateSettingsThemeUI() {
  if (el.btnThemeSegDark && el.btnThemeSegLight) {
    el.btnThemeSegDark.classList.toggle('active', state.theme === 'dark');
    el.btnThemeSegLight.classList.toggle('active', state.theme === 'light');
  }
}

async function refreshSettingsCacheStats() {
  try {
    const stats = await window.beamly.getCacheStats();
    if (!stats) return;

    if (el.statDbSize) {
      const bytes = stats.dbSizeBytes || 0;
      if (bytes > 1024 * 1024) {
        el.statDbSize.textContent = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      } else {
        el.statDbSize.textContent = `${(bytes / 1024).toFixed(1)} KB`;
      }
    }

    if (el.statMatchesCount) {
      el.statMatchesCount.textContent = (stats.trackMatchesCount || 0).toLocaleString();
    }

    if (el.statOfflineCount) {
      el.statOfflineCount.textContent = (stats.offlineTracksCount || 0).toLocaleString();
    }
  } catch (err) {
    console.error('Failed to fetch cache stats:', err);
  }
}

async function handleClearMatchesCache() {
  try {
    const res = await window.beamly.clearTrackMatchesCache();
    if (res && res.success) {
      showToast('Track match cache cleared successfully.');
      await refreshSettingsCacheStats();
    } else {
      showToast('Failed to clear track cache.');
    }
  } catch (err) {
    console.error('Error clearing track cache:', err);
    showToast('Failed to clear track cache.');
  }
}

async function handleClearAllCache() {
  try {
    const res = await window.beamly.clearAllCache();
    if (res && res.success) {
      showToast('Application cache purged successfully.');
      await refreshSettingsCacheStats();
    } else {
      showToast('Failed to purge cache.');
    }
  } catch (err) {
    console.error('Error purging all cache:', err);
    showToast('Failed to purge cache.');
  }
}

// -------------------------------------------------------------------
// 15.1 Playlist Management Modals (Create, Import, Add-to-Playlist)
// -------------------------------------------------------------------

function openPlaylistModal(defaultTab = 'create') {
  if (!el.playlistModal) return;
  switchPlaylistModalTab(defaultTab);
  el.playlistModal.classList.add('active');
  if (defaultTab === 'create' && el.inputNewPlName) {
    el.inputNewPlName.focus();
  } else if (defaultTab === 'import' && el.inputImportPlUrl) {
    el.inputImportPlUrl.focus();
  }
}

function closePlaylistModal() {
  if (!el.playlistModal) return;
  el.playlistModal.classList.remove('active');
  if (el.inputNewPlName) el.inputNewPlName.value = '';
  if (el.inputNewPlDesc) el.inputNewPlDesc.value = '';
  if (el.inputImportPlUrl) el.inputImportPlUrl.value = '';
  if (el.btnConfirmImportPl) el.btnConfirmImportPl.disabled = false;
  if (el.importPlBtnText) el.importPlBtnText.textContent = 'Import Playlist';
}

function switchPlaylistModalTab(tabName) {
  const isCreate = tabName === 'create';
  if (el.tabBtnCreatePl) el.tabBtnCreatePl.classList.toggle('active', isCreate);
  if (el.tabBtnImportPl) el.tabBtnImportPl.classList.toggle('active', !isCreate);
  if (el.tabContentCreatePl) el.tabContentCreatePl.classList.toggle('active', isCreate);
  if (el.tabContentImportPl) el.tabContentImportPl.classList.toggle('active', !isCreate);
}

async function handleCreateLocalPlaylist() {
  const name = el.inputNewPlName ? el.inputNewPlName.value.trim() : '';
  const desc = el.inputNewPlDesc ? el.inputNewPlDesc.value.trim() : '';
  if (!name) {
    showToast('Please enter a playlist name.');
    el.inputNewPlName?.focus();
    return;
  }

  try {
    const pl = await window.beamly.createLocalPlaylist({ name, description: desc });
    showToast(`Created playlist "${name}"!`);
    closePlaylistModal();
    await loadSidebarLibrary();
    if (pl && pl.id) {
      openPlaylist(pl.id);
    }
  } catch (err) {
    console.error('Failed to create playlist:', err);
    showToast(`Could not create playlist: ${err.message}`);
  }
}

async function handleImportPlaylistUrl() {
  const url = el.inputImportPlUrl ? el.inputImportPlUrl.value.trim() : '';
  if (!url) {
    showToast('Please enter a YouTube or YouTube Music playlist link.');
    el.inputImportPlUrl?.focus();
    return;
  }

  try {
    if (el.btnConfirmImportPl) el.btnConfirmImportPl.disabled = true;
    if (el.importPlBtnText) el.importPlBtnText.textContent = 'Importing...';
    showToast('Fetching playlist tracks from YouTube...');

    const result = await window.beamly.importPlaylist(url);
    if (!result || !result.tracks || result.tracks.length === 0) {
      throw new Error(result?.error || 'No tracks found in playlist link.');
    }

    const plName = result.title || 'Imported Playlist';
    const plDesc = result.description || `Imported from YouTube (${result.tracks.length} tracks)`;

    const importedPl = await window.beamly.createLocalPlaylist({
      name: plName,
      description: plDesc,
      tracks: result.tracks,
      thumbnail: result.thumbnail
    });

    showToast(`Imported ${result.tracks.length} tracks into "${plName}"!`);
    closePlaylistModal();
    await loadSidebarLibrary();
    if (importedPl && importedPl.id) {
      openPlaylist(importedPl.id);
    }
  } catch (err) {
    console.error('Failed to import playlist:', err);
    showToast(`Import failed: ${err.message}`);
  } finally {
    if (el.btnConfirmImportPl) el.btnConfirmImportPl.disabled = false;
    if (el.importPlBtnText) el.importPlBtnText.textContent = 'Import Playlist';
  }
}

async function openAddToPlaylistModal(track) {
  if (!track || !el.addToPlaylistModal) return;
  state.targetTrackForPlaylist = track;
  if (el.addToPlTrackInfo) {
    el.addToPlTrackInfo.textContent = `Adding "${track.title}" by ${track.artist}`;
  }

  // Refresh playlists
  try {
    const localPlaylists = await window.beamly.getLocalPlaylists();
    state.localPlaylists = localPlaylists || [];
  } catch (err) {
    console.warn('Error fetching local playlists:', err);
  }

  if (el.addToPlList) {
    el.addToPlList.innerHTML = '';
    if (!state.localPlaylists || state.localPlaylists.length === 0) {
      el.addToPlList.innerHTML = '<div style="color: var(--md-sys-color-on-surface-variant); font-size: 0.88rem; text-align: center; padding: 20px 0;">No local playlists yet. Click "+ Create New Playlist" below.</div>';
    } else {
      state.localPlaylists.forEach(pl => {
        const item = document.createElement('div');
        item.className = 'add-to-pl-item';
        const artUrl = getArtworkUrl(pl);
        item.innerHTML = `
          <img class="add-to-pl-thumb" src="${escapeHtml(artUrl)}" alt="Cover" loading="lazy" onerror="this.onerror=null; this.src='${FALLBACK_NOTE_ICON}';">
          <div class="add-to-pl-meta">
            <span class="add-to-pl-name">${escapeHtml(pl.name || 'Playlist')}</span>
            <span class="add-to-pl-count">${(pl.tracks || []).length} songs</span>
          </div>
        `;
        item.addEventListener('click', async () => {
          try {
            await window.beamly.addTrackToLocalPlaylist(pl.id, track);
            showToast(`Added "${track.title}" to ${pl.name}!`);
            closeAddToPlaylistModal();
            await loadSidebarLibrary();
            // If currently viewing this playlist, refresh
            if (state.currentView === 'playlist' && state.activePlaylist?.id === pl.id) {
              openPlaylist(pl.id);
            }
          } catch (addErr) {
            console.error('Failed to add track to playlist:', addErr);
            showToast('Failed to add track to playlist.');
          }
        });
        el.addToPlList.appendChild(item);
      });
    }
  }

  el.addToPlaylistModal.classList.add('active');
}

function closeAddToPlaylistModal() {
  if (!el.addToPlaylistModal) return;
  el.addToPlaylistModal.classList.remove('active');
  state.targetTrackForPlaylist = null;
}

// -------------------------------------------------------------------
// 16. MediaSession API & Background Playback
// -------------------------------------------------------------------

function setupMediaSession(track) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || 'Beamly Music',
    artwork: [
      { src: track.artwork || 'assets/logo.png', sizes: '512x512', type: 'image/jpeg' }
    ]
  });

  navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
  navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
  navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime && el.audio.duration) {
      el.audio.currentTime = details.seekTime;
    }
  });
}

// -------------------------------------------------------------------
// 17. Event Listeners Setup
// -------------------------------------------------------------------

function setupEventListeners() {
  // Theme Toggle
  el.btnThemeToggle?.addEventListener('click', toggleTheme);

  // Navigation Links
  el.navHome?.addEventListener('click', () => navigateTo('home'));
  el.navSearch?.addEventListener('click', () => navigateTo('search'));
  el.navLibrary?.addEventListener('click', () => navigateTo('library'));
  el.navOffline?.addEventListener('click', () => navigateTo('offline'));
  el.navSettings?.addEventListener('click', (e) => {
    e.preventDefault();
    openSettingsModal();
  });
  el.btnNavBack?.addEventListener('click', goBack);
  el.btnNavForward?.addEventListener('click', goForward);

  // Topbar Settings Trigger
  el.btnTopbarSettings?.addEventListener('click', (e) => {
    e.preventDefault();
    openSettingsModal();
  });

  // Settings Modal Controls
  el.btnCloseSettings?.addEventListener('click', (e) => {
    e.preventDefault();
    closeSettingsModal();
  });

  el.btnSettingsDone?.addEventListener('click', (e) => {
    e.preventDefault();
    closeSettingsModal();
  });

  el.settingsModal?.addEventListener('click', (e) => {
    if (e.target === el.settingsModal) closeSettingsModal();
  });

  el.btnSettingsAuthAction?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (state.googleUser && state.googleUser.loggedIn) {
      await triggerUserLogout();
    } else {
      await triggerGoogleLogin();
    }
  });

  el.audioQualitySegmented?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (btn && btn.dataset.quality) {
      setAudioQuality(btn.dataset.quality);
    }
  });

  el.btnThemeSegDark?.addEventListener('click', (e) => {
    e.preventDefault();
    applyTheme('dark');
  });

  el.btnThemeSegLight?.addEventListener('click', (e) => {
    e.preventDefault();
    applyTheme('light');
  });

  el.btnSettingsClearMatches?.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleClearMatchesCache();
  });

  el.btnSettingsClearAll?.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleClearAllCache();
  });

  // Google / YouTube Music Authentication
  el.btnGoogleLogin?.addEventListener('click', triggerGoogleLogin);
  el.btnSidebarGoogleLogin?.addEventListener('click', triggerGoogleLogin);
  el.btnUserLogout?.addEventListener('click', triggerUserLogout);

  // Sidebar Liked Music item & filter chip
  const handleLikedMusicClick = (e) => {
    e?.preventDefault();
    if (!state.googleUser.loggedIn) {
      showToast('Please sign in with Google to access your Liked Music.');
      triggerGoogleLogin();
      return;
    }
    openPlaylist('LM');
  };
  el.sidebarItemLiked?.addEventListener('click', handleLikedMusicClick);
  el.chipLiked?.addEventListener('click', handleLikedMusicClick);
  el.chipPlaylists?.addEventListener('click', () => navigateTo('library'));
  el.chipAll?.addEventListener('click', () => navigateTo('library'));

  // Playlist Management Modal Triggers & Actions
  el.btnCreatePlaylistTrigger?.addEventListener('click', () => openPlaylistModal('create'));
  el.btnClosePlaylistModal?.addEventListener('click', closePlaylistModal);
  el.btnCancelCreatePl?.addEventListener('click', closePlaylistModal);
  el.btnCancelImportPl?.addEventListener('click', closePlaylistModal);
  el.tabBtnCreatePl?.addEventListener('click', () => switchPlaylistModalTab('create'));
  el.tabBtnImportPl?.addEventListener('click', () => switchPlaylistModalTab('import'));
  el.btnConfirmCreatePl?.addEventListener('click', handleCreateLocalPlaylist);
  el.btnConfirmImportPl?.addEventListener('click', handleImportPlaylistUrl);
  el.playlistModal?.addEventListener('click', (e) => {
    if (e.target === el.playlistModal) closePlaylistModal();
  });

  // Add-to-Playlist Modal Triggers & Actions
  el.btnCloseAddToPlModal?.addEventListener('click', closeAddToPlaylistModal);
  el.btnCancelAddToPl?.addEventListener('click', closeAddToPlaylistModal);
  el.btnAddToNewPlTrigger?.addEventListener('click', () => {
    closeAddToPlaylistModal();
    openPlaylistModal('create');
  });
  el.addToPlaylistModal?.addEventListener('click', (e) => {
    if (e.target === el.addToPlaylistModal) closeAddToPlaylistModal();
  });

  // Player Controls (Non-blocking async handlers)
  el.pPlayBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await togglePlayPause();
  });

  el.pNextBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await playNextTrack();
  });

  el.pPrevBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    await playPrevTrack();
  });

  // Shuffle & Repeat
  el.pShuffleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    state.isShuffle = !state.isShuffle;
    el.pShuffleBtn.classList.toggle('active', state.isShuffle);
    showToast(`Shuffle ${state.isShuffle ? 'Enabled' : 'Disabled'}`);
  });

  el.pRepeatBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    state.isRepeat = !state.isRepeat;
    el.pRepeatBtn.classList.toggle('active', state.isRepeat);
    showToast(`Repeat ${state.isRepeat ? 'Enabled' : 'Disabled'}`);
  });

  // Download Active Track from Player Bar
  el.rDownloadBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (state.currentTrack) {
      await downloadSingleTrack(state.currentTrack);
    } else {
      showToast('No track currently playing.');
    }
  });

  // Synced Lyrics Overlay Toggle & Direct Close Listeners
  el.rLyricsBtn?.addEventListener('click', toggleLyricsOverlay);
  el.lyricsCloseBtn?.addEventListener('click', closeLyricsOverlay);

  // Close Settings, Lyrics, Queue or Playlist Modals with Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.isSettingsOpen) closeSettingsModal();
      if (state.isLyricsOpen) closeLyricsOverlay();
      if (state.isQueueOpen) closeQueueOverlay();
      if (el.playlistModal?.classList.contains('active')) closePlaylistModal();
      if (el.addToPlaylistModal?.classList.contains('active')) closeAddToPlaylistModal();
    }
  });

  // Playback Queue Overlay Toggle
  el.rQueueBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleQueueOverlay();
  });

  el.queueCloseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeQueueOverlay();
  });

  el.btnClearQueue?.addEventListener('click', (e) => {
    e.preventDefault();
    clearQueue();
  });

  // Sleep Timer Dialog
  el.btnSleepTimer?.addEventListener('click', (e) => {
    e.preventDefault();
    openSleepTimerDialog();
  });

  el.btnCloseTimerDialog?.addEventListener('click', (e) => {
    e.preventDefault();
    closeSleepTimerDialog();
  });

  el.sleepTimerDialog?.addEventListener('click', (e) => {
    if (e.target === el.sleepTimerDialog) closeSleepTimerDialog();
  });

  el.timerOptionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const minutes = btn.dataset.minutes;
      setSleepTimer(minutes);
    });
  });

  // Google Cast Popover (Non-blocking async)
  el.rCastBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    el.rCastPopover.classList.toggle('active');
    await updateCastDevices();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#r-cast-btn') && !e.target.closest('#r-cast-popover')) {
      el.rCastPopover?.classList.remove('active');
    }
  });

  // Volume Slider
  el.pVolumeSlider?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.volume = val;
    state.isMuted = val === 0;
    el.audio.volume = val;
    el.pVolumeFill.style.width = `${val * 100}%`;
    localStorage.setItem('beamly_volume', val.toString());
  });

  el.rVolIconBtn?.addEventListener('click', () => {
    if (state.isMuted) {
      el.audio.volume = state.volume || 0.8;
      state.isMuted = false;
      el.pVolumeSlider.value = state.volume || 0.8;
      el.pVolumeFill.style.width = `${(state.volume || 0.8) * 100}%`;
    } else {
      el.audio.volume = 0;
      state.isMuted = true;
      el.pVolumeSlider.value = 0;
      el.pVolumeFill.style.width = '0%';
    }
  });

  // Audio Player Events
  el.audio.addEventListener('timeupdate', () => {
    const current = el.audio.currentTime || 0;
    const duration = el.audio.duration || state.currentTrack?.duration || 0;

    el.pCurrentTime.textContent = formatDuration(current);
    el.pDurationTime.textContent = formatDuration(duration);

    if (duration > 0) {
      const percent = (current / duration) * 100;
      el.pProgressFill.style.width = `${percent}%`;
      el.pProgressSlider.value = percent;
    }

    // Live synced lyrics highlight (non-blocking, RAF-coalesced, O(log N))
    queueSyncActiveLyricLine(current);
  });

  el.audio.addEventListener('ended', () => {
    if (state.sleepTimer.isEndOfTrack) {
      state.sleepTimer.isEndOfTrack = false;
      el.sleepTimerLabel.textContent = 'Timer';
      el.btnSleepTimer.classList.remove('active');
      showToast('Track ended. Sleep timer stopped playback. Goodnight!');
      return;
    }
    playNextTrack();
  });

  // Progress Bar Seek
  el.pProgressSlider?.addEventListener('input', (e) => {
    const percent = parseFloat(e.target.value);
    el.pProgressFill.style.width = `${percent}%`;
    const duration = el.audio.duration || state.currentTrack?.duration || 0;
    if (duration > 0) {
      el.audio.currentTime = (percent / 100) * duration;
    }
  });

  // IPC Event Subscriptions
  window.beamly.onGoogleAuthChanged(async (authData) => {
    await checkAuthStatus();
  });

  window.beamly.onPlayerTogglePlay(() => togglePlayPause());
  window.beamly.onPlayerNext(() => playNextTrack());
  window.beamly.onPlayerPrev(() => playPrevTrack());

  window.beamly.onCastDevicesUpdated((devices) => {
    state.castDevices = devices || [];
    renderCastDevicesPopover();
  });

  // Keyboard Shortcuts (Space for Play/Pause)
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    }
  });
}

// -------------------------------------------------------------------
// 18. Initialization
// -------------------------------------------------------------------

async function init() {
  // Apply saved theme
  applyTheme(state.theme);

  // Set greeting
  updateGreeting();

  // Initialize Volume UI
  if (el.pVolumeSlider && el.pVolumeFill) {
    el.pVolumeSlider.value = state.volume;
    el.pVolumeFill.style.width = `${state.volume * 100}%`;
    el.audio.volume = state.volume;
  }

  // Setup Search input & Event listeners
  setupSearch();
  setupEventListeners();
  updateSettingsAudioQualityUI();

  // Load Offline database items
  await refreshOfflineStatus();

  // Check Google / YouTube Music Authentication & Load Home Shelves
  await checkAuthStatus();

  // Scan initial cast devices
  updateCastDevices();
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
