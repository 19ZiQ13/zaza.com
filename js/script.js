const ACCESS_KEY = "1234";

// ============================================================
// INDEXEDDB STORAGE
// ============================================================
const DB_NAME = 'SanctuaryDB';
const DB_VERSION = 1;
let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) { resolve(db); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const database = e.target.result;
            ['memories', 'awesome', 'photos'].forEach(store => {
                if (!database.objectStoreNames.contains(store)) {
                    database.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
                }
            });
        };
        req.onsuccess = e => { db = e.target.result; resolve(db); };
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAll(category) {
    if (category !== 'photos') {
        return JSON.parse(localStorage.getItem(category) || "[]");
    }
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(category, 'readonly');
        const req = tx.objectStore(category).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function dbAdd(category, entry) {
    if (category !== 'photos') {
        let store = JSON.parse(localStorage.getItem(category) || "[]");
        store.push(entry);
        localStorage.setItem(category, JSON.stringify(store));
        return;
    }
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(category, 'readwrite');
        tx.objectStore(category).add(entry);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function dbDelete(category, id) {
    if (category !== 'photos') {
        let store = JSON.parse(localStorage.getItem(category) || "[]");
        store.splice(id, 1);
        localStorage.setItem(category, JSON.stringify(store));
        return;
    }
    const database = await openDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(category, 'readwrite');
        tx.objectStore(category).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// Migrate any existing photos from localStorage into IndexedDB (runs once)
async function migratePhotos() {
    const old = JSON.parse(localStorage.getItem('photos') || "[]");
    if (old.length === 0) return;
    const migrated = localStorage.getItem('photos_migrated');
    if (migrated) return;
    for (const item of old) {
        await dbAdd('photos', { author: item.author, content: item.content, caption: item.caption || '', date: item.date });
    }
    localStorage.setItem('photos_migrated', 'true');
    localStorage.removeItem('photos');
}

// ============================================================
// IMAGE COMPRESSION
// ============================================================
function compressImage(file, maxWidth = 1200, quality = 0.82) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            let { width, height } = img;
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = url;
    });
}

// ============================================================
// 1. AUTHENTICATION
// ============================================================
window.unlockHub = function() {
    const input = document.getElementById('pass-input');
    if (input && input.value === ACCESS_KEY) {
        localStorage.setItem('hub_unlocked', 'true');
        location.reload();
    } else if (input) {
        input.style.borderColor = "#ff3b30";
        input.value = "";
        input.placeholder = "❌ Wrong key";
        setTimeout(() => {
            input.placeholder = "••••";
            input.style.borderColor = "rgba(255, 255, 255, 0.1)";
        }, 2000);
    }
};

window.logout = () => {
    localStorage.removeItem('hub_unlocked');
    localStorage.removeItem('message_unlocked');
    location.reload();
};

// ============================================================
// 2. MODAL SYSTEM
// ============================================================

const EMOJI_LIST = ['❤️','🌻','✨','🎉','😊','🥹','💫','🌙','🔥','💜','🌈','🎶','🥂','💌','🌸','😂','🤝','👑','🙈','💪','🌊','🍀','🎯','🫶','😭','💀','🫂','🐾','🌺','⚡'];

