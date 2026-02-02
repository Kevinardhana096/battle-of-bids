// Viewer Script — Socket.IO-based viewer
const CATEGORIES = ['Kombinatorika', 'Aljabar Linear', 'Struktur Aljabar', 'Analisis Riil', 'Analisis Kompleks'];

// Detect simulation viewer mode and choose room
const urlParams = new URLSearchParams(window.location.search);
const isSimulationMode = urlParams.get('mode') === 'simulation';
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

// Update mode badge
const modeBadgeEl = document.getElementById('mode-badge');
if (modeBadgeEl && isSimulationMode) {
    modeBadgeEl.classList.remove('hidden');
    modeBadgeEl.textContent = '🔬 VIEWER SIMULASI';
}

// --- Navigation Functions ---

// Back to start menu (from viewer)
function backToMenu() {
    window.location.href = 'start-menu.html';
}

// Audio context for timer sound effects
const viewerSoundEnabled = true;
let audioContext = null;
let lastTimerValue = null;

// === SLIDE BACKGROUND MUSIC (FADE IN / FADE OUT) ===
let slideAudio = null;
let slideFadeInterval = null;

function playSlideMusic() {
    if (!viewerSoundEnabled) return;

    if (!slideAudio) {
        slideAudio = new Audio('/news-intro-flash-vlog-promo-background-297806.mp3');
        slideAudio.loop = true;
        slideAudio.volume = 0; // start silent for fade-in
    }

    slideAudio.play().catch(err => {
        console.log('Slide audio blocked until user interaction:', err);
        return;
    });

    // FADE IN (2 seconds)
    clearInterval(slideFadeInterval);
    const fadeDuration = 2000; // ms
    const stepTime = 50; // ms per step
    const targetVolume = 0.35;
    const steps = Math.max(1, fadeDuration / stepTime);
    let currentStep = 0;

    slideFadeInterval = setInterval(() => {
        currentStep++;
        slideAudio.volume = Math.min(
            targetVolume,
            (currentStep / steps) * targetVolume
        );

        if (currentStep >= steps) {
            clearInterval(slideFadeInterval);
        }
    }, stepTime);
}

function stopSlideMusic() {
    if (!slideAudio) return;

    // FADE OUT (1.5 seconds)
    clearInterval(slideFadeInterval);
    const fadeDuration = 1500; // ms
    const stepTime = 50; // ms per step
    const steps = Math.max(1, fadeDuration / stepTime);
    let currentStep = 0;
    const startVolume = slideAudio.volume || 0;

    slideFadeInterval = setInterval(() => {
        currentStep++;
        slideAudio.volume = Math.max(
            0,
            startVolume * (1 - currentStep / steps)
        );

        if (currentStep >= steps) {
            clearInterval(slideFadeInterval);
            try {
                slideAudio.pause();
                slideAudio.currentTime = 0;
            } catch (e) {
                console.log('Error stopping slide audio:', e);
            }
        }
    }, stepTime);
}

function initAudioContext() {
    if (!viewerSoundEnabled) {
        return;
    }
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Called once on first user interaction to unlock both WebAudio and HTMLAudio
function handleUserInteraction() {
    try {
        initAudioContext();
        if (audioContext && audioContext.state === 'suspended' && audioContext.resume) {
            audioContext.resume().catch(() => { });
        }
    } catch (e) {
        console.log('AudioContext init/resume error:', e);
    }

    // If viewer is already in PREROUND, start slide music now
    if (currentPhase === 'PREROUND') {
        playSlideMusic();
    }
}

// Play beep sound for timer
function playTimerBeep(frequency = 800, duration = 0.1) {
    if (!viewerSoundEnabled) {
        return;
    }
    initAudioContext();
    try {
        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Nada konsisten: 800 Hz (lebih tinggi untuk terdengar jelas)
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        // Volume lebih besar (0.3 dari max untuk safety)
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);
    } catch (e) {
        console.log('Audio playback error (browser may require user interaction):', e);
    }
}

// Play success sound (ascending beeps) - 3 quick beeps
function playSuccessSound() {
    if (!viewerSoundEnabled) {
        return;
    }
    initAudioContext();
    try {
        const now = audioContext.currentTime;
        const frequencies = [600, 800, 1000]; // Ascending frequencies

        frequencies.forEach((freq, index) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            const startTime = now + (index * 0.15);
            const duration = 0.12;

            gainNode.gain.setValueAtTime(0.4, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        });
    } catch (e) {
        console.log('Success sound error:', e);
    }
}

