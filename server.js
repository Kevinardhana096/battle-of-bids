const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const TARGETS_ASLI = [
    'Kombinatorika_5', 'Kombinatorika_10', 'Kombinatorika_15', 'Kombinatorika_25',
    'Struktur_Aljabar_5', 'Struktur_Aljabar_10', 'Struktur_Aljabar_15', 'Struktur_Aljabar_25',
    'Analisis_Riil_5', 'Analisis_Riil_10', 'Analisis_Riil_15', 'Analisis_Riil_25',
    'Aljabar_Linear_5', 'Aljabar_Linear_10', 'Aljabar_Linear_15', 'Aljabar_Linear_25',
    'Analisis_Kompleks_5', 'Analisis_Kompleks_10', 'Analisis_Kompleks_15', 'Analisis_Kompleks_25'
];
const TARGETS_SIM = [
    'sim_Kombinatorika_5', 'sim_Kombinatorika_10', 'sim_Kombinatorika_15',
    'sim_Kombinatorika_20', 'sim_Kombinatorika_25'
];

const storage = multer.memoryStorage();
const upload = multer({ storage });

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getFolder(isSimulation) {
    return path.join(__dirname, isSimulation ? 'Gambar Soal Simulasi' : 'Gambar Soal Asli');
}

function normalizeExt(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext) ? ext : '.jpg';
}

function countImages(folderPath) {
    if (!fs.existsSync(folderPath)) return 0;
    return fs.readdirSync(folderPath).filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())).length;
}

function clearImages(folderPath) {
    if (!fs.existsSync(folderPath)) return 0;
    let removed = 0;
    fs.readdirSync(folderPath).forEach((file) => {
        const ext = path.extname(file).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
            fs.unlinkSync(path.join(folderPath, file));
            removed += 1;
        }
    });
    return removed;
}

async function handleUpload(req, res, isSimulation) {
    const files = req.files || [];
    const targets = isSimulation ? TARGETS_SIM : TARGETS_ASLI;
    const folderPath = getFolder(isSimulation);
    ensureDir(folderPath);

    let saved = 0;
    let skipped = 0;
    const savedFiles = [];

    files.forEach((file, index) => {
        if (!file || index >= targets.length) {
            skipped += 1;
            return;
        }

        const ext = normalizeExt(file.originalname);
        const filename = `${targets[index]}${ext}`;
        const targetPath = path.join(folderPath, filename);
        fs.writeFileSync(targetPath, file.buffer);
        saved += 1;
        savedFiles.push(filename);
    });

    if (files.length > targets.length) {
        skipped += files.length - targets.length;
    }

    res.json({
        ok: true,
        saved,
        skipped,
        files: savedFiles,
        counts: {
            asli: countImages(getFolder(false)),
            sim: countImages(getFolder(true))
        }
    });
}

app.use(express.static(__dirname));

// Serve image folders explicitly to avoid 404s when browser requests image URLs
app.use('/images/asli', express.static(path.join(__dirname, 'Gambar Soal Asli')));
app.use('/images/sim', express.static(path.join(__dirname, 'Gambar Soal Simulasi')));

// Debug: log whether image folders and counts exist (helps diagnose 404s)
console.log('Image folder (asli) exists:', fs.existsSync(path.join(__dirname, 'Gambar Soal Asli')));
console.log('Image folder (sim) exists:', fs.existsSync(path.join(__dirname, 'Gambar Soal Simulasi')));
console.log('Image counts:', { asli: countImages(getFolder(false)), sim: countImages(getFolder(true)) });