window.addItem = function(category) {
    const isPhoto = category === 'photos';
    const isTextCat = category === 'memories' || category === 'awesome';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'active-modal';

    const today = new Date().toISOString().split('T')[0];

    overlay.innerHTML = `
        <div class="sanctuary-card modal-content" style="max-height:90vh; overflow-y:auto;">
            <h2 style="margin:0; text-align:center;">New ${isPhoto ? 'Photos' : category.slice(0,-1)}</h2>

            <span class="modal-label">From:</span>
            <input type="text" id="m-author" class="sanctuary-input" placeholder="Your Name">

            <span class="modal-label">Date:</span>
            <input type="date" id="m-date" class="sanctuary-input" value="${today}">

            ${isPhoto ? `
                <span class="modal-label">Upload Photos (select as many as you want):</span>
                <input type="file" id="m-file" class="sanctuary-input" accept="image/*" multiple style="padding:10px;">
                <div id="m-preview" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"></div>
                <span class="modal-label">OR Image URL (single):</span>
                <input type="text" id="m-content" class="sanctuary-input" placeholder="https://...">
                <span class="modal-label">Caption (applies to all):</span>
                <textarea id="m-caption" class="sanctuary-input" rows="2" placeholder="Describe these photos..."></textarea>
            ` : `
                <span class="modal-label">Content:</span>
                <textarea id="m-content" class="sanctuary-input" rows="4" placeholder="Write something..."></textarea>
            `}

            ${isTextCat ? `
                <span class="modal-label">Add a little something (optional):</span>
                <div style="display:flex; gap:10px; margin-bottom:6px;">
                    <button type="button" id="tab-emoji" onclick="switchAccentTab('emoji')"
                        style="flex:1; padding:8px; border-radius:10px; border:2px solid var(--neon); background:var(--neon); color:#000; font-weight:800; font-size:0.8rem; cursor:pointer;">
                        😊 Emoji
                    </button>
                    <button type="button" id="tab-img" onclick="switchAccentTab('img')"
                        style="flex:1; padding:8px; border-radius:10px; border:2px solid rgba(255,255,255,0.15); background:transparent; color:white; font-weight:800; font-size:0.8rem; cursor:pointer;">
                        🖼 Image
                    </button>
                    <button type="button" id="tab-none" onclick="switchAccentTab('none')"
                        style="flex:1; padding:8px; border-radius:10px; border:2px solid rgba(255,255,255,0.15); background:transparent; color:rgba(255,255,255,0.4); font-weight:800; font-size:0.8rem; cursor:pointer;">
                        None
                    </button>
                </div>

                <!-- emoji picker panel -->
                <div id="panel-emoji" style="display:flex; flex-wrap:wrap; gap:6px; padding:10px; background:rgba(0,0,0,0.3); border-radius:14px;">
                    ${EMOJI_LIST.map(e => `
                        <button type="button" onclick="selectEmoji('${e}')"
                            style="font-size:1.4rem; background:none; border:2px solid transparent; border-radius:8px; padding:4px 6px; cursor:pointer; transition:all 0.15s;"
                            class="emoji-opt">${e}</button>
                    `).join('')}
                    <div style="width:100%; margin-top:6px;">
                        <input type="text" id="emoji-custom" class="sanctuary-input" placeholder="Or type any emoji / paste one..." style="font-size:1.2rem;"
                            oninput="selectEmoji(this.value)">
                    </div>
                </div>

                <!-- image upload panel -->
                <div id="panel-img" style="display:none;">
                    <input type="file" id="m-accent-file" class="sanctuary-input" accept="image/*" style="padding:10px;">
                    <div id="accent-preview" style="margin-top:8px;"></div>
                </div>

                <input type="hidden" id="m-accent" value="">
                <input type="hidden" id="m-accent-type" value="emoji">
            ` : ''}

            <div id="m-error" style="color:#ff3b30; font-size:0.8rem; margin-top:8px; display:none;"></div>

            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="pill-btn-white" style="background:rgba(255,255,255,0.1); color:white;" onclick="closeModal()">Cancel</button>
                <button class="pill-btn-white" id="m-save-btn" onclick="handleSubmission('${category}')">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    if (isPhoto) {
        document.getElementById('m-file').addEventListener('change', function() {
            const preview = document.getElementById('m-preview');
            preview.innerHTML = '';
            Array.from(this.files).forEach(file => {
                const url = URL.createObjectURL(file);
                preview.innerHTML += `<img src="${url}" style="height:60px; border-radius:8px; object-fit:cover;">`;
            });
            const count = this.files.length;
            if (count > 0) {
                document.getElementById('m-save-btn').textContent = `Save ${count} Photo${count > 1 ? 's' : ''}`;
            }
        });
    }

    if (isTextCat) {
        // Set default selected emoji
        selectEmoji('❤️');

        const accentFile = document.getElementById('m-accent-file');
        if (accentFile) {
            accentFile.addEventListener('change', async function() {
                if (this.files[0]) {
                    const compressed = await compressImage(this.files[0], 300, 0.8);
                    document.getElementById('m-accent').value = compressed;
                    document.getElementById('m-accent-type').value = 'image';
                    document.getElementById('accent-preview').innerHTML =
                        `<img src="${compressed}" style="height:70px; border-radius:10px; object-fit:cover;">`;
                }
            });
        }
    }
};

window.switchAccentTab = function(tab) {
    const tabs = { emoji: 'tab-emoji', img: 'tab-img', none: 'tab-none' };
    const panels = { emoji: 'panel-emoji', img: 'panel-img' };

    Object.entries(tabs).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const active = key === tab;
        el.style.background = active ? 'var(--neon)' : 'transparent';
        el.style.color = active ? '#000' : (key === 'none' ? 'rgba(255,255,255,0.4)' : 'white');
        el.style.borderColor = active ? 'var(--neon)' : 'rgba(255,255,255,0.15)';
    });

    Object.entries(panels).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = key === tab ? (key === 'emoji' ? 'flex' : 'block') : 'none';
    });

    if (tab === 'none') {
        document.getElementById('m-accent').value = '';
        document.getElementById('m-accent-type').value = 'none';
    } else if (tab === 'emoji') {
        document.getElementById('m-accent-type').value = 'emoji';
    } else {
        document.getElementById('m-accent-type').value = 'image';
    }
};

window.selectEmoji = function(emoji) {
    if (!emoji.trim()) return;
    document.getElementById('m-accent').value = emoji.trim();
    document.getElementById('m-accent-type').value = 'emoji';
    // highlight selected
    document.querySelectorAll('.emoji-opt').forEach(btn => {
        btn.style.borderColor = btn.textContent.trim() === emoji.trim() ? 'var(--neon)' : 'transparent';
        btn.style.background = btn.textContent.trim() === emoji.trim() ? 'rgba(0,242,255,0.15)' : 'none';
    });
};

window.handleSubmission = async (category) => {
    const author = document.getElementById('m-author').value;
    const date = document.getElementById('m-date').value;
    const fileInput = document.getElementById('m-file');
    const caption = document.getElementById('m-caption') ? document.getElementById('m-caption').value : "";

    if (category === 'photos') {
        const files = fileInput && fileInput.files.length > 0 ? Array.from(fileInput.files) : null;
        const urlInput = document.getElementById('m-content') ? document.getElementById('m-content').value.trim() : '';

        if (!author) { showModalError('Please enter a name.'); return; }
        if (!files && !urlInput) { showModalError('Please upload a photo or enter a URL.'); return; }

        const saveBtn = document.getElementById('m-save-btn');
        saveBtn.disabled = true;

        if (files) {
            for (let i = 0; i < files.length; i++) {
                saveBtn.textContent = `Saving ${i + 1} of ${files.length}...`;
                try {
                    const content = await compressImage(files[i]);
                    await dbAdd(category, { author, content, caption, date });
                } catch(e) {
                    showModalError(`Couldn't save: ${files[i].name}`);
                }
            }
            location.reload();
        } else {
            try {
                await dbAdd(category, { author, content: urlInput, caption, date });
                location.reload();
            } catch(e) {
                showModalError('Something went wrong saving that URL.');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        }
    } else {
        const content = document.getElementById('m-content').value;
        const accentVal = document.getElementById('m-accent') ? document.getElementById('m-accent').value : '';
        const accentType = document.getElementById('m-accent-type') ? document.getElementById('m-accent-type').value : 'none';
        if (author && content) {
            try {
                await dbAdd(category, { author, content, date, accent: accentVal, accentType });
                location.reload();
            } catch(e) {
                showModalError('Storage full! Please delete some old entries first.');
            }
        }
    }
};

