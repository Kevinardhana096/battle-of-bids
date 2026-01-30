// Game Configuration
const CATEGORIES = ['Kombinatorika', 'Aljabar Linear', 'Struktur Aljabar', 'Analisis Riil', 'Analisis Kompleks'];
const POINTS = [5, 10, 15, 25];
const INITIAL_GOLD = 700;
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
let isTimerPaused = false;
let pausedTimeLeft = 0;
// Slide state
let currentSlide = 1;
const TOTAL_SLIDES = 8;

// Socket.IO client for syncing with viewers
const socket = io(); // Socket.IO client
const ROOM = 'host';
socket.emit('JOIN_ROOM', ROOM);

// Note: Socket.IO handles reconnection and handshakes. Host will call
// `syncToViewer()` when application state changes to push updates to viewers.

// Sync state to viewer (emit to server which will broadcast to viewers)
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
        currentSlide: typeof currentSlide !== 'undefined' ? currentSlide : 1,
        totalSlides: typeof TOTAL_SLIDES !== 'undefined' ? TOTAL_SLIDES : 8
    }));
}

// Send timer update to viewer via server
function syncTimerToViewer(elementId, timeLeft) {
    socket.emit('TIMER_UPDATE', { room: ROOM, elementId, timeLeft });
}

// Broadcast any message to viewers
function broadcastToViewers(type, data) {
    socket.emit(type, Object.assign({ room: ROOM }, data || {}));
}

// DOM Elements
const views = {
    setup: document.getElementById('view-setup'),
    preround: document.getElementById('view-preround'),
    board: document.getElementById('view-board'),
    bidding: document.getElementById('view-bidding'),
    answering: document.getElementById('view-answering'),
    rebidding: document.getElementById('view-rebidding'),
    reanswering: document.getElementById('view-reanswering')
};

const scoreboardEl = document.getElementById('scoreboard');
const logListEl = document.getElementById('log-list');

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

// --- Initialization ---

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function initGame() {
    // Generate Questions
    questions = [];
    CATEGORIES.forEach((cat) => {
        POINTS.forEach((pts) => {
            questions.push({
                category: cat,
                points: pts,
                initialPrice: pts, // Price equals base points
                status: 'AVAILABLE', // AVAILABLE, SOLD, DISCARDED
                winner: null,
                revealed: false // Track if category/points have been revealed
            });
        });
    });

    // Shuffle questions randomly
    shuffleArray(questions);

    // Assign display numbers 1-20
    questions.forEach((q, idx) => {
        q.id = idx + 1;
        q.displayNumber = idx + 1;
    });
}

// --- Pre-Round Briefing Slides ---
function initSlides() {
    currentSlide = 1;
    updateSlideDisplay();
    renderSlideDots();
}

function renderSlideDots() {
    const dotsContainer = document.getElementById('slide-dots');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = '';
    for (let i = 1; i <= TOTAL_SLIDES; i++) {
        const dot = document.createElement('span');
        dot.className = `slide-dot ${i === currentSlide ? 'active' : ''}`;
        dot.onclick = () => goToSlide(i);
        dotsContainer.appendChild(dot);
    }
}

