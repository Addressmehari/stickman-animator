/**
 * Stickman Animation Application
 * Handles Logic, Rendering, and State Management
 */

// --- Constants & Config ---
const CONFIG = {
    pointRadius: 6,
    selectionRadius: 15,
    skeletonColor: '#3b82f6', // Neon Blue
    junctionColor: '#ffffff',
    onionSkinColor: 'rgba(255, 255, 255, 0.2)',
    maxFPS: 60
};

// --- Initial Data ---
// 12-Point Rig Hierarchy
const SKELETON_HIERARCHY = {
    // ID: { parent: ParentID or null, children: [ChildIDs] }
    0: { id: 0, name: 'head', parent: 1 },
    1: { id: 1, name: 'neck', parent: 2 },
    2: { id: 2, name: 'spine_mid', parent: 6 },
    3: { id: 3, name: 'l_elbow', parent: 1 },
    4: { id: 4, name: 'l_hand', parent: 3 },
    5: { id: 5, name: 'r_elbow', parent: 1 },
    6: { id: 6, name: 'r_hand', parent: 5 },
    7: { id: 7, name: 'spine_pelvis', parent: null }, // ROOT
    8: { id: 7, name: 'l_knee', parent: 7 }, // Fixed parent from 8 to 7 based on hierarchy logic
    9: { id: 8, name: 'l_foot', parent: 8 },
    10: { id: 7, name: 'r_knee', parent: 7 }, // Fixed parent
    11: { id: 10, name: 'r_foot', parent: 10 }
};

// Connections for Drawing
const CONNECTIONS = [
    [0, 1], // Head -> Neck
    [1, 2], // Neck -> SpineMid
    [2, 7], // SpineMid -> Pelvis
    [1, 3], // Neck -> LElbow
    [3, 4], // LElbow -> LHand
    [1, 5], // Neck -> RElbow
    [5, 6], // RElbow -> RHand
    [7, 8], // Pelvis -> LKnee
    [8, 9], // LKnee -> LFoot
    [7, 10], // Pelvis -> RKnee
    [10, 11] // RKnee -> RFoot
];

// Map for Parenting Logic (Child Index -> Parent Index)
const PARENT_MAP = {
    0: 1, 1: 2, 2: 7, 
    3: 1, 4: 3,
    5: 1, 6: 5,
    7: null,
    8: 7, 9: 8,
    10: 7, 11: 10
};

// Initial T-Pose Coordinates (relative to 800x600 canvas center)
function getInitialPose() {
    return [
        { id: 0, x: 400, y: 180 }, // Head
        { id: 1, x: 400, y: 230 }, // Neck
        { id: 2, x: 400, y: 280 }, // SpineMid
        { id: 3, x: 350, y: 230 }, // LElbow
        { id: 4, x: 300, y: 230 }, // LHand
        { id: 5, x: 450, y: 230 }, // RElbow
        { id: 6, x: 500, y: 230 }, // RHand
        { id: 7, x: 400, y: 330 }, // Pelvis
        { id: 8, x: 370, y: 400 }, // LKnee
        { id: 9, x: 370, y: 470 }, // LFoot
        { id: 10, x: 430, y: 400 }, // RKnee
        { id: 11, x: 430, y: 470 }  // RFoot
    ];
}

// --- Audio Engine (Procedural Sound) ---
const AudioEngine = {
    ctx: null,
    
    init: function() {
        // User interaction required to start AudioContext
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch(e) {
            console.warn('Web Audio API not supported');
        }
    },

    playPaperScuff: function(intensity = 1.0) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const t = this.ctx.currentTime;
        
        // Brown/Pink Noise for "Paper" texture
        const bufferSize = this.ctx.sampleRate * 0.15; // 150ms
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        
        for (let i = 0; i < bufferSize; i++) {
            // Simple Brown Noise approximation
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5; // Gain up
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        // Filter to make it sound like paper
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400 + Math.random() * 400; // Vary frequency
        filter.Q.value = 1;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }
};

// --- Application State ---
const State = {
    frames: [
        {
            id: 1,
            duration: 0.5,
            points: getInitialPose()
        },
        {
            id: 2,
            duration: 0.5,
            points: getInitialPose() 
        }
    ],
    currentFrameIndex: 0,
    isPlaying: false,
    draggedPointIndex: null,
    isOnionSkinEnabled: true,
    lastFrameTime: 0,
    playStartTime: 0,
    playCurrentGlobalTime: 0,
    playLastScuffTime: 0 // Track sound triggers
};

