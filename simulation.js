// Simulation Mode Configuration
// 3 teams, 5 questions, 700 gold initial

const SIMULATION_MODE = true;
const CATEGORIES = ['Kombinatorika']; // Only 1 category for simulation
const POINTS = [25]; // 5 different point values
const INITIAL_GOLD = 700; // Reduced gold for simulation
const NUM_TEAMS = 5; // 5 teams for simulation
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const IMAGE_TARGETS_ASLI = [
    'Kombinatorika_5', 'Kombinatorika_10', 'Kombinatorika_15', 'Kombinatorika_25',
    'Struktur_Aljabar_5', 'Struktur_Aljabar_10', 'Struktur_Aljabar_15', 'Struktur_Aljabar_25',
    'Analisis_Riil_5', 'Analisis_Riil_10', 'Analisis_Riil_15', 'Analisis_Riil_25',
    'Aljabar_Linear_5', 'Aljabar_Linear_10', 'Aljabar_Linear_15', 'Aljabar_Linear_25',
    'Analisis_Kompleks_5', 'Analisis_Kompleks_10', 'Analisis_Kompleks_15', 'Analisis_Kompleks_25'
];
const IMAGE_TARGETS_SIM = [
    'sim_Kombinatorika_5', 'sim_Kombinatorika_10', 'sim_Kombinatorika_15',
    'sim_Kombinatorika_20', 'sim_Kombinatorika_25'
];

// Game State
let teams = [];
let questions = [];
let currentPhase = 'SETUP'; // SETUP, BOARD, BIDDING, ANSWERING, REBIDDING, REANSWERING
let activeQuestion = null;
let timerInterval = null;
let currentBid = 0;
let currentBidder = null; // Team Index
let rebidder = null; // Team Index for re-answering
let isBidPaused = false;

// DOM Elements
const views = {
    setup: document.getElementById('view-setup'),
    board: document.getElementById('view-board'),
    bidding: document.getElementById('view-bidding'),
    answering: document.getElementById('view-answering'),
    rebidding: document.getElementById('view-rebidding'),
    reanswering: document.getElementById('view-reanswering')
};

const scoreboardEl = document.getElementById('scoreboard');
const logListEl = document.getElementById('log-list');

// Socket.IO client for simulation host
const socket = io();
const ROOM = 'simulation';
socket.emit('JOIN_ROOM', ROOM);

// Note: Socket.IO handles reconnection/handshake. Simulation will call
// `syncToViewer()` wherever necessary when state changes.

// Sync state to viewer
function syncToViewer() {
    const timerValues = {};
    ['bid-timer', 'answer-timer', 'rebid-timer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            timerValues[id] = el.innerText;
        }
    });
    socket.emit('HOST_STATE', Object.assign({ room: ROOM }, {
        teams: teams,
        questions: questions,
        currentPhase: currentPhase,
        activeQuestion: activeQuestion,
        currentBid: currentBid,
        currentBidder: currentBidder,
        rebidder: rebidder,
        timerValues: timerValues,
        simulationMode: true
    }));
}

// Send timer update to viewer
function syncTimerToViewer(elementId, timeLeft) {
    socket.emit('TIMER_UPDATE', { room: ROOM, elementId, timeLeft });
}

// (no sendTimerSnapshots helper — simulation will call `syncTimerToViewer` directly if needed)

// Broadcast any message to viewers
function broadcastToViewers(type, data) {
    socket.emit(type, Object.assign({ room: ROOM }, data || {}));
}

// --- Initialization ---

function initGame() {
    // Generate Questions for simulation - only 5 questions
    questions = [];
    POINTS.forEach((pts, idx) => {
        questions.push({
            id: idx + 1,
            displayNumber: idx + 1,
            category: CATEGORIES[0], // Single category
            points: pts,
            initialPrice: pts, // Price equals base points
            status: 'AVAILABLE', // AVAILABLE, SOLD, DISCARDED
            winner: null,
            revealed: false // Track if category/points have been revealed
        });
    });
}

function startGame() {
    // Initialize Teams - only 3 for simulation
    teams = [];
    for (let i = 1; i <= NUM_TEAMS; i++) {
        const nameInput = document.getElementById(`team${i}-name`);
        const name = nameInput ? nameInput.value : `Tim Simulasi ${String.fromCharCode(64 + i)}`;
        teams.push({
            id: i - 1,
            name: name,
            gold: INITIAL_GOLD,
            points: 0,
            bidHistory: {}, // { 'Category': count }
            consecutiveWrongStreak: 0,
            suspended: false, // Suspended for next turn
            suspendedCount: 0 // How many turns to remain suspended (usually 1)
        });
        // Init bid history
        CATEGORIES.forEach(cat => teams[i - 1].bidHistory[cat] = 0);
    }

    initGame();
    switchView('board');
    renderScoreboard();
    renderBoard();
    log("🔬 Simulasi Dimulai!");
}

// --- Navigation Functions ---

// Back to start menu
function backToMenu() {
    if (confirm('Kembali ke menu utama? Progress akan hilang.')) {
        window.location.href = 'start-menu.html';
    }
}