function updateSlideDisplay() {
    // Update slide indicator
    const currentEl = document.getElementById('slide-current');
    const totalEl = document.getElementById('slide-total');
    if (currentEl) currentEl.innerText = currentSlide;
    if (totalEl) totalEl.innerText = TOTAL_SLIDES;

    // Update slides visibility with animation
    const slides = document.querySelectorAll('.briefing-slide');
    slides.forEach((slide, idx) => {
        const slideNum = idx + 1;
        if (slideNum === currentSlide) {
            slide.classList.remove('exiting');
            slide.classList.add('active');
            // Re-trigger card animations
            const cards = slide.querySelectorAll('.info-card, .points-grid');
            cards.forEach(card => {
                card.style.animation = 'none';
                card.offsetHeight; // Trigger reflow
                card.style.animation = '';
            });
        } else {
            slide.classList.remove('active');
            slide.classList.add('exiting');
            setTimeout(() => {
                if (slideNum !== currentSlide) {
                    slide.classList.remove('exiting');
                }
            }, 500);
        }
    });

    // Update dots
    const dots = document.querySelectorAll('.slide-dot');
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx + 1 === currentSlide);
    });

    // Update navigation buttons
    const prevBtn = document.getElementById('prev-slide-btn');
    const nextBtn = document.getElementById('next-slide-btn');

    if (prevBtn) {
        prevBtn.disabled = currentSlide === 1;
    }

    if (nextBtn) {
        if (currentSlide === TOTAL_SLIDES) {
            nextBtn.innerText = '▶️ Mulai Lomba';
            nextBtn.classList.add('primary');
        } else {
            nextBtn.innerText = 'Selanjutnya →';
            nextBtn.classList.remove('primary');
        }
    }

    // Broadcast slide change to viewers
    broadcastToViewers('SLIDE_CHANGE', { currentSlide, totalSlides: TOTAL_SLIDES });
}

function nextSlide() {
    if (currentSlide < TOTAL_SLIDES) {
        currentSlide++;
        updateSlideDisplay();
    } else {
        // Last slide - transition to question board
        finishBriefing();
    }
}

function prevSlide() {
    if (currentSlide > 1) {
        currentSlide--;
        updateSlideDisplay();
    }
}

function goToSlide(slideNum) {
    if (slideNum >= 1 && slideNum <= TOTAL_SLIDES) {
        currentSlide = slideNum;
        updateSlideDisplay();
    }
}

function finishBriefing() {
    // Animate slide out
    const currentSlideEl = document.querySelector('.briefing-slide.active');
    if (currentSlideEl) {
        currentSlideEl.classList.add('exiting');
    }

    // Broadcast to viewers that briefing is complete
    broadcastToViewers('BRIEFING_COMPLETE', {});

    // Transition to question board after brief delay
    setTimeout(() => {
        switchView('board');
        renderBoard();
        log("Penjelasan Battle of Bids selesai. Papan soal siap!");
    }, 500);
}

