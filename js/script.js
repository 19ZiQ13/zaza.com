const ACCESS_KEY = "1234";

// 1. AUTHENTICATION
window.unlockHub = function() {
    const input = document.getElementById('pass-input');
    if (input && input.value === ACCESS_KEY) {
        localStorage.setItem('hub_unlocked', 'true');
        location.reload();
    } else if (input) {
        input.style.borderColor = "#ff3b30";
        input.value = "";
    }
};

window.logout = () => {
    localStorage.removeItem('hub_unlocked');
    location.reload();
};

// 2. MODAL SYSTEM (Adding Content)
window.addItem = function(category) {
    const isPhoto = category === 'photos';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'active-modal';

    const today = new Date().toISOString().split('T')[0];

    overlay.innerHTML = `
        <div class="sanctuary-card modal-content">
            <h2 style="margin:0; text-align:center;">New ${category.slice(0,-1)}</h2>
            
            <span class="modal-label">From:</span>
            <input type="text" id="m-author" class="sanctuary-input" placeholder="Your Name">
            
            <span class="modal-label">Date:</span>
            <input type="date" id="m-date" class="sanctuary-input" value="${today}">
            
            ${isPhoto ? `
                <span class="modal-label">Upload File:</span>
                <input type="file" id="m-file" class="sanctuary-input" accept="image/*" style="padding:10px;">
                <span class="modal-label">OR Image URL:</span>
                <input type="text" id="m-content" class="sanctuary-input" placeholder="https://...">
                <span class="modal-label">Caption:</span>
                <textarea id="m-caption" class="sanctuary-input" rows="2" placeholder="Describe this photo..."></textarea>
            ` : `
                <span class="modal-label">Content:</span>
                <textarea id="m-content" class="sanctuary-input" rows="4" placeholder="Write something..."></textarea>
            `}
            
            <div style="display:flex; gap:10px;">
                <button class="pill-btn-white" style="background:rgba(255,255,255,0.1); color:white;" onclick="closeModal()">Cancel</button>
                <button class="pill-btn-white" onclick="handleSubmission('${category}')">Save Entry</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.handleSubmission = async (category) => {
    const author = document.getElementById('m-author').value;
    const date = document.getElementById('m-date').value;
    let content = document.getElementById('m-content').value;
    const fileInput = document.getElementById('m-file');
    const caption = document.getElementById('m-caption') ? document.getElementById('m-caption').value : "";

    // File handling
    if (category === 'photos' && fileInput && fileInput.files[0]) {
        content = await toBase64(fileInput.files[0]);
    }

    if (author && content) {
        const entry = { author, content, caption, date };
        let store = JSON.parse(localStorage.getItem(category) || "[]");
        store.push(entry);
        localStorage.setItem(category, JSON.stringify(store));
        location.reload();
    }
};

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// 3. CUSTOM DELETE MODAL (No more browser prompt)
window.askDelete = (cat, idx) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'delete-modal';
    overlay.innerHTML = `
        <div class="sanctuary-card modal-content" style="border-color:#ff3b30; text-align:center;">
            <h2 style="color:#ff3b30; margin:0;">Delete Entry?</h2>
            <p style="opacity:0.7; margin:20px 0;">Are you sure? This cannot be undone.</p>
            <div style="display:flex; gap:10px;">
                <button class="pill-btn-white" style="background:rgba(255,255,255,0.1); color:white;" onclick="closeDeleteModal()">Cancel</button>
                <button class="pill-btn-white" style="background:#ff3b30; color:white;" onclick="confirmDelete('${cat}', ${idx})">Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.confirmDelete = (cat, idx) => {
    let store = JSON.parse(localStorage.getItem(cat) || "[]");
    store.splice(idx, 1);
    localStorage.setItem(cat, JSON.stringify(store));
    location.reload();
};

window.closeModal = () => document.getElementById('active-modal').remove();
window.closeDeleteModal = () => document.getElementById('delete-modal').remove();

// 5. CUSTOM CURSOR
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
        // Smooth cursor follow
        cursorX += (mouseX - cursorX) * 0.15;
        cursorY += (mouseY - cursorY) * 0.15;
        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';

        // Even smoother dot follow
        dotX += (mouseX - dotX) * 0.08;
        dotY += (mouseY - dotY) * 0.08;
        cursorDot.style.left = dotX + 'px';
        cursorDot.style.top = dotY + 'px';

        requestAnimationFrame(animate);
    }
    animate();

    // Cursor expansion on hover
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

// 6. PARALLAX SCROLLING
function initParallax() {
    document.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const cards = document.querySelectorAll('.sanctuary-card');

        cards.forEach((card, index) => {
            const speed = (index % 3 + 1) * 0.02;
            const yPos = -(scrolled * speed);
            card.style.transform = `translateY(${yPos}px)`;
        });
    });
}

// 7. INITIALIZE
document.addEventListener("DOMContentLoaded", () => {
    const isUnlocked = localStorage.getItem('hub_unlocked') === 'true';
    const gate = document.getElementById('auth-gate');

    if (isUnlocked) {
        if (gate) gate.remove();
        renderContent();

        // Initialize effects after content is loaded
        setTimeout(() => {
            initCustomCursor();
            initParallax();
        }, 100);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && document.getElementById('pass-input')) window.unlockHub();
    });
});

function renderContent() {
    ['memories', 'awesome', 'photos'].forEach(cat => {
        const list = document.getElementById(`${cat}-list`);
        if (!list) return;
        const data = JSON.parse(localStorage.getItem(cat) || "[]");
        list.innerHTML = data.map((item, i) => `
            <div class="sanctuary-card">
                <div class="card-header">
                    <span class="author-tag">FROM: ${item.author}</span>
                    <span class="date-tag">${item.date}</span>
                    <button class="del-btn" onclick="askDelete('${cat}', ${i})">×</button>
                </div>
                <div class="card-body">
                    ${cat === 'photos' ? `
                        <img src="${item.content}">
                        ${item.caption ? `<p style="margin-top:15px; font-style:italic; opacity:0.8;">${item.caption}</p>` : ''}
                    ` : `<p>${item.content}</p>`}
                </div>
            </div>
        `).join('');
    });
}
