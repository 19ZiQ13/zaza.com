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
window.addItem = function(category) {
    const isPhoto = category === 'photos';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'active-modal';

    const today = new Date().toISOString().split('T')[0];

    overlay.innerHTML = `
        <div class="sanctuary-card modal-content">
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
        if (author && content) {
            try {
                await dbAdd(category, { author, content, caption, date });
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
    // Memories and Awesome — full card with header as before
    for (const cat of ['memories', 'awesome']) {
        const list = document.getElementById(`${cat}-list`);
        if (!list) continue;
        const data = await dbGetAll(cat);
        list.innerHTML = data.map((item, i) => `
            <div class="sanctuary-card">
                <div class="card-header">
                    <span class="author-tag">FROM: ${item.author}</span>
                    <span class="date-tag">${item.date}</span>
                    <button class="del-btn" onclick="askDelete('${cat}', ${i})">×</button>
                </div>
                <div class="card-body">
                    <p>${item.content}</p>
                </div>
            </div>
        `).join('');
    }

    // Photos — clean image-only cards, delete button overlaid on hover
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

    // Show delete button on hover
    photoList.querySelectorAll('.photo-card').forEach(card => {
        const btn = card.querySelector('.photo-del-btn');
        card.addEventListener('mouseenter', () => btn.style.opacity = '1');
        card.addEventListener('mouseleave', () => btn.style.opacity = '0');
    });
}