// Play failure sound (descending beeps) - 3 descending tones
function playFailureSound() {
    if (!viewerSoundEnabled) {
        return;
    }
    initAudioContext();
    try {
        const now = audioContext.currentTime;
        const frequencies = [800, 600, 400]; // Descending frequencies

        frequencies.forEach((freq, index) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            const startTime = now + (index * 0.15);
            const duration = 0.15;

            gainNode.gain.setValueAtTime(0.4, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        });
    } catch (e) {
        console.log('Failure sound error:', e);
    }
}

// Game State (received from host)
let teams = [];
let questions = [];
let currentPhase = 'SETUP';
let activeQuestion = null;
let currentBid = 0;
let currentBidder = null;
let rebidder = null;
let currentSlide = 1;
let totalSlides = 8;

// DOM Elements
const views = {
    setup: document.getElementById('view-setup'),
    preround: document.getElementById('view-preround'),
    board: document.getElementById('view-board'),
    bidding: document.getElementById('view-bidding'),
    answering: document.getElementById('view-answering'),
    rebidding: document.getElementById('view-rebidding'),
    reanswering: document.getElementById('view-reanswering'),
    finished: document.getElementById('view-finished')
};

const scoreboardEl = document.getElementById('scoreboard');
const connectionStatus = document.getElementById('connection-status');
const statusText = document.getElementById('status-text');

if (isSimulationMode && scoreboardEl) {
    scoreboardEl.classList.add('simulation-scoreboard');
}

// Socket.IO client for receiving updates from host
const socket = io();
const ROOM = isSimulationMode ? 'simulation' : 'host';
socket.emit('JOIN_ROOM', ROOM);

socket.on('SYNC_STATE', (data) => { setConnectionStatus(true); handleSyncState(data); });
socket.on('TIMER_UPDATE', (data) => { setConnectionStatus(true); handleTimerUpdate(data); });
socket.on('ANSWER_RESULT', (data) => { setConnectionStatus(true); handleAnswerResult(data); });
socket.on('GAME_FINISHED', () => { setConnectionStatus(true); showFinished(); });
socket.on('SLIDE_CHANGE', (data) => { setConnectionStatus(true); handleSlideChange(data); });
socket.on('BRIEFING_COMPLETE', () => { setConnectionStatus(true); handleBriefingComplete(); });

// Connection status via socket.io connect/disconnect
socket.on('connect', () => setConnectionStatus(true));
socket.on('disconnect', () => setConnectionStatus(false));

function handleSyncState(data) {
    setConnectionStatus(true);
    teams = data.teams || [];
    questions = data.questions || [];
    const prevPhase = currentPhase;
    const newPhase = data.currentPhase || 'SETUP';
    currentPhase = newPhase;
    // Reset timer sound state when phase changes so start-beep triggers
    if (newPhase !== prevPhase) {
        lastTimerValue = null;
    }

    // 🎵 Start/stop slide music when entering/exiting PREROUND
    if (newPhase === 'PREROUND' && prevPhase !== 'PREROUND') {
        playSlideMusic();
    }
    if (prevPhase === 'PREROUND' && newPhase !== 'PREROUND') {
        stopSlideMusic();
    }
    activeQuestion = data.activeQuestion;
    currentBid = data.currentBid || 0;
    currentBidder = data.currentBidder;
    rebidder = data.rebidder;

    // Handle slide state
    if (data.currentSlide !== undefined) {
        currentSlide = data.currentSlide;
    }
    if (data.totalSlides !== undefined) {
        totalSlides = data.totalSlides;
    }

    // Apply host's current timer values if available; otherwise use defaults
    if (data.timerValues) {
        applyHostTimerValues(data.timerValues);
    } else {
        applyPhaseDefaultTimers(currentPhase);
    }

    renderScoreboard();
    updateView();
}

// Handle slide change from host
function handleSlideChange(data) {
    currentSlide = data.currentSlide || 1;
    totalSlides = data.totalSlides || 8;
    updateSlideDisplay();
}

// Handle briefing complete from host
function handleBriefingComplete() {
    // Animate slide out
    const currentSlideEl = document.querySelector('.briefing-slide.active');
    if (currentSlideEl) {
        currentSlideEl.classList.add('exiting');
    }
    // Ensure slide music stops if briefing completes early
    stopSlideMusic();
}

// Update slide display on viewer
function updateSlideDisplay() {
    // Update slide indicator
    const currentEl = document.getElementById('slide-current');
    const totalEl = document.getElementById('slide-total');
    if (currentEl) currentEl.innerText = currentSlide;
    if (totalEl) totalEl.innerText = totalSlides;

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
    renderViewerSlideDots();
}