// Back to setup (from board)
function backToSetup() {
    // Only allow if no questions answered yet
    const answeredQuestions = questions.filter(q => q.status !== 'AVAILABLE').length;

    if (answeredQuestions > 0) {
        if (!confirm('Game sudah dimulai! Kembali ke setup akan mereset progress. Lanjutkan?')) {
            return;
        }
    }

    // Reset game state
    teams = [];
    questions = [];
    currentBid = 0;
    currentBidder = null;
    rebidder = null;
    activeQuestion = null;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Reset to setup phase
    currentPhase = 'SETUP';
    switchView('setup');
    renderScoreboard();
    syncToViewer();
}

// --- Rendering ---

function switchView(viewName) {
    Object.values(views).forEach(el => el.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    currentPhase = viewName.toUpperCase();
    syncToViewer();
}

function renderScoreboard() {
    scoreboardEl.innerHTML = '';
    teams.forEach((team, idx) => {
        const div = document.createElement('div');
        div.className = `team-card ${team.suspended ? 'suspended' : ''}`;
        if (currentBidder === idx && currentPhase === 'BIDDING') div.classList.add('active-turn');

        div.innerHTML = `
            <span class="team-name">${team.name}</span>
            <div class="team-stats">
                <span class="stat-gold">Gold: ${team.gold}</span>
                <span class="stat-points">Poin: ${team.points}</span>
            </div>
            ${team.suspended ? '<small style="color:red">DISKORS</small>' : ''}
        `;
        scoreboardEl.appendChild(div);
    });
    syncToViewer();
}

function renderBoard() {
    const grid = document.getElementById('question-grid');
    if (!grid) {
        console.error('Question grid element not found!');
        return;
    }

    console.log('=== renderBoard called (Simulation) ===');
    grid.innerHTML = '';

    // Render questions as a 1x5 grid with numbers only (mystery style)
    questions.forEach((q, index) => {
        const btn = document.createElement('button');
        const isAvailable = q.status === 'AVAILABLE';

        btn.className = `q-btn ${!isAvailable ? 'disabled' : ''}`;
        btn.innerHTML = `<span class="q-number">${q.displayNumber}</span>`;
        btn.type = 'button';

        if (!isAvailable) {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
        } else {
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Question #${q.displayNumber} clicked`);
                selectQuestion(q);
            });

            btn.onclick = () => {
                console.log(`Question #${q.displayNumber} onclick fired`);
                selectQuestion(q);
            };
        }

        grid.appendChild(btn);
    });

    const availableCount = questions.filter(q => q.status === 'AVAILABLE').length;
    console.log(`Rendered ${questions.length} questions. Available: ${availableCount}`);
}

function log(msg) {
    console.log(`[LOG] ${msg}`);
    if (logListEl) {
        const li = document.createElement('li');
        li.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logListEl.prepend(li);
    }
}

// --- Game Logic: Selection ---

function selectQuestion(question) {
    console.log('=== selectQuestion called ===', question);

    if (!question || question.status !== 'AVAILABLE') {
        console.error('Invalid question selection:', question);
        return;
    }

    activeQuestion = question;

    // Mark question as revealed (category/points now visible)
    question.revealed = true;

    // Log the reveal
    log(`Soal #${question.displayNumber} dibuka: ${question.category} - ${question.points} Poin`);

    // Check suspensions
    // Do NOT decrement suspension here; expiration happens when question is finalized
    renderScoreboard();

    // IMPORTANT: Switch to bidding view FIRST before accessing DOM elements
    switchView('bidding');
    showPreBiddingState(true);
    resetBiddingPanelState();

    // Now setup Bidding View elements (after view is visible)
    const bidCategory = document.getElementById('bid-category');
    const bidPoints = document.getElementById('bid-points');
    const bidPrice = document.getElementById('bid-price');
    const highestBidAmount = document.getElementById('highest-bid-amount');
    const highestBidderName = document.getElementById('highest-bidder-name');
    const bidTimer = document.getElementById('bid-timer');

    if (bidCategory) bidCategory.innerText = question.category;
    if (bidPoints) bidPoints.innerText = question.points;
    if (bidPrice) bidPrice.innerText = question.initialPrice;
    if (highestBidAmount) highestBidAmount.innerText = '0';
    if (highestBidderName) highestBidderName.innerText = '-';
    if (bidTimer) bidTimer.innerText = '30';

    currentBid = 0;
    currentBidder = null;
    isBidPaused = false;

    // Setup Bid Buttons for 3 teams
    const btnContainer = document.getElementById('team-bid-buttons');
    if (btnContainer) {
        btnContainer.innerHTML = '';
        teams.forEach((team, idx) => {
            const btn = document.createElement('button');
            btn.innerText = team.name;
            btn.onclick = () => placeBid(idx);
            if (team.suspended) btn.disabled = true;
            btnContainer.appendChild(btn);
        });
    }

    // Setup bid input with constraints
    const inputEl = document.getElementById('bid-input');
    if (inputEl) {
        const minBid = question.initialPrice;
        const maxBid = question.initialPrice * 5;
        inputEl.min = minBid;
        inputEl.max = maxBid;
        inputEl.value = minBid;
        inputEl.placeholder = `${minBid} - ${maxBid}`;
    }

    syncToViewer();
    console.log('Question setup complete');
}

