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
        id: 'f1', name: 'Work', emoji: '💼',
        links: [
            { id: 'l1', title: 'GitHub', url: 'https://github.com', icon: '🐙' },
            { id: 'l2', title: 'Claude AI', url: 'https://claude.ai', icon: '🤖' }
        ]
    },
    {
        id: 'f2', name: 'Entertainment', emoji: '🎬',
        links: [
            { id: 'l3', title: 'YouTube', url: 'https://youtube.com', icon: '🎥' },
            { id: 'l4', title: 'Netflix', url: 'https://netflix.com', icon: '📺' }
        ]
    },
    {
        id: 'f3', name: 'Learning', emoji: '📚',
        links: [
            { id: 'l5', title: 'Udemy', url: 'https://udemy.com', icon: '🎓' },
            { id: 'l6', title: 'MDN Docs', url: 'https://developer.mozilla.org', icon: '📖' }
        ]
    }
];

const FREE_FOLDER_LIMIT = 3;

// ---------- App State ----------
const App = {
    data: {
        folders: [],
        isPro: false,
        proExpiresAt: null,
        theme: 'dark'
    },
    _editingFolderId: null,
    _editingLinkId: null,
    _pendingAction: null, // for confirm dialog

    async init() {
        await this.load();
        this.applyTheme(this.data.theme);
        this.render();
        this.bindEvents();
        this.updateProUI();
        this.checkProExpiry();
        this.createToastContainer();
    },

    // ---------- Persistence ----------
    async load() {
        const stored = await Storage.get(['ntf_data']);
        if (stored.ntf_data) {
            this.data = { ...this.data, ...stored.ntf_data };
        } else {
            this.data.folders = JSON.parse(JSON.stringify(DEFAULT_FOLDERS));
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
            badge.textContent = 'PRO';
            badge.classList.add('is-pro');
            upgradeBtn.classList.add('hidden');
        } else {
            badge.textContent = 'FREE';
            badge.classList.remove('is-pro');
            upgradeBtn.classList.remove('hidden');
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

        if (folders.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>No folders yet. Click the button below to create one!</p>
                </div>`;
        }

        folders.forEach(folder => {
            grid.appendChild(this._buildFolderCard(folder));
        });

        grid.appendChild(this._buildAddFolderCard());
    },

    _buildFolderCard(folder) {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.dataset.folderId = folder.id;

        card.innerHTML = `
            <div class="folder-header">
                <span class="folder-emoji">${folder.emoji || '📁'}</span>
                <input type="text" class="folder-title-input" value="${this._esc(folder.name)}" title="Click to rename" readonly>
                <div class="folder-actions">
                    <button class="folder-action-btn" data-action="edit-emoji" title="Change icon">🎨</button>
                    <button class="folder-action-btn delete-btn" data-action="delete-folder" title="Delete folder">🗑️</button>
                </div>
            </div>
            <div class="links-container" id="links-${folder.id}">
                ${folder.links.map(link => this._buildLinkHTML(link, folder.id)).join('')}
                <button class="add-link-btn" data-action="add-link" data-folder-id="${folder.id}">
                    <span>＋</span> Add Link
                </button>
            </div>`;

        return card;
    },

    _buildLinkHTML(link, folderId) {
        return `
            <a href="${this._esc(link.url)}" class="link-item" target="_blank" rel="noopener noreferrer"
               data-link-id="${link.id}" data-folder-id="${folderId}">
                <span class="link-icon">${link.icon || '🔗'}</span>
                <span class="link-text" title="${this._esc(link.title)}">${this._esc(link.title)}</span>
                <button class="link-delete-btn" data-action="delete-link"
                        data-link-id="${link.id}" data-folder-id="${folderId}" title="Remove link">✕</button>
            </a>`;
    },

    _buildAddFolderCard() {
        const card = document.createElement('div');
        const canAdd = this.isPro || this.data.folders.length < FREE_FOLDER_LIMIT;

        card.className = 'add-folder-card' + (canAdd ? '' : ' locked-pro');
        card.dataset.action = canAdd ? 'add-folder' : 'show-premium';
        card.innerHTML = `
            <div class="add-folder-content">
                <span class="add-folder-icon">${canAdd ? '➕' : '🔒'}</span>
                <span>${canAdd ? 'New Folder' : 'Unlock More Folders'}</span>
            </div>`;

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
        const folder = {
            id: 'f' + Date.now(),
            name: 'New Folder',
            emoji: emojis[Math.floor(Math.random() * emojis.length)],
            links: []
        };

        this.data.folders.push(folder);
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
                titleEl.textContent = 'Edit Link';
                titleInput.value = link.title;
                urlInput.value = link.url;
                iconInput.value = link.icon || '';
            }
        } else {
            titleEl.textContent = 'Add Link';
            document.getElementById('addLinkForm').reset();
        }

        this.openModal('addLinkModal');
        titleInput.focus();
    },

    saveLink(formData) {
        const folderId = this._editingFolderId;
        const folder = this.data.folders.find(f => f.id === folderId);
        if (!folder) return;

        let url = formData.url.trim();
        if (url && !url.match(/^https?:\/\//)) url = 'https://' + url;

        if (this._editingLinkId) {
            const link = folder.links.find(l => l.id === this._editingLinkId);
            if (link) {
                link.title = formData.title.trim();
                link.url = url;
                link.icon = formData.icon.trim() || '🔗';
            }
        } else {
            folder.links.push({
                id: 'l' + Date.now(),
                title: formData.title.trim(),
                url: url,
                icon: formData.icon.trim() || '🔗'
            });
        }

        this.save();
        this.closeModal('addLinkModal');
        this.render();
        this.showToast(this._editingLinkId ? 'Link updated.' : 'Link added.', 'success');
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
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmOk').textContent = okLabel || 'Delete';
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

            // Link item click — don't interfere
        });

        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.render(e.target.value);
        });

        document.getElementById('searchCloseBtn').addEventListener('click', () => {
            this.toggleSearch();
        });

        document.getElementById('searchBtn').addEventListener('click', () => {
            this.toggleSearch();
        });

        // Upgrade button
        document.getElementById('upgradeBtn').addEventListener('click', () => {
            this.showPremiumModal();
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openModal('settingsModal');
        });

        // Add Link Form submit
        document.getElementById('addLinkForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const titleVal = document.getElementById('linkTitle').value;
            const urlVal = document.getElementById('linkUrl').value;
            if (!titleVal.trim() || !urlVal.trim()) return;
            this.saveLink({
                title: titleVal,
                url: urlVal,
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
        document.getElementById('themeGrid').addEventListener('click', (e) => {
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
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        // Settings: Import
        document.getElementById('importBtn').addEventListener('click', () => {
            if (!this.isPro) { this.closeModal('settingsModal'); this.showPremiumModal(); return; }
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            if (e.target.files[0]) this.importData(e.target.files[0]);
            e.target.value = '';
        });

        // Settings: Clear Data
        document.getElementById('clearDataBtn').addEventListener('click', () => {
            this.confirm(
                'Clear All Data',
                'This will delete all your folders and links. Are you sure?',
                'Clear Data',
                () => this.clearData()
            );
        });

        // Confirm dialog
        document.getElementById('confirmOk').addEventListener('click', () => {
            if (this._pendingAction) {
                this._pendingAction();
                this._pendingAction = null;
            }
            this.closeModal('confirmModal');
        });

        document.getElementById('confirmCancel').addEventListener('click', () => {
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
                    'Remove Link',
                    'Remove this link from the folder?',
                    'Remove',
                    () => this.deleteLink(folderId, linkId)
                );
                break;
            }

            case 'edit-emoji': {
                e.stopPropagation();
                const card = el.closest('.folder-card');
                const folderId = card?.dataset.folderId;
                const emojis = ['📁','💼','⭐','🎯','💡','🔥','🌍','🎮','📚','🎨','🛒','💻','🏠','✈️','🎵','🏋️','🍕','📷','🔬','🌱'];
                const folder = this.data.folders.find(f => f.id === folderId);
                if (!folder) return;
                const cur = emojis.indexOf(folder.emoji);
                folder.emoji = emojis[(cur + 1) % emojis.length];
                this.save();
                // Update in-place
                const emojiEl = card.querySelector('.folder-emoji');
                if (emojiEl) emojiEl.textContent = folder.emoji;
                break;
            }
        }
    }
};

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => App.init());
