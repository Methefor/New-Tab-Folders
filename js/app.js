/* ===================================================
   NEW TAB FOLDERS — Main App
   =================================================== */

// ---------- Storage Abstraction ----------
const Storage = {
    async get(keys) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                return new Promise((resolve, reject) =>
                    chrome.storage.local.get(keys, result => {
                        if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
                        else resolve(result);
                    })
                );
            }
        } catch (err) {
            console.error('Storage.get error:', err);
            return {};
        }
        const result = {};
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach(k => {
            try {
                const val = localStorage.getItem(k);
                if (val !== null) result[k] = JSON.parse(val);
            } catch { /* skip bad entries */ }
        });
        return result;
    },
    async set(data) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                return new Promise((resolve, reject) =>
                    chrome.storage.local.set(data, () => {
                        if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
                        else resolve();
                    })
                );
            }
        } catch (err) {
            console.error('Storage.set error:', err);
            return;
        }
        Object.entries(data).forEach(([k, v]) => {
            try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota exceeded */ }
        });
    }
};

// ---------- Default Data ----------
const DEFAULT_FOLDERS = [
    {
        id: 'f1', name: 'Comfort Zone', color: 'red',
        links: [
            { id: 'l1', title: 'YouTube', url: 'https://www.youtube.com', icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128' },
            { id: 'l2', title: 'YouTube Music', url: 'https://music.youtube.com', icon: 'https://www.google.com/s2/favicons?domain=music.youtube.com&sz=128' },
            { id: 'l3', title: 'Netflix', url: 'https://www.netflix.com/browse', icon: 'https://www.google.com/s2/favicons?domain=netflix.com&sz=128' },
            { id: 'l4', title: 'Disney+', url: 'https://www.disneyplus.com', icon: 'https://www.google.com/s2/favicons?domain=disneyplus.com&sz=128' },
            { id: 'l5', title: 'Steam', url: 'https://store.steampowered.com', icon: 'https://www.google.com/s2/favicons?domain=steampowered.com&sz=128' }
        ]
    },
    {
        id: 'f2', name: 'Ai Tools', color: 'blue',
        links: [
            { id: 'h1', title: 'Works', type: 'header' },
            { id: 'l6', title: 'GitHub', url: 'https://github.com', icon: 'https://www.google.com/s2/favicons?domain=github.com&sz=128' },
            { id: 'l7', title: 'NoteBookLM', url: 'https://notebooklm.google.com', icon: 'https://www.google.com/s2/favicons?domain=notebooklm.google.com&sz=128' },
            { id: 'l8', title: 'Notion', url: 'https://www.notion.so', icon: 'https://www.google.com/s2/favicons?domain=notion.so&sz=128' },
            { id: 'h2', title: 'Ai Chat', type: 'header' },
            { id: 'l9', title: 'Claude', url: 'https://claude.ai', icon: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=128' },
            { id: 'l10', title: 'Gemini', url: 'https://gemini.google.com', icon: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128' },
            { id: 'l11', title: 'DeepSeek', url: 'https://chat.deepseek.com', icon: 'https://www.google.com/s2/favicons?domain=chat.deepseek.com&sz=128' },
            { id: 'l12', title: 'Grok', url: 'https://grok.x.ai', icon: 'https://www.google.com/s2/favicons?domain=grok.x.ai&sz=128' },
            { id: 'h3', title: 'DataBase', type: 'header' },
            { id: 'l13', title: 'Supabase', url: 'https://supabase.com', icon: 'https://www.google.com/s2/favicons?domain=supabase.com&sz=128' },
            { id: 'l14', title: 'Firecrawl', url: 'https://firecrawl.dev', icon: 'https://www.google.com/s2/favicons?domain=firecrawl.dev&sz=128' }
        ]
    },
    {
        id: 'f3', name: 'Projects', color: 'green',
        links: [
            { id: 'l15', title: 'My Portfolio', url: '#', icon: '📁' }
        ]
    }
];

const FREE_FOLDER_LIMIT = 3;

// TRANSLATIONS constant is now loaded from js/translations.js

// ---------- App State ----------
const App = {
    data: {
        folders: [],
        isPro: false,
        proExpiresAt: null,
        theme: 'dark',
        tutorialCompleted: false,
        sidebarCollapsed: false,
        tabsSortOrder: 'recent',
        language: 'TR',
        columnCount: 'auto',
        compactMode: false,
        updatedAt: 0,
        licenseKey: null,
        licenseInstanceId: null,
        lastSeenVersion: null,
        background: { type: 'none', value: '' },
        quickBarLinks: [],
        linkStats: {},
        searchEngine: 'google'
    },
    _editingFolderId: null,
    _editingLinkId: null,
    _pendingAction: null,    // for confirm dialog
    _undoStack: [],          // for Ctrl+Z undo
    _activeTag: null,        // tag filter
    _brokenLinks: new Set(), // broken link ids (transient)
    _dragLink: null,         // link being reordered
    _dragFolder: null,       // folder being reordered
    _pendingChromeBookmarks: null, // chrome bookmarks import preview

    // Folder templates
    FOLDER_TEMPLATES: [
        { key: 'blank',   icon: '📁', color: 'blue',   links: [] },
        { key: 'work',    icon: '💼', color: 'blue',   links: [
            { title: 'Gmail',        url: 'https://mail.google.com' },
            { title: 'Google Drive', url: 'https://drive.google.com' },
            { title: 'Notion',       url: 'https://notion.so' },
            { title: 'GitHub',       url: 'https://github.com' },
        ]},
        { key: 'reading', icon: '📚', color: 'green',  links: [
            { title: 'Medium',       url: 'https://medium.com' },
            { title: 'Hacker News',  url: 'https://news.ycombinator.com' },
            { title: 'Wikipedia',    url: 'https://wikipedia.org' },
            { title: 'Reddit',       url: 'https://reddit.com' },
        ]},
        { key: 'social',  icon: '🌐', color: 'purple', links: [
            { title: 'X / Twitter',  url: 'https://x.com' },
            { title: 'Instagram',    url: 'https://instagram.com' },
            { title: 'LinkedIn',     url: 'https://linkedin.com' },
            { title: 'YouTube',      url: 'https://youtube.com' },
        ]},
        { key: 'ai',      icon: '🤖', color: 'teal',   links: [
            { title: 'Claude',       url: 'https://claude.ai' },
            { title: 'ChatGPT',      url: 'https://chat.openai.com' },
            { title: 'Gemini',       url: 'https://gemini.google.com' },
            { title: 'DeepSeek',     url: 'https://chat.deepseek.com' },
        ]},
    ],

    // Starter Packs — multi-folder collections
    STARTER_PACKS: [
        {
            key: 'remote-work', pro: false,
            icon: '🏢', name: 'Remote Worker',
            desc: 'Communication · Projects · Dev Tools',
            folders: [
                { name: '📧 Communication', color: 'blue', links: [
                    { title: 'Gmail',      url: 'https://mail.google.com' },
                    { title: 'Slack',      url: 'https://slack.com' },
                    { title: 'Zoom',       url: 'https://zoom.us' },
                    { title: 'Teams',      url: 'https://teams.microsoft.com' },
                    { title: 'Discord',    url: 'https://discord.com' },
                ]},
                { name: '📋 Projects', color: 'green', links: [
                    { title: 'Notion',     url: 'https://notion.so' },
                    { title: 'Trello',     url: 'https://trello.com' },
                    { title: 'Linear',     url: 'https://linear.app' },
                    { title: 'Jira',       url: 'https://atlassian.com/software/jira' },
                    { title: 'Asana',      url: 'https://asana.com' },
                ]},
                { name: '💻 Dev Tools', color: 'teal', links: [
                    { title: 'GitHub',     url: 'https://github.com' },
                    { title: 'Vercel',     url: 'https://vercel.com' },
                    { title: 'Netlify',    url: 'https://netlify.com' },
                    { title: 'Stack Overflow', url: 'https://stackoverflow.com' },
                    { title: 'MDN Docs',   url: 'https://developer.mozilla.org' },
                ]},
            ]
        },
        {
            key: 'student', pro: false,
            icon: '📚', name: 'Student',
            desc: 'Learning · Study Tools · Research',
            folders: [
                { name: '🎓 Learning', color: 'blue', links: [
                    { title: 'Coursera',      url: 'https://coursera.org' },
                    { title: 'edX',           url: 'https://edx.org' },
                    { title: 'Khan Academy',  url: 'https://khanacademy.org' },
                    { title: 'YouTube',       url: 'https://youtube.com' },
                    { title: 'Udemy',         url: 'https://udemy.com' },
                ]},
                { name: '📝 Study Tools', color: 'green', links: [
                    { title: 'Notion',        url: 'https://notion.so' },
                    { title: 'Google Docs',   url: 'https://docs.google.com' },
                    { title: 'Anki',          url: 'https://apps.ankiweb.net' },
                    { title: 'Quizlet',       url: 'https://quizlet.com' },
                    { title: 'Wolfram Alpha', url: 'https://wolframalpha.com' },
                ]},
                { name: '🔬 Research', color: 'purple', links: [
                    { title: 'Google Scholar',url: 'https://scholar.google.com' },
                    { title: 'Wikipedia',     url: 'https://wikipedia.org' },
                    { title: 'PubMed',        url: 'https://pubmed.ncbi.nlm.nih.gov' },
                    { title: 'ResearchGate',  url: 'https://researchgate.net' },
                ]},
            ]
        },
        {
            key: 'cinema', pro: true,
            icon: '🎬', name: 'Cinema & TV',
            desc: 'Streaming · Series & Film · Music',
            folders: [
                { name: '🍿 Streaming', color: 'red', links: [
                    { title: 'Netflix',       url: 'https://netflix.com' },
                    { title: 'YouTube',       url: 'https://youtube.com' },
                    { title: 'Disney+',       url: 'https://disneyplus.com' },
                    { title: 'Amazon Prime',  url: 'https://primevideo.com' },
                    { title: 'HBO Max',       url: 'https://max.com' },
                    { title: 'Apple TV+',     url: 'https://tv.apple.com' },
                ]},
                { name: '⭐ Discover', color: 'orange', links: [
                    { title: 'IMDb',          url: 'https://imdb.com' },
                    { title: 'Letterboxd',    url: 'https://letterboxd.com' },
                    { title: 'Rotten Tomatoes', url: 'https://rottentomatoes.com' },
                    { title: 'Trakt.tv',      url: 'https://trakt.tv' },
                    { title: 'JustWatch',     url: 'https://justwatch.com' },
                ]},
                { name: '🎵 Music & Podcast', color: 'green', links: [
                    { title: 'Spotify',       url: 'https://spotify.com' },
                    { title: 'YouTube Music', url: 'https://music.youtube.com' },
                    { title: 'Apple Music',   url: 'https://music.apple.com' },
                    { title: 'Pocket Casts',  url: 'https://pocketcasts.com' },
                ]},
            ]
        },
        {
            key: 'influencer', pro: true,
            icon: '📱', name: 'Influencer',
            desc: 'Social Media · Design · Analytics',
            folders: [
                { name: '📢 Social Media', color: 'purple', links: [
                    { title: 'YouTube Studio',url: 'https://studio.youtube.com' },
                    { title: 'TikTok',        url: 'https://tiktok.com' },
                    { title: 'Instagram',     url: 'https://instagram.com' },
                    { title: 'X / Twitter',   url: 'https://x.com' },
                    { title: 'Threads',       url: 'https://threads.net' },
                    { title: 'LinkedIn',      url: 'https://linkedin.com' },
                ]},
                { name: '🎨 Design & Create', color: 'orange', links: [
                    { title: 'Canva',         url: 'https://canva.com' },
                    { title: 'Figma',         url: 'https://figma.com' },
                    { title: 'Adobe Express', url: 'https://express.adobe.com' },
                    { title: 'CapCut',        url: 'https://capcut.com' },
                    { title: 'Unsplash',      url: 'https://unsplash.com' },
                    { title: 'Pexels',        url: 'https://pexels.com' },
                ]},
                { name: '📊 Analytics', color: 'blue', links: [
                    { title: 'YouTube Analytics', url: 'https://studio.youtube.com/channel/analytics' },
                    { title: 'Google Analytics',  url: 'https://analytics.google.com' },
                    { title: 'Buffer',            url: 'https://buffer.com' },
                    { title: 'Later',             url: 'https://later.com' },
                ]},
            ]
        },
        {
            key: 'gamer', pro: true,
            icon: '🎮', name: 'Gamer',
            desc: 'Platforms · Streaming · Community',
            folders: [
                { name: '🕹️ Platforms', color: 'teal', links: [
                    { title: 'Steam',         url: 'https://store.steampowered.com' },
                    { title: 'Epic Games',    url: 'https://epicgames.com' },
                    { title: 'GOG',           url: 'https://gog.com' },
                    { title: 'Xbox',          url: 'https://xbox.com' },
                    { title: 'PlayStation',   url: 'https://playstation.com' },
                ]},
                { name: '🔴 Live Streaming', color: 'red', links: [
                    { title: 'Twitch',        url: 'https://twitch.tv' },
                    { title: 'YouTube Gaming',url: 'https://youtube.com/gaming' },
                    { title: 'Kick',          url: 'https://kick.com' },
                ]},
                { name: '👥 Community', color: 'purple', links: [
                    { title: 'Discord',       url: 'https://discord.com' },
                    { title: 'Reddit Gaming', url: 'https://reddit.com/r/gaming' },
                    { title: 'PCGamer',       url: 'https://pcgamer.com' },
                    { title: 'IGN',           url: 'https://ign.com' },
                ]},
            ]
        },
    ],

    // Changelog entries — keyed by version
    CHANGELOG: {
        '1.6': {
            emoji: '🎉',
            title: "What's New in v1.6",
            subtitle: 'A big update packed with new features!',
            items: [
                { icon: '🌊', label: 'New Ocean Theme', desc: '5 themes total with live hover preview' },
                { icon: '🏢', label: 'Starter Packs', desc: 'Remote Worker, Student, Cinema, Influencer, Gamer packs' },
                { icon: '🌤️', label: 'Weather & Clock Widget', desc: 'Live clock + weather on every new tab' },
                { icon: '💳', label: 'Pro Plans Live', desc: 'Monthly, Yearly & Lifetime — activate with license key' },
                { icon: '☁️', label: 'Cloud Sync', desc: 'Sync folders across all your devices with Google sign-in' },
            ]
        }
    },

    // Background presets
    BG_PRESETS: [
        { id: 'midnight', label: '🌌 Midnight', type: 'gradient', value: 'linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)' },
        { id: 'sunset',   label: '🌅 Sunset',   type: 'gradient', value: 'linear-gradient(135deg,#1a0533 0%,#4a0066 45%,#8b1a1a 100%)' },
        { id: 'ocean',    label: '🌊 Ocean',    type: 'gradient', value: 'linear-gradient(135deg,#0d1b2a 0%,#1b4f72 50%,#0e7490 100%)' },
        { id: 'forest',   label: '🌿 Forest',   type: 'gradient', value: 'linear-gradient(135deg,#0a1a0a 0%,#1a3a1a 50%,#2d5a20 100%)' },
        { id: 'ember',    label: '🔥 Ember',    type: 'gradient', value: 'linear-gradient(135deg,#1a0a00 0%,#7c2d12 50%,#991b1b 100%)' },
        { id: 'rose',     label: '🌸 Rose',     type: 'gradient', value: 'linear-gradient(135deg,#2a0a1a 0%,#7c1d4e 50%,#be185d 100%)' },
        { id: 'aurora',   label: '🪐 Aurora',   type: 'gradient', value: 'linear-gradient(135deg,#050a14 0%,#0d3b2e 35%,#0a1628 70%,#1a0d2e 100%)' },
        { id: 'steel',    label: '⚙️ Steel',    type: 'gradient', value: 'linear-gradient(135deg,#0d1117 0%,#161b22 50%,#21262d 100%)' },
    ],

    t(key, params = {}) {
        const lang = this.data.language || 'TR';
        let str = TRANSLATIONS[lang]?.[key] || TRANSLATIONS['EN']?.[key] || key;
        Object.entries(params).forEach(([k, v]) => {
            str = str.replace(`{${k}}`, v);
        });
        return str;
    },

    updateStaticI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            el.textContent = this.t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            el.placeholder = this.t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            el.title = this.t(key);
        });
    },

    async init() {
        // Init sync session before loading so we can merge on first load
        if (typeof SyncManager !== 'undefined') {
            await SyncManager.init().catch(console.warn);
        }
        await this.load();
        this.applyTheme(this.data.theme);
        this.applyBackground(this.data.background);
        this._renderBgPresets();
        this._renderQuickBar();
        this._renderMostVisited();
        this.updateStaticI18n();
        if (this.data.sidebarCollapsed) {
            document.getElementById('sidebar')?.classList.add('collapsed');
        }
        this.render();
        this.applyLayout();
        this.bindEvents();
        this.updateProUI();
        this.checkProExpiry();
        this.validateLicense().catch(console.warn);
        this.createToastContainer();
        this.fetchTabs();
        this._updateProfileUI();
        this._initWidgets();
        this._initWebSearch();
        this._checkChangelog();
        document.addEventListener('visibilitychange', () => this._onVisibilityChange());

        if (!this.data.tutorialCompleted) {
            this.openModal('tutorialModal');
            document.getElementById('tutorialStep1')?.classList.remove('hidden');
            document.getElementById('tutorialStep2')?.classList.add('hidden');
        }
    },

    // ---------- Tabs API ----------
    async fetchTabs() {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({}, (tabs) => {
                const list = document.getElementById('openTabsList');
                const count = document.getElementById('openTabsCount');
                if (!list) return;

                let sortedTabs = [...tabs];
                const sortOrder = this.data.tabsSortOrder || 'recent';
                
                if (sortOrder === 'recent') {
                    sortedTabs.sort((a,b) => (b.id || 0) - (a.id || 0));
                } else if (sortOrder === 'position') {
                    sortedTabs.sort((a,b) => {
                        if (a.windowId !== b.windowId) return a.windowId - b.windowId;
                        return a.index - b.index;
                    });
                } else if (sortOrder === 'reverse') {
                    sortedTabs.sort((a,b) => {
                        if (a.windowId !== b.windowId) return b.windowId - a.windowId;
                        return b.index - a.index;
                    });
                }
                
                list.innerHTML = sortedTabs.map(t => {
                    const iconUrl = t.favIconUrl || 'https://www.google.com/s2/favicons?domain=' + new URL(t.url).hostname + '&sz=128';
                    return `<div class="tab-item" draggable="true" data-tab-id="${t.id}" title="${this._esc(t.title)}" data-url="${this._esc(t.url)}" data-icon="${iconUrl}" data-title="${this._esc(t.title)}">
                        <img src="${iconUrl}" class="tab-icon" onerror="this.src='assets/icons/icon16.png'">
                        <span class="tab-title">${this._esc(t.title)}</span>
                        <div class="tab-actions">
                            <button class="tab-action-icon" data-action="add-tab-link" data-url="${this._esc(t.url)}" data-title="${this._esc(t.title)}" data-icon="${iconUrl}" title="Add to folder">➕</button>
                            <button class="tab-close" data-action="close-tab" data-tab-id="${t.id}" title="Close tab">✕</button>
                        </div>
                    </div>`;
                }).join('');
                if (tabs.length === 0) {
                    list.innerHTML = `<div class="empty-state">${this.t('no_recently_closed')}</div>`; 
                    return;
                }
                if (count) count.textContent = this.t('tabs_count', { n: tabs.length });
            });
        }
        
        if (typeof chrome !== 'undefined' && chrome.sessions) {
            chrome.sessions.getRecentlyClosed({ maxResults: 10 }, (sessions) => {
                const list = document.getElementById('closedTabsList');
                if (!list) return;
                
                let recentTabs = [];
                sessions.forEach(s => {
                    if (s.tab) recentTabs.push(s.tab);
                    if (s.window && s.window.tabs) {
                        recentTabs = recentTabs.concat(s.window.tabs);
                    }
                });
                recentTabs = recentTabs.slice(0, 15);
                
                if (recentTabs.length === 0) {
                    list.innerHTML = `<div class="empty-state">${this.t('no_recently_closed')}</div>`;
                    return;
                }

                list.innerHTML = recentTabs.map(t => {
                    let iconUrl = t.favIconUrl;
                    if (!iconUrl) {
                        try {
                            iconUrl = 'https://www.google.com/s2/favicons?domain=' + new URL(t.url).hostname + '&sz=128';
                        } catch {
                            iconUrl = 'assets/icons/icon16.png';
                        }
                    }
                    return `<div class="tab-item" data-action="restore-tab" data-session-id="${t.sessionId}" title="${this._esc(t.title)}">
                        <img src="${iconUrl}" class="tab-icon" onerror="this.src='assets/icons/icon16.png'">
                        <span class="tab-title">${this._esc(t.title)}</span>
                    </div>`;
                }).join('');
            });
        }
    },

    // ---------- Persistence ----------
    async load() {
        const stored = await Storage.get(['ntf_data', 'app_version']);
        // Force update defaults if we are missing the new structure
        if (stored.ntf_data && stored.app_version === '1.2') {
            this.data = { ...this.data, ...stored.ntf_data };
        } else {
            this.data.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
            await Storage.set({ app_version: '1.2' });
            await this.save();
        }
        // Merge with remote if signed in
        if (typeof SyncManager !== 'undefined' && SyncManager.isSignedIn) {
            try {
                const remote = await SyncManager.pull();
                if (remote && (remote.updatedAt || 0) > (this.data.updatedAt || 0)) {
                    this.data = { ...this.data, ...remote };
                    await Storage.set({ ntf_data: this.data });
                } else {
                    SyncManager.push(this.data).catch(console.error);
                }
            } catch (err) {
                console.warn('Sync load error:', err);
            }
        }
    },

    async save() {
        this.data.updatedAt = Date.now();
        try {
            await Storage.set({ ntf_data: this.data });
        } catch (err) {
            console.error('Save error:', err);
            this.showToast(this.t('storage_error'), 'error');
            return;
        }
        if (typeof SyncManager !== 'undefined' && SyncManager.isSignedIn) {
            this._updateSyncStatus('syncing');
            SyncManager.push(this.data)
                .then(ok => this._updateSyncStatus(ok ? 'synced' : 'error'))
                .catch(() => this._updateSyncStatus('error'));
        }
    },

    // ---------- Cloud Sync ----------
    async signIn() {
        if (typeof SyncManager === 'undefined') {
            this.showToast('Sync not available.', 'error'); return;
        }
        try {
            this._updateSyncStatus('syncing');
            await SyncManager.signIn();
            this._updateProfileUI();
            const remote = await SyncManager.pull();
            if (remote && (remote.updatedAt || 0) > (this.data.updatedAt || 0)) {
                this.data = { ...this.data, ...remote };
                await Storage.set({ ntf_data: this.data });
                this.render();
                this.showToast(this.t('sync_from_device'), 'success');
            } else {
                await SyncManager.push(this.data);
            }
            this._updateSyncStatus('synced');
            this.showToast(this.t('sync_synced'), 'success');
        } catch (err) {
            this._updateSyncStatus('error');
            this.showToast(err.message || this.t('sync_error'), 'error');
        }
    },

    async signOut() {
        if (typeof SyncManager !== 'undefined') {
            await SyncManager.signOut().catch(console.warn);
        }
        this._updateProfileUI();
    },

    _updateSyncStatus(state) {
        const chip = document.getElementById('syncStatus');
        const dot = document.getElementById('syncDot');
        const text = document.getElementById('syncStatusText');
        if (!chip) return;
        const signedIn = typeof SyncManager !== 'undefined' && SyncManager.isSignedIn;
        if (!state || state === 'hidden' || !signedIn) {
            chip.classList.add('hidden');
            return;
        }
        chip.classList.remove('hidden');
        dot.className = 'sync-dot';
        if (state === 'synced') {
            dot.classList.add('synced');
            text.textContent = this.t('sync_just_now');
            const lastSyncEl = document.getElementById('lastSyncText');
            if (lastSyncEl) lastSyncEl.textContent = this.t('sync_just_now');
        } else if (state === 'syncing') {
            dot.classList.add('syncing');
            text.textContent = this.t('sync_syncing');
        } else if (state === 'error') {
            dot.classList.add('error');
            text.textContent = this.t('sync_error');
        } else if (state === 'offline') {
            dot.classList.add('offline');
            text.textContent = this.t('sync_offline');
        }
    },

    _updateProfileUI() {
        const signedIn = typeof SyncManager !== 'undefined' && SyncManager.isSignedIn;
        const signedInEl = document.getElementById('profileSignedIn');
        const signedOutEl = document.getElementById('profileSignedOut');
        if (signedIn) {
            signedInEl?.classList.remove('hidden');
            signedOutEl?.classList.add('hidden');
            const user = SyncManager.user;
            const avatarEl = document.getElementById('userAvatar');
            const nameEl = document.getElementById('userName');
            const emailEl = document.getElementById('userEmail');
            if (avatarEl) avatarEl.src = user?.photoUrl || '';
            if (nameEl) nameEl.textContent = user?.displayName || '';
            if (emailEl) emailEl.textContent = user?.email || '';
            this._updateSyncStatus('synced');
        } else {
            signedInEl?.classList.add('hidden');
            signedOutEl?.classList.remove('hidden');
            this._updateSyncStatus('hidden');
        }
    },

    async _onVisibilityChange() {
        if (document.hidden) return;
        if (typeof SyncManager === 'undefined' || !SyncManager.isSignedIn) return;
        try {
            const remote = await SyncManager.pull();
            if (remote && (remote.updatedAt || 0) > (this.data.updatedAt || 0)) {
                this.data = { ...this.data, ...remote };
                await Storage.set({ ntf_data: this.data });
                this.render();
                this.showToast(this.t('sync_from_device'), 'info');
                this._updateSyncStatus('synced');
            }
        } catch (err) {
            console.warn('Visibility sync error:', err);
        }
    },

    // ---------- Changelog / What's New ----------
    _checkChangelog() {
        const current = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '1.6';
        if (this.data.lastSeenVersion === current) return;
        const entry = this.CHANGELOG[current];
        if (!entry) { this.data.lastSeenVersion = current; this.save(); return; }

        // Delay slightly so the main UI settles first
        setTimeout(() => {
            const modal = document.getElementById('whatsNewModal');
            if (!modal) return;
            // Inject content
            document.getElementById('whatsNewEmoji').textContent = entry.emoji;
            document.getElementById('whatsNewTitle').textContent = entry.title;
            document.getElementById('whatsNewSubtitle').textContent = entry.subtitle;
            document.getElementById('whatsNewList').innerHTML = entry.items.map(i =>
                `<li class="wn-item">
                    <span class="wn-icon">${i.icon}</span>
                    <div><strong>${this._esc(i.label)}</strong><span class="wn-desc"> — ${this._esc(i.desc)}</span></div>
                </li>`
            ).join('');
            this.openModal('whatsNewModal');
        }, 800);

        this.data.lastSeenVersion = current;
        this.save();
    },

    // ---------- Widget Bar ----------
    _initWidgets() {
        this._startClock();
        this._loadWeather();
    },

    _startClock() {
        const GREETINGS = ['Good night','Good night','Good night','Good night','Good night',
            'Good morning','Good morning','Good morning','Good morning','Good morning',
            'Good morning','Good morning','Good afternoon','Good afternoon','Good afternoon',
            'Good afternoon','Good afternoon','Good evening','Good evening','Good evening',
            'Good evening','Good night','Good night','Good night'];
        const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const MONTHS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const tick = () => {
            const now = new Date();
            const h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            const timeEl = document.getElementById('widgetTime');
            const greetEl = document.getElementById('widgetGreeting');
            const dateEl = document.getElementById('widgetDate');
            if (timeEl) timeEl.textContent = `${h}:${m}:${s}`;
            if (greetEl) greetEl.textContent = GREETINGS[h];
            if (dateEl) dateEl.textContent =
                `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
        };
        tick();
        setInterval(tick, 1000);
    },

    async _loadWeather() {
        const el = document.getElementById('widgetWeather');
        if (!el) return;
        try {
            const cached = sessionStorage.getItem('ntf_weather');
            if (cached) {
                const { d, ts } = JSON.parse(cached);
                if (Date.now() - ts < 30 * 60 * 1000) { this._renderWeather(el, d); return; }
            }
        } catch { /* ignore bad cache */ }
        try {
            const pos = await new Promise((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }));
            const { latitude: lat, longitude: lon } = pos.coords;
            const [wRes, gRes] = await Promise.all([
                fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode`),
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
            ]);
            const wJson = await wRes.json();
            const gJson = await gRes.json();
            const d = {
                temp: Math.round(wJson.current.temperature_2m),
                code: wJson.current.weathercode,
                city: gJson.address?.city || gJson.address?.town || gJson.address?.village || 'Unknown'
            };
            sessionStorage.setItem('ntf_weather', JSON.stringify({ d, ts: Date.now() }));
            this._renderWeather(el, d);
        } catch {
            el.innerHTML = `<div class="weather-unavailable" title="Click to retry" onclick="App._loadWeather()">📍 Allow location for weather</div>`;
        }
    },

    _renderWeather(el, d) {
        const ICONS = {
            0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
            51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',
            71:'🌨️',73:'🌨️',75:'❄️',77:'🌨️',
            80:'🌦️',81:'🌧️',82:'⛈️',85:'🌨️',86:'❄️',
            95:'⛈️',96:'⛈️',99:'⛈️'
        };
        const DESCS = {
            0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
            45:'Foggy',48:'Foggy',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
            61:'Light rain',63:'Rain',65:'Heavy rain',
            71:'Light snow',73:'Snow',75:'Heavy snow',
            80:'Rain showers',81:'Rain showers',82:'Violent showers',
            95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm with hail'
        };
        el.innerHTML = `
            <div class="weather-icon">${ICONS[d.code] ?? '🌡️'}</div>
            <div class="weather-info">
                <div class="weather-temp">${d.temp}°C</div>
                <div class="weather-city">${this._esc(d.city)}</div>
                <div class="weather-desc">${DESCS[d.code] ?? ''}</div>
            </div>`;
    },

    // ---------- Web Search ----------
    SEARCH_ENGINES: {
        google:     { name: 'Google',     url: 'https://www.google.com/search?q=',               favicon: 'https://www.google.com/favicon.ico' },
        bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=',                 favicon: 'https://www.bing.com/favicon.ico' },
        duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',                     favicon: 'https://duckduckgo.com/favicon.ico' },
        youtube:    { name: 'YouTube',    url: 'https://www.youtube.com/results?search_query=',  favicon: 'https://www.youtube.com/favicon.ico' },
    },

    _initWebSearch() {
        const input      = document.getElementById('webSearchInput');
        const btn        = document.getElementById('webSearchBtn');
        const picker     = document.getElementById('searchEnginePicker');
        const dropdown   = document.getElementById('engineDropdown');
        const iconEl     = document.getElementById('searchEngineIcon');
        const nameEl     = document.getElementById('searchEngineName');
        if (!input) return;

        // Apply saved engine
        const engine = this.data.searchEngine || 'google';
        this._applySearchEngine(engine, iconEl, nameEl);

        // Toggle engine dropdown
        picker?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('open');
        });

        // Select engine
        dropdown?.addEventListener('click', (e) => {
            const opt = e.target.closest('.engine-option');
            if (!opt) return;
            const key = opt.dataset.engine;
            this.data.searchEngine = key;
            this.save();
            this._applySearchEngine(key, iconEl, nameEl);
            dropdown.classList.remove('open');
            // Mark active
            dropdown.querySelectorAll('.engine-option').forEach(o => o.classList.toggle('active', o.dataset.engine === key));
            input.focus();
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => dropdown?.classList.remove('open'));

        // Perform search
        const doSearch = () => {
            const q = input.value.trim();
            if (!q) return;
            const key = this.data.searchEngine || 'google';
            const eng = this.SEARCH_ENGINES[key] || this.SEARCH_ENGINES.google;
            window.open(eng.url + encodeURIComponent(q), '_blank');
            input.value = '';
        };

        btn?.addEventListener('click', doSearch);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

        // Mark active engine in dropdown on open
        picker?.addEventListener('click', () => {
            const cur = this.data.searchEngine || 'google';
            dropdown?.querySelectorAll('.engine-option').forEach(o => o.classList.toggle('active', o.dataset.engine === cur));
        });
    },

    _applySearchEngine(key, iconEl, nameEl) {
        const eng = this.SEARCH_ENGINES[key] || this.SEARCH_ENGINES.google;
        if (iconEl) { iconEl.src = eng.favicon; iconEl.alt = eng.name; }
        if (nameEl) nameEl.textContent = eng.name;
    },

    // ---------- Undo ----------
    _pushUndo(type, data) {
        this._undoStack.push({ type, data });
        if (this._undoStack.length > 20) this._undoStack.shift();
    },

    undo() {
        const item = this._undoStack.pop();
        if (!item) { this.showToast(this.t('nothing_to_undo'), 'info'); return; }
        if (item.type === 'delete-folder') {
            this.data.folders.splice(item.data.index, 0, item.data.folder);
            this.save();
            this.render();
            this.showToast(this.t('folder_restored'), 'success');
        } else if (item.type === 'delete-link') {
            const folder = this.data.folders.find(f => f.id === item.data.folderId);
            if (folder) {
                folder.links.splice(item.data.index, 0, item.data.link);
                this.save();
                this.render();
                this.showToast(this.t('link_restored'), 'success');
            }
        }
    },

    // ---------- Stash / Close Window ----------
    stashOpenTabs() {
        if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) {
            this.showPremiumModal(); return;
        }
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            this.showToast('Chrome API not available.', 'error'); return;
        }
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                this.showToast(this.t('no_open_tabs'), 'info'); return;
            }
            const dateStr = new Date().toLocaleDateString();
            const now = Date.now();
            this.data.folders.push({
                id: 'stash_' + now,
                name: 'Stash ' + dateStr,
                color: 'blue',
                links: tabs.map((t, i) => ({
                    id: 'sl_' + now + '_' + i,
                    title: t.title || t.url,
                    url: t.url,
                    icon: t.favIconUrl || ''
                }))
            });
            this.save();
            this.render();
            this.showToast(this.t('tabs_stashed', { n: tabs.length }), 'success');
        });
    },

    // ---------- Import Tab Groups ----------
    importTabGroups() {
        if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) {
            this.showPremiumModal(); return;
        }
        if (typeof chrome === 'undefined' || !chrome.tabGroups) {
            this.showToast(this.t('no_tab_groups'), 'info'); return;
        }
        chrome.tabGroups.query({}, (groups) => {
            if (!groups || groups.length === 0) {
                this.showToast(this.t('no_tab_groups'), 'info'); return;
            }
            chrome.tabs.query({}, (tabs) => {
                const colorMap = { grey: 'blue', blue: 'blue', red: 'red', yellow: 'yellow',
                    green: 'green', pink: 'pink', purple: 'purple', cyan: 'teal', orange: 'orange' };
                let addedCount = 0;
                const now = Date.now();
                groups.forEach(group => {
                    if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) return;
                    const groupTabs = tabs.filter(t => t.groupId === group.id);
                    if (groupTabs.length === 0) return;
                    this.data.folders.push({
                        id: 'fg_' + now + '_' + group.id,
                        name: group.title || this.t('tab_group'),
                        color: colorMap[group.color] || 'blue',
                        links: groupTabs.map((t, i) => ({
                            id: 'tg_' + now + '_' + i,
                            title: t.title || t.url,
                            url: t.url,
                            icon: t.favIconUrl || ''
                        }))
                    });
                    addedCount++;
                });
                if (addedCount > 0) {
                    this.save(); this.render();
                    this.showToast(this.t('tab_groups_imported', { n: addedCount }), 'success');
                } else {
                    this.showToast(this.t('no_tab_groups'), 'info');
                }
            });
        });
    },

    // ---------- Folder Templates ----------
    createFromTemplate(templateKey) {
        const tpl = this.FOLDER_TEMPLATES.find(t => t.key === templateKey);
        if (!tpl) return;
        const now = Date.now();
        const name = templateKey === 'blank' ? this.t('new_folder') : this.t('template_' + templateKey);
        const newFolder = {
            id: 'folder_' + now,
            name,
            color: tpl.color,
            links: tpl.links.map((l, i) => {
                let icon = '';
                try { icon = `https://www.google.com/s2/favicons?domain=${new URL(l.url).hostname}&sz=128`; } catch { /* empty */ }
                return { id: 'tl_' + now + '_' + i, title: l.title, url: l.url, icon };
            })
        };
        this.data.folders.push(newFolder);
        this.save();
        this.render();
        this.closeModal('templateModal');
        if (templateKey === 'blank') {
            requestAnimationFrame(() => {
                const card = document.querySelector(`[data-folder-id="${newFolder.id}"]`);
                if (card) {
                    const input = card.querySelector('.folder-title-input');
                    if (input) this._startEditTitle(input, newFolder.id);
                }
            });
        }
    },

    // ---------- Starter Packs ----------
    applyStarterPack(packKey) {
        const pack = this.STARTER_PACKS.find(p => p.key === packKey);
        if (!pack) return;
        if (pack.pro && !this.isPro) {
            this.closeModal('templateModal');
            this.showPremiumModal();
            return;
        }
        const now = Date.now();
        let added = 0;
        pack.folders.forEach((f, i) => {
            if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) return;
            const fId = `pack_${packKey}_${now}_${i}`;
            this.data.folders.push({
                id: fId,
                name: f.name,
                color: f.color,
                links: f.links.map((l, j) => {
                    let icon = '';
                    try { icon = `https://www.google.com/s2/favicons?domain=${new URL(l.url).hostname}&sz=128`; } catch { /* empty */ }
                    return { id: `${fId}_l${j}`, title: l.title, url: l.url, icon };
                })
            });
            added++;
        });
        this.save();
        this.render();
        this.closeModal('templateModal');
        this.showToast(`✅ ${pack.icon} ${pack.name} pack applied! ${added} folders added.`, 'success');
    },

    // ---------- Favicon Utility ----------
    _getFaviconUrl(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch { return ''; }
    },

    // ---------- Layout (Columns + Compact) ----------
    applyLayout() {
        const grid = document.getElementById('foldersGrid');
        if (!grid) return;
        const cols = this.data.columnCount || 'auto';
        grid.classList.remove('cols-2', 'cols-3', 'cols-4');
        if (cols !== 'auto') grid.classList.add('cols-' + cols);
        document.querySelectorAll('.col-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cols === cols);
        });
        const compact = !!this.data.compactMode;
        grid.classList.toggle('compact', compact);
        const toggle = document.getElementById('compactModeToggle');
        if (toggle) toggle.classList.toggle('active', compact);
    },

    setColumnCount(cols) {
        this.data.columnCount = cols;
        this.save();
        this.applyLayout();
    },

    toggleCompactMode() {
        this.data.compactMode = !this.data.compactMode;
        this.save();
        this.applyLayout();
    },

    // ---------- Folder Pinning ----------
    togglePinFolder(folderId) {
        const folder = this.data.folders.find(f => f.id === folderId);
        if (!folder) return;
        folder.pinned = !folder.pinned;
        this.save();
        this.render();
        this.showToast(folder.pinned ? this.t('folder_pinned') : this.t('folder_unpinned'), 'info');
    },

    // ---------- Tag Filter Bar ----------
    _updateTagFilterBar() {
        const bar = document.getElementById('tagFilterBar');
        if (!bar) return;
        const tags = new Set();
        this.data.folders.forEach(folder => {
            folder.links.forEach(link => {
                (link.tags || []).forEach(t => { if (t) tags.add(t.trim()); });
            });
        });
        if (tags.size === 0) { bar.innerHTML = ''; return; }
        const activeTag = this._activeTag;
        bar.innerHTML = `
            <span style="font-size:12px; color:var(--text-dim);">${this.t('tag_filter_label')}</span>
            ${[...tags].map(tag => `<span class="tag-pill${tag === activeTag ? ' active' : ''}" data-tag="${this._esc(tag)}">${this._esc(tag)}</span>`).join('')}
            ${activeTag ? `<span class="tag-clear-btn" id="clearTagFilter">${this.t('clear_tag_filter')}</span>` : ''}
        `;
        bar.querySelectorAll('.tag-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                this._activeTag = this._activeTag === pill.dataset.tag ? null : pill.dataset.tag;
                this.render();
            });
        });
        bar.querySelector('#clearTagFilter')?.addEventListener('click', () => {
            this._activeTag = null;
            this.render();
        });
    },

    // ---------- Broken Link Checker ----------
    async checkBrokenLinks() {
        const allLinks = [];
        this.data.folders.forEach(f => {
            f.links.forEach(l => { if (l.url && l.type !== 'header') allLinks.push(l); });
        });
        if (allLinks.length === 0) { this.showToast(this.t('no_broken_links'), 'success'); return; }
        this.showToast(this.t('checking_links'), 'info');
        this._brokenLinks.clear();
        const checks = allLinks.map(async link => {
            try {
                await fetch(link.url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(5000) });
                // no-cors opaque = likely alive
            } catch {
                this._brokenLinks.add(link.id);
            }
        });
        await Promise.all(checks);
        this.render();
        if (this._brokenLinks.size > 0) {
            this.showToast(this.t('broken_links_found', { n: this._brokenLinks.size }), 'error');
        } else {
            this.showToast(this.t('no_broken_links'), 'success');
        }
    },

    // ---------- Chrome Bookmarks Import ----------
    importChromeBookmarks() {
        if (typeof chrome === 'undefined' || !chrome.bookmarks) {
            this.showToast('Bookmarks API not available.', 'error'); return;
        }
        chrome.bookmarks.getTree((tree) => {
            const folders = [];
            const walk = (nodes) => {
                nodes.forEach(node => {
                    if (node.children) {
                        if (['0', '1', '2'].includes(node.id)) { walk(node.children); return; }
                        const links = node.children
                            .filter(c => c.url)
                            .map((c, i) => ({ id: 'bm_' + Date.now() + '_' + i, title: c.title || c.url, url: c.url, icon: '' }));
                        if (links.length > 0) folders.push({ name: node.title || 'Bookmarks', links });
                        const subFolders = node.children.filter(c => c.children);
                        if (subFolders.length) walk(subFolders);
                    }
                });
            };
            walk(tree);
            if (folders.length === 0) { this.showToast('No bookmark folders found.', 'info'); return; }
            this._pendingChromeBookmarks = folders;
            const total = folders.reduce((s, f) => s + f.links.length, 0);
            const descEl = document.getElementById('importBookmarksDesc');
            if (descEl) descEl.textContent = this.t('import_bookmarks_desc', { folders: folders.length, links: total });
            const preview = document.getElementById('importBookmarksPreview');
            if (preview) {
                preview.innerHTML = folders.slice(0, 8).map(f => `
                    <div class="bookmark-preview-item bookmark-preview-folder">📁 ${this._esc(f.name)} (${f.links.length})</div>
                    ${f.links.slice(0, 3).map(l => `<div class="bookmark-preview-item bookmark-preview-link">🔗 ${this._esc(l.title)}</div>`).join('')}
                    ${f.links.length > 3 ? `<div class="bookmark-preview-item bookmark-preview-link" style="color:var(--text-dim)">... and ${f.links.length - 3} more</div>` : ''}
                `).join('');
            }
            this.openModal('importBookmarksModal');
        });
    },

    confirmImportBookmarks() {
        if (!this._pendingChromeBookmarks) return;
        const now = Date.now();
        const colors = ['blue', 'green', 'purple', 'red', 'teal', 'orange'];
        let added = 0;
        this._pendingChromeBookmarks.forEach((f, idx) => {
            if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) return;
            this.data.folders.push({
                id: 'bm_folder_' + now + '_' + idx,
                name: f.name,
                color: colors[idx % colors.length],
                links: f.links.map((l, i) => ({
                    ...l,
                    id: 'bm_link_' + now + '_' + idx + '_' + i,
                    icon: this._getFaviconUrl(l.url)
                }))
            });
            added++;
        });
        this._pendingChromeBookmarks = null;
        this.closeModal('importBookmarksModal');
        this.save();
        this.render();
        this.showToast(this.t('tab_groups_imported', { n: added }), 'success');
    },

    // ---------- Pro ----------
    get isPro() {
        if (!this.data.isPro) return false;
        if (this.data.proExpiresAt && Date.now() > this.data.proExpiresAt) {
            this.data.isPro = false;
            this.data.proExpiresAt = null;
            this.save();
            return false;
        }
        return true;
    },

    checkProExpiry() {
        if (!this.data.isPro || !this.data.proExpiresAt) return;
        const remaining = this.data.proExpiresAt - Date.now();
        if (remaining <= 0) {
            this.data.isPro = false;
            this.data.proExpiresAt = null;
            this.save();
            this.updateProUI();
            this.showToast('Your PRO trial has expired.', 'info');
        }
    },

    activateDemo() {
        this.data.isPro = true;
        this.data.proExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        this.save();
        this.updateProUI();
        this.render();
        this.showToast('🎉 7-day PRO demo activated!', 'success');
    },

    // ---------- License Key (LemonSqueezy) ----------
    async activateLicense(key) {
        key = key.trim();
        if (!key) return;
        const btn = document.getElementById('activateLicenseBtn');
        const msg = document.getElementById('licenseStatusMsg');
        if (btn) btn.disabled = true;
        if (msg) { msg.textContent = 'Activating…'; msg.className = 'license-status-msg'; }

        try {
            const body = new URLSearchParams({
                license_key: key,
                instance_name: 'NTF Extension'
            });
            const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                body
            });
            const json = await res.json();
            if (json.activated) {
                this.data.licenseKey = key;
                this.data.licenseInstanceId = json.instance?.id || null;
                this.data.isPro = true;
                // Set expiry only for monthly/yearly; lifetime = null
                const variant = (json.license_key?.variant_name || '').toLowerCase();
                if (variant.includes('month')) {
                    this.data.proExpiresAt = Date.now() + 31 * 24 * 60 * 60 * 1000;
                } else if (variant.includes('year')) {
                    this.data.proExpiresAt = Date.now() + 366 * 24 * 60 * 60 * 1000;
                } else {
                    this.data.proExpiresAt = null; // lifetime
                }
                await this.save();
                this.updateProUI();
                this.render();
                this.closeModal('premiumModal');
                this.showToast('🎉 PRO activated! Welcome aboard.', 'success');
            } else {
                const errMsg = json.error || 'Invalid or already used license key.';
                if (msg) { msg.textContent = '✗ ' + errMsg; msg.className = 'license-status-msg error'; }
            }
        } catch (err) {
            if (msg) { msg.textContent = '✗ Network error. Please try again.'; msg.className = 'license-status-msg error'; }
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async validateLicense() {
        const key = this.data.licenseKey;
        const instanceId = this.data.licenseInstanceId;
        if (!key || !instanceId) return;
        try {
            const body = new URLSearchParams({ license_key: key, instance_id: instanceId });
            const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                body
            });
            const json = await res.json();
            if (!json.valid) {
                this.data.isPro = false;
                this.data.licenseKey = null;
                this.data.licenseInstanceId = null;
                this.data.proExpiresAt = null;
                await this.save();
                this.updateProUI();
            }
        } catch { /* offline — keep existing pro status */ }
    },

    updateProUI() {
        const badge = document.getElementById('proBadge');
        const upgradeBtn = document.getElementById('upgradeBtn');
        if (this.isPro) {
            if (badge) {
                badge.textContent = 'PRO';
                badge.classList.add('is-pro');
            }
            if (upgradeBtn) upgradeBtn.classList.add('hidden');
            // Unlock all pro-gated theme buttons
            document.querySelectorAll('.theme-btn[data-pro]').forEach(btn => {
                btn.classList.remove('pro-locked');
                btn.querySelector('.lock-tag')?.remove();
            });
        } else {
            if (badge) {
                badge.textContent = 'Pro only';
                badge.classList.remove('is-pro');
            }
            if (upgradeBtn) upgradeBtn.classList.remove('hidden');
        }
    },

    // ---------- Theme ----------
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.data.theme = theme;
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
        const lbl = document.getElementById('themeDropdownLabel');
        if (lbl) lbl.textContent = 'Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1);
    },

    // ---------- Background ----------
    applyBackground(bg) {
        const body = document.body;
        body.classList.remove('custom-bg-gradient', 'custom-bg-image', 'custom-bg-color');
        body.style.backgroundImage = '';
        body.style.backgroundColor = '';
        body.style.backgroundSize = '';
        body.style.backgroundPosition = '';
        body.style.backgroundAttachment = '';

        if (!bg || bg.type === 'none') {
            this.data.background = { type: 'none', value: '' };
        } else if (bg.type === 'gradient') {
            body.style.backgroundImage = bg.value;
            body.classList.add('custom-bg-gradient');
            this.data.background = bg;
        } else if (bg.type === 'image') {
            body.style.backgroundImage = `url("${bg.value}")`;
            body.style.backgroundSize = 'cover';
            body.style.backgroundPosition = 'center';
            body.style.backgroundAttachment = 'fixed';
            body.classList.add('custom-bg-image');
            this.data.background = bg;
        } else if (bg.type === 'color') {
            body.style.backgroundColor = bg.value;
            body.classList.add('custom-bg-color');
            this.data.background = bg;
        }

        // Update active swatch
        document.querySelectorAll('.bg-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.bgId === (bg?.id || ''));
        });
    },

    _renderBgPresets() {
        const grid = document.getElementById('bgPresetGrid');
        if (!grid) return;
        const activeBgId = this.data.background?.id || '';
        grid.innerHTML = this.BG_PRESETS.map(p =>
            `<button class="bg-swatch${p.id === activeBgId ? ' active' : ''}" data-bg-id="${p.id}" title="${p.label}" style="background:${p.value}"></button>`
        ).join('');
    },

    // ---------- Quick Bar ----------
    _renderQuickBar() {
        const bar = document.getElementById('quickBar');
        if (!bar) return;
        const links = this.data.quickBarLinks || [];
        if (links.length === 0) {
            bar.innerHTML = `<span class="quick-bar-hint">📌 Hover a link → click 📌 to pin here</span>`;
            return;
        }
        bar.innerHTML = links.map(l => `
            <a href="${this._esc(l.url)}" target="_blank" rel="noopener noreferrer"
               class="quick-chip" title="${this._esc(l.title)}" data-url="${this._esc(l.url)}">
                <img src="${this._esc(l.icon || '')}" class="quick-chip-icon" onerror="this.src='assets/icons/icon16.png'">
                <span class="quick-chip-title">${this._esc(l.title)}</span>
                <button class="quick-chip-remove" data-action="remove-quick" data-id="${this._esc(l.id)}" title="Unpin">×</button>
            </a>`).join('');
    },

    addToQuickBar(linkId, folderId) {
        const folder = this.data.folders.find(f => f.id === folderId);
        const link = folder?.links.find(l => l.id === linkId);
        if (!link) return;
        if (!this.data.quickBarLinks) this.data.quickBarLinks = [];
        if (this.data.quickBarLinks.some(l => l.url === link.url)) {
            this.showToast('Already pinned', 'info'); return;
        }
        this.data.quickBarLinks.push({ id: link.id, title: link.title, url: link.url, icon: link.icon || '' });
        this.save();
        this._renderQuickBar();
        this.showToast('📌 Pinned to quick bar', 'success');
    },

    removeFromQuickBar(linkId) {
        this.data.quickBarLinks = (this.data.quickBarLinks || []).filter(l => l.id !== linkId);
        this.save();
        this._renderQuickBar();
    },

    // ---------- Link Click Tracking ----------
    trackLinkClick(url) {
        if (!url || url === '#') return;
        if (!this.data.linkStats) this.data.linkStats = {};
        this.data.linkStats[url] = (this.data.linkStats[url] || 0) + 1;
        this.save();
        this._renderMostVisited();
    },

    _renderMostVisited() {
        const section = document.getElementById('mostVisitedSection');
        if (!section) return;
        const stats = this.data.linkStats || {};
        const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (sorted.length === 0) { section.classList.add('hidden'); return; }
        section.classList.remove('hidden');

        // Build URL→link lookup
        const urlMap = {};
        this.data.folders.forEach(f => f.links.forEach(l => { if (l.url) urlMap[l.url] = l; }));
        (this.data.quickBarLinks || []).forEach(l => { if (l.url) urlMap[l.url] = l; });

        const list = document.getElementById('mostVisitedList');
        if (!list) return;
        list.innerHTML = sorted.map(([url, count]) => {
            const l = urlMap[url];
            const title = l?.title || url;
            let icon = l?.icon || '';
            if (!icon) { try { icon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; } catch {} }
            return `<a href="${this._esc(url)}" target="_blank" rel="noopener noreferrer"
                       class="visited-chip" data-url="${this._esc(url)}">
                        <img src="${this._esc(icon)}" class="visited-chip-icon" onerror="this.src='assets/icons/icon16.png'">
                        <span>${this._esc(title)}</span>
                        <span class="visited-count">${count}</span>
                    </a>`;
        }).join('');
    },

    // ---------- Render ----------
    render(searchQuery = '') {
        const grid = document.getElementById('foldersGrid');
        if (!grid) return;
        grid.innerHTML = '';
        this.applyLayout();
        this._updateTagFilterBar();

        const folders = this.data.folders;

        if (searchQuery.trim()) {
            this._renderSearch(grid, folders, searchQuery.trim().toLowerCase());
            return;
        }

        if (folders.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-large">
                    <div class="empty-icon">📂</div>
                    <h3>${this.t('empty_folders_title')}</h3>
                    <p>${this.t('empty_folders_desc')}</p>
                    <button class="btn-primary" onclick="App.addFolder()">${this.t('create_first_folder')}</button>
                </div>
            `;
            return;
        }

        // Pinned folders first
        const sorted = [...folders].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

        // Tag filter
        let foldersToShow = sorted;
        if (this._activeTag) {
            foldersToShow = sorted.map(f => ({
                ...f,
                links: f.links.filter(l => l.tags && l.tags.includes(this._activeTag))
            })).filter(f => f.links.length > 0);
        }

        foldersToShow.forEach(folder => {
            grid.appendChild(this._buildFolderCard(folder));
        });

        grid.appendChild(this._buildAddFolderCard());
    },

    _buildFolderCard(folder) {
        const card = document.createElement('div');
        card.className = 'folder-card group-card' + (folder.pinned ? ' pinned' : '');
        card.dataset.folderId = folder.id;
        card.setAttribute('draggable', 'true');
        card.setAttribute('role', 'article');
        card.setAttribute('aria-label', folder.name);

        if (folder.color === 'custom' && folder.customColor) {
            card.style.setProperty('--folder-accent', folder.customColor);
            card.dataset.color = 'custom';
        } else if (folder.color) {
            card.dataset.color = folder.color;
        }

        const pinTitle = folder.pinned ? this.t('unpin_folder') : this.t('pin_folder');
        const pinActiveClass = folder.pinned ? ' active' : '';

        card.innerHTML = `
            <div class="folder-header">
                <input type="text" class="folder-title-input" value="${this._esc(folder.name)}" title="Click to rename" readonly aria-label="${this._esc(folder.name)}">
                <div class="folder-actions">
                    <button class="folder-action-btn pin-btn${pinActiveClass}" data-action="pin-folder" title="${pinTitle}" aria-label="${pinTitle}">📌</button>
                    <button class="folder-action-btn" data-action="open-folder-context" title="Options" aria-label="Folder options">•••</button>
                </div>
            </div>
            <div class="links-container" id="links-${folder.id}" role="list">
                ${folder.links.map(link => this._buildLinkHTML(link, folder.id)).join('')}
                <button class="add-link-btn" data-action="open-folder-context" data-folder-id="${folder.id}" aria-label="${this.t('add_link')}">
                    <span>＋</span> Click to add
                </button>
            </div>`;

        return card;
    },

    _buildLinkHTML(link, folderId) {
        if (link.type === 'header') {
            return `<div class="link-header-item" role="listitem">
                <span>${this._esc(link.title)}</span>
                <div class="link-actions">
                    <button class="link-edit-btn" data-action="edit-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Edit header" aria-label="Edit header">✏️</button>
                    <button class="link-delete-btn" data-action="delete-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Remove header" aria-label="Remove header">✕</button>
                </div>
            </div>`;
        }

        // Icon resolution
        let iconHtml = '';
        if (link.icon && link.icon.length <= 2) {
            iconHtml = `<span class="link-icon emoji-icon" aria-hidden="true">${link.icon}</span>`;
        } else if (link.icon) {
            iconHtml = `<img class="link-icon" src="${link.icon}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;" alt="" loading="lazy" onerror="this.src='${this._getFaviconUrl(link.url) || 'assets/icons/icon16.png'}'">`;
        } else {
            const faviconUrl = this._getFaviconUrl(link.url);
            iconHtml = faviconUrl
                ? `<img class="link-icon" src="${faviconUrl}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;" alt="" loading="lazy" onerror="this.src='assets/icons/icon16.png'">`
                : `<span class="link-icon" aria-hidden="true">🔗</span>`;
        }

        // Tags chips
        const tagsHtml = link.tags && link.tags.length > 0
            ? `<div class="link-tags-row">${link.tags.map(t => `<span class="tag-chip">${this._esc(t)}</span>`).join('')}</div>`
            : '';

        // Note indicator
        const noteHtml = link.note
            ? `<span class="link-note-icon" title="${this._esc(link.note)}" aria-label="Has note">📝</span>`
            : '';

        // Broken link indicator
        const brokenClass = this._brokenLinks.has(link.id) ? ' broken' : '';
        const titleAttr = link.note ? `${this._esc(link.title)} — ${this._esc(link.note)}` : this._esc(link.title);

        return `
            <a href="${this._esc(link.url)}" class="link-item${brokenClass}" target="_blank" rel="noopener noreferrer"
               data-link-id="${link.id}" data-folder-id="${folderId}" draggable="true"
               role="listitem" aria-label="${this._esc(link.title)}">
                ${iconHtml}
                <div class="link-text-wrap" style="flex:1;overflow:hidden;">
                    <span class="link-text" title="${titleAttr}">${this._esc(link.title)}</span>
                    ${tagsHtml}
                </div>
                ${noteHtml}
                <div class="link-actions">
                    <button class="link-pin-btn" data-action="pin-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Pin to quick bar" aria-label="Pin to quick bar">📌</button>
                    <button class="link-edit-btn" data-action="edit-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Edit link" aria-label="Edit link">✏️</button>
                    <button class="link-delete-btn" data-action="delete-link"
                            data-link-id="${link.id}" data-folder-id="${folderId}" title="Remove link" aria-label="Remove link">✕</button>
                </div>
            </a>`;
    },

    _buildAddFolderCard() {
        const card = document.createElement('div');
        card.className = 'folder-card add-folder-card';
        card.innerHTML = `
            <div class="add-folder-inner">
                <span class="plus-icon">+</span>
                <span class="text">${this.t('add_folder')}</span>
            </div>
        `;
        card.addEventListener('click', () => this.addFolder());
        return card;
    },

    _renderSearch(grid, folders, query) {
        let found = false;
        folders.forEach(folder => {
            const matchingLinks = folder.links.filter(
                link => link.title.toLowerCase().includes(query) || link.url.toLowerCase().includes(query)
            );
            const folderNameMatch = folder.name.toLowerCase().includes(query);

            if (matchingLinks.length === 0 && !folderNameMatch) return;

            found = true;
            const card = document.createElement('div');
            card.className = 'folder-card';
            card.dataset.folderId = folder.id;

            const linksToShow = folderNameMatch ? folder.links : matchingLinks;
            card.innerHTML = `
                <div class="folder-header">
                    <span class="folder-emoji">${folder.emoji || '📁'}</span>
                    <input type="text" class="folder-title-input" value="${this._esc(folder.name)}" readonly>
                    <div class="folder-actions"></div>
                </div>
                <div class="links-container">
                    ${linksToShow.map(link => this._buildLinkHTML(link, folder.id)).join('')}
                </div>`;

            grid.appendChild(card);
        });

        if (!found) {
            grid.innerHTML = `<div class="no-results">🔍 No results for "<strong>${this._esc(query)}</strong>"</div>`;
        }
    },

    // ---------- Folder Operations ----------
    addFolder() {
        if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) {
            this.showPremiumModal();
            return;
        }
        this.openModal('templateModal');
    },

    deleteFolder(folderId) {
        const idx = this.data.folders.findIndex(f => f.id === folderId);
        if (idx !== -1) {
            this._pushUndo('delete-folder', { folder: JSON.parse(JSON.stringify(this.data.folders[idx])), index: idx });
        }
        this.data.folders = this.data.folders.filter(f => f.id !== folderId);
        this.save();
        this.render();
        this.showToast(this.t('folder_deleted_undo'), 'info');
    },

    renameFolder(folderId, newName) {
        const folder = this.data.folders.find(f => f.id === folderId);
        if (!folder) return;
        const name = newName.trim() || 'Untitled';
        folder.name = name;
        this.save();
    },

    _startEditTitle(input, folderId) {
        input.removeAttribute('readonly');
        input.focus();
        input.select();

        const finish = () => {
            input.setAttribute('readonly', '');
            this.renameFolder(folderId, input.value);
            input.removeEventListener('blur', finish);
            input.removeEventListener('keydown', onKey);
        };

        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(); }
            if (e.key === 'Escape') { e.preventDefault(); finish(); }
        };

        input.addEventListener('blur', finish);
        input.addEventListener('keydown', onKey);
    },

    // ---------- Link Operations ----------
    openAddLinkModal(folderId, linkId = null) {
        this._editingFolderId = folderId;
        this._editingLinkId = linkId;

        const titleEl = document.getElementById('addLinkModalTitle');
        const titleInput = document.getElementById('linkTitle');
        const urlInput = document.getElementById('linkUrl');
        const iconInput = document.getElementById('linkIcon');

        const tagsInput = document.getElementById('linkTags');
        const noteInput = document.getElementById('linkNote');
        const tagsPreview = document.getElementById('tagsPreview');

        if (linkId) {
            const folder = this.data.folders.find(f => f.id === folderId);
            const link = folder?.links.find(l => l.id === linkId);
            if (link) {
                if (link.type === 'header') {
                    titleEl.textContent = 'Edit Header';
                    titleInput.value = link.title;
                    urlInput.value = '';
                    urlInput.disabled = true;
                    iconInput.disabled = true;
                    if (tagsInput) { tagsInput.value = ''; tagsInput.disabled = true; }
                    if (noteInput) { noteInput.value = ''; noteInput.disabled = true; }
                } else {
                    titleEl.textContent = 'Edit Link';
                    titleInput.value = link.title;
                    urlInput.value = link.url;
                    urlInput.disabled = false;
                    iconInput.disabled = false;
                    iconInput.value = link.icon || '';
                    if (tagsInput) { tagsInput.value = (link.tags || []).join(', '); tagsInput.disabled = false; }
                    if (noteInput) { noteInput.value = link.note || ''; noteInput.disabled = false; }
                }
            }
        } else {
            titleEl.textContent = 'Add Link';
            document.getElementById('addLinkForm').reset();
            urlInput.disabled = false;
            iconInput.disabled = false;
            if (tagsInput) { tagsInput.value = ''; tagsInput.disabled = false; }
            if (noteInput) { noteInput.value = ''; noteInput.disabled = false; }
        }
        // Reset tags preview
        if (tagsPreview) tagsPreview.innerHTML = '';

        this.openModal('addLinkModal');
        titleInput.focus();
    },

    saveLink(formData) {
        const folderId = this._editingFolderId;
        const folder = this.data.folders.find(f => f.id === folderId);
        if (!folder) return;

        const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const note = formData.note ? formData.note.trim() : '';

        if (this._editingLinkId) {
            const link = folder.links.find(l => l.id === this._editingLinkId);
            if (link) {
                link.title = formData.title.trim();
                if (link.type !== 'header') {
                    let url = formData.url.trim();
                    if (url && !url.match(/^https?:\/\//)) url = 'https://' + url;
                    link.url = url;
                    link.icon = formData.icon.trim() || '';
                    link.tags = tags;
                    link.note = note;
                }
            }
        } else {
            let url = formData.url.trim();
            if (url && !url.match(/^https?:\/\//)) url = 'https://' + url;

            // Duplicate URL check (soft warning, still saves)
            const normalizeUrl = u => u.replace(/\/$/, '').toLowerCase();
            const isDupe = folder.links.some(l => l.url && normalizeUrl(l.url) === normalizeUrl(url));
            if (isDupe) {
                this.showToast(this.t('duplicate_warning'), 'info');
            }

            folder.links.push({
                id: 'l' + Date.now(),
                title: formData.title.trim(),
                url: url,
                icon: formData.icon.trim() || '',
                tags,
                note
            });
        }

        this.save();
        this.closeModal('addLinkModal');
        this.render();
        this.showToast(this._editingLinkId ? 'Updated.' : 'Link added.', 'success');
    },

    deleteLink(folderId, linkId) {
        const folder = this.data.folders.find(f => f.id === folderId);
        if (!folder) return;
        const idx = folder.links.findIndex(l => l.id === linkId);
        if (idx !== -1) {
            this._pushUndo('delete-link', { link: JSON.parse(JSON.stringify(folder.links[idx])), folderId, index: idx });
        }
        folder.links = folder.links.filter(l => l.id !== linkId);
        this.save();
        this.render();
        this.showToast(this.t('link_deleted_undo'), 'info');
    },

    // ---------- Modals ----------
    openModal(id) {
        document.getElementById(id)?.classList.add('open');
    },

    closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    },

    showPremiumModal() {
        this.openModal('premiumModal');
    },

    confirm(_title, _message, _okLabel, action) {
        document.getElementById('confirmTitle').textContent = this.t('confirm_title');
        document.getElementById('confirmMessage').textContent = this.t('confirm_msg');
        document.getElementById('confirmOk').textContent = this.t('delete');
        this._pendingAction = action;
        this.openModal('confirmModal');
    },

    // ---------- Search ----------
    toggleSearch() {
        const wrapper = document.getElementById('searchWrapper');
        const input = document.getElementById('searchInput');
        const isVisible = wrapper.style.display !== 'none';

        if (isVisible) {
            wrapper.style.display = 'none';
            input.value = '';
            this.render();
        } else {
            wrapper.style.display = '';
            input.focus();
        }
    },

    // ---------- Settings ----------
    exportData() {
        if (!this.isPro) { this.showPremiumModal(); return; }
        const json = JSON.stringify(this.data.folders, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'new-tab-folders-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Data exported.', 'success');
    },

    importData(file) {
        if (!this.isPro) { this.showPremiumModal(); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const folders = JSON.parse(e.target.result);
                if (!Array.isArray(folders)) throw new Error('Invalid format');
                this.data.folders = folders;
                this.save();
                this.render();
                this.closeModal('settingsModal');
                this.showToast('Data imported successfully!', 'success');
            } catch {
                this.showToast('Import failed. Invalid file format.', 'error');
            }
        };
        reader.readAsText(file);
    },

    clearData() {
        this.data.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
        this.save();
        this.render();
        this.closeModal('settingsModal');
        this.showToast('Data cleared. Default folders restored.', 'info');
    },

    // ---------- Toast ----------
    createToastContainer() {
        if (!document.querySelector('.toast-container')) {
            const el = document.createElement('div');
            el.className = 'toast-container';
            document.body.appendChild(el);
        }
    },

    showToast(message, type = 'info') {
        const container = document.querySelector('.toast-container');
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${icons[type] || ''}</span> ${this._esc(message)}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    },

    // ---------- Utility ----------
    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // ---------- Event Bindings ----------
    bindEvents() {
        // Global delegated click on document
        document.addEventListener('click', (e) => {
            // Close modal on overlay click
            if (e.target.classList.contains('modal-overlay')) {
                this.closeModal(e.target.id);
                return;
            }

            // [data-close] buttons
            const closeBtn = e.target.closest('[data-close]');
            if (closeBtn) {
                this.closeModal(closeBtn.dataset.close);
                return;
            }

            // Action buttons
            const actionEl = e.target.closest('[data-action]');
            if (actionEl) {
                this._handleAction(actionEl, e);
                return;
            }

            // Link click tracking (must be after action check so edit/delete/pin don't count)
            const linkItem = e.target.closest('a.link-item');
            if (linkItem) {
                this.trackLinkClick(linkItem.href);
                return;
            }
            const visitedChip = e.target.closest('a.visited-chip');
            if (visitedChip) {
                this.trackLinkClick(visitedChip.href);
                return;
            }
        });

        // ---------- Drag and Drop Logic ----------
        const openTabsList = document.getElementById('openTabsList');
        if (openTabsList) {
            openTabsList.addEventListener('dragstart', (e) => {
                const tabItem = e.target.closest('.tab-item');
                if (tabItem) {
                    const data = {
                        action: 'add-tab',
                        title: tabItem.dataset.title,
                        url: tabItem.dataset.url,
                        icon: tabItem.dataset.icon
                    };
                    e.dataTransfer.setData('application/json', JSON.stringify(data));
                    e.dataTransfer.effectAllowed = 'copy';
                }
            });
        }

        const foldersGrid = document.getElementById('foldersGrid');
        if (foldersGrid) {
            // Folder card drag start (for reordering) + link drag start (reordering)
            foldersGrid.addEventListener('dragstart', (e) => {
                const linkItem = e.target.closest('.link-item[draggable]');
                if (linkItem) {
                    const folderId = linkItem.dataset.folderId;
                    const linkId = linkItem.dataset.linkId;
                    const folder = this.data.folders.find(f => f.id === folderId);
                    const idx = folder?.links.findIndex(l => l.id === linkId) ?? -1;
                    this._dragLink = { folderId, linkId, idx };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'link-reorder');
                    return;
                }
                const folderCard = e.target.closest('.folder-card[draggable]');
                if (folderCard && !e.target.closest('.link-item') && !e.target.closest('button') && !e.target.closest('input')) {
                    const folderId = folderCard.dataset.folderId;
                    const idx = this.data.folders.findIndex(f => f.id === folderId);
                    this._dragFolder = { folderId, idx };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'folder-reorder');
                }
            });

            foldersGrid.addEventListener('dragend', () => {
                this._dragLink = null;
                this._dragFolder = null;
                document.querySelectorAll('.drag-over-top,.drag-over-bottom,.folder-drag-over,.is-drag-over')
                    .forEach(el => el.classList.remove('drag-over-top','drag-over-bottom','folder-drag-over','is-drag-over'));
            });

            foldersGrid.addEventListener('dragover', (e) => {
                if (this._dragLink) {
                    const linkTarget = e.target.closest('.link-item');
                    if (linkTarget) {
                        e.preventDefault();
                        document.querySelectorAll('.drag-over-top,.drag-over-bottom')
                            .forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
                        const rect = linkTarget.getBoundingClientRect();
                        linkTarget.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
                    }
                    return;
                }
                if (this._dragFolder) {
                    const folderCard = e.target.closest('.folder-card:not(.add-folder-card)');
                    if (folderCard && folderCard.dataset.folderId !== this._dragFolder.folderId) {
                        e.preventDefault();
                        document.querySelectorAll('.folder-drag-over')
                            .forEach(el => el.classList.remove('folder-drag-over'));
                        folderCard.classList.add('folder-drag-over');
                    }
                    return;
                }
                // Tab drop from sidebar
                const folderCard = e.target.closest('.folder-card');
                if (folderCard) {
                    e.preventDefault();
                    folderCard.classList.add('is-drag-over');
                }
            });

            foldersGrid.addEventListener('dragleave', (e) => {
                const linkItem = e.target.closest('.link-item');
                if (linkItem && (!e.relatedTarget || !linkItem.contains(e.relatedTarget))) {
                    linkItem.classList.remove('drag-over-top','drag-over-bottom');
                }
                const folderCard = e.target.closest('.folder-card');
                if (folderCard && e.relatedTarget && !folderCard.contains(e.relatedTarget)) {
                    folderCard.classList.remove('is-drag-over','folder-drag-over');
                }
            });

            foldersGrid.addEventListener('drop', (e) => {
                document.querySelectorAll('.drag-over-top,.drag-over-bottom,.folder-drag-over,.is-drag-over')
                    .forEach(el => el.classList.remove('drag-over-top','drag-over-bottom','folder-drag-over','is-drag-over'));

                // Link reorder drop
                if (this._dragLink) {
                    const linkTarget = e.target.closest('.link-item');
                    if (linkTarget) {
                        e.preventDefault();
                        const tgtFolderId = linkTarget.dataset.folderId;
                        const tgtLinkId = linkTarget.dataset.linkId;
                        const srcFolder = this.data.folders.find(f => f.id === this._dragLink.folderId);
                        const tgtFolder = this.data.folders.find(f => f.id === tgtFolderId);
                        if (srcFolder && tgtFolder) {
                            const srcIdx = srcFolder.links.findIndex(l => l.id === this._dragLink.linkId);
                            const tgtIdx = tgtFolder.links.findIndex(l => l.id === tgtLinkId);
                            if (srcIdx !== -1 && tgtIdx !== -1) {
                                const [moved] = srcFolder.links.splice(srcIdx, 1);
                                const rect = linkTarget.getBoundingClientRect();
                                const insertIdx = tgtIdx + (e.clientY > rect.top + rect.height / 2 ? 1 : 0);
                                tgtFolder.links.splice(insertIdx, 0, moved);
                                this.save();
                                this.render();
                            }
                        }
                    }
                    this._dragLink = null;
                    return;
                }

                // Folder reorder drop
                if (this._dragFolder) {
                    const folderCard = e.target.closest('.folder-card:not(.add-folder-card)');
                    if (folderCard && folderCard.dataset.folderId !== this._dragFolder.folderId) {
                        e.preventDefault();
                        const srcIdx = this.data.folders.findIndex(f => f.id === this._dragFolder.folderId);
                        const tgtIdx = this.data.folders.findIndex(f => f.id === folderCard.dataset.folderId);
                        if (srcIdx !== -1 && tgtIdx !== -1) {
                            const [moved] = this.data.folders.splice(srcIdx, 1);
                            this.data.folders.splice(tgtIdx, 0, moved);
                            this.save();
                            this.render();
                        }
                    }
                    this._dragFolder = null;
                    return;
                }

                // Tab drop from sidebar
                const folderCard = e.target.closest('.folder-card');
                if (folderCard) {
                    e.preventDefault();
                    const tabDataAttr = e.dataTransfer.getData('application/json');
                    if (tabDataAttr) {
                        try {
                            const tabData = JSON.parse(tabDataAttr);
                            if (tabData.action === 'add-tab') {
                                const fId = folderCard.dataset.folderId;
                                const folder = this.data.folders.find(f => f.id === fId);
                                if (folder) {
                                    folder.links.push({
                                        id: 'link_' + Date.now(),
                                        title: tabData.title,
                                        url: tabData.url,
                                        icon: tabData.icon,
                                        createdAt: Date.now()
                                    });
                                    this.save();
                                    this.render();
                                    this.showToast('Tab saved to folder!', 'success');
                                }
                            }
                        } catch(err) { console.error('Drag drop error', err); }
                    }
                }
            });
        }
        // -----------------------------------------

        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.render(e.target.value);
            });
        }

        // Dropdown toggle logic
        document.querySelectorAll('.dropdown-wrapper').forEach(wrapper => {
            const btn = wrapper.querySelector('button');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close others
                    document.querySelectorAll('.dropdown-wrapper').forEach(w => {
                        if (w !== wrapper) w.classList.remove('active');
                    });
                    wrapper.classList.toggle('active');
                });
            }
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown-wrapper')) {
                document.querySelectorAll('.dropdown-wrapper').forEach(w => {
                    w.classList.remove('active');
                });
            }
        });

        // Pricing checkout buttons (open LemonSqueezy in new tab)
        document.querySelectorAll('.pricing-btn[data-checkout]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.open(btn.dataset.checkout, '_blank');
            });
        });

        // License key activation
        document.getElementById('activateLicenseBtn')?.addEventListener('click', () => {
            const key = document.getElementById('licenseKeyInput')?.value || '';
            this.activateLicense(key);
        });

        document.getElementById('licenseKeyInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const key = e.target.value || '';
                this.activateLicense(key);
            }
        });

        // Dropdown actions
        document.getElementById('headerUpgradeBtn')?.addEventListener('click', () => {
            this.showPremiumModal();
        });

        document.getElementById('dropdownExportBtn')?.addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('dropdownImportBtn')?.addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        // Toggle switches in settings menu (visual only, for now)
        document.querySelectorAll('.toggle-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const switchEl = item.querySelector('.toggle-switch');
                if (switchEl) switchEl.classList.toggle('active');
            });
        });

        // Add Link Form submit
        document.getElementById('addLinkForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const titleVal = document.getElementById('linkTitle').value;
            const urlInput = document.getElementById('linkUrl');
            
            // Allow empty URL ONLY if the current editing item is a header type (it disables the input)
            if (!titleVal.trim() || (!urlInput.value.trim() && !urlInput.disabled)) return;
            
            this.saveLink({
                title: titleVal,
                url: urlInput.value,
                icon: document.getElementById('linkIcon').value,
                tags: document.getElementById('linkTags')?.value || '',
                note: document.getElementById('linkNote')?.value || ''
            });
        });

        // Settings: Theme buttons + hover preview
        const themeGrid = document.getElementById('themeGrid');
        if (themeGrid) {
            // Live preview on hover
            themeGrid.addEventListener('mouseover', (e) => {
                const btn = e.target.closest('.theme-btn');
                if (btn) document.documentElement.setAttribute('data-theme', btn.dataset.theme);
            });
            // Restore on mouse leave
            themeGrid.addEventListener('mouseleave', () => {
                document.documentElement.setAttribute('data-theme', this.data.theme);
            });
            // Apply on click
            themeGrid.addEventListener('click', (e) => {
                const btn = e.target.closest('.theme-btn');
                if (!btn) return;
                if (btn.classList.contains('pro-locked')) {
                    this.closeModal('settingsModal');
                    this.showPremiumModal();
                    return;
                }
                this.applyTheme(btn.dataset.theme);
                this.save();
            });
        }

        // Settings: Export
        // Settings: Background presets
        document.getElementById('bgPresetGrid')?.addEventListener('click', (e) => {
            const swatch = e.target.closest('.bg-swatch');
            if (!swatch) return;
            const preset = this.BG_PRESETS.find(p => p.id === swatch.dataset.bgId);
            if (preset) { this.applyBackground(preset); this.save(); }
        });

        document.getElementById('bgResetBtn')?.addEventListener('click', () => {
            this.applyBackground({ type: 'none', value: '' });
            this.save();
        });

        document.getElementById('bgUrlApplyBtn')?.addEventListener('click', () => {
            const url = document.getElementById('bgUrlInput')?.value?.trim();
            if (url) { this.applyBackground({ type: 'image', value: url }); this.save(); }
        });

        document.getElementById('bgUrlInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const url = e.target.value.trim();
                if (url) { this.applyBackground({ type: 'image', value: url }); this.save(); }
            }
        });

        document.getElementById('exportBtn')?.addEventListener('click', () => {
            this.exportData();
        });

        // Settings: Import
        document.getElementById('importBtn')?.addEventListener('click', () => {
            if (!this.isPro) { this.closeModal('settingsModal'); this.showPremiumModal(); return; }
            document.getElementById('importFile')?.click();
        });

        document.getElementById('importFile')?.addEventListener('change', (e) => {
            if (e.target.files[0]) this.importData(e.target.files[0]);
            e.target.value = '';
        });

        // Settings: Clear Data
        document.getElementById('clearDataBtn')?.addEventListener('click', () => {
            this.confirm(
                'Clear All Data',
                'This will delete all your folders and links. Are you sure?',
                'Clear Data',
                () => this.clearData()
            );
        });

        // Sidebar Toggle
        document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.toggle('collapsed');
                this.data.sidebarCollapsed = sidebar.classList.contains('collapsed');
                this.save();
            }
        });

        // Toggle Closed Tabs (Eye Icon switch)
        document.getElementById('toggleClosedTabsBtn')?.addEventListener('click', () => {
            const list = document.getElementById('closedTabsList');
            const iconBtn = document.getElementById('closedTabsIcon');
            if (list) {
                list.classList.toggle('hidden');
                const isHidden = list.classList.contains('hidden');
                if (iconBtn) {
                    const eyeOpen = iconBtn.querySelector('.eye-open');
                    const eyeClosed = iconBtn.querySelector('.eye-closed');
                    if (eyeOpen) eyeOpen.style.display = isHidden ? 'none' : 'block';
                    if (eyeClosed) eyeClosed.style.display = isHidden ? 'block' : 'none';
                }
            }
        });

        // Tabs Sort Menu Options
        document.querySelectorAll('#sortTabsMenu .dropdown-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this.data.tabsSortOrder = btn.dataset.sort;
                
                document.querySelectorAll('#sortTabsMenu .dropdown-item').forEach(b => {
                    b.classList.remove('active');
                    const span = b.querySelector('.check-icon');
                    if(span) span.style.visibility = b === btn ? 'visible' : 'hidden';
                });
                btn.classList.add('active');
                
                this.save();
                this.fetchTabs();
                document.getElementById('sortTabsMenu')?.parentElement.classList.remove('active');
            });
        });

        // Initialize sort UI state based on loaded data
        const currentSort = this.data.tabsSortOrder || 'recent';
        document.querySelectorAll('#sortTabsMenu .dropdown-item').forEach(b => {
            b.classList.toggle('active', b.dataset.sort === currentSort);
            const span = b.querySelector('.check-icon');
            if (span) span.style.visibility = b.dataset.sort === currentSort ? 'visible' : 'hidden';
        });

        // Main Context Menu on Right Click empty folders space
        const scrollArea = document.querySelector('.content-scroll');
        if (scrollArea) {
            scrollArea.addEventListener('contextmenu', (e) => {
                if (e.target.closest('.folder-card') || e.target.closest('.context-modal')) {
                    return;
                }
                e.preventDefault();
                const modal = document.getElementById('mainContextModal');
                const modalContent = modal?.querySelector('.modal');
                if (modal && modalContent) {
                    modal.classList.add('open');
                    
                    const x = e.clientX;
                    const y = e.clientY;
                    modalContent.style.left = `${x}px`;
                    modalContent.style.top = `${y}px`;
                    modalContent.style.margin = '0';
                    modalContent.style.position = 'absolute';
                    modalContent.style.transform = 'none';
                    
                    const rect = modalContent.getBoundingClientRect();
                    if (x + rect.width > window.innerWidth) modalContent.style.left = `${window.innerWidth - rect.width - 10}px`;
                    if (y + rect.height > window.innerHeight) modalContent.style.top = `${window.innerHeight - rect.height - 10}px`;
                }
            });
        }
        
        // Main Context Menu Actions
        document.getElementById('ctxMainPaste')?.addEventListener('click', () => {
            this.showToast('Paste feature requires Clipboard API permissions.', 'info');
            this.closeModal('mainContextModal');
        });
        
        document.getElementById('ctxMainAddNote')?.addEventListener('click', () => {
            this.showToast('Adding custom notes coming soon!', 'info');
            this.closeModal('mainContextModal');
        });
        
        document.getElementById('ctxMainAddFolder')?.addEventListener('click', () => {
            this.addFolder();
            this.closeModal('mainContextModal');
        });

        // Language Dropdown Logic
        document.querySelectorAll('#languageMenu .dropdown-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                this.data.language = lang;
                
                document.querySelectorAll('#languageMenu .dropdown-item').forEach(item => {
                    const check = item.querySelector('.check-icon');
                    if (check) check.style.visibility = item.dataset.lang === lang ? 'visible' : 'hidden';
                });
                
                this.updateStaticI18n();
                this.render();
                this.fetchTabs();
                this.save();
                // Silent change - no toast
                // Close the dropdown
                btn.closest('.dropdown-wrapper').classList.remove('active');
            });
        });

        // Initialize Language UI
        const currentLang = this.data.language || 'TR';
        document.querySelectorAll('#languageMenu .dropdown-item').forEach(item => {
            const check = item.querySelector('.check-icon');
            if (check) check.style.visibility = item.dataset.lang === currentLang ? 'visible' : 'hidden';
        });

        // Tutorial Logic
        document.getElementById('retakeTutorialBtn')?.addEventListener('click', () => {
            this.openModal('tutorialModal');
            document.getElementById('tutorialStep1')?.classList.remove('hidden');
            document.getElementById('tutorialStep2')?.classList.add('hidden');
        });
        
        document.getElementById('tutorialNextBtn')?.addEventListener('click', () => {
            document.getElementById('tutorialStep1')?.classList.add('hidden');
            document.getElementById('tutorialStep2')?.classList.remove('hidden');
        });
        
        document.getElementById('tutorialPrevBtn')?.addEventListener('click', () => {
            document.getElementById('tutorialStep2')?.classList.add('hidden');
            document.getElementById('tutorialStep1')?.classList.remove('hidden');
        });
        
        document.getElementById('tutorialFinishBtn')?.addEventListener('click', () => {
            this.data.tutorialCompleted = true;
            this.save();
            this.closeModal('tutorialModal');
        });
        
        document.getElementById('tutorialImportBtn')?.addEventListener('click', () => {
            document.getElementById('importFile')?.click();
            this.data.tutorialCompleted = true;
            this.save();
            this.closeModal('tutorialModal');
        });
        
        document.querySelectorAll('.tutorial-theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tutorial-theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const theme = btn.dataset.setTheme;
                const finalTheme = theme === 'auto' ? 'dark' : theme;
                this.applyTheme(finalTheme);
                this.data.theme = finalTheme;
                this.save();
            });
        });

        // Confirm dialog
        document.getElementById('confirmOk')?.addEventListener('click', () => {
            if (this._pendingAction) {
                this._pendingAction();
                this._pendingAction = null;
            }
            this.closeModal('confirmModal');
        });

        document.getElementById('confirmCancel')?.addEventListener('click', () => {
            this._pendingAction = null;
            this.closeModal('confirmModal');
        });

        // Stash open tabs button
        document.getElementById('saveWindowLinks')?.addEventListener('click', () => {
            this.stashOpenTabs();
        });

        // Import tab groups button
        document.getElementById('importTabGroupsBtn')?.addEventListener('click', () => {
            this.importTabGroups();
        });

        // Close window + all tabs
        document.getElementById('closeWindowTabs')?.addEventListener('click', () => {
            this.confirm('Close Window', 'Close this window and all its tabs?', 'Close', () => {
                if (typeof chrome !== 'undefined' && chrome.windows) {
                    chrome.windows.getCurrent(win => { if (win) chrome.windows.remove(win.id); });
                }
            });
        });

        // Keyboard shortcuts modal
        document.getElementById('keyboardShortcutsBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.openModal('shortcutsModal');
        });

        // Theme & Background — open settingsModal from dropdown
        document.getElementById('themeDropdownBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.openModal('settingsModal');
        });
        document.getElementById('bgSettingsBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.openModal('settingsModal');
            setTimeout(() => {
                document.getElementById('bgPresetGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 150);
        });

        // Template picker cards
        document.getElementById('templateModal')?.addEventListener('click', (e) => {
            const tplCard = e.target.closest('[data-template]');
            if (tplCard) { this.createFromTemplate(tplCard.dataset.template); return; }
            const packCard = e.target.closest('[data-pack]');
            if (packCard) this.applyStarterPack(packCard.dataset.pack);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Z → undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
                return;
            }
            // Shift + Alt + P → activate demo
            if (e.shiftKey && e.altKey && e.key === 'P') {
                this.activateDemo();
                return;
            }
            // Escape → close topmost open modal
            if (e.key === 'Escape') {
                const open = [...document.querySelectorAll('.modal-overlay.open')];
                if (open.length) this.closeModal(open[open.length - 1].id);
            }
        });

        // Folder title rename — double click
        document.addEventListener('dblclick', (e) => {
            const input = e.target.closest('.folder-title-input');
            if (!input) return;
            const card = input.closest('.folder-card');
            if (!card) return;
            this._startEditTitle(input, card.dataset.folderId);
        });
        
        // --- Sidebar Toggles ---
        const toggleClosedBtn = document.getElementById('toggleClosedTabsBtn');
        if (toggleClosedBtn) {
            toggleClosedBtn.addEventListener('click', () => {
                const list = document.getElementById('closedTabsList');
                if (list) list.classList.toggle('hidden');
            });
        }
        
        const newTabBtn = document.getElementById('newTabBtn');
        if (newTabBtn && typeof chrome !== 'undefined' && chrome.tabs) {
            newTabBtn.addEventListener('click', () => chrome.tabs.create({}));
        }

        // --- Sidebar Utilities ---
        document.getElementById('cleanDupesBtn')?.addEventListener('click', () => {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    const seen = new Set();
                    const dupes = [];
                    tabs.forEach(t => {
                        if (seen.has(t.url)) dupes.push(t.id);
                        else seen.add(t.url);
                    });
                    if (dupes.length) chrome.tabs.remove(dupes, () => this.fetchTabs());
                });
            }
        });
        
        document.getElementById('sortTabsBtn')?.addEventListener('click', () => {
            // Very simple sort by URL logic for demonstration visually in sidebar
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.query({ currentWindow: true }, (tabs) => {
                    const sorted = [...tabs].sort((a,b) => a.url.localeCompare(b.url));
                    sorted.forEach((t, i) => chrome.tabs.move(t.id, { index: i }));
                    setTimeout(() => this.fetchTabs(), 300);
                });
            }
        });

        // --- Context Menu Handlers ---
        document.getElementById('ctxAddBookmark')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            this.openAddLinkModal(fId);
        });

        document.getElementById('ctxAddGroup')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            const folder = this.data.folders.find(f => f.id === fId);
            if (folder) {
                folder.links.push({ id: 'h' + Date.now(), title: 'New Group', type: 'header' });
                this.save();
                this.render();
            }
        });

        document.getElementById('ctxOpenAll')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            const folder = this.data.folders.find(f => f.id === fId);
            if (folder && typeof chrome !== 'undefined' && chrome.tabs) {
                folder.links.filter(l => l.type !== 'header').forEach(l => chrome.tabs.create({ url: l.url, active: false }));
            }
        });

        document.getElementById('ctxOpenNewWin')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            const folder = this.data.folders.find(f => f.id === fId);
            if (folder && typeof chrome !== 'undefined' && chrome.windows) {
                const urls = folder.links.filter(l => l.type !== 'header').map(l => l.url);
                if (urls.length) chrome.windows.create({ url: urls });
            }
        });

        document.getElementById('ctxRename')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            const card = document.querySelector(`[data-folder-id="${fId}"]`);
            if (card) {
                const input = card.querySelector('.folder-title-input');
                if (input) this._startEditTitle(input, fId);
            }
        });

        document.getElementById('ctxDuplicate')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            if (!this.isPro && this.data.folders.length >= FREE_FOLDER_LIMIT) {
                this.showPremiumModal();
                return;
            }
            const folder = this.data.folders.find(f => f.id === fId);
            if (folder) {
                const dup = JSON.parse(JSON.stringify(folder));
                dup.id = 'f' + Date.now();
                dup.name += ' (Copy)';
                dup.links.forEach(l => l.id += 'c');
                this.data.folders.push(dup);
                this.save();
                this.render();
            }
        });

        document.getElementById('ctxDelete')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            const folder = this.data.folders.find(f => f.id === fId);
            if (folder) {
                this.confirm('Delete Space', `Delete "${folder.name}" and all its links?`, 'Delete', () => this.deleteFolder(fId));
            }
        });

        // Color Picker (preset dots)
        document.querySelector('.color-picker-grid')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-dot')) {
                const color = e.target.dataset.color;
                const fId = document.getElementById('contextFolderId').value;
                const folder = this.data.folders.find(f => f.id === fId);
                if (folder) {
                    folder.color = color;
                    delete folder.customColor;
                    this.save();
                    this.render();
                    this.closeModal('folderContextModal');
                }
            }
        });

        // Custom Color Picker
        document.getElementById('customColorPicker')?.addEventListener('change', (e) => {
            const hex = e.target.value;
            const fId = document.getElementById('contextFolderId').value;
            const folder = this.data.folders.find(f => f.id === fId);
            if (folder) {
                folder.color = 'custom';
                folder.customColor = hex;
                this.save();
                this.render();
                this.closeModal('folderContextModal');
            }
        });

        // Pin Folder (context menu)
        document.getElementById('ctxPin')?.addEventListener('click', () => {
            const fId = document.getElementById('contextFolderId').value;
            this.closeModal('folderContextModal');
            this.togglePinFolder(fId);
        });

        // Pin Folder (action button on card) — via _handleAction
        // (handled in _handleAction switch below)

        // Column selector
        document.addEventListener('click', (e) => {
            const colBtn = e.target.closest('.col-btn');
            if (colBtn) {
                e.stopPropagation();
                this.setColumnCount(colBtn.dataset.cols);
            }
        });

        // Compact mode toggle
        document.getElementById('compactModeItem')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCompactMode();
        });

        // Import Chrome Bookmarks
        document.getElementById('importChromeBookmarksBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.importChromeBookmarks();
        });

        document.getElementById('confirmImportBookmarksBtn')?.addEventListener('click', () => {
            this.confirmImportBookmarks();
        });

        // Check broken links
        document.getElementById('checkLinksBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.checkBrokenLinks();
        });

        // Tags input live preview
        document.getElementById('linkTags')?.addEventListener('input', (e) => {
            const preview = document.getElementById('tagsPreview');
            if (!preview) return;
            const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
            preview.innerHTML = tags.map(t => `<span class="tag-chip">${this._esc(t)}</span>`).join('');
        });

        // Sign in / sign out / sync now
        document.getElementById('signInBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.signIn();
        });

        document.getElementById('signOutBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-wrapper').forEach(w => w.classList.remove('active'));
            this.signOut();
        });

        document.getElementById('syncNowBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (typeof SyncManager === 'undefined' || !SyncManager.isSignedIn) return;
            this._updateSyncStatus('syncing');
            try {
                const remote = await SyncManager.pull();
                if (remote && (remote.updatedAt || 0) > (this.data.updatedAt || 0)) {
                    this.data = { ...this.data, ...remote };
                    await Storage.set({ ntf_data: this.data });
                    this.render();
                    this.showToast(this.t('sync_from_device'), 'info');
                } else {
                    await SyncManager.push(this.data);
                }
                this._updateSyncStatus('synced');
                this.showToast(this.t('sync_synced'), 'success');
            } catch {
                this._updateSyncStatus('error');
                this.showToast(this.t('sync_error'), 'error');
            }
        });

        // Clipboard paste → quick add URL
        document.addEventListener('paste', (e) => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
            // Also ignore if a modal is open
            if (document.querySelector('.modal-overlay.open')) return;
            const text = e.clipboardData?.getData('text') || '';
            if (text && /^https?:\/\//.test(text.trim())) {
                e.preventDefault();
                if (this.data.folders.length === 0) { this.showToast('Create a folder first!', 'error'); return; }
                this._editingFolderId = this.data.folders[0].id;
                this._editingLinkId = null;
                document.getElementById('addLinkModalTitle').textContent = this.t('add_link');
                document.getElementById('linkTitle').value = '';
                document.getElementById('linkUrl').value = text.trim();
                document.getElementById('linkIcon').value = '';
                const tagsEl = document.getElementById('linkTags');
                const noteEl = document.getElementById('linkNote');
                if (tagsEl) tagsEl.value = '';
                if (noteEl) noteEl.value = '';
                document.getElementById('linkUrl').disabled = false;
                document.getElementById('linkIcon').disabled = false;
                this.openModal('addLinkModal');
                document.getElementById('linkTitle').focus();
                this.showToast(this.t('clipboard_url_detected'), 'info');
            }
        });
    },

    _handleAction(el, e) {
        const action = el.dataset.action;

        switch (action) {
            case 'add-folder':
                this.addFolder();
                break;

            case 'show-premium':
                this.showPremiumModal();
                break;

            case 'add-link': {
                e.preventDefault();
                e.stopPropagation();
                this.openAddLinkModal(el.dataset.folderId);
                break;
            }

            case 'delete-folder': {
                e.stopPropagation();
                const card = el.closest('.folder-card');
                const folderId = card?.dataset.folderId;
                const folder = this.data.folders.find(f => f.id === folderId);
                if (!folder) return;
                this.confirm(
                    'Delete Folder',
                    `Delete "${folder.name}" and all its links?`,
                    'Delete',
                    () => this.deleteFolder(folderId)
                );
                break;
            }

            case 'pin-link': {
                e.preventDefault();
                e.stopPropagation();
                this.addToQuickBar(el.dataset.linkId, el.dataset.folderId);
                break;
            }

            case 'remove-quick': {
                e.preventDefault();
                e.stopPropagation();
                this.removeFromQuickBar(el.dataset.id);
                break;
            }

            case 'delete-link': {
                e.preventDefault();
                e.stopPropagation();
                const { linkId, folderId } = el.dataset;
                this.confirm(
                    'Remove Item',
                    'Remove this item from the folder?',
                    'Remove',
                    () => this.deleteLink(folderId, linkId)
                );
                break;
            }
            
            case 'edit-link': {
                e.preventDefault();
                e.stopPropagation();
                const { linkId, folderId } = el.dataset;
                this.openAddLinkModal(folderId, linkId);
                break;
            }

            case 'pin-folder': {
                e.stopPropagation();
                const card = el.closest('.folder-card');
                const folderId = card?.dataset.folderId;
                if (folderId) this.togglePinFolder(folderId);
                break;
            }

            case 'open-folder-context': {
                e.stopPropagation();
                e.preventDefault();
                const card = el.closest('.folder-card');
                const folderId = card?.dataset.folderId;
                if (!folderId) return;
                document.getElementById('contextFolderId').value = folderId;
                // Update pin button label
                const folder = this.data.folders.find(f => f.id === folderId);
                const ctxPin = document.getElementById('ctxPin');
                if (ctxPin && folder) {
                    ctxPin.textContent = folder.pinned ? this.t('unpin_folder') : this.t('pin_folder');
                }
                this.openModal('folderContextModal');
                break;
            }

            case 'close-tab': {
                e.preventDefault();
                e.stopPropagation();
                const tabId = parseInt(el.dataset.tabId, 10);
                if (typeof chrome !== 'undefined' && chrome.tabs) {
                    chrome.tabs.remove(tabId, () => this.fetchTabs());
                }
                break;
            }
            
            case 'add-tab-link': {
                e.preventDefault();
                e.stopPropagation();
                const { url, title, icon } = el.dataset;
                
                // Show modal to select folder or just add to first one
                if (this.data.folders.length > 0) {
                     const folderId = this.data.folders[0].id; // For simplicity add to first folder right now. User UI could handle folder choice
                     this._editingFolderId = folderId;
                     this._editingLinkId = null;
                     
                     document.getElementById('addLinkModalTitle').textContent = 'Add Tab Link';
                     document.getElementById('linkTitle').value = title;
                     document.getElementById('linkUrl').value = url;
                     document.getElementById('linkIcon').value = icon;
                     
                     this.openModal('addLinkModal');
                } else {
                    this.showToast('Create a folder first!', 'error');
                }
                break;
            }

            case 'restore-tab': {
                e.preventDefault();
                e.stopPropagation();
                const sessionId = el.dataset.sessionId;
                if (typeof chrome !== 'undefined' && chrome.sessions) {
                    chrome.sessions.restore(sessionId, () => this.fetchTabs());
                }
                break;
            }
        }
    }
};

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => App.init());
