/* ===================================================
   NEW TAB FOLDERS — Main App
   =================================================== */

// ---------- Storage Abstraction ----------
const Storage = {
    async get(keys) {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            return new Promise(resolve => chrome.storage.local.get(keys, resolve));
        }
        const result = {};
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach(k => {
            const val = localStorage.getItem(k);
            if (val !== null) result[k] = JSON.parse(val);
        });
        return result;
    },
    async set(data) {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            return new Promise(resolve => chrome.storage.local.set(data, resolve));
        }
        Object.entries(data).forEach(([k, v]) => {
            localStorage.setItem(k, JSON.stringify(v));
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
        language: 'TR'
    },
    _editingFolderId: null,
    _editingLinkId: null,
    _pendingAction: null, // for confirm dialog

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
        await this.load();
        this.applyTheme(this.data.theme);
        this.updateStaticI18n();
        if (this.data.sidebarCollapsed) {
            document.getElementById('sidebar')?.classList.add('collapsed');
        }
        this.render();
        this.bindEvents();
        this.updateProUI();
        this.checkProExpiry();
        this.createToastContainer();
        this.fetchTabs();
        
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
    },

    async save() {
        await Storage.set({ ntf_data: this.data });
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

    updateProUI() {
        const badge = document.getElementById('proBadge');
        const upgradeBtn = document.getElementById('upgradeBtn');
        if (this.isPro) {
            if (badge) {
                badge.textContent = 'PRO';
                badge.classList.add('is-pro');
            }
            if (upgradeBtn) {
                upgradeBtn.classList.add('hidden');
            }
        } else {
            if (badge) {
                badge.textContent = 'Pro only';
                badge.classList.remove('is-pro');
            }
            if (upgradeBtn) {
                upgradeBtn.classList.remove('hidden');
            }
        }
    },

    // ---------- Theme ----------
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.data.theme = theme;
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    },

    // ---------- Render ----------
    render(searchQuery = '') {
        const grid = document.getElementById('foldersGrid');
        grid.innerHTML = '';

        let folders = this.data.folders;

        if (searchQuery.trim()) {
            this._renderSearch(grid, folders, searchQuery.trim().toLowerCase());
            return;
        }

        if (this.data.folders.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-large">
                    <h3>${this.t('search_no_results')}</h3>
                    <p>${this.t('add_new_space')}</p>
                </div>
            `;
            return;
        }

        folders.forEach(folder => {
            grid.appendChild(this._buildFolderCard(folder));
        });

        grid.appendChild(this._buildAddFolderCard());
    },

    _buildFolderCard(folder) {
        const card = document.createElement('div');
        card.className = 'folder-card group-card';
        card.dataset.folderId = folder.id;
        if (folder.color) card.dataset.color = folder.color;

        card.innerHTML = `
            <div class="folder-header">
                <input type="text" class="folder-title-input" value="${this._esc(folder.name)}" title="Click to rename" readonly>
                <div class="folder-actions">
                    <button class="folder-action-btn" data-action="open-folder-context" title="Options">•••</button>
                </div>
            </div>
            <div class="links-container" id="links-${folder.id}">
                ${folder.links.map(link => this._buildLinkHTML(link, folder.id)).join('')}
                <button class="add-link-btn" data-action="open-folder-context" data-folder-id="${folder.id}">
                    <span>＋</span> Click to add
                </button>
            </div>`;

        return card;
    },

    _buildLinkHTML(link, folderId) {
        if (link.type === 'header') {
            return `<div class="link-header-item">
                <span>${this._esc(link.title)}</span>
                <div class="link-actions">
                    <button class="link-edit-btn" data-action="edit-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Edit header">✏️</button>
                    <button class="link-delete-btn" data-action="delete-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Remove header">✕</button>
                </div>
            </div>`;
        }
    
        // Fallback or explicit resolution
        let iconHtml = '';
        if (link.icon && link.icon.length <= 2) {
            iconHtml = `<span class="link-icon emoji-icon">${link.icon}</span>`;
        } else if (link.icon) {
            iconHtml = `<img class="link-icon" src="${link.icon}" style="width:20px; height:20px; object-fit:contain; border-radius:4px;">`;
        } else {
            // Auto-fetch if no icon
            try {
                const domain = new URL(link.url).hostname;
                iconHtml = `<img class="link-icon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=128" style="width:20px; height:20px; object-fit:contain; border-radius:4px;">`;
            } catch {
                iconHtml = `<img class="link-icon" src="assets/icons/icon16.png" style="width:20px; height:20px; object-fit:contain; border-radius:4px;">`;
            }
        }
            
        return `
            <a href="${this._esc(link.url)}" class="link-item" target="_blank" rel="noopener noreferrer"
               data-link-id="${link.id}" data-folder-id="${folderId}">
                ${iconHtml}
                <span class="link-text" title="${this._esc(link.title)}">${this._esc(link.title)}</span>
                <div class="link-actions">
                    <button class="link-edit-btn" data-action="edit-link" data-link-id="${link.id}" data-folder-id="${folderId}" title="Edit link">✏️</button>
                    <button class="link-delete-btn" data-action="delete-link"
                            data-link-id="${link.id}" data-folder-id="${folderId}" title="Remove link">✕</button>
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

        const emojis = ['📁', '⭐', '🎯', '💡', '🔥', '🌍', '🎮', '💼', '📚', '🎨'];
        const newFolder = {
            id: 'folder_' + Date.now(),
            name: this.t('new_folder'),
            links: [],
            color: 'blue'
        };

        this.data.folders.push(newFolder);
        this.save();
        this.render();

        // Focus the title input of the new card
        requestAnimationFrame(() => {
            const card = document.querySelector(`[data-folder-id="${folder.id}"]`);
            if (card) {
                const input = card.querySelector('.folder-title-input');
                if (input) this._startEditTitle(input, folder.id);
            }
        });
    },

    deleteFolder(folderId) {
        this.data.folders = this.data.folders.filter(f => f.id !== folderId);
        this.save();
        this.render();
        this.showToast('Folder deleted.', 'info');
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
                } else {
                    titleEl.textContent = 'Edit Link';
                    titleInput.value = link.title;
                    urlInput.value = link.url;
                    urlInput.disabled = false;
                    iconInput.disabled = false;
                    iconInput.value = link.icon || '';
                }
            }
        } else {
            titleEl.textContent = 'Add Link';
            document.getElementById('addLinkForm').reset();
            urlInput.disabled = false;
            iconInput.disabled = false;
        }

        this.openModal('addLinkModal');
        titleInput.focus();
    },

    saveLink(formData) {
        const folderId = this._editingFolderId;
        const folder = this.data.folders.find(f => f.id === folderId);
        if (!folder) return;

        if (this._editingLinkId) {
            const link = folder.links.find(l => l.id === this._editingLinkId);
            if (link) {
                link.title = formData.title.trim();
                if (link.type !== 'header') {
                    let url = formData.url.trim();
                    if (url && !url.match(/^https?:\/\//)) url = 'https://' + url;
                    link.url = url;
                    link.icon = formData.icon.trim() || '';
                }
            }
        } else {
            let url = formData.url.trim();
            if (url && !url.match(/^https?:\/\//)) url = 'https://' + url;

            folder.links.push({
                id: 'l' + Date.now(),
                title: formData.title.trim(),
                url: url,
                icon: formData.icon.trim() || ''
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
        folder.links = folder.links.filter(l => l.id !== linkId);
        this.save();
        this.render();
        this.showToast('Link removed.', 'info');
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

    confirm(title, message, okLabel, action) {
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
            foldersGrid.addEventListener('dragover', (e) => {
                const folderCard = e.target.closest('.folder-card');
                if (folderCard) {
                    e.preventDefault(); // allow drop
                    folderCard.classList.add('is-drag-over');
                }
            });
            foldersGrid.addEventListener('dragleave', (e) => {
                const folderCard = e.target.closest('.folder-card');
                if (folderCard && e.relatedTarget && !folderCard.contains(e.relatedTarget)) {
                    folderCard.classList.remove('is-drag-over');
                }
            });
            foldersGrid.addEventListener('drop', (e) => {
                const folderCard = e.target.closest('.folder-card');
                if (folderCard) {
                    e.preventDefault();
                    folderCard.classList.remove('is-drag-over');
                    const tabDataAttr = e.dataTransfer.getData('application/json');
                    if (tabDataAttr) {
                        try {
                            const tabData = JSON.parse(tabDataAttr);
                            if (tabData.action === 'add-tab') {
                                const folderId = folderCard.dataset.folderId;
                                const linkId = 'link_' + Date.now();
                                
                                const folder = this.data.folders.find(f => f.id === folderId);
                                if (folder) {
                                    folder.links.push({
                                        id: linkId,
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
                icon: document.getElementById('linkIcon').value
            });
        });

        // Pricing buttons
        document.querySelectorAll('.pricing-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const plan = btn.closest('[data-plan]')?.dataset.plan;
                this.showToast(`Payment integration coming soon! (${plan})`, 'info');
            });
        });

        // Settings: Theme buttons
        document.getElementById('themeGrid')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.theme-btn');
            if (!btn || btn.classList.contains('pro-locked')) {
                if (btn?.classList.contains('pro-locked')) {
                    this.closeModal('settingsModal');
                    this.showPremiumModal();
                }
                return;
            }
            this.applyTheme(btn.dataset.theme);
            this.save();
        });

        // Settings: Export
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
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

        // Color Picker
        document.querySelector('.color-picker-grid')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-dot')) {
                const color = e.target.dataset.color;
                const fId = document.getElementById('contextFolderId').value;
                const folder = this.data.folders.find(f => f.id === fId);
                if (folder) {
                    folder.color = color;
                    this.save();
                    this.render();
                    this.closeModal('folderContextModal');
                }
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

            case 'open-folder-context': {
                e.stopPropagation();
                e.preventDefault();
                const card = el.closest('.folder-card');
                const folderId = card?.dataset.folderId;
                if (!folderId) return;
                document.getElementById('contextFolderId').value = folderId;
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