function startGame() {
    // Initialize Teams
    teams = [];
    for (let i = 1; i <= 5; i++) {
        const name = document.getElementById(`team${i}-name`).value || `Tim ${i}`;
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

    // Show pre-round briefing slides first
    initSlides();
    switchView('preround');
    renderScoreboard();
    log("Menampilkan penjelasan Battle of Bids...");
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

    console.log('=== renderBoard called ===');
    grid.innerHTML = '';

    // Render questions as a 4x5 grid with numbers only (mystery style)
    questions.forEach((q, index) => {
        const btn = document.createElement('button');
        const isAvailable = q.status === 'AVAILABLE';

        btn.className = `q-btn ${!isAvailable ? 'disabled' : ''}`;
        btn.innerHTML = `<span class="q-number">${q.displayNumber}</span>`;
        btn.type = 'button'; // Explicitly set button type

        if (!isAvailable) {
            btn.disabled = true;
            btn.style.pointerEvents = 'none'; // Extra protection
        } else {
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';

            // Use addEventListener instead of onclick for better reliability
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Question #${q.displayNumber} clicked`);
                selectQuestion(q);
            });

            // Backup: also set onclick
            btn.onclick = () => {
                console.log(`Question #${q.displayNumber} onclick fired`);
                selectQuestion(q);
            };
        }

        grid.appendChild(btn);

        // Log first 3 for debugging
        if (index < 3) {
            console.log(`Q#${q.displayNumber}: status=${q.status}, disabled=${btn.disabled}, clickable=${isAvailable}`);
        }
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

    // NOTE: Do NOT decrement suspension here — suspensions expire AFTER the question
    // has been fully resolved. Rendering scoreboard is still useful to show suspended
    // status during bidding.
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

    // Setup Bid Buttons
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
    updateTimerButtons();
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
    // Defensive: ensure currentBidder exists and is not suspended
    if (currentBidder === null || typeof teams[currentBidder] === 'undefined') {
        log('startAnswering dipanggil tanpa currentBidder yang valid.');
        return;
    }

    const team = teams[currentBidder];
    if (team.suspended) {
        log(`${team.name} diskors — answering dibatalkan.`);
        setupRebiddingPhase();
        return;
    }

    showPreAnsweringState(false);
    log(`${team.name} mulai menjawab soal!`);
    startTimer('answer-timer', 180, endAnsweringTime);
    updateTimerButtons();
}

// Called when answering timer ends - show waiting state for operator to judge answer
function endAnsweringTime() {
    clearInterval(timerInterval);
    timerInterval = null;
    isTimerPaused = false;
    log("Waktu menjawab habis. Operator bisa menilai jawaban.");
    showAnsweringWaitingState();
    updateTimerButtons();
}

// Show waiting state after answering timer ends
function showAnsweringWaitingState() {
    const answeringControls = document.getElementById('answering-controls');
    if (answeringControls) {
        // Keep controls visible for operator to judge
        answeringControls.style.display = 'block';

        // Update button text to reflect time's up
        const buttons = answeringControls.querySelectorAll('button');
        if (buttons.length >= 2) {
            buttons[0].innerText = 'Jawaban Benar';
            buttons[1].innerText = 'Waktu Habis - Jawaban Salah / Tidak Menjawab';
        }
    }
}

// --- Game Logic: Bidding ---

// Host audio disabled — sound moved to Viewer (per competition rules)
// All Host-side audio functions removed to keep Host silent.


function startTimer(elementId, seconds, callback, isResume = false) {
    if (timerInterval) clearInterval(timerInterval);
    let timeLeft = isResume ? seconds : seconds;
    document.getElementById(elementId).innerText = timeLeft;
    syncTimerToViewer(elementId, timeLeft);

    isTimerPaused = false; // Reset pause state

    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById(elementId).innerText = timeLeft;
        syncTimerToViewer(elementId, timeLeft);

        // Host remains silent; viewers will handle audio playback.

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (callback) callback();
        }
    }, 1000);
}

function pauseTimer() {
    if (timerInterval && !isTimerPaused) {
        clearInterval(timerInterval);
        timerInterval = null;
        isTimerPaused = true;
        const timerElementId = currentPhase === 'BIDDING' ? 'bid-timer' : 'answer-timer';
        pausedTimeLeft = parseInt(document.getElementById(timerElementId).innerText);
        log(`Timer ${currentPhase.toLowerCase()} dijeda pada ${pausedTimeLeft} detik.`);
        syncToViewer();
        updateTimerButtons();
    }
}

function resumeTimer() {
    if (isTimerPaused) {
        const timerElementId = currentPhase === 'BIDDING' ? 'bid-timer' : 'answer-timer';
        const callback = currentPhase === 'BIDDING' ? endBiddingSuccess : endAnsweringTime;
        startTimer(timerElementId, pausedTimeLeft, callback, true);
        log(`Timer ${currentPhase.toLowerCase()} dilanjutkan dari ${pausedTimeLeft} detik.`);
        updateTimerButtons();
    }
}

function updateTimerButtons() {
    const isBidding = currentPhase === 'BIDDING';
    const pauseId = isBidding ? 'pause-timer-btn' : 'pause-timer-answering-btn';
    const resumeId = isBidding ? 'resume-timer-btn' : 'resume-timer-answering-btn';

    const pauseBtn = document.getElementById(pauseId);
    const resumeBtn = document.getElementById(resumeId);

    if (pauseBtn && resumeBtn) {
        if (isTimerPaused) {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'inline-block';
        } else if (timerInterval) {
            pauseBtn.style.display = 'inline-block';
            resumeBtn.style.display = 'none';
        } else {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'none';
        }
    }
}