// Show/hide pre-bidding controls
function showPreBiddingState(isPreBidding) {
    const startBtn = document.getElementById('start-bidding-btn');
    const bidControls = document.getElementById('bidding-controls');

    if (isPreBidding) {
        if (startBtn) startBtn.style.display = 'block';
        if (bidControls) bidControls.style.display = 'none';
    } else {
        if (startBtn) startBtn.style.display = 'none';
        if (bidControls) bidControls.style.display = 'block';
    }
}

// Host manually starts bidding
function startBidding() {
    showPreBiddingState(false);
    log(`Bidding dimulai untuk soal #${activeQuestion.displayNumber}!`);
    startTimer('bid-timer', 30, endBiddingSuccess);
}

// Show/hide pre-answering controls
function showPreAnsweringState(isPreAnswering) {
    const startBtn = document.getElementById('start-answering-btn');
    const answeringControls = document.getElementById('answering-controls');

    if (isPreAnswering) {
        if (startBtn) startBtn.style.display = 'block';
        if (answeringControls) answeringControls.style.display = 'none';
    } else {
        if (startBtn) startBtn.style.display = 'none';
        if (answeringControls) answeringControls.style.display = 'block';
    }
}

// Host manually starts answering
function startAnswering() {
    showPreAnsweringState(false);
    log(`${teams[currentBidder].name} mulai menjawab soal!`);
    startTimer('answer-timer', 180, endAnsweringTime);
}

// Called when answering timer ends - show waiting state for operator to judge answer
function endAnsweringTime() {
    clearInterval(timerInterval);
    log("Waktu menjawab habis. Operator bisa menilai jawaban.");
    showAnsweringWaitingState();
}

// Show waiting state after answering timer ends
function showAnsweringWaitingState() {
    const answeringControls = document.getElementById('answering-controls');
    if (answeringControls) {
        answeringControls.style.display = 'block';
        const buttons = answeringControls.querySelectorAll('button');
        if (buttons.length >= 2) {
            buttons[0].innerText = 'Jawaban Benar';
            buttons[1].innerText = 'Waktu Habis - Jawaban Salah / Tidak Menjawab';
        }
    }
}

// --- Game Logic: Bidding ---

// Host audio disabled — sound moved to Viewer (per competition rules)
// Simulation host will remain silent; viewers handle playback.


function startTimer(elementId, seconds, callback) {
    if (timerInterval) clearInterval(timerInterval);
    let timeLeft = seconds;
    document.getElementById(elementId).innerText = timeLeft;
    syncTimerToViewer(elementId, timeLeft);

    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById(elementId).innerText = timeLeft;
        syncTimerToViewer(elementId, timeLeft);

        // Host/simulation remains silent; viewers will play sounds.

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (callback) callback();
        }
    }, 1000);
}

function placeBid(teamIdx) {
    const team = teams[teamIdx];
    const inputEl = document.getElementById('bid-input');
    let amount = parseInt(inputEl.value);

    // Validation
    if (isNaN(amount)) {
        alert("Masukkan jumlah bid yang valid!");
        return;
    }

    // Rule 8: Multiple of 5
    if (amount % 5 !== 0) {
        alert("Bid harus kelipatan 5!");
        return;
    }

    let minBid = (currentBid === 0) ? activeQuestion.initialPrice : currentBid + 5;

    if (amount < minBid) {
        alert(`Bid minimal adalah ${minBid} Gold!`);
        return;
    }

    // Rule 9: Check Balance
    if (amount > team.gold) {
        alert("Saldo Gold tidak mencukupi!");
        return;
    }

    // Rule 8: Max 5x initial price
    let maxBid = activeQuestion.initialPrice * 5;

    // 🚨 Pause hanya jika bid VALID & maksimal
    if (amount === maxBid && !isBidPaused) {
        pauseBiddingTimer();
        showResumeBiddingButton();
    }

    // Check if this is a late bid (after timer ended)
    const isLateBid = currentBidder === null;

    // Valid Bid
    restoreCurrentBidInfoHTML();

    currentBid = amount;
    currentBidder = teamIdx;

    // Track participation
    team.bidHistory[activeQuestion.category]++;

    // Update UI
    const highestBidAmount = document.getElementById('highest-bid-amount');
    const highestBidderName = document.getElementById('highest-bidder-name');

    if (highestBidAmount) highestBidAmount.innerText = currentBid;
    if (highestBidderName) highestBidderName.innerText = team.name;

    renderScoreboard();
    log(`${team.name} melakukan bid sebesar ${amount} Gold.`);
    syncToViewer();

    // If this is a late bid (after timer ended), show button to proceed to answering
    if (isLateBid) {
        showLateBidProceedButton();
        return;
    }

    // Auto-increment input for next bid
    let nextBid = currentBid + 5;
    if (nextBid <= maxBid) {
        inputEl.value = nextBid;
    } else {
        inputEl.value = maxBid;
    }
    inputEl.min = nextBid;
}

// Function to restore original current-bid-info HTML
function restoreCurrentBidInfoHTML() {
    const currentBidInfo = document.querySelector('.current-bid-info');
    if (currentBidInfo) {
        if (!document.getElementById('highest-bid-amount')) {
            currentBidInfo.innerHTML = `
                <p>💰 Bid Tertinggi: <span id="highest-bid-amount">0</span> Gold</p>
                <p>👤 Oleh: <span id="highest-bidder-name">-</span></p>
            `;
        }
    }
}

