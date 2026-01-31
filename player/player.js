const canvas = document.getElementById('player-canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('file-input');
const btnImport = document.getElementById('btn-import');
const btnPlayPause = document.getElementById('btn-play-pause');
const scrubber = document.getElementById('scrubber');
const timeDisplay = document.getElementById('time-display');
const startOverlay = document.getElementById('start-overlay');
const loadingOverlay = document.getElementById('loading-overlay');

// Config
const CONFIG = {
    skeletonColor: '#3b82f6',
    junctionColor: '#ffffff',
    pointRadius: 6,
    baseWidth: 4
};

// Connections (Same as Editor)
const CONNECTIONS = [
    [0, 1], [1, 2], [2, 7], [1, 3], [3, 4], 
    [1, 5], [5, 6], [7, 8], [8, 9], [7, 10], [10, 11]
];

// State
let animationData = null;
let isPlaying = false;
let startTime = 0;
let currentTime = 0;
let animationDuration = 0;
let requestID = null;
let lastDrawTime = 0;

// Init
btnImport.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    startOverlay.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target.result);
            loadAnimation(json);
        } catch (err) {
            console.error(err);
            alert("Invalid JSON file");
            loadingOverlay.classList.add('hidden');
            startOverlay.classList.remove('hidden');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

function loadAnimation(data) {
    // Prefer bakedAnimation for smooth playback
    if (!data.bakedAnimation || !Array.isArray(data.bakedAnimation)) {
        alert("This file doesn't contain baked animation data. Please re-export from the editor.");
        loadingOverlay.classList.add('hidden');
        return;
    }

    animationData = data.bakedAnimation;
    // Calculate total duration from last frame
    const lastFrame = animationData[animationData.length - 1];
    animationDuration = lastFrame ? lastFrame.time : 0;
    
    // Fallback to meta duration if available
    if (data.meta && data.meta.totalDuration) {
        animationDuration = data.meta.totalDuration;
    }

    // Reset State
    stop();
    currentTime = 0;
    updateScrubberUI();
    
    // Enable Controls
    btnPlayPause.disabled = false;
    scrubber.disabled = false;
    scrubber.max = animationDuration;
    
    loadingOverlay.classList.add('hidden');
    
    // Draw first frame
    drawFrameAtTime(0);
}

// Playback Logic
btnPlayPause.addEventListener('click', () => {
    if (isPlaying) pause();
    else play();
});

scrubber.addEventListener('input', (e) => {
    pause();
    currentTime = parseFloat(e.target.value);
    drawFrameAtTime(currentTime);
    updateScrubberUI();
});

function play() {
    if (!animationData) return;
    isPlaying = true;
    btnPlayPause.textContent = "⏸"; // Pause Icon
    lastDrawTime = performance.now();
    
    // Handle replay if at end
    if (currentTime >= animationDuration) {
        currentTime = 0;
    }
    
    requestID = requestAnimationFrame(loop);
}

function pause() {
    isPlaying = false;
    btnPlayPause.textContent = "▶";
    if (requestID) cancelAnimationFrame(requestID);
}

function stop() {
    pause();
    currentTime = 0;
    updateScrubberUI();
}

function loop(timestamp) {
    if (!isPlaying) return;

    const delta = (timestamp - lastDrawTime) / 1000;
    lastDrawTime = timestamp;

    currentTime += delta;

    if (currentTime >= animationDuration) {
        currentTime = 0; // Loop
    }

    drawFrameAtTime(currentTime);
    updateScrubberUI();
    
    requestID = requestAnimationFrame(loop);
}

function updateScrubberUI() {
    scrubber.value = currentTime;
    timeDisplay.textContent = `${currentTime.toFixed(2)} / ${animationDuration.toFixed(2)}`;
}

// Rendering
function drawFrameAtTime(time) {
    if (!animationData) return;

    // Find the closest frame in bakedAnimation
    // Since bakedAnimation is sorted by time, we can find the first frame > time
    // For "Play as it is", nearest neighbor or simple linear search is fine for 30fps data
    
    // Optimization: If frames are evenly spaced (30fps), we could calculate index.
    // Index = Math.floor(time * 30);
    // Let's iterate to be safe.
    
    let frame = animationData[0];
    for (let i = 0; i < animationData.length; i++) {
        if (animationData[i].time >= time) {
            frame = animationData[i];
            break;
        }
    }
    
    if (frame) {
        drawStickman(frame.points);
    }
}

function drawStickman(points) {
    // Clear
    // Maintain aspect ratio scaling if canvas size differs from 800x600?
    // For now assuming 1:1 map since saved coords are absolute pixels.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Map points by ID for easy connection lookup
    const pointMap = {};
    points.forEach(p => pointMap[p.id] = p);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CONFIG.skeletonColor;
    ctx.lineWidth = CONFIG.baseWidth;

    // Draw Connections
    ctx.beginPath();
    CONNECTIONS.forEach(([startId, endId]) => {
        const p1 = pointMap[startId];
        const p2 = pointMap[endId];
        if (p1 && p2) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
    });
    ctx.stroke();

    // Draw Joints
    ctx.fillStyle = CONFIG.junctionColor;
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, CONFIG.pointRadius, 0, Math.PI * 2);
        ctx.fill();
    });
}