function showModalError(msg) {
    const el = document.getElementById('m-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ============================================================
// 3. DELETE MODAL
// ============================================================
window.askDelete = (cat, id) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'delete-modal';
    overlay.innerHTML = `
        <div class="sanctuary-card modal-content" style="border-color:#ff3b30; text-align:center;">
            <h2 style="color:#ff3b30; margin:0;">Delete Entry?</h2>
            <p style="opacity:0.7; margin:20px 0;">Are you sure? This cannot be undone.</p>
            <div style="display:flex; gap:10px;">
                <button class="pill-btn-white" style="background:rgba(255,255,255,0.1); color:white;" onclick="closeDeleteModal()">Cancel</button>
                <button class="pill-btn-white" style="background:#ff3b30; color:white;" onclick="confirmDelete('${cat}', ${JSON.stringify(id)})">Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.confirmDelete = async (cat, id) => {
    await dbDelete(cat, id);
    location.reload();
};

window.closeModal = () => document.getElementById('active-modal').remove();
window.closeDeleteModal = () => document.getElementById('delete-modal').remove();

// ============================================================
// 5. CUSTOM CURSOR
// ============================================================
function initCustomCursor() {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    const cursorDot = document.createElement('div');
    cursorDot.className = 'cursor-dot';
    document.body.appendChild(cursorDot);

    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    let dotX = 0, dotY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animate() {
        cursorX += (mouseX - cursorX) * 0.15;
        cursorY += (mouseY - cursorY) * 0.15;
        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';

        dotX += (mouseX - dotX) * 0.08;
        dotY += (mouseY - dotY) * 0.08;
        cursorDot.style.left = dotX + 'px';
        cursorDot.style.top = dotY + 'px';

        requestAnimationFrame(animate);
    }
    animate();

    const interactiveElements = document.querySelectorAll('a, button, input, textarea, .sanctuary-card');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.style.transform = 'scale(1.5)';
            cursor.style.borderColor = 'var(--neon)';
        });
        el.addEventListener('mouseleave', () => {
            cursor.style.transform = 'scale(1)';
        });
    });
}

// ============================================================
// 6. PARALLAX SCROLLING
// ============================================================
function initParallax() {
    document.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const cards = document.querySelectorAll('.sanctuary-card');
        cards.forEach((card, index) => {
            const speed = (index % 3 + 1) * 0.02;
            card.style.transform = `translateY(${-(scrolled * speed)}px)`;
        });
    });
}

// ============================================================
// 7. INITIALIZE + RENDER
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    const isUnlocked = localStorage.getItem('hub_unlocked') === 'true';
    const gate = document.getElementById('auth-gate');

    if (isUnlocked) {
        if (gate) gate.remove();
        await migratePhotos();
        await renderContent();

        setTimeout(() => {
            initCustomCursor();
            initParallax();
        }, 100);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && document.getElementById('pass-input')) window.unlockHub();
    });
});


async function renderContent() {
    // ── MEMORIES ── journal-style entries with a decorative quote mark
    const memoriesList = document.getElementById('memories-list');
    if (memoriesList) {
        const data = await dbGetAll('memories');
        memoriesList.innerHTML = data.map((item, i) => {
            const hasAccent = item.accent && item.accentType !== 'none';
            const accentHtml = !hasAccent ? '' : item.accentType === 'emoji'
                ? `<div style="font-size:2.8rem; line-height:1; flex-shrink:0; margin-top:4px; filter:drop-shadow(0 0 8px rgba(255,255,255,0.3));">${item.accent}</div>`
                : `<img src="${item.accent}" style="width:72px; height:72px; border-radius:14px; object-fit:cover; flex-shrink:0; border:2px solid var(--neon); box-shadow:0 0 12px var(--neon);">`;
            return `
            <div class="sanctuary-card memory-entry" style="position:relative; overflow:visible; margin-bottom:30px;">
                <div style="position:absolute; top:-18px; left:24px; font-size:5rem; line-height:1; color:var(--neon); opacity:0.25; font-family:Georgia,serif; pointer-events:none; user-select:none;">"</div>
                <div style="padding:30px 30px 20px;">
                    <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:20px;">
                        ${accentHtml}
                        <p style="font-size:1.05rem; line-height:1.8; margin:0; font-style:italic; color:rgba(255,255,255,0.88); flex:1;">${item.content}</p>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.08); padding-top:14px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:32px; height:32px; border-radius:50%; background:var(--neon); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.75rem; color:#000; flex-shrink:0;">
                                ${item.author.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight:800; font-size:0.8rem; color:var(--neon);">${item.author}</div>
                                <div style="font-size:0.7rem; opacity:0.4;">${item.date}</div>
                            </div>
                        </div>
                        <button class="del-btn" onclick="askDelete('memories', ${i})">×</button>
                    </div>
                </div>
            </div>
        `}).join('');
    }

    // ── AWESOME ── bold highlight cards with a star accent
    const awesomeList = document.getElementById('awesome-list');
    if (awesomeList) {
        const data = await dbGetAll('awesome');
        awesomeList.innerHTML = data.map((item, i) => {
            const hasAccent = item.accent && item.accentType !== 'none';
            const accentHtml = !hasAccent
                ? `<div style="font-size:1.8rem; line-height:1; flex-shrink:0; margin-top:2px;">⭐</div>`
                : item.accentType === 'emoji'
                    ? `<div style="font-size:2.2rem; line-height:1; flex-shrink:0; margin-top:2px; filter:drop-shadow(0 0 8px rgba(255,255,255,0.3));">${item.accent}</div>`
                    : `<img src="${item.accent}" style="width:64px; height:64px; border-radius:12px; object-fit:cover; flex-shrink:0; border:2px solid var(--neon); box-shadow:0 0 12px var(--neon);">`;
            return `
            <div class="sanctuary-card awesome-entry" style="margin-bottom:24px; position:relative;">
                <div style="position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--neon); border-radius:4px 0 0 4px; box-shadow:0 0 10px var(--neon);"></div>
                <div style="padding:22px 24px 22px 30px; display:flex; align-items:flex-start; gap:16px;">
                    ${accentHtml}
                    <div style="flex:1;">
                        <p style="margin:0 0 14px; font-size:1rem; line-height:1.7; color:rgba(255,255,255,0.9); font-weight:500;">${item.content}</p>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:0.72rem; font-weight:800; color:var(--neon); text-transform:uppercase; letter-spacing:1px;">${item.author} · ${item.date}</span>
                            <button class="del-btn" onclick="askDelete('awesome', ${i})">×</button>
                        </div>
                    </div>
                </div>
            </div>
        `}).join('');
    }

    // ── PHOTOS ── clean image-only cards, delete on hover
    const photoList = document.getElementById('photos-list');
    if (!photoList) return;
    const photos = await dbGetAll('photos');
    photoList.innerHTML = photos.map((item) => `
        <div class="photo-card" style="position:relative; break-inside:avoid; margin-bottom:20px; display:inline-block; width:100%; border-radius:20px; overflow:hidden; cursor:pointer;">
            <img src="${item.content}" style="width:100%; display:block; border-radius:20px;">
            ${item.caption ? `<p style="position:absolute; bottom:0; left:0; right:0; margin:0; padding:10px 14px; background:linear-gradient(transparent, rgba(0,0,0,0.75)); font-style:italic; font-size:0.8rem; opacity:0.9;">${item.caption}</p>` : ''}
            <button
                onclick="askDelete('photos', ${item.id})"
                style="position:absolute; top:10px; right:10px; background:rgba(255,59,48,0.85); color:white; border:none; width:28px; height:28px; border-radius:50%; font-size:1rem; cursor:pointer; opacity:0; transition:opacity 0.2s; line-height:1;"
                class="photo-del-btn"
            >×</button>
        </div>
    `).join('');

    photoList.querySelectorAll('.photo-card').forEach(card => {
        const btn = card.querySelector('.photo-del-btn');
        card.addEventListener('mouseenter', () => btn.style.opacity = '1');
        card.addEventListener('mouseleave', () => btn.style.opacity = '0');
    });
}