// Image resolver endpoint: try known extensions on the server and serve the first match
app.get('/image/:mode/:name', (req, res) => {
    try {
        const { mode, name } = req.params || {};
        const folder = mode === 'sim' ? 'Gambar Soal Simulasi' : 'Gambar Soal Asli';
        const exts = ['.png', '.jpg', '.jpeg', '.webp'];

        for (const ext of exts) {
            const filePath = path.join(__dirname, folder, `${name}${ext}`);
            if (fs.existsSync(filePath)) {
                return res.sendFile(filePath);
            }
        }

        return res.status(404).send('Image not found');
    } catch (err) {
        console.error('Error in /image resolver:', err);
        return res.status(500).send('Server error');
    }
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Room join support
    socket.on('JOIN_ROOM', (room) => {
        if (typeof room === 'string') {
            socket.join(room);
            console.log(`Socket ${socket.id} joined room ${room}`);
        }
    });

    socket.on('HOST_STATE', (payload) => {
        const { room, ...data } = payload || {};
        if (room) {
            socket.to(room).emit('SYNC_STATE', data);
        } else {
            socket.broadcast.emit('SYNC_STATE', data);
        }
    });

    socket.on('TIMER_UPDATE', (payload) => {
        const { room, ...data } = payload || {};
        if (room) {
            socket.to(room).emit('TIMER_UPDATE', data);
        } else {
            socket.broadcast.emit('TIMER_UPDATE', data);
        }
    });

    socket.on('SLIDE_CHANGE', (payload) => {
        const { room, ...data } = payload || {};
        if (room) {
            socket.to(room).emit('SLIDE_CHANGE', data);
        } else {
            socket.broadcast.emit('SLIDE_CHANGE', data);
        }
    });

    socket.on('BRIEFING_COMPLETE', (payload) => {
        const room = payload && payload.room;
        if (room) socket.to(room).emit('BRIEFING_COMPLETE');
        else socket.broadcast.emit('BRIEFING_COMPLETE');
    });

    // Room-aware relays for auxiliary events
    socket.on('HEARTBEAT', (payload) => {
        const room = payload && payload.room;
        if (room) socket.to(room).emit('HEARTBEAT', payload || {});
        else socket.broadcast.emit('HEARTBEAT', payload || {});
    });

    socket.on('VIEWER_CONNECTED', (payload) => {
        const room = payload && payload.room;
        if (room) socket.to(room).emit('VIEWER_CONNECTED', payload || {});
        else socket.broadcast.emit('VIEWER_CONNECTED', payload || {});
    });

    socket.on('SYNC_REQUEST', (payload) => {
        const room = payload && payload.room;
        if (room) socket.to(room).emit('SYNC_REQUEST', payload || {});
        else socket.broadcast.emit('SYNC_REQUEST', payload || {});
    });

    socket.on('ANSWER_RESULT', (payload) => {
        const room = payload && payload.room;
        if (room) socket.to(room).emit('ANSWER_RESULT', payload || {});
        else socket.broadcast.emit('ANSWER_RESULT', payload || {});
    });

    socket.on('GAME_FINISHED', (payload) => {
        const room = payload && payload.room;
        if (room) socket.to(room).emit('GAME_FINISHED', payload || {});
        else socket.broadcast.emit('GAME_FINISHED', payload || {});
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

app.post('/upload/asli', upload.array('images'), (req, res) => {
    handleUpload(req, res, false).catch((err) => {
        console.error(err);
        res.status(500).json({ ok: false, error: 'Upload gagal.' });
    });
});

app.post('/upload/sim', upload.array('images'), (req, res) => {
    handleUpload(req, res, true).catch((err) => {
        console.error(err);
        res.status(500).json({ ok: false, error: 'Upload gagal.' });
    });
});

app.post('/upload/single', upload.single('image'), (req, res) => {
    try {
        const mode = req.body.mode === 'sim' ? 'sim' : 'asli';
        const target = req.body.target || '';
        const targets = mode === 'sim' ? TARGETS_SIM : TARGETS_ASLI;
        if (!targets.includes(target)) {
            res.status(400).json({ ok: false, error: 'Target tidak valid.' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ ok: false, error: 'File tidak ditemukan.' });
            return;
        }

        const folderPath = getFolder(mode === 'sim');
        ensureDir(folderPath);
        const ext = normalizeExt(req.file.originalname);
        const filename = `${target}${ext}`;
        const targetPath = path.join(folderPath, filename);
        fs.writeFileSync(targetPath, req.file.buffer);

        res.json({
            ok: true,
            filename,
            counts: {
                asli: countImages(getFolder(false)),
                sim: countImages(getFolder(true))
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: 'Upload gagal.' });
    }
});

app.get('/counts', (req, res) => {
    res.json({
        ok: true,
        counts: {
            asli: countImages(getFolder(false)),
            sim: countImages(getFolder(true))
        }
    });
});

app.post('/clear/all', (req, res) => {
    const removedAsli = clearImages(getFolder(false));
    const removedSim = clearImages(getFolder(true));
    res.json({
        ok: true,
        removed: { asli: removedAsli, sim: removedSim },
        counts: { asli: 0, sim: 0 }
    });
});

// NOTE: using `server.listen` above for Socket.IO + Express
// Keep routes attached to `app` but server is started via `server.listen`