// Render slide dots for viewer
function renderViewerSlideDots() {
    const dotsContainer = document.getElementById('slide-dots');
    if (!dotsContainer) return;

    dotsContainer.innerHTML = '';
    for (let i = 1; i <= totalSlides; i++) {
        const dot = document.createElement('span');
        dot.className = `slide-dot ${i === currentSlide ? 'active' : ''}`;
        dotsContainer.appendChild(dot);
    }
}

// Apply host's exact timer values to viewer
function applyHostTimerValues(timerValues) {
    if (timerValues['bid-timer']) {
        const el = document.getElementById('bid-timer');
        if (el) el.innerText = timerValues['bid-timer'];
    }
    if (timerValues['answer-timer']) {
        const el = document.getElementById('answer-timer');
        if (el) el.innerText = timerValues['answer-timer'];
    }
    if (timerValues['rebid-timer']) {
        const el = document.getElementById('rebid-timer');
        if (el) el.innerText = timerValues['rebid-timer'];
    }
}

// Make sure timers have sane defaults every time a phase sync occurs (fallback)
function applyPhaseDefaultTimers(phase) {
    const phaseLower = (phase || '').toLowerCase();

    if (phaseLower === 'bidding') {
        const bidTimer = document.getElementById('bid-timer');
        if (bidTimer && (!bidTimer.innerText || parseInt(bidTimer.innerText, 10) <= 0)) {
            bidTimer.innerText = '30';
        }
    }

    if (phaseLower === 'answering') {
        const ansTimer = document.getElementById('answer-timer');
        if (ansTimer && (!ansTimer.innerText || parseInt(ansTimer.innerText, 10) <= 0)) {
            ansTimer.innerText = '180';
        }
    }

    if (phaseLower === 'rebidding') {
        const rebidTimer = document.getElementById('rebid-timer');
        if (rebidTimer && (!rebidTimer.innerText || parseInt(rebidTimer.innerText, 10) <= 0)) {
            rebidTimer.innerText = '10';
        }
    }
}

function handleTimerUpdate(data) {
    setConnectionStatus(true);
    const { elementId, timeLeft } = data;
    const el = document.getElementById(elementId);
    if (el) {
        el.innerText = timeLeft;

        // Add urgency styling when time is low
        if (timeLeft <= 5) {
            el.style.color = 'var(--danger)';
        } else if (timeLeft <= 10) {
            el.style.color = 'var(--warning)';
        } else {
            el.style.color = 'var(--highlight)';
        }

        // 🔊 Viewer-only sound logic (start / per-second / final), guarded to avoid duplicates
        if (viewerSoundEnabled) {
            const isStart = (lastTimerValue === null) || (timeLeft > lastTimerValue);
            const isNewTick = (lastTimerValue === null) || (timeLeft !== lastTimerValue);

            // Start beep (one-time when timer begins or is reset)
            if (isStart) {
                playTimerBeep(500, 0.25);
            }

            // Per-second rhythmic beeps
            if (isNewTick) {
                if (timeLeft > 5 && timeLeft > 0) {
                    playTimerBeep(700, 0.08);
                } else if (timeLeft <= 5 && timeLeft > 0) {
                    playTimerBeep(1000, 0.12);
                }

                // Final sound at 0
                if (timeLeft === 0) {
                    playFailureSound();
                }
            }

            lastTimerValue = timeLeft;
        }
    }
}

function setConnectionStatus(connected) {
    if (connected) {
        connectionStatus.className = 'connection-status connected';
        statusText.innerText = 'Terhubung ke Host';
    } else {
        connectionStatus.className = 'connection-status disconnected';
        statusText.innerText = 'Menunggu Host...';
    }
}

function handleAnswerResult(data) {
    const { isCorrect, pointsGained } = data;
    const modal = document.getElementById('answer-result-modal');
    const resultIcon = document.getElementById('result-icon');
    const resultText = document.getElementById('result-text');
    const resultPoints = document.getElementById('result-points');

    if (isCorrect) {
        resultIcon.innerText = '✓';
        resultText.innerText = 'BENAR!';
        resultPoints.innerText = `+${pointsGained} Poin`;
        modal.className = 'answer-result-modal success';
        playSuccessSound();
    } else {
        resultIcon.innerText = '✗';
        resultText.innerText = 'SALAH!';
        resultPoints.innerText = `-${pointsGained} Poin`;
        modal.className = 'answer-result-modal failure';
        playFailureSound();
    }

    modal.classList.remove('hidden');

    setTimeout(() => {
        modal.classList.add('hidden');
        // RESET VIEWER STATE after answer result to avoid stale answering state
        activeQuestion = null;
        currentBid = 0;
        currentBidder = null;
        rebidder = null;
        // Ensure view updates in case host state is delayed
        updateView();
    }, 2500);
}