function placeBid(teamIdx) {
    const team = teams[teamIdx];
    const inputEl = document.getElementById('bid-input');
    let amount = parseInt(inputEl.value);

    // Prevent suspended teams from bidding
    if (team.suspended) {
        log(`${team.name} sedang DISKORS dan tidak boleh bidding.`);
        alert(`${team.name} sedang DISKORS dan tidak boleh bidding.`);
        return;
    }
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

    // Rule 8: Min increment 5 (must be higher than current bid)
    // Exception: First bid must be at least initial price? 
    // Rule 5: "Setiap soal dibuka dengan harga awal". So first bid >= initialPrice.
    // Rule 8: "Kenaikan minimal setiap bid adalah 5 gold".
    let minBid = (currentBid === 0) ? activeQuestion.initialPrice : currentBid + 5;

    if (amount < minBid) {
        alert(`Bid minimal adalah ${minBid} Gold!`);
        return;
    }

    // Rule 8: Max 5x initial price
    let maxBid = activeQuestion.initialPrice * 5;
    if (amount > maxBid) {
        alert(`Bid maksimal adalah ${maxBid} Gold (5x Harga Awal)!`);
        return;
    }

    // Rule 9: Check Balance
    if (amount > team.gold) {
        alert("Saldo Gold tidak mencukupi!");
        return;
    }

    // Check if this is a late bid (after timer ended)
    const isLateBid = currentBidder === null;

    // Valid Bid - First restore the bid info HTML if it was replaced
    restoreCurrentBidInfoHTML();

    currentBid = amount;
    currentBidder = teamIdx;

    // Rule 10: Track participation
    team.bidHistory[activeQuestion.category]++;

    // Check if bid reaches maximum - stop bidding immediately
    if (amount === maxBid) {
        clearInterval(timerInterval);
        timerInterval = null;
        log(`Bid maksimal tercapai oleh ${team.name}. Bidding dihentikan.`);
        endBiddingSuccess();
        return; // Exit early, no need for further processing
    }

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
        return; // Don't auto-increment, wait for operator to click proceed button
    }

    // Auto-increment input for next bid
    let nextBid = currentBid + 5;
    if (nextBid <= maxBid) {
        inputEl.value = nextBid;
    } else {
        inputEl.value = maxBid;
    }
    inputEl.min = nextBid; // Enforce new min
}