// --- DOM Elements ---
const canvas = document.getElementById('anim-canvas');
const ctx = canvas.getContext('2d');
const timelineTrack = document.getElementById('timeline-track');
const frameNumDisplay = document.getElementById('current-frame-num');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnExport = document.getElementById('btn-export');
const btnAddFrame = document.getElementById('btn-add-frame');
const btnDeleteFrame = document.getElementById('btn-delete-frame'); // New Button
const exportModal = document.getElementById('export-modal');
const exportOutput = document.getElementById('export-output');
const closeModalBtn = document.querySelector('.close-modal');
const btnCopy = document.getElementById('btn-copy');
const chkOnionSkin = document.getElementById('chk-onion-skin');

// --- Initialization ---
function init() {
    renderTimeline();
    updateUIControls(); // Initial check
    draw();
    setupEventListeners();
}

// --- Event Listeners ---
function setupEventListeners() {
    // Canvas Interaction
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    // Controls
    btnPlay.addEventListener('click', startPlayback);
    btnStop.addEventListener('click', stopPlayback);
    btnAddFrame.addEventListener('click', addNewFrame);
    
    // Global Delete Button
    btnDeleteFrame.addEventListener('click', () => {
        deleteFrame(State.currentFrameIndex);
    });
    
    chkOnionSkin.addEventListener('change', (e) => {
        State.isOnionSkinEnabled = e.target.checked;
        if (!State.isPlaying) draw();
    });

    // Export
    btnExport.addEventListener('click', showExportModal);
    closeModalBtn.addEventListener('click', () => exportModal.classList.add('hidden'));
    btnCopy.addEventListener('click', () => {
        exportOutput.select();
        document.execCommand('copy');
        btnCopy.textContent = "Copied!";
        setTimeout(() => btnCopy.textContent = "Copy to Clipboard", 2000);
    });
}

// --- Canvas Logic ---
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function handleMouseDown(e) {
    if (State.isPlaying) return;
    const pos = getMousePos(e);
    const frame = State.frames[State.currentFrameIndex];
    
    // Find clicked point 
    for (let i = 0; i < frame.points.length; i++) {
        const p = frame.points[i];
        const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
        if (dist <= CONFIG.selectionRadius) {
            State.draggedPointIndex = i;
            break;
        }
    }
}

function handleMouseMove(e) {
    if (State.isPlaying) return;
    const pos = getMousePos(e);

    if (State.draggedPointIndex !== null) {
        const frame = State.frames[State.currentFrameIndex];
        const pointIndex = State.draggedPointIndex;
        const point = frame.points[pointIndex];
        
        const dx = pos.x - point.x;
        const dy = pos.y - point.y;
        
        point.x = pos.x;
        point.y = pos.y;
        
        moveChildren(pointIndex, dx, dy, frame.points);
        
        draw();
    } else {
        // Hover Cursor
        const frame = State.frames[State.currentFrameIndex];
        let hovering = false;
        for (let p of frame.points) {
            const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
            if (dist <= CONFIG.selectionRadius) {
                hovering = true;
                break;
            }
        }
        canvas.style.cursor = hovering ? 'pointer' : 'crosshair';
    }
}

function handleMouseUp() {
    if (State.draggedPointIndex !== null) {
        State.draggedPointIndex = null;
        renderTimeline(); // Re-render thumbnails after edit
    }
}

function moveChildren(parentId, dx, dy, points) {
    for (let i = 0; i < points.length; i++) {
        if (PARENT_MAP[i] === parentId) {
            points[i].x += dx;
            points[i].y += dy;
            moveChildren(i, dx, dy, points);
        }
    }
}

// --- Drawing ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Use clearRect

    if (State.isPlaying) {
        // Render Interpolated Frame with Jitter
        // Pass 'true' for isPlaying to enable Jitter
        drawStickman(ctx, getCurrentInterpolatedPose(), CONFIG.skeletonColor, 1, 1, 0, 0, true);
        
        // Audio Trigger Logic
        // Trigger a scuff sound every ~150-200ms during movement
        if (State.playCurrentGlobalTime - State.playLastScuffTime > 0.15) {
             // Only play if there is significant movement (optional, but keep simple for now)
             AudioEngine.playPaperScuff(Math.random() * 0.5 + 0.5);
             State.playLastScuffTime = State.playCurrentGlobalTime;
        }

    } else {
        if (State.isOnionSkinEnabled && State.currentFrameIndex > 0) {
            const prevFrame = State.frames[State.currentFrameIndex - 1];
            // Static, no jitter
            drawStickman(ctx, prevFrame.points, CONFIG.onionSkinColor, 0.4, 1, 0, 0, false);
        }
        // Static Frame
        drawStickman(ctx, State.frames[State.currentFrameIndex].points, CONFIG.skeletonColor, 1, 1, 0, 0, false);
    }
}