// Reset bidding panel UI to default before each new question
function resetBiddingPanelState() {
    restoreCurrentBidInfoHTML();

    const highestBidAmount = document.getElementById('highest-bid-amount');
    const highestBidderName = document.getElementById('highest-bidder-name');
    if (highestBidAmount) highestBidAmount.innerText = '0';
    if (highestBidderName) highestBidderName.innerText = '-';

    const bidInput = document.getElementById('bid-input');
    if (bidInput) {
        bidInput.value = '';
        bidInput.removeAttribute('min');
    }

    const actionButtons = document.querySelector('#bidding-controls .action-buttons');
    if (actionButtons) {
        actionButtons.innerHTML = `
            <button onclick="endBiddingNoWinner()" class="warning-btn">Tidak Ada Penawar (-5 Poin Semua)</button>
        `;
    }
}

// Show manual proceed button after normal bidding ends
function showProceedToAnsweringButton() {
    const bidControls = document.getElementById('bidding-controls');
    if (bidControls) {
        const actionButtons = bidControls.querySelector('.action-buttons');
        if (actionButtons) {
            actionButtons.innerHTML = `
                <button onclick="proceedToAnswering()" class="success-btn" style="font-size: 1.1em; padding: 12px 30px;">
                    ✓ Lanjut ke Fase Menjawab
                </button>
                <button onclick="endBiddingNoWinner()" class="danger-btn" style="font-size: 1.1em; padding: 12px 30px;">
                    ✗ Batalkan Bid
                </button>
            `;
        }
    }
}

// Proceed to answering after operator confirms
function proceedToAnswering() {
    if (currentBidder === null) {
        alert("Tidak ada bid yang diterima!");
        return;
    }

    setupAnsweringPhase();
    startAnswering();
}

// Show button to proceed to answering after late bid
function showLateBidProceedButton() {
    const bidControls = document.getElementById('bidding-controls');
    if (bidControls) {
        const actionButtons = bidControls.querySelector('.action-buttons');
        if (actionButtons) {
            actionButtons.innerHTML = `
                <button onclick="proceedToAnsweringAfterLateBid()" class="success-btn" style="font-size: 1.1em; padding: 12px 30px;">
                    ✓ Lanjut ke Fase Menjawab
                </button>
                <button onclick="endBiddingNoWinner()" class="danger-btn" style="font-size: 1.1em; padding: 12px 30px;">
                    ✗ Batalkan Bid
                </button>
            `;
        }
    }
}

// Proceed to answering after a late bid was placed
function proceedToAnsweringAfterLateBid() {
    if (currentBidder === null) {
        alert("Tidak ada bid yang diterima!");
        return;
    }

    const winner = teams[currentBidder];

    // Deduct Gold
    winner.gold -= currentBid;
    activeQuestion.winner = currentBidder;

    log(`${winner.name} memenangkan bidding (bid terlambat) dengan ${currentBid} Gold!`);
    renderScoreboard();

    setupAnsweringPhase();
    startAnswering();
}

function endBiddingSuccess() {
    if (currentBidder === null) {
        showNoBidderWaitingState();
    } else {
        const winner = teams[currentBidder];

        // Deduct Gold
        winner.gold -= currentBid;
        activeQuestion.winner = currentBidder;

        log(`${winner.name} memenangkan bidding dengan ${currentBid} Gold!`);
        renderScoreboard();

        // Update panel info
        const currentBidInfo = document.querySelector('.current-bid-info');
        if (currentBidInfo) {
            currentBidInfo.innerHTML = `
                <p>✅ Bidding selesai.</p>
                <p>Pemenang: <b>${winner.name}</b> dengan ${currentBid} Gold.</p>
                <p>Tekan "Lanjut ke Fase Menjawab" untuk mulai.</p>
            `;
        }

        showProceedToAnsweringButton();
    }
}

function showNoBidderWaitingState() {
    const bidControls = document.getElementById('bidding-controls');
    if (bidControls) bidControls.style.display = 'block';

    const currentBidInfo = document.querySelector('.current-bid-info');
    if (currentBidInfo) {
        currentBidInfo.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <p style="font-size: 1.4em; color: var(--warning); margin-bottom: 15px;">
                    ⏰ Waktu Bidding Habis!
                </p>
                <p style="font-size: 1.1em; color: var(--text-muted); margin-bottom: 25px;">
                    Tidak ada tim yang melakukan bidding
                </p>
                <button onclick="endBiddingNoWinner()" class="warning-btn" style="font-size: 1.2em; padding: 15px 40px;">
                    🔙 Kembali ke Papan Soal (Penalti -5 Poin)
                </button>
                <p style="font-size: 0.9em; color: var(--text-muted); margin-top: 15px;">
                    💡 Atau gunakan panel kontrol di bawah untuk menerima bid terlambat
                </p>
            </div>
        `;
    }

    log("Waktu bidding habis. Tidak ada penawar.");
}

function endBiddingNoWinner() {
    console.log('=== endBiddingNoWinner called ===');

    clearInterval(timerInterval);
    timerInterval = null;

    // -5 points for all teams
    teams.forEach(t => t.points -= 5);

    // Mark question as discarded
    if (activeQuestion) {
        activeQuestion.status = 'DISCARDED';
        console.log(`Question #${activeQuestion.displayNumber} marked as DISCARDED`);
    }

    log("Tidak ada penawar. Semua tim -5 poin. Soal hangus.");
    renderScoreboard();

    // Finalize question lifecycle
    finalizeQuestion();
}