// Function to restore original current-bid-info HTML
function restoreCurrentBidInfoHTML() {
    const currentBidInfo = document.querySelector('.current-bid-info');
    if (currentBidInfo) {
        // Check if elements are missing (HTML was replaced)
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

    // Hide timer buttons
    const pauseBtn = document.getElementById('pause-timer-btn');
    const resumeBtn = document.getElementById('resume-timer-btn');
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';
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

    // Note: gold already deducted in endBiddingSuccess
    // Defensive: ensure the current bidder is not suspended (operator might click wrong)
    const team = teams[currentBidder];
    if (team && team.suspended) {
        log(`${team.name} sedang DISKORS dan tidak boleh menjawab.`);
        setupRebiddingPhase();
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
            // Remove old content and add proceed button
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

    // If the winner is suspended, do not allow answering — throw (rebid)
    if (winner.suspended) {
        log(`${winner.name} sedang DISKORS dan tidak boleh menjawab soal ini. Melakukan pelemparan ulang.`);
        setupRebiddingPhase();
        return;
    }

    // If the winner is suspended, do not allow answering — throw (rebid)
    if (winner.suspended) {
        log(`${winner.name} sedang DISKORS dan tidak boleh menjawab soal ini. Melakukan pelemparan ulang.`);
        setupRebiddingPhase();
        return;
    }

    // Rule 17: Deduct Gold
    winner.gold -= currentBid;
    activeQuestion.winner = currentBidder;

    log(`${winner.name} memenangkan bidding (bid terlambat) dengan ${currentBid} Gold!`);
    renderScoreboard();

    setupAnsweringPhase();
    startAnswering();
}

function endBiddingSuccess() {
    isTimerPaused = false;
    updateTimerButtons();

    if (currentBidder === null) {
        // No one bid - show waiting state with manual return button
        showNoBidderWaitingState();
    } else {
        // We have a winner
        const winner = teams[currentBidder];

        // If the winner is suspended, do not allow answering — throw (rebid)
        if (winner.suspended) {
            log(`${winner.name} sedang DISKORS dan tidak boleh menjawab soal ini. Melakukan pelemparan ulang.`);
            setupRebiddingPhase();
            return;
        }

        // Rule 17: Deduct Gold
        winner.gold -= currentBid;
        activeQuestion.winner = currentBidder;

        log(`${winner.name} memenangkan bidding dengan ${currentBid} Gold!`);
        renderScoreboard();

        // Update panel info to inform operator
        const currentBidInfo = document.querySelector('.current-bid-info');
        if (currentBidInfo) {
            currentBidInfo.innerHTML = `
                <p>✅ Bidding selesai.</p>
                <p>Pemenang: <b>${winner.name}</b> dengan ${currentBid} Gold.</p>
                <p>Tekan "Lanjut ke Fase Menjawab" untuk mulai.</p>
            `;
        }

        // Show manual proceed button (no auto start)
        showProceedToAnsweringButton();
    }
}

function showNoBidderWaitingState() {
    // Keep bidding controls visible - GM can still accept late bids
    const bidControls = document.getElementById('bidding-controls');
    if (bidControls) bidControls.style.display = 'block';

    // Update current bid info to show time's up message and return button
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
    isTimerPaused = false;

    // Rule 24: -5 points for all teams
    teams.forEach(t => t.points -= 5);

    // Mark question as discarded
    if (activeQuestion) {
        activeQuestion.status = 'DISCARDED';
        console.log(`Question #${activeQuestion.displayNumber} marked as DISCARDED`);
    }

    log("Tidak ada penawar. Semua tim -5 poin. Soal hangus.");
    renderScoreboard();

    // Mark question as discarded and finalize lifecycle
    finalizeQuestion();
}

// --- Game Logic: Answering ---

function buildImagePath(category, points, ext = 'jpg', isSimulation = false) {
    if (!category || points === undefined) return 'question_placeholder.svg';
    const safeCategory = category.trim().replace(/\s+/g, '_');
    const baseName = isSimulation ? `sim_${safeCategory}_${points}` : `${safeCategory}_${points}`;
    const basePath = isSimulation ? '/image/sim' : '/image/asli';
    return `${basePath}/${baseName}`;
}

function getQuestionImageSource(category, points, isSimulation = false) {
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

function setQuestionImageWithFallback(img, category, points, isSimulation = false) {
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
    // Defensive checks: ensure there is a current bidder and they are not suspended
    if (currentBidder === null || typeof teams[currentBidder] === 'undefined') {
        log('Tidak ada pemenang saat ini untuk memasuki fase menjawab.');
        return;
    }

    const team = teams[currentBidder];
    if (team.suspended) {
        log(`${team.name} sedang DISKORS dan tidak boleh menjawab soal ini.`);
        setupRebiddingPhase();
        return;
    }

    switchView('answering');
    document.getElementById('answering-team').innerText = team.name;
    document.getElementById('answer-timer').innerText = '180';

    // Set question image based on category and points
    if (activeQuestion) {
        const questionImg = document.getElementById('question-image');
        if (questionImg) {
            questionImg.alt = `Soal ${activeQuestion.category} - ${activeQuestion.points} Poin`;
            setQuestionImageWithFallback(questionImg, activeQuestion.category, activeQuestion.points, false);
        }
    }

    syncToViewer();
}

function handleAnswer(isCorrect) {
    clearInterval(timerInterval);
    timerInterval = null;
    isTimerPaused = false;
    showAnsweringControls(false); // Hide buttons during result display

    const team = teams[currentBidder];
    const modal = document.getElementById('answer-result-modal');
    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const resultPoints = document.getElementById('result-points');

    let pointsGained = 0;
    let resultMessage = '';

    if (isCorrect) {
        // Rule 20: +Base Points
        pointsGained = activeQuestion.points;
        team.points += pointsGained;
        resultIcon.innerText = '✓';
        resultText.innerText = 'BENAR!';
        resultPoints.innerText = `+${pointsGained} Poin`;
        modal.className = 'answer-result-modal success';
        log(`${team.name} menjawab BENAR! (+${pointsGained} Poin)`);

        // Rule 25 Logic: Reset streak
        team.consecutiveWrongStreak = 0;

        // Reset other teams streak
        teams.forEach((t, idx) => {
            if (idx !== currentBidder) t.consecutiveWrongStreak = 0;
        });

        activeQuestion.status = 'SOLD';
        activeQuestion.answeredCorrectly = true;
    } else {
        // Rule 20: -Base Points
        pointsGained = activeQuestion.points;
        team.points -= pointsGained;
        resultIcon.innerText = '✗';
        resultText.innerText = 'SALAH!';
        resultPoints.innerText = `-${pointsGained} Poin`;
        modal.className = 'answer-result-modal failure';
        log(`${team.name} menjawab SALAH/TIDAK MENJAWAB! (-${pointsGained} Poin)`);

        // Rule 25 Logic: Increment streak
        team.consecutiveWrongStreak++;
        if (team.consecutiveWrongStreak >= 3) {
            team.suspended = true;
            team.suspendedCount = 2; // Suspend for 2 questions (current and next)
            log(`${team.name} telah salah 3x berturut-turut setelah menang bid. DISKORS 2 SOAL!`);
        }

        // Reset other teams streak
        teams.forEach((t, idx) => {
            if (idx !== currentBidder) t.consecutiveWrongStreak = 0;
        });

        // Mark question as SOLD (hangus) even though answered wrong - goes to rebidding
        activeQuestion.status = 'SOLD';
    }

    renderScoreboard();
    syncToViewer();

    // Send answer result to viewer via server
    socket.emit('ANSWER_RESULT', { room: ROOM, isCorrect: isCorrect, pointsGained: pointsGained });
    // Force a full state sync to viewers to keep UI in sync (defensive)
    syncToViewer();

    // Show result modal for 2.5 seconds
    modal.classList.remove('hidden');

    setTimeout(() => {
        modal.classList.add('hidden');

        // Proceed to next phase
        if (isCorrect) {
            finalizeQuestion();
        } else {
            // Rule 21: Throw (Re-bid)
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
    document.getElementById('rebid-price').innerText = currentBid; // Rule 22: Same price
    document.getElementById('rebid-timer').innerText = '10'; // Reset timer display
    showPreRebiddingState(true);

    const btnContainer = document.getElementById('rebid-team-buttons');
    btnContainer.innerHTML = '';

    teams.forEach((team, idx) => {
        // Original winner cannot re-bid
        if (idx !== currentBidder && !team.suspended) {
            const btn = document.createElement('button');
            btn.innerText = team.name;
            btn.onclick = () => handleRebid(idx);
            // Check if they have enough gold? Rule 22 says "Jumlah bid sama".
            // Assuming they must pay that amount.
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

// Called when rebidding timer ends - show waiting state for operator to pick team
function endRebiddingTime() {
    clearInterval(timerInterval);
    log("Waktu pelemparan habis. Operator bisa memilih tim.");
    showRebiddingWaitingState();
}

// Show waiting state after rebidding timer ends
function showRebiddingWaitingState() {
    const rebidControls = document.getElementById('rebidding-controls');
    if (rebidControls) {
        // Keep controls visible for operator to manually select team
        rebidControls.style.display = 'block';

        // Update message to show time's up
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

    // Deduct Gold? Rule 17 says "Gold yang diajukan dipotong". 
    // Rule 22 says "Jumlah bid sama". Assuming deduction happens.
    team.gold -= currentBid;

    log(`${team.name} mengambil lemparan soal dengan harga ${currentBid} Gold.`);
    renderScoreboard();

    startReansweringPhase();
}

function cancelRebid() {
    clearInterval(timerInterval);
    log("Tidak ada yang mengambil lemparan soal.");
    // Mark question as SOLD (hangus) since no one took the throw
    activeQuestion.status = 'SOLD';
    finalizeQuestion();
}

// --- Game Logic: Re-Answering ---

function startReansweringPhase() {
    switchView('reanswering');
    document.getElementById('reanswering-team').innerText = teams[rebidder].name;
    // No specific timer mentioned for answering throw? Assuming immediate or same 3 mins?
    // Rule 19 says "waktu menjawab 3 menit". Rule 22 doesn't specify new time.
    // Usually throws are quick. Let's give 3 minutes to be safe or manual control.
    // I'll not set a timer auto-fail here to allow GM control, or reuse 3 mins.
}

function handleReAnswer(isCorrect) {
    const team = teams[rebidder];
    const modal = document.getElementById('answer-result-modal');
    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const resultPoints = document.getElementById('result-points');

    let pointsGained = 0;

    if (isCorrect) {
        // Rule 23: +80% Base Points
        pointsGained = activeQuestion.points * 0.8;
        team.points += pointsGained;
        resultIcon.innerText = '✓';
        resultText.innerText = 'BENAR!';
        resultPoints.innerText = `+${pointsGained.toFixed(1)} Poin`;
        modal.className = 'answer-result-modal success';
        log(`${team.name} menjawab lemparan BENAR! (+${pointsGained.toFixed(1)} Poin)`);
    } else {
        // Rule 23: -100% Base Points
        pointsGained = activeQuestion.points;
        team.points -= pointsGained;
        resultIcon.innerText = '✗';
        resultText.innerText = 'SALAH!';
        resultPoints.innerText = `-${pointsGained} Poin`;
        modal.className = 'answer-result-modal failure';
        log(`${team.name} menjawab lemparan SALAH! (-${pointsGained} Poin)`);

        // Mark question as SOLD (hangus) since re-answer is wrong
        activeQuestion.status = 'SOLD';
    }

    renderScoreboard();
    syncToViewer();

    // Send answer result to viewer via server
    socket.emit('ANSWER_RESULT', { room: ROOM, isCorrect: isCorrect, pointsGained: pointsGained });
    // Force a full state sync to viewers to keep UI in sync (defensive)
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

// Finalize the lifecycle of the current question: called only when the question
// is fully resolved (SOLD or DISCARDED) and we are about to return to the board.
function finalizeQuestion() {
    // === HANDLE SUSPENSION EXPIRY ===
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

    // Reset state for next question
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
    if (!confirm("Apakah Anda yakin ingin mengakhiri permainan dan menghitung penalti?")) return;

    log("=== PERHITUNGAN PENALTI ===");

    // Rule 10: Check participation
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
    alert("Permainan Selesai! Cek Log untuk detail penalti.");
}

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', handleKeyboardShortcut);

function handleKeyboardShortcut(event) {
    // Ignore if user is typing in an input field
    if (event.target.tagName === 'INPUT') {
        // Only handle special keys in input
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

    // Numbers 1-5 to place bid for team
    if (key >= '1' && key <= '5') {
        const teamIdx = parseInt(key) - 1;
        if (teamIdx < teams.length && !teams[teamIdx].suspended) {
            placeBid(teamIdx);
        }
        return;
    }

    // Quick bid adjustment with constraints
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

    // Large increment with Shift
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

    // Enter to focus input
    if (key === 'ENTER') {
        inputEl.focus();
        inputEl.select();
        return;
    }

    // Escape for no winner
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

    // Escape to cancel rebid
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

initImageImport();