// Updated drawStickman with Jitter/Hand-Drawn Effect
function drawStickman(context, points, color, opacity, scale = 1, offsetX = 0, offsetY = 0, useJitter = false) {
    context.globalAlpha = opacity;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    context.beginPath();
    context.strokeStyle = color;
    
    // Vary line width slightly for hand-drawn feel
    const baseWidth = Math.max(1.5, 4 * scale);
    context.lineWidth = useJitter ? baseWidth + (Math.random() - 0.5) : baseWidth;
    
    CONNECTIONS.forEach(([startIndex, endIndex]) => {
        let start = points[startIndex];
        let end = points[endIndex];
        
        // Apply Scribble/Jitter
        // We calculate 'rendered' positions
        let sx = start.x * scale + offsetX;
        let sy = start.y * scale + offsetY;
        let ex = end.x * scale + offsetX;
        let ey = end.y * scale + offsetY;

        if (useJitter) {
            sx += (Math.random() - 0.5) * 3;
            sy += (Math.random() - 0.5) * 3;
            ex += (Math.random() - 0.5) * 3;
            ey += (Math.random() - 0.5) * 3;
        }

        context.moveTo(sx, sy);
        // Add a slight curve control point for "imperfect" lines? 
        // For now, straight lines with endpoint jitter is effective enough for "Stickman" style.
        context.lineTo(ex, ey);
    });
    context.stroke();

    if (scale === 1) { 
        points.forEach(p => {
            context.beginPath();
            context.fillStyle = CONFIG.junctionColor;
            
            let px = p.x;
            let py = p.y;
            
            if (useJitter) {
                px += (Math.random() - 0.5) * 2;
                py += (Math.random() - 0.5) * 2;
            }

            context.arc(px, py, CONFIG.pointRadius, 0, Math.PI * 2);
            context.fill();
        });
    }

    context.globalAlpha = 1.0;
}

// --- Timeline & Frames ---
function renderTimeline() {
    timelineTrack.innerHTML = '';
    
    State.frames.forEach((frame, index) => {
        // 1. Frame Unit Container
        const frameUnit = document.createElement('div');
        frameUnit.className = 'frame-unit';

        // 2. Frame Card
        const card = document.createElement('div');
        card.className = `frame-card ${index === State.currentFrameIndex ? 'active' : ''}`;
        card.onclick = () => selectFrame(index);

        // Thumbnail
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 60;
        thumbCanvas.height = 80;
        const thumbCtx = thumbCanvas.getContext('2d');
        // Simple scale down: 800x600 -> 60x45 roughly (fit in 60x80)
        // Scale factor: 60/800 = 0.075
        drawStickman(thumbCtx, frame.points, '#000', 1, 0.075, 0, 10); 

        const num = document.createElement('div');
        num.className = 'frame-num';
        num.textContent = index + 1;

        card.appendChild(thumbCanvas);
        card.appendChild(num);
        
        // Delete Button (if > 1 frame)
        if (State.frames.length > 1) {
            const delBtn = document.createElement('div');
            delBtn.className = 'delete-frame';
            delBtn.innerHTML = '&times;';
            delBtn.title = "Delete Frame";
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteFrame(index);
            };
            frameUnit.appendChild(delBtn);
        }

        frameUnit.appendChild(card);
        timelineTrack.appendChild(frameUnit);

        // 3. Interpolator (if not last frame)
        if (index < State.frames.length - 1) {
            const interp = document.createElement('div');
            interp.className = 'interpolator';

            const tag = document.createElement('span');
            tag.className = 'duration-tag';
            tag.textContent = frame.duration + 's';

            const range = document.createElement('input');
            range.type = 'range';
            range.min = '0.1';
            range.max = '3.0';
            range.step = '0.1';
            range.value = frame.duration;
            range.title = `Access Transition Time: ${frame.duration}s`;
            range.oninput = (e) => {
                const val = parseFloat(e.target.value);
                frame.duration = val;
                tag.textContent = val + 's';
            };

            interp.appendChild(tag);
            interp.appendChild(range);
            timelineTrack.appendChild(interp);
        }
    });
    
    // Update Global Delete Button Visibility
    updateUIControls();

    // 4. Add Frame Placeholder at the end
    const addBtn = document.createElement('div');
    addBtn.className = 'add-frame-div';
    addBtn.innerHTML = '+';
    addBtn.onclick = addNewFrame;
    timelineTrack.appendChild(addBtn);
}