// --- Game Logic: Answering ---

function buildImagePath(category, points, ext = 'jpg', isSimulation = true) {
    if (!category || points === undefined) return 'question_placeholder.svg';
    const safeCategory = category.trim().replace(/\s+/g, '_');
    const baseName = isSimulation ? `sim_${safeCategory}_${points}` : `${safeCategory}_${points}`;
    const folder = isSimulation ? 'Gambar Soal Simulasi' : 'Gambar Soal Asli';
    return `${folder}/${baseName}.${ext}`;
}

function getQuestionImageSource(category, points, isSimulation = true) {
    if (!category || points === undefined) return 'question_placeholder.svg';
    return buildImagePath(category, points, 'jpg', isSimulation);
}

function applyImageOrientation(img) {
    if (!img) return;
    const updateOrientation = () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        const isPortrait = img.naturalHeight > img.naturalWidth;
        img.classList.toggle('img-portrait', isPortrait);
        img.classList.toggle('img-landscape', !isPortrait);
    };

    if (img.complete && img.naturalWidth) {
        updateOrientation();
    } else {
        img.addEventListener('load', updateOrientation, { once: true });
    }

    img.addEventListener('error', () => {
        img.classList.remove('img-portrait', 'img-landscape');
    }, { once: true });
}

function setQuestionImageWithFallback(img, category, points, isSimulation = true) {
    if (!img) return;
    if (!category || points === undefined) {
        img.src = 'question_placeholder.svg';
        return;
    }

    let index = 0;
    const tryNext = () => {
        if (index >= IMAGE_EXTENSIONS.length) {
            img.src = 'question_placeholder.svg';
            return;
        }
        const ext = IMAGE_EXTENSIONS[index];
        index += 1;
        img.src = buildImagePath(category, points, ext, isSimulation);
    };

    img.onerror = () => {
        tryNext();
    };

    img.onload = () => {
        applyImageOrientation(img);
    };

    tryNext();
}

function setImportMessage(message, isError = false) {
    const messageEl = document.getElementById('import-message');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.classList.toggle('success', !isError && Boolean(message));
    messageEl.classList.toggle('error', isError && Boolean(message));
}

async function updateImportStatus() {
    const countAsliEl = document.getElementById('imported-count-asli');
    const countSimEl = document.getElementById('imported-count-sim');
    if (!countAsliEl && !countSimEl) return;

    try {
        const res = await fetch('/counts');
        const data = await res.json();
        if (!data.ok) throw new Error('Gagal membaca status');
        if (countAsliEl) countAsliEl.textContent = String(data.counts.asli || 0);
        if (countSimEl) countSimEl.textContent = String(data.counts.sim || 0);
    } catch (err) {
        if (countAsliEl) countAsliEl.textContent = '-';
        if (countSimEl) countSimEl.textContent = '-';
        setImportMessage('Server belum berjalan. Jalankan server untuk import.', true);
    }
}

async function importImages(fileList, isSimulation) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) {
        setImportMessage('Tidak ada file gambar yang valid.', true);
        return;
    }

    if (files.length > (isSimulation ? IMAGE_TARGETS_SIM.length : IMAGE_TARGETS_ASLI.length)) {
        setImportMessage('Jumlah gambar melebihi slot yang tersedia. Sisanya akan diabaikan.', true);
    }

    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    try {
        const endpoint = isSimulation ? '/upload/sim' : '/upload/asli';
        const res = await fetch(endpoint, { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Upload gagal');
        updateImportStatus();
        setImportMessage(`Berhasil upload ${data.saved} gambar${data.skipped ? `, ${data.skipped} diabaikan` : ''}.`, false);
    } catch (err) {
        setImportMessage('Upload gagal. Pastikan server berjalan.', true);
    }
}

async function clearImportedImages() {
    try {
        const res = await fetch('/clear/all', { method: 'POST' });
        const data = await res.json();
        if (!data.ok) throw new Error('Gagal menghapus');
        updateImportStatus();
        setImportMessage('Semua gambar import telah dihapus.', false);
    } catch (err) {
        setImportMessage('Gagal menghapus gambar. Pastikan server berjalan.', true);
    }
}

function initImageImport() {
    const inputAsli = document.getElementById('image-import-asli');
    const inputSim = document.getElementById('image-import-sim');
    const inputAsliFolder = document.getElementById('image-import-asli-folder');
    const inputSimFolder = document.getElementById('image-import-sim-folder');
    const singleTargetAsli = document.getElementById('single-target-asli');
    const singleTargetSim = document.getElementById('single-target-sim');
    const singleImageAsli = document.getElementById('single-image-asli');
    const singleImageSim = document.getElementById('single-image-sim');
    const clearBtn = document.getElementById('clear-imported-images');

    if (inputAsli) {
        inputAsli.addEventListener('change', (e) => {
            importImages(e.target.files, false);
            e.target.value = '';
        });
    }

    if (inputSim) {
        inputSim.addEventListener('change', (e) => {
            importImages(e.target.files, true);
            e.target.value = '';
        });
    }

    if (inputAsliFolder) {
        inputAsliFolder.addEventListener('change', (e) => {
            importImages(e.target.files, false);
            e.target.value = '';
        });
    }

    if (inputSimFolder) {
        inputSimFolder.addEventListener('change', (e) => {
            importImages(e.target.files, true);
            e.target.value = '';
        });
    }

    if (singleTargetAsli) {
        singleTargetAsli.innerHTML = IMAGE_TARGETS_ASLI.map((target) => `<option value="${target}">${target}</option>`).join('');
    }

    if (singleTargetSim) {
        singleTargetSim.innerHTML = IMAGE_TARGETS_SIM.map((target) => `<option value="${target}">${target}</option>`).join('');
    }

    if (singleImageAsli) {
        singleImageAsli.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const target = singleTargetAsli ? singleTargetAsli.value : '';
            const formData = new FormData();
            formData.append('image', file);
            formData.append('mode', 'asli');
            formData.append('target', target);

            try {
                const res = await fetch('/upload/single', { method: 'POST', body: formData });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error || 'Upload gagal');
                updateImportStatus();
                setImportMessage(`Berhasil upload ${data.filename}.`, false);
            } catch (err) {
                setImportMessage('Upload gagal. Pastikan server berjalan.', true);
            }
            e.target.value = '';
        });
    }

    if (singleImageSim) {
        singleImageSim.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const target = singleTargetSim ? singleTargetSim.value : '';
            const formData = new FormData();
            formData.append('image', file);
            formData.append('mode', 'sim');
            formData.append('target', target);

            try {
                const res = await fetch('/upload/single', { method: 'POST', body: formData });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error || 'Upload gagal');
                updateImportStatus();
                setImportMessage(`Berhasil upload ${data.filename}.`, false);
            } catch (err) {
                setImportMessage('Upload gagal. Pastikan server berjalan.', true);
            }
            e.target.value = '';
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearImportedImages);
    }

    updateImportStatus();
}

