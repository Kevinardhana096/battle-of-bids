const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
const ROOM = process.env.ROOM || 'host';

console.log(`Connecting to ${URL}, room=${ROOM}`);

const socket = io(URL, { transports: ['websocket'], reconnectionAttempts: 5, timeout: 3000 });

socket.on('connect', () => {
    console.log('Connected as', socket.id);
    socket.emit('JOIN_ROOM', ROOM);

    // Send HOST_STATE to trigger PREROUND -> viewer should play slide music
    const hostState = {
        room: ROOM,
        currentPhase: 'PREROUND',
        currentSlide: 1,
        totalSlides: 5,
        timerValues: {
            'bid-timer': '30',
            'answer-timer': '180',
            'rebid-timer': '10'
        }
    };

    console.log('Emitting HOST_STATE (PREROUND)');
    socket.emit('HOST_STATE', hostState);

    // After a short delay, simulate starting a 10-second timer (TIMER_UPDATE every second)
    setTimeout(() => {
        console.log('Starting simulated timer (10s)');
        let t = 10;
        const interval = setInterval(() => {
            socket.emit('TIMER_UPDATE', { room: ROOM, elementId: 'bid-timer', timeLeft: t });
            t--;
            if (t < 0) {
                clearInterval(interval);
                console.log('Timer finished; emitting HOST_STATE to switch to BOARD');
                socket.emit('HOST_STATE', { room: ROOM, currentPhase: 'BOARD', currentSlide: 1, totalSlides: 5 });
                socket.disconnect();
            }
        }, 1000);
    }, 2200); // wait for slide fade-in (~2s)
});

socket.on('connect_error', (err) => {
    console.error('Connect error:', err.message);
    process.exit(1);
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
});
