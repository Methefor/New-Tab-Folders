/* ===================================================
   NEW TAB FOLDERS — Cloud Sync (Firebase REST API)
   No SDK needed — pure fetch() for MV3 compatibility

   SETUP: Fill in your Firebase project values below.
   Get them from: Firebase Console → Project Settings → Your apps
   =================================================== */

const FIREBASE_CONFIG = {
    apiKey:    'AIzaSyBnuBvBbRvW7pDG1BA0izz8mTpKrFK1Vqg',
    projectId: 'newtabfolders'
};

// Firebase REST API base URLs
const FB_AUTH_URL   = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`;
const FB_REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`;
const FB_FS_BASE    = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users`;

const CACHE_KEY = 'ntf_auth';

// -------------------------------------------------------
const SyncManager = {

    // In-memory session cache
    _cache: null, // { idToken, refreshToken, expiresAt, uid, displayName, email, photoUrl }

    // -------- Init (restore session from storage) --------
    async init() {
        try {
            const stored = await new Promise(resolve => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    chrome.storage.local.get(CACHE_KEY, r => resolve(r[CACHE_KEY] || null));
                } else {
                    try { resolve(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch { resolve(null); }
                }
            });
            if (stored && stored.uid) {
                this._cache = stored;
                // Token might be expired — refresh proactively
                if (Date.now() > (stored.expiresAt || 0) - 60000) {
                    await this._refreshToken().catch(() => { /* stay signed in with old token */ });
                }
            }
        } catch (err) {
            console.warn('SyncManager.init error:', err);
        }
    },

    // -------- Sign In with Google --------
    async signIn() {
        if (typeof chrome === 'undefined' || !chrome.identity) {
            throw new Error('chrome.identity API not available');
        }

        // 1. Get Google OAuth access token via chrome.identity
        const googleToken = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, token => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(token);
            });
        });

        // 2. Exchange Google token for Firebase ID token
        const res = await fetch(FB_AUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postBody: `access_token=${googleToken}&providerId=google.com`,
                requestUri: 'http://localhost',
                returnIdpCredential: true,
                returnSecureToken: true
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || 'Firebase auth failed');
        }

        const data = await res.json();
        const expiresAt = Date.now() + parseInt(data.expiresIn || 3600, 10) * 1000;

        this._cache = {
            idToken:      data.idToken,
            refreshToken: data.refreshToken,
            expiresAt,
            uid:          data.localId,
            displayName:  data.displayName || '',
            email:        data.email || '',
            photoUrl:     data.photoUrl || ''
        };

        await this._saveCache();
        return this._cache;
    },

    // -------- Sign Out --------
    async signOut() {
        this._cache = null;
        await new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.remove(CACHE_KEY, resolve);
            } else {
                localStorage.removeItem(CACHE_KEY);
                resolve();
            }
        });
        // Revoke Google token so next sign-in shows account picker
        if (typeof chrome !== 'undefined' && chrome.identity) {
            chrome.identity.getAuthToken({ interactive: false }, token => {
                if (token) chrome.identity.removeCachedAuthToken({ token });
            });
        }
    },

    // -------- Get valid Firebase ID token (auto-refresh) --------
    async _getToken() {
        if (!this._cache) return null;
        if (Date.now() > (this._cache.expiresAt || 0) - 60000) {
            await this._refreshToken();
        }
        return this._cache?.idToken || null;
    },

    // -------- Refresh expired Firebase ID token --------
    async _refreshToken() {
        if (!this._cache?.refreshToken) return;
        const res = await fetch(FB_REFRESH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                refresh_token: this._cache.refreshToken
            })
        });
        if (!res.ok) {
            this._cache = null;
            return;
        }
        const data = await res.json();
        this._cache.idToken      = data.id_token;
        this._cache.refreshToken = data.refresh_token;
        this._cache.expiresAt    = Date.now() + parseInt(data.expires_in || 3600, 10) * 1000;
        await this._saveCache();
    },

    // -------- Push data to Firestore --------
    async push(appData) {
        const token = await this._getToken();
        if (!token || !this._cache?.uid) return false;

        const url = `${FB_FS_BASE}/${this._cache.uid}`;
        const body = {
            fields: {
                ntf_data:  { stringValue: JSON.stringify(appData) },
                updatedAt: { integerValue: String(appData.updatedAt || Date.now()) },
                version:   { stringValue: '1.6' }
            }
        };

        const res = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        return res.ok;
    },

    // -------- Pull data from Firestore --------
    async pull() {
        const token = await this._getToken();
        if (!token || !this._cache?.uid) return null;

        const url = `${FB_FS_BASE}/${this._cache.uid}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 404) return null; // no data yet
        if (!res.ok) return null;

        const doc = await res.json();
        if (!doc.fields?.ntf_data?.stringValue) return null;

        try {
            const parsed = JSON.parse(doc.fields.ntf_data.stringValue);
            // Parse updatedAt from Firestore integer field
            if (doc.fields.updatedAt?.integerValue) {
                parsed.updatedAt = parseInt(doc.fields.updatedAt.integerValue, 10);
            }
            return parsed;
        } catch {
            return null;
        }
    },

    // -------- Getters --------
    get isSignedIn() {
        return !!(this._cache?.uid);
    },

    get user() {
        return this._cache;
    },

    // -------- Internal: persist cache --------
    async _saveCache() {
        const val = this._cache;
        if (typeof chrome !== 'undefined' && chrome.storage) {
            return new Promise(resolve => chrome.storage.local.set({ [CACHE_KEY]: val }, resolve));
        }
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(val)); } catch { /* ignore */ }
    }
};