function setupAnsweringPhase() {
    switchView('answering');
    document.getElementById('answering-team').innerText = teams[currentBidder].name;
    document.getElementById('answer-timer').innerText = '180';

    // Display question info (category and points)
    if (activeQuestion) {
        const categoryEl = document.getElementById('answering-category');
        const pointsEl = document.getElementById('answering-points');
        if (categoryEl) categoryEl.innerText = activeQuestion.category;
        if (pointsEl) pointsEl.innerText = activeQuestion.points;
    }

    // Set question image based on category and points
    if (activeQuestion) {
        const questionImg = document.getElementById('question-image');
        if (questionImg) {
            questionImg.alt = `Soal ${activeQuestion.category} - ${activeQuestion.points} Poin`;
            setQuestionImageWithFallback(questionImg, activeQuestion.category, activeQuestion.points, true);
        }
    }

    syncToViewer();
}

function handleAnswer(isCorrect) {
    clearInterval(timerInterval);
    showAnsweringControls(false);

    const team = teams[currentBidder];
    const modal = document.getElementById('answer-result-modal');
    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const resultPoints = document.getElementById('result-points');

    let pointsGained = 0;

    if (isCorrect) {
        pointsGained = activeQuestion.points;
        team.points += pointsGained;
        resultIcon.innerText = '✓';
        resultText.innerText = 'BENAR!';
        resultPoints.innerText = `+${pointsGained} Poin`;
        modal.className = 'answer-result-modal success';
        log(`${team.name} menjawab BENAR! (+${pointsGained} Poin)`);

        team.consecutiveWrongStreak = 0;

        teams.forEach((t, idx) => {
            if (idx !== currentBidder) t.consecutiveWrongStreak = 0;
        });

        activeQuestion.status = 'SOLD';
        activeQuestion.answeredCorrectly = true;
    } else {
        pointsGained = activeQuestion.points;
        team.points -= pointsGained;
        resultIcon.innerText = '✗';
        resultText.innerText = 'SALAH!';
        resultPoints.innerText = `-${pointsGained} Poin`;
        modal.className = 'answer-result-modal failure';
        log(`${team.name} menjawab SALAH/TIDAK MENJAWAB! (-${pointsGained} Poin)`);

        team.consecutiveWrongStreak++;
        if (team.consecutiveWrongStreak >= 3) {
            team.suspended = true;
            team.suspendedCount = 2; // Suspend for 2 questions (current and next)
            log(`${team.name} telah salah 3x berturut-turut setelah menang bid. DISKORS 2 SOAL!`);
        }

        teams.forEach((t, idx) => {
            if (idx !== currentBidder) t.consecutiveWrongStreak = 0;
        });

        activeQuestion.status = 'SOLD';
    }

    renderScoreboard();
    syncToViewer();

    // Send answer result to viewer
    socket.emit('ANSWER_RESULT', { room: ROOM, isCorrect: isCorrect, pointsGained: pointsGained });
    // Ensure viewers get full sync too
    syncToViewer();

    // Show result modal for 2.5 seconds
    modal.classList.remove('hidden');

    setTimeout(() => {
        modal.classList.add('hidden');

        if (isCorrect) {
            finalizeQuestion();
        } else {
            setupRebiddingPhase();
        }
    }, 2500);
}