function updateUIControls() {
    if (State.frames.length > 1) {
        btnDeleteFrame.style.display = 'inline-flex';
    } else {
        btnDeleteFrame.style.display = 'none';
    }
}

function selectFrame(index) {
    if (State.isPlaying) return;
    State.currentFrameIndex = index;
    frameNumDisplay.textContent = index + 1;
    // Only update active class to avoid full re-render lag
    Array.from(document.querySelectorAll('.frame-card')).forEach((el, i) => {
        if(i === index) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    // Also scroll the timeline to keep selection in view
    // Not strictly necessary but good for UX
    
    draw();
}

function addNewFrame() {
    const currentPoints = State.frames[State.currentFrameIndex].points;
    const newPoints = JSON.parse(JSON.stringify(currentPoints));
    
    const newFrame = {
        id: Date.now(),
        duration: 0.5,
        points: newPoints
    };

    State.frames.splice(State.currentFrameIndex + 1, 0, newFrame);
    State.currentFrameIndex++;
    renderTimeline();
    updateUIControls();
    draw();
}

function deleteFrame(index) {
    if (State.frames.length <= 1) return; // Prevention
    
    State.frames.splice(index, 1);
    if (State.currentFrameIndex >= State.frames.length) {
        State.currentFrameIndex = State.frames.length - 1;
    }
    renderTimeline();
    updateUIControls();
    draw();
}

// --- Playback Logic ---
function startPlayback() {
    AudioEngine.init(); // Initialize audio on first user gesture
    State.isPlaying = true;
    State.playStartTime = performance.now();
    State.playCurrentGlobalTime = 0;
    State.playLastScuffTime = 0;
    
    btnPlay.classList.add('hidden');
    btnStop.classList.remove('hidden');
    requestAnimationFrame(playbackLoop);
}

function stopPlayback() {
    State.isPlaying = false;
    btnPlay.classList.remove('hidden');
    btnStop.classList.add('hidden');
    draw();
}

function playbackLoop(timestamp) {
    if (!State.isPlaying) return;

    let totalDuration = 0;
    for (let i = 0; i < State.frames.length - 1; i++) {
        totalDuration += State.frames[i].duration;
    }
    
    let elapsed = (timestamp - State.playStartTime) / 1000;
    
    if (elapsed > totalDuration) {
        State.playStartTime = timestamp; // Loop
        elapsed = 0;
    }

    State.playCurrentGlobalTime = elapsed;
    draw();
    requestAnimationFrame(playbackLoop);
}

function getCurrentInterpolatedPose() {
    let timeAccumulator = 0;
    
    for (let i = 0; i < State.frames.length - 1; i++) {
        const frameDuration = State.frames[i].duration;
        
        if (State.playCurrentGlobalTime >= timeAccumulator && State.playCurrentGlobalTime < timeAccumulator + frameDuration) {
            const timeInFrame = State.playCurrentGlobalTime - timeAccumulator;
            const t = timeInFrame / frameDuration; 
            
            // Apply Easing (Smooth Physics-like feel)
            // Using EaseInOutCubic for natural acceleration/deceleration
            const easedT = EasingFunctions.easeInOutCubic(t);
            
            return interpolatePoints(State.frames[i].points, State.frames[i+1].points, easedT);
        }
        timeAccumulator += frameDuration;
    }
    return State.frames[State.frames.length - 1].points;
}

const EasingFunctions = {
    linear: t => t,
    // Smooth start and end (Natural)
    easeInOutCubic: t => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    // Spring-like overshoot (Optional, using cubic for now as it's cleaner)
    easeOutBack: t => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
};

function interpolatePoints(pointsA, pointsB, t) {
    return pointsA.map((pA, index) => {
        const pB = pointsB[index];
        return {
            id: pA.id,
            x: pA.x + (pB.x - pA.x) * t,
            y: pA.y + (pB.y - pA.y) * t
        };
    });
}

// --- Export ---
function showExportModal() {
    const exportData = {
        animationName: "my_stickman_anim",
        frames: State.frames.map((f, i) => ({
            frameId: i + 1,
            durationToNext: (i < State.frames.length - 1) ? f.duration : 0,
            points: f.points
        }))
    };
    exportOutput.value = JSON.stringify(exportData, null, 2);
    exportModal.classList.remove('hidden');
}

// Start
init();
