/**
 * Shared logic for Information Pages (Guide, Pricing, Changelog)
 * Handles theme switching and i18n initialization.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Logic
    const savedTheme = localStorage.getItem('ntf_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    
    // Inject shared dark theme variables if needed
    const style = document.createElement('style');
    style.textContent = `
        [data-theme="dark"] {
            --bg-body: #0f172a;
            --bg-card: #1e293b;
            --text-main: #f1f5f9;
            --text-muted: #94a3b8;
            --border: #334155;
            --num-bg: #1e293b;
            --num-text: #94a3b8;
        }
        [data-theme="dark"] header { background: rgba(15, 23, 42, 0.8); border-bottom-color: #334155; }
        [data-theme="dark"] .logo-area { color: #f1f5f9; }
        [data-theme="dark"] section .num { background: var(--num-bg); color: var(--num-text); }
        [data-theme="dark"] h2, [data-theme="dark"] h3, [data-theme="dark"] .hero h1 { color: #f8fafc; }
        [data-theme="dark"] .pro-tip { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.2); }
        [data-theme="dark"] .pro-tip p { color: #fbbf24; }
        [data-theme="dark"] footer { background: #020617; border-top-color: #1e293b; }
        [data-theme="dark"] .card { background: #1e293b; border-color: #334155; }
        [data-theme="dark"] .card .price { color: #f8fafc; }
        [data-theme="dark"] .btn-card { background: #334155; color: #f1f5f9; }
        [data-theme="dark"] .beta-banner { background: rgba(251, 191, 36, 0.05); border-color: rgba(251, 191, 36, 0.2); color: #fbbf24; }
    `;
    document.head.appendChild(style);

    // 2. Localization Logic
    const lang = localStorage.getItem('ntf_language') || 'TR';
    
    function t(key, params = {}) {
        let str = (typeof TRANSLATIONS !== 'undefined' ? (TRANSLATIONS[lang]?.[key] || TRANSLATIONS['EN']?.[key]) : key) || key;
        Object.entries(params).forEach(([k, v]) => {
            str = str.replace(`{${k}}`, v);
        });
        return str;
    }

    function updateStaticI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            el.textContent = t(key);
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.dataset.i18nHtml;
            el.innerHTML = t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            el.placeholder = t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            el.title = t(key);
        });
    }

    if (typeof TRANSLATIONS !== 'undefined') {
        updateStaticI18n();
    }

    // 3. Smooth Scroll for Sidebar Links (Guide page)
    document.querySelectorAll('.sidebar a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
});