// Helper function to show/hide answering controls
function showAnsweringControls(show) {
    const answeringControls = document.getElementById('answering-controls');
    if (answeringControls) {
        answeringControls.style.display = show ? 'block' : 'none';
    }
}

// --- Game Logic: Re-Bidding ---

function setupRebiddingPhase() {
    switchView('rebidding');
    document.getElementById('rebid-price').innerText = currentBid;
    document.getElementById('rebid-timer').innerText = '10';
    showPreRebiddingState(true);

    const btnContainer = document.getElementById('rebid-team-buttons');
    btnContainer.innerHTML = '';

    teams.forEach((team, idx) => {
        // Original winner cannot re-bid
        if (idx !== currentBidder && !team.suspended) {
            const btn = document.createElement('button');
            btn.innerText = team.name;
            btn.onclick = () => handleRebid(idx);
            if (team.gold < currentBid) {
                btn.disabled = true;
                btn.title = "Saldo tidak cukup";
            }
            btnContainer.appendChild(btn);
        }
    });

    syncToViewer();
}

// Show/hide pre-rebidding controls
function showPreRebiddingState(isPreRebidding) {
    const startBtn = document.getElementById('start-rebidding-btn');
    const rebidControls = document.getElementById('rebidding-controls');

    if (isPreRebidding) {
        if (startBtn) startBtn.style.display = 'block';
        if (rebidControls) rebidControls.style.display = 'none';
    } else {
        if (startBtn) startBtn.style.display = 'none';
        if (rebidControls) rebidControls.style.display = 'block';
    }
}

// Host manually starts rebidding
function startRebidding() {
    showPreRebiddingState(false);
    log(`Pelemparan soal dimulai! Siapa cepat dia dapat!`);
    startTimer('rebid-timer', 10, endRebiddingTime);
}

// Called when rebidding timer ends
function endRebiddingTime() {
    clearInterval(timerInterval);
    log("Waktu pelemparan habis. Operator bisa memilih tim.");
    showRebiddingWaitingState();
}

// Show waiting state after rebidding timer ends
function showRebiddingWaitingState() {
    const rebidControls = document.getElementById('rebidding-controls');
    if (rebidControls) {
        rebidControls.style.display = 'block';

        const header = rebidControls.querySelector('h3') || document.createElement('h3');
        if (!rebidControls.querySelector('h3')) {
            header.innerText = 'Pilih Tim Tercepat:';
            rebidControls.insertBefore(header, rebidControls.firstChild);
        } else {
            header.innerText = 'Waktu Habis - Pilih Tim Tercepat:';
        }
    }
}

function handleRebid(teamIdx) {
    clearInterval(timerInterval);
    rebidder = teamIdx;
    const team = teams[teamIdx];

    team.gold -= currentBid;

    log(`${team.name} mengambil lemparan soal dengan harga ${currentBid} Gold.`);
    renderScoreboard();

    startReansweringPhase();
}

function cancelRebid() {
    clearInterval(timerInterval);
    log("Tidak ada yang mengambil lemparan soal.");
    activeQuestion.status = 'SOLD';
    finalizeQuestion();
}

// --- Game Logic: Re-Answering ---

function startReansweringPhase() {
    switchView('reanswering');
    document.getElementById('reanswering-team').innerText = teams[rebidder].name;
}

function handleReAnswer(isCorrect) {
    const team = teams[rebidder];
    const modal = document.getElementById('answer-result-modal');
    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const resultPoints = document.getElementById('result-points');

    let pointsGained = 0;

    if (isCorrect) {
        pointsGained = activeQuestion.points * 0.8;
        team.points += pointsGained;
        resultIcon.innerText = '✓';
        resultText.innerText = 'BENAR!';
        resultPoints.innerText = `+${pointsGained.toFixed(1)} Poin`;
        modal.className = 'answer-result-modal success';
        log(`${team.name} menjawab lemparan BENAR! (+${pointsGained.toFixed(1)} Poin)`);
    } else {
        pointsGained = activeQuestion.points;
        team.points -= pointsGained;
        resultIcon.innerText = '✗';
        resultText.innerText = 'SALAH!';
        resultPoints.innerText = `-${pointsGained} Poin`;
        modal.className = 'answer-result-modal failure';
        log(`${team.name} menjawab lemparan SALAH! (-${pointsGained} Poin)`);

        activeQuestion.status = 'SOLD';
    }

    renderScoreboard();
    syncToViewer();

    // Send answer result to viewer
    socket.emit('ANSWER_RESULT', { room: ROOM, isCorrect: isCorrect, pointsGained: pointsGained });
    // Ensure viewers get full sync too
    syncToViewer();

    // Show result modal for 2.5 seconds
    modal.classList.remove('hidden');

    setTimeout(() => {
        modal.classList.add('hidden');
        finalizeQuestion();
    }, 2500);
}

function finishQuestion() {
    // Backwards-compatible wrapper
    finalizeQuestion();
}

function finalizeQuestion() {
    // Handle suspension expiry only when question truly finished
    teams.forEach(team => {
        if (team.suspended) {
            team.suspendedCount--;
            if (team.suspendedCount <= 0) {
                team.suspended = false;
                team.suspendedCount = 0;
                log(`${team.name} telah selesai masa skorsing.`);
            }
        }
    });

    activeQuestion = null;
    currentBid = 0;
    currentBidder = null;
    rebidder = null;

    switchView('board');
    renderBoard();
    renderScoreboard();
    syncToViewer();
}

