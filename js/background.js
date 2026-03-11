// New Tab Folders — Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
        console.log('[NTF] Extension installed.');
    }
    if (reason === 'update') {
        console.log('[NTF] Extension updated.');
    }
});