function switchView(viewName) {
    Object.values(views).forEach(el => {
        if (el) el.classList.add('hidden');
    });
    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
    }
}

function updateView() {
    const phase = currentPhase.toLowerCase();

    if (phase === 'setup') {
        switchView('setup');
    } else if (phase === 'preround') {
        switchView('preround');
        updateSlideDisplay();
    } else if (phase === 'board') {
        switchView('board');
        renderBoard();
    } else if (phase === 'bidding') {
        switchView('bidding');
        updateBiddingView();
    } else if (phase === 'answering') {
        switchView('answering');
        updateAnsweringView();
    } else if (phase === 'rebidding') {
        switchView('rebidding');
        updateRebiddingView();
    } else if (phase === 'reanswering') {
        switchView('reanswering');
        updateReansweringView();
    }
}

function renderScoreboard() {
    scoreboardEl.innerHTML = '';
    teams.forEach((team, idx) => {
        const div = document.createElement('div');
        div.className = `team-card ${team.suspended ? 'suspended' : ''}`;
        if (currentBidder === idx && currentPhase === 'BIDDING') {
            div.classList.add('active-turn');
        }

        div.innerHTML = `
            <span class="team-name">${team.name}</span>
            <div class="team-stats">
                <span class="stat-gold">Gold: ${team.gold}</span>
                <span class="stat-points">Poin: ${team.points}</span>
            </div>
            ${team.suspended ? '<small style="color:red; font-size: 0.9em;">🚫 DISKORS</small>' : ''}
        `;
        scoreboardEl.appendChild(div);
    });
}

function renderBoard() {
    const grid = document.getElementById('question-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Render questions as a 4x5 grid with numbers (mystery style)
    questions.forEach(q => {
        const btn = document.createElement('button');
        btn.className = `q-btn ${q.status !== 'AVAILABLE' ? 'disabled' : ''}`;

        // Show only number, category/points are hidden until revealed
        btn.innerHTML = `<span class="q-number">${q.displayNumber}</span>`;

        btn.disabled = true; // Viewer can't click
        grid.appendChild(btn);
    });
}

function updateBiddingView() {
    if (!activeQuestion) return;

    document.getElementById('bid-category').innerText = activeQuestion.category;
    document.getElementById('bid-points').innerText = activeQuestion.points;
    document.getElementById('bid-price').innerText = activeQuestion.initialPrice;
    document.getElementById('bid-max-price').innerText = activeQuestion.initialPrice * 5;
    document.getElementById('highest-bid-amount').innerText = currentBid || '0';

    // Display maximum bid (gold of current bidder)
    const maxBidEl = document.getElementById('max-bid-amount');
    if (maxBidEl && currentBidder !== null && teams[currentBidder]) {
        maxBidEl.innerText = teams[currentBidder].gold;
    } else if (maxBidEl) {
        maxBidEl.innerText = '-';
    }

    // Ensure standby timer shows 30s before bidding actually starts
    const bidTimer = document.getElementById('bid-timer');
    if (bidTimer && (!bidTimer.innerText || parseInt(bidTimer.innerText, 10) <= 0)) {
        bidTimer.innerText = '30';
    }

    const bidderName = currentBidder !== null && teams[currentBidder]
        ? teams[currentBidder].name
        : '-';
    document.getElementById('highest-bidder-name').innerText = bidderName;
}

function updateAnsweringView() {
    if (currentBidder !== null && teams[currentBidder]) {
        document.getElementById('answering-team').innerText = teams[currentBidder].name;
    }

    // Display question info (category and points)
    if (activeQuestion) {
        const categoryEl = document.getElementById('answering-category');
        const pointsEl = document.getElementById('answering-points');
        if (categoryEl) categoryEl.innerText = activeQuestion.category;
        if (pointsEl) pointsEl.innerText = activeQuestion.points;
    }

    // Display question image
    if (activeQuestion) {
        const questionImg = document.getElementById('question-image-viewer');
        if (questionImg) {
            questionImg.alt = `Soal ${activeQuestion.category} - ${activeQuestion.points} Poin`;
            setQuestionImageWithFallback(questionImg, activeQuestion.category, activeQuestion.points, isSimulationMode);
        }
    }
}

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


function updateRebiddingView() {
    document.getElementById('rebid-price').innerText = currentBid;
}

function updateReansweringView() {
    if (rebidder !== null && teams[rebidder]) {
        document.getElementById('reanswering-team').innerText = teams[rebidder].name;
    }
}

function showFinished() {
    switchView('finished');
    renderScoreboard();
}

// Initial connection attempt
setConnectionStatus(false);
console.log('Viewer initialized. Waiting for host connection...');
