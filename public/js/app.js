/* ==========================================================================
   TITAN board — shared front-end behaviour.

   Board / Post an Item / Profile share the same shell (nav bar + fonts +
   icon library already loaded once). Clicking between them used to trigger
   a full page reload, which re-fetched fonts/icons/CSS and caused a visible
   flash every time. This file replaces that with lightweight client-side
   navigation: it fetches the target page, swaps just the #app-content
   region, and updates the URL — everything else on the page stays put.

   All page-specific interactivity (forms, resolve/save/delete buttons,
   filters, the upload dropzone) is wired up with EVENT DELEGATION on
   `document`, not inline <script> blocks — that way it keeps working after
   a swap without needing to be re-initialized.
   ========================================================================== */

function initIcons() {
    if (window.lucide) window.lucide.createIcons();
}

const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
};

function toast(message, type = 'info', duration = 3200) {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${TOAST_ICONS[type] || TOAST_ICONS.info}<span></span>`;
    el.querySelector('span').textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 220);
    }, duration);
}

async function api(url, options = {}) {
    const opts = { ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && !(opts.body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok || (data && data.success === false)) {
        throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

function bumpCounter(id, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    const val = parseInt(el.textContent, 10) || 0;
    el.textContent = Math.max(0, val + delta);
}

async function refreshStats() {
    try {
        const data = await api('/api/stats');
        const s = data.stats;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('stat-total', s.total);
        set('stat-lost', s.lostCount);
        set('stat-found', s.foundCount);
        set('stat-resolved', s.resolvedCount);
    } catch (e) { /* non-critical */ }
}

/* ---------------------------------------------------------------------- *
 * Client-side navigation between Board / Post an Item / Profile
 * ---------------------------------------------------------------------- */
let pjaxBarTimer = null;
function showBar() {
    const bar = document.getElementById('pjax-bar');
    if (!bar) return;
    clearTimeout(pjaxBarTimer);
    bar.style.transition = 'none';
    bar.style.width = '0%';
    bar.classList.add('active');
    requestAnimationFrame(() => {
        bar.style.transition = 'width 0.4s ease, opacity 0.15s ease';
        bar.style.width = '75%';
    });
}
function hideBar() {
    const bar = document.getElementById('pjax-bar');
    if (!bar) return;
    bar.style.width = '100%';
    pjaxBarTimer = setTimeout(() => {
        bar.classList.remove('active');
        bar.style.width = '0%';
    }, 220);
}

function updateActiveNav() {
    document.querySelectorAll('.nav-link[data-pjax]').forEach(link => {
        const path = link.getAttribute('href').split('?')[0];
        link.classList.toggle('active', location.pathname === path);
    });
}

async function navigateTo(url, push = true) {
    const oldContent = document.getElementById('app-content');
    if (!oldContent) { window.location.href = url; return; }
    showBar();
    try {
        const res = await fetch(url, { headers: { 'X-Pjax': '1' } });
        if (!res.ok) throw new Error('Navigation failed');
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newContent = doc.getElementById('app-content');
        const newTitle = doc.querySelector('title');
        if (!newContent) { window.location.href = url; return; }
        oldContent.replaceWith(newContent);
        if (newTitle) document.title = newTitle.textContent;
        if (push) history.pushState({}, '', url);
        initIcons();
        updateActiveNav();
        window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
        window.location.href = url;
    } finally {
        hideBar();
    }
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-pjax]');
    if (!link || e.metaKey || e.ctrlKey || link.target === '_blank') return;
    const href = link.getAttribute('href');
    e.preventDefault();
    if (href !== location.pathname + location.search) navigateTo(href);
});

window.addEventListener('popstate', () => navigateTo(location.pathname + location.search, false));

/* ---------------------------------------------------------------------- *
 * Delegated click handling (works after swaps, no re-binding needed)
 * ---------------------------------------------------------------------- */
document.addEventListener('click', async (e) => {
    const navToggle = e.target.closest('#nav-toggle-btn');
    if (navToggle) {
        const nav = document.getElementById('site-nav');
        if (nav) {
            const open = nav.classList.toggle('nav-open');
            navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        return;
    }
    if (e.target.closest('#nav-panel a, #nav-panel button')) {
        closeMobileNav();
    }

    const resolveBtn = e.target.closest('.js-resolve');
    if (resolveBtn) {
        resolveBtn.disabled = true;
        resolveBtn.textContent = 'Updating…';
        try {
            await api(`/api/items/${resolveBtn.dataset.id}/resolve`, { method: 'PATCH' });
            const card = resolveBtn.closest('.case-card');
            card.classList.add('resolved');
            const media = card.querySelector('.case-media');
            const stamp = document.createElement('div');
            stamp.className = 'stamp-resolved';
            stamp.textContent = 'Resolved';
            media.appendChild(stamp);
            resolveBtn.outerHTML = '<button class="btn-primary" style="flex:1;opacity:.5;cursor:not-allowed;background-image:none;background-color:#9ca3af;color:#fff;" disabled>Resolved</button>';
            toast('Marked as resolved. Glad it worked out!', 'success');
            refreshStats();
            bumpCounter('profile-resolved-count', 1);
        } catch (err) {
            toast(err.message, 'error');
            resolveBtn.disabled = false;
            resolveBtn.textContent = 'Mark as Resolved';
        }
        return;
    }

    const saveBtn = e.target.closest('.js-save');
    if (saveBtn) {
        try {
            const data = await api(`/api/items/${saveBtn.dataset.id}/save`, { method: 'PATCH' });
            saveBtn.classList.toggle('saved', data.saved);
            saveBtn.querySelector('svg').setAttribute('fill', data.saved ? 'currentColor' : 'none');
            toast(data.saved ? 'Saved to your list.' : 'Removed from saved.', 'info', 1800);
        } catch (err) {
            toast(err.message, 'error');
        }
        return;
    }

    const delBtn = e.target.closest('.js-delete');
    if (delBtn) {
        if (!confirm('Permanently delete this report?')) return;
        try {
            await api(`/api/items/${delBtn.dataset.id}`, { method: 'DELETE' });
            const card = delBtn.closest('.case-card');
            card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => card.remove(), 200);
            toast('Item deleted.', 'info', 1800);
            refreshStats();
            bumpCounter('profile-posted-count', -1);
        } catch (err) {
            toast(err.message, 'error');
        }
        return;
    }

    const contactBtn = e.target.closest('.js-contact');
    if (contactBtn) {
        const card = contactBtn.closest('.case-card');
        const titleEl = document.getElementById('contact-item-title');
        const posterEl = document.getElementById('contact-item-poster');
        const mailto = document.getElementById('contact-mailto');
        const noEmail = document.getElementById('contact-no-email');
        if (titleEl) titleEl.textContent = card.dataset.title;
        if (posterEl) posterEl.textContent = card.dataset.poster;
        const email = card.dataset.email;
        if (mailto && noEmail) {
            if (email) {
                mailto.style.display = 'flex';
                mailto.href = `mailto:${email}?subject=${encodeURIComponent('TITAN Board: ' + card.dataset.title)}`;
                noEmail.style.display = 'none';
            } else {
                mailto.style.display = 'none';
                noEmail.style.display = 'block';
            }
        }
        openModal('contact-modal');
        return;
    }

    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
        return;
    }
    const closeBtn = e.target.closest('.modal-close');
    if (closeBtn) {
        const overlay = closeBtn.closest('.modal-overlay');
        if (overlay) overlay.classList.remove('open');
        return;
    }

    const typeCard = e.target.closest('.type-card');
    if (typeCard) {
        document.querySelectorAll('.type-card').forEach(c => { c.style.borderColor = 'var(--line)'; c.style.background = '#fff'; });
        typeCard.previousElementSibling.checked = true;
        typeCard.style.borderColor = 'var(--gold)';
        typeCard.style.background = '#fdf6e6';
        return;
    }
});

function closeMobileNav() {
    const nav = document.getElementById('site-nav');
    const toggle = document.getElementById('nav-toggle-btn');
    if (nav) nav.classList.remove('nav-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (e) => {
    const nav = document.getElementById('site-nav');
    if (nav && nav.classList.contains('nav-open') && !nav.contains(e.target)) {
        closeMobileNav();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        closeMobileNav();
    }
});

/* ---------------------------------------------------------------------- *
 * Delegated change handling
 * ---------------------------------------------------------------------- */
document.addEventListener('change', (e) => {
    if (e.target.id === 'category-filter') {
        const url = new URL(location.href);
        if (e.target.value === 'all') url.searchParams.delete('category');
        else url.searchParams.set('category', e.target.value);
        navigateTo(url.pathname + url.search);
        return;
    }
    if (e.target.id === 'reward-toggle') {
        const wrap = document.getElementById('reward-amount-wrap');
        if (wrap) wrap.style.display = e.target.checked ? 'block' : 'none';
        return;
    }
    if (e.target.id === 'itemImageInput') {
        handleImagePreview(e.target);
        return;
    }
});

function handleImagePreview(input) {
    if (!(input.files && input.files[0])) return;
    const file = input.files[0];
    if (file.size > 1 * 1024 * 1024) {
        toast('That image is over 1MB — please pick a smaller photo.', 'error');
        input.value = '';
        return;
    }
    const dzIdle = document.getElementById('dropzone-idle');
    const dzPreview = document.getElementById('dropzone-preview');
    const previewImg = document.getElementById('preview-img');
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        dzIdle.style.display = 'none';
        dzPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

/* Drag-and-drop for the upload dropzone (delegated, works after swaps) */
document.addEventListener('dragover', (e) => {
    const dz = e.target.closest('.dropzone');
    if (dz) { e.preventDefault(); dz.classList.add('drag-over'); }
});
document.addEventListener('dragleave', (e) => {
    const dz = e.target.closest('.dropzone');
    if (dz) dz.classList.remove('drag-over');
});
document.addEventListener('drop', (e) => {
    const dz = e.target.closest('.dropzone');
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove('drag-over');
    const input = dz.querySelector('input[type="file"]');
    if (input && e.dataTransfer.files && e.dataTransfer.files[0]) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
    }
});

/* ---------------------------------------------------------------------- *
 * Forms — login, signup, search, post item
 * ---------------------------------------------------------------------- */
document.addEventListener('submit', async (e) => {
    if (e.target.id === 'search-form') {
        e.preventDefault();
        const fd = new FormData(e.target);
        const url = new URL('/board', location.origin);
        for (const [k, v] of fd.entries()) { if (v) url.searchParams.set(k, v); }
        navigateTo(url.pathname + url.search);
        return;
    }

    if (e.target.id === 'login-form') {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('login-btn');
        const errBox = document.getElementById('form-error');
        const errText = document.getElementById('form-error-text');
        errBox.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        try {
            const data = await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
            toast(`Welcome back, ${data.user.name.split(' ')[0]}!`, 'success');
            setTimeout(() => window.location.href = data.redirect || '/board', 300);
        } catch (err) {
            errText.textContent = err.message;
            errBox.style.display = 'flex';
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
        return;
    }

    if (e.target.id === 'signup-form') {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('signup-btn');
        const errBox = document.getElementById('form-error');
        const errText = document.getElementById('form-error-text');
        errBox.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Creating account…';
        try {
            const data = await api('/api/auth/signup', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
            toast(`Account created — welcome, ${data.user.name.split(' ')[0]}!`, 'success');
            setTimeout(() => window.location.href = data.redirect || '/board', 300);
        } catch (err) {
            errText.textContent = err.message;
            errBox.style.display = 'flex';
            btn.disabled = false;
            btn.textContent = 'Complete Registration';
        }
        return;
    }

    if (e.target.id === 'post-item-form') {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('submit-btn');
        const errBox = document.getElementById('form-error');
        const errText = document.getElementById('form-error-text');
        errBox.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Posting…';
        try {
            await api('/api/items', { method: 'POST', body: new FormData(form) });
            toast('Item posted to the board!', 'success');
            navigateTo('/board');
        } catch (err) {
            errText.textContent = err.message;
            errBox.style.display = 'flex';
            btn.disabled = false;
            btn.textContent = 'Post Item';
        }
        return;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initIcons();
    updateActiveNav();
});