// --- Game End ---

function finishGame() {
    if (!confirm("Apakah Anda yakin ingin mengakhiri simulasi dan menghitung penalti?")) return;

    log("=== PERHITUNGAN PENALTI SIMULASI ===");

    // Check participation
    teams.forEach(team => {
        let missedCategories = 0;
        CATEGORIES.forEach(cat => {
            if (team.bidHistory[cat] === 0) {
                missedCategories++;
                log(`${team.name} tidak bid di kategori ${cat}.`);
            }
        });

        if (missedCategories > 0) {
            const penalty = missedCategories * 50;
            team.points -= penalty;
            log(`${team.name} terkena penalti -${penalty} Poin (${missedCategories} kategori kosong).`);
        }
    });

    renderScoreboard();
    socket.emit('GAME_FINISHED', { room: ROOM });
    alert("Simulasi Selesai! Cek Log untuk detail penalti.");
}

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', handleKeyboardShortcut);

function handleKeyboardShortcut(event) {
    // Ignore if user is typing in an input field
    if (event.target.tagName === 'INPUT') {
        if (event.key === 'Escape') {
            event.target.blur();
        }
        return;
    }

    const key = event.key.toUpperCase();

    switch (currentPhase) {
        case 'BIDDING':
            handleBiddingShortcut(key, event);
            break;
        case 'ANSWERING':
            handleAnsweringShortcut(key);
            break;
        case 'REBIDDING':
            handleRebiddingShortcut(key, event);
            break;
        case 'REANSWERING':
            handleReansweringShortcut(key);
            break;
    }
}

function handleBiddingShortcut(key, event) {
    // Space to start bidding (if not started yet)
    if (key === ' ' || event.code === 'SPACE') {
        const startBtn = document.getElementById('start-bidding-btn');
        if (startBtn && startBtn.style.display !== 'none') {
            event.preventDefault();
            startBidding();
            return;
        }
    }

    // Numbers 1-5 to place bid for team (only 3 teams in simulation)
    if (key >= '1' && key <= '5') {
        const teamIdx = parseInt(key) - 1;
        if (teamIdx < teams.length && !teams[teamIdx].suspended) {
            placeBid(teamIdx);
        }
        return;
    }

    // Quick bid adjustment
    const inputEl = document.getElementById('bid-input');
    let currentValue = parseInt(inputEl.value) || 0;
    const minBid = parseInt(inputEl.min) || 0;
    const maxBid = parseInt(inputEl.max) || 999;

    if (key === 'PAGEUP') {
        event.preventDefault();
        inputEl.value = maxBid;
        return;
    }

    if (key === 'PAGEDOWN') {
        event.preventDefault();
        inputEl.value = minBid;
        return;
    }

    const step = event.shiftKey ? 25 : 5;

    if (key === '+' || key === '=' || key === 'ARROWUP') {
        event.preventDefault();
        inputEl.value = Math.min(maxBid, currentValue + step);
        return;
    }

    if (key === '-' || key === '_' || key === 'ARROWDOWN') {
        event.preventDefault();
        inputEl.value = Math.max(minBid, currentValue - step);
        return;
    }

    if (key === 'ENTER') {
        inputEl.focus();
        inputEl.select();
        return;
    }

    if (event.key === 'Escape') {
        endBiddingNoWinner();
        return;
    }
}

function handleAnsweringShortcut(key) {
    if (key === 'B') {
        handleAnswer(true);
    } else if (key === 'S') {
        handleAnswer(false);
    }
}

function handleRebiddingShortcut(key, event) {
    // Numbers 1-5 to select team (except original bidder)
    if (key >= '1' && key <= '5') {
        const teamIdx = parseInt(key) - 1;
        if (teamIdx < teams.length &&
            teamIdx !== currentBidder &&
            !teams[teamIdx].suspended &&
            teams[teamIdx].gold >= currentBid) {
            handleRebid(teamIdx);
        }
        return;
    }

    if (event.key === 'Escape') {
        cancelRebid();
        return;
    }
}

function handleReansweringShortcut(key) {
    if (key === 'B') {
        handleReAnswer(true);
    } else if (key === 'S') {
        handleReAnswer(false);
    }
}
function pauseBiddingTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        isBidPaused = true;
        log("⏸️ Bidding dijeda (bid maksimal tercapai).");
    }
}

function resumeBiddingTimer() {
    if (!isBidPaused) return;

    isBidPaused = false;
    log("▶️ Bidding dilanjutkan.");
    startTimer('bid-timer', parseInt(document.getElementById('bid-timer').innerText), endBiddingSuccess);
}
function showResumeBiddingButton() {
    const actionButtons = document.getElementById('bidding-action-buttons');
    if (!actionButtons) return;

    actionButtons.innerHTML = `
        <button onclick="resumeBiddingTimer()" class="success-btn" style="font-size:1.1em; padding:12px 30px;">
            ▶️ Lanjutkan Bidding
        </button>
        <button onclick="proceedToAnswering()" class="primary-btn" style="font-size:1.1em; padding:12px 30px;">
            ⏭️ Langsung Menjawab
        </button>
    `;
}

initImageImport();
