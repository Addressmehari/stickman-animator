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
    selectedPointIndex: null,
    isIKEnabled: false,
    ikDragData: null,
    background: null,
    isDraggingBg: false,
    isOnionSkinEnabled: true,
    lastFrameTime: 0,
    playStartTime: 0,
    playCurrentGlobalTime: 0,
    playbackMode: 'loop' // 'loop', 'pingpong', 'once'
};

// --- History System (Undo/Redo) ---
const History = {
    stack: [],
    redoStack: [],
    maxSize: 50,
    
    // Helper to create a deep copy of current state
    _createSnapshot: function() {
        const framesCopy = JSON.parse(JSON.stringify(State.frames));
        
        // Clone Background Props
        let bgCopy = null;
        if (State.background) {
            bgCopy = { ...State.background };
        }

        return {
            frames: framesCopy,
            currentFrameIndex: State.currentFrameIndex,
            background: bgCopy,
            selectedPointIndex: State.selectedPointIndex
        };
    },

    saveState: function() {
        const snapshot = this._createSnapshot();

        this.stack.push(snapshot);
        if (this.stack.length > this.maxSize) this.stack.shift();
        
        // Clear redo stack on new action path
        this.redoStack = [];
    },

    undo: function() {
        if (this.stack.length === 0) return;
        
        // Save 'Future' state to Redo Stack before going back
        const currentSnapshot = this._createSnapshot();
        this.redoStack.push(currentSnapshot);
        
        const snapshot = this.stack.pop();
        this.restore(snapshot);
    },

    redo: function() {
        if (this.redoStack.length === 0) return;

        // Save 'Past' state to Undo Stack before going forward
        const currentSnapshot = this._createSnapshot();
        this.stack.push(currentSnapshot);

        const snapshot = this.redoStack.pop();
        this.restore(snapshot);
    },

    restore: function(snapshot) {
        // Restore Data
        State.frames = snapshot.frames; // These are deep copies, so safe
        State.currentFrameIndex = snapshot.currentFrameIndex;
        State.selectedPointIndex = snapshot.selectedPointIndex;
        
        // Restore Background
        if (snapshot.background) {
            State.background = snapshot.background;
        } else {
            State.background = null;
        }

        // Update UI
        if (State.selectedPointIndex !== null) {
            panelProperties.classList.remove('hidden');
            const p = State.frames[State.currentFrameIndex].points[State.selectedPointIndex];
            selectEasing.value = p.easing || 'easeInOutCubic';
            
            const chkPassthrough = document.getElementById('point-passthrough');
            if (chkPassthrough) chkPassthrough.checked = !!p.isIgnored;
            
        } else {
            panelProperties.classList.add('hidden');
        }

        renderTimeline();
        updateUIControls();
        frameNumDisplay.textContent = State.currentFrameIndex + 1;
        draw();
    }
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
// const btnCopy = document.getElementById('btn-copy'); // Removed
const chkOnionSkin = document.getElementById('chk-onion-skin');

// New Property Panel Elements
const panelProperties = document.getElementById('point-properties');
const selectEasing = document.getElementById('point-easing');
const selectPlaybackMode = document.getElementById('select-playback-mode');
const chkPassthrough = document.getElementById('point-passthrough');

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

    canvas.addEventListener('touchstart', handleMouseDown, { passive: false });
    canvas.addEventListener('touchmove', handleMouseMove, { passive: false });
    canvas.addEventListener('touchend', handleMouseUp);
    canvas.addEventListener('touchcancel', handleMouseUp);

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

    if (selectPlaybackMode) {
        selectPlaybackMode.addEventListener('change', (e) => {
            State.playbackMode = e.target.value;
        });
    }

    // Property Panel Inputs
    selectEasing.addEventListener('change', (e) => {
        if (State.selectedPointIndex !== null && State.frames[State.currentFrameIndex]) {
            History.saveState();
            const point = State.frames[State.currentFrameIndex].points[State.selectedPointIndex];
            point.easing = e.target.value;
        }
    });

    if (chkPassthrough) {
        chkPassthrough.addEventListener('change', (e) => {
             if (State.selectedPointIndex !== null && State.frames[State.currentFrameIndex]) {
                History.saveState();
                const point = State.frames[State.currentFrameIndex].points[State.selectedPointIndex];
                point.isIgnored = e.target.checked;
                draw();
            }
        });
    }

    // Video/GIF Export (Placeholder for future)
    btnExport.addEventListener('click', showExportModal);
    closeModalBtn.addEventListener('click', () => exportModal.classList.add('hidden'));
    
    // Import JSON
    const btnImport = document.getElementById('btn-import');
    const fileImport = document.getElementById('file-import');

    btnImport.addEventListener('click', () => fileImport.click());

    fileImport.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.keyframes && Array.isArray(data.keyframes)) {
                    loadProject(data.keyframes);
                } else if (Array.isArray(data)) {
                     // Support raw array format if user edited it extensively
                     loadProject(data);
                } else {
                    alert('Invalid JSON file. Missing "keyframes" array.');
                }
            } catch (err) {
                console.error(err);
                alert('Error parsing JSON file. Check console for details.');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset so same file can be selected again
    });

    // Download JSON
    const btnDownload = document.getElementById('btn-download');
    const inputExportName = document.getElementById('export-name');

    btnDownload.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(exportOutput.value);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        
        // Determine filename
        let fileName = inputExportName.value.trim();
        if (!fileName) fileName = "animation";
        if (!fileName.toLowerCase().endsWith('.json')) fileName += ".json";
        
        downloadAnchorNode.setAttribute("download", fileName);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    // IK Toggle
    const chkIK = document.getElementById('chk-ik-mode');
    if (chkIK) {
        chkIK.addEventListener('change', (e) => {
            State.isIKEnabled = e.target.checked;
            console.log("IK Enabled:", State.isIKEnabled);
        });
    }

    // Rotoscoping Controls
    const btnUploadBg = document.getElementById('btn-upload-bg');
    const fileBg = document.getElementById('file-bg');
    const btnClearBg = document.getElementById('btn-clear-bg');
    const divBgSettings = document.getElementById('bg-settings');
    const rngBgOpacity = document.getElementById('rng-bg-opacity');
    const lblBgOpacity = document.getElementById('bg-opacity-val');
    const chkEditBg = document.getElementById('chk-edit-bg');
    const rngBgScale = document.getElementById('rng-bg-scale');
    const lblBgScale = document.getElementById('bg-scale-val');

    if (btnUploadBg && fileBg) {
        btnUploadBg.addEventListener('click', () => fileBg.click());

        fileBg.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const url = URL.createObjectURL(file);
            const type = file.type.startsWith('video') ? 'video' : 'image';
            
            let media;
            if (type === 'video') {
                media = document.createElement('video');
                media.src = url;
                media.muted = true; 
                media.loop = true; 
                media.onloadedmetadata = () => draw();
            } else {
                media = new Image();
                media.src = url;
                media.onload = () => draw();
            }
            
            History.saveState();
            State.background = {
                media: media,
                type: type,
                opacity: 0.5,
                url: url,
                x: 0,
                y: 0,
                scale: 1.0
            };
            
            // UI
            divBgSettings.classList.remove('hidden');
            btnClearBg.classList.remove('hidden');
            btnUploadBg.textContent = "Change Media"; 
            if(chkEditBg) chkEditBg.checked = false; 
            
            // Reset Scale Slider
            if(rngBgScale) {
                rngBgScale.value = 1.0;
                lblBgScale.textContent = "1.0x";
            }
        });
    }
    
    // Scale Slider Listener
    if (rngBgScale) {
        rngBgScale.addEventListener('mousedown', () => History.saveState()); // Save before slide
        rngBgScale.addEventListener('input', (e) => {
            if (State.background) {
                State.background.scale = parseFloat(e.target.value);
                lblBgScale.textContent = State.background.scale.toFixed(1) + 'x';
                draw();
            }
        });
    }

    if (rngBgOpacity) {
        rngBgOpacity.addEventListener('mousedown', () => History.saveState()); // Save before slide
        rngBgOpacity.addEventListener('input', (e) => {
            if (State.background) {
                State.background.opacity = parseFloat(e.target.value);
                lblBgOpacity.textContent = Math.round(State.background.opacity * 100) + '%';
                draw();
            }
        });
    }

    if (btnClearBg) {
        btnClearBg.addEventListener('click', () => {
             // ... same as before
            History.saveState();
            if (State.background && State.background.url) {
                // URL.revokeObjectURL(State.background.url); // Commented out to allow Undo to restore image
            }
            State.background = null;
            divBgSettings.classList.add('hidden');
            btnClearBg.classList.add('hidden');
            btnUploadBg.textContent = "📂 Load Media";
            fileBg.value = '';
            draw();
        });
    }

    // Wheel Event for Scaling Background
    canvas.addEventListener('wheel', (e) => {
        if (State.background && chkEditBg && chkEditBg.checked) {
             // Throttling or saving on first move would be ideal, 
             // but for now let's just not SPAM history. 
             // Maybe we only save if > 1s since last save? 
             // For simplicity in this iteration, we skip auto-save on wheel-zoom 
             // to avoid popping the stack 100 times. User can use Slider for undoable zoom.
            e.preventDefault();
            const zoomSpeed = 0.1;
            const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
            State.background.scale = Math.max(0.1, State.background.scale + delta);
            
            // Sync Slider
            if (rngBgScale) {
                rngBgScale.value = State.background.scale;
                lblBgScale.textContent = State.background.scale.toFixed(1) + 'x';
            }
            
            draw();
        }
    });

    // --- Keyboard Shortcuts ---
    window.addEventListener('keydown', (e) => {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        switch(e.key) {
            case ' ':
                e.preventDefault();
                if (State.isPlaying) stopPlayback();
                else startPlayback();
                break;
            case 'ArrowLeft':
                if (!State.isPlaying && State.currentFrameIndex > 0) {
                    selectFrame(State.currentFrameIndex - 1);
                }
                break;
            case 'ArrowRight':
                if (!State.isPlaying && State.currentFrameIndex < State.frames.length - 1) {
                    selectFrame(State.currentFrameIndex + 1);
                }
                break;
            case 'n':
            case 'N':
                addNewFrame();
                break;
            case 'Delete':
            case 'Backspace':
                deleteFrame(State.currentFrameIndex);
                break;
            case 'z':
            case 'Z':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        History.redo(); // Ctrl+Shift+Z
                    } else {
                        History.undo(); // Ctrl+Z
                    }
                }
                break;
            case 'y':
            case 'Y':
                 // Ctrl+Y (Redo)
                 if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    History.redo();
                 }
                 break;
            case 'p':
            case 'P':
                // Hotkey for Passthrough
                if (State.selectedPointIndex !== null && !State.isPlaying) {
                     History.saveState();
                     const chkPassthrough = document.getElementById('point-passthrough');
                     const point = State.frames[State.currentFrameIndex].points[State.selectedPointIndex];
                     point.isIgnored = !point.isIgnored;
                     
                     // Sync UI if visible
                     if (chkPassthrough) {
                        chkPassthrough.checked = point.isIgnored;
                        // Optional: Add visual flare or highlight?
                     }
                     draw();
                }
                break;
                break;
        }
    });

    // Prevent accidental refresh/close
    window.addEventListener('beforeunload', (e) => {
        // If there is history (actions taken) or more than 1 frame, ask for confirmation
        if (History.stack.length > 0 || State.frames.length > 1) {
            e.preventDefault(); 
            e.returnValue = ''; // Required for Chrome/Firefox/Safari to show prompt
        }
    });
}

function loadProject(keyframes) {
    console.log("Loading project...", keyframes);
    // Validate structure
    try {
        if (!keyframes || keyframes.length === 0) {
            throw new Error("No keyframes found in file.");
        }

        const newFrames = keyframes.map((f, i) => ({
            id: f.id || (Date.now() + i), // Ensure ID
            duration: Number(f.duration) || 0.5,
            points: f.points.map(p => ({
                id: Number(p.id),
                x: Number(p.x),
                y: Number(p.y),
                // Preserve easing if present
                ...(p.easing ? { easing: p.easing } : {})
            }))
        }));

        console.log("Parsed frames:", newFrames);

        State.frames = newFrames;
        State.currentFrameIndex = 0;
        
        // Force reset
        if (State.selectedPointIndex !== null) deselectPoint();
        
        renderTimeline();
        selectFrame(0); // This will also call draw() correctly
        updateUIControls();
        
    } catch (e) {
        console.error("Error loading project data", e);
        alert("Failed to load project structure: " + e.message);
    }
}

// Map Leaf ID -> [MiddleJoint ID, RootJoint ID]
const IK_CHAINS = {
    4: [3, 1],   // L_Hand -> L_Elbow -> Neck
    6: [5, 1],   // R_Hand -> R_Elbow -> Neck
    9: [8, 7],   // L_Foot -> L_Knee -> Pelvis
    11: [10, 7]  // R_Foot -> R_Knee -> Pelvis
};

// --- Canvas Logic ---
// --- Canvas Logic ---
function getPointerPos(evt) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (evt.touches && evt.touches.length > 0) {
        clientX = evt.touches[0].clientX;
        clientY = evt.touches[0].clientY;
    } else {
        clientX = evt.clientX;
        clientY = evt.clientY;
    }

    // Scale mapping: CSS Size -> Canvas Internal Resolution (800x600)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// Alias for compatibility
const getMousePos = getPointerPos;

function handleMouseDown(e) {
    // Prevent default only for touch to allow mouse users to interact normally (though standard mouse doesn't scroll often on drag)
    // For touch, we'll handle preventDefault in the specific listener
    if (e.type === 'touchstart') {
        // e.preventDefault(); // Moved to options for passive listener issue prevention if needed, but usually handled in logic
    }

    if (State.isPlaying) return;
    
    // Save state before potential interaction
    History.saveState();

    const pos = getPointerPos(e);
    
    // Check Background Edit Mode
    const chkEditBg = document.getElementById('chk-edit-bg');
    if (State.background && chkEditBg && chkEditBg.checked) {
        State.isDraggingBg = true;
        State.lastMousePos = pos;
        return; // Skip stickman selection
    }

    const frame = State.frames[State.currentFrameIndex];
    let found = false;
    // Find clicked point 
    for (let i = 0; i < frame.points.length; i++) {
        const p = frame.points[i];
        const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
        if (dist <= CONFIG.selectionRadius) {
            State.draggedPointIndex = i;
            selectPoint(i); // Update Selection
            found = true;
            
            // Initialize IK Data if applicable
            if (State.isIKEnabled && IK_CHAINS[i]) {
                const [jointIdx, rootIdx] = IK_CHAINS[i];
                const root = frame.points[rootIdx];
                const joint = frame.points[jointIdx];
                const effector = frame.points[i];
                
                State.ikDragData = {
                    rootIdx,
                    jointIdx,
                    effectorIdx: i,
                    d1: Math.hypot(joint.x - root.x, joint.y - root.y),
                    d2: Math.hypot(effector.x - joint.x, effector.y - joint.y),
                    bendDir: ((joint.x - root.x) * (effector.y - root.y) - (joint.y - root.y) * (effector.x - root.x)) > 0 ? 1 : -1
                };
            }
            break;
        }
    }
    
    if (!found) {
        deselectPoint();
    }
}

function selectPoint(index) {
    State.selectedPointIndex = index;
    panelProperties.classList.remove('hidden');
    
    // Update Properties Panel values
    const point = State.frames[State.currentFrameIndex].points[index];
    selectEasing.value = point.easing || 'easeInOutCubic';
    if (chkPassthrough) {
        chkPassthrough.checked = !!point.isIgnored;
    }
    draw();
}

function deselectPoint() {
    State.selectedPointIndex = null;
    panelProperties.classList.add('hidden');
    draw();
}

function handleMouseMove(e) {
    // Prevent default on touch to stop scrolling
    if (e.type === 'touchmove') e.preventDefault();

    if (State.isPlaying) return;
    const pos = getPointerPos(e);

    // Background Dragging
    if (State.isDraggingBg && State.background) {
        const dx = pos.x - State.lastMousePos.x;
        const dy = pos.y - State.lastMousePos.y;
        State.background.x += dx;
        State.background.y += dy;
        State.lastMousePos = pos;
        draw();
        return;
    }

    if (State.draggedPointIndex !== null) {
        const frame = State.frames[State.currentFrameIndex];
        const points = frame.points;
        const dragIdx = State.draggedPointIndex;
        const point = points[dragIdx];
        
        // Check for IK and ensure we have init data
        if (State.isIKEnabled && State.ikDragData && State.ikDragData.effectorIdx === dragIdx) {
            solveTwoJointIK(points, State.ikDragData, pos.x, pos.y);
        } else {
            // Standard FK
            const dx = pos.x - point.x;
            const dy = pos.y - point.y;
            
            point.x = pos.x;
            point.y = pos.y;
            
            moveChildren(dragIdx, dx, dy, points);
        }
        
        draw();
    } else {
        // Hover Cursor logic (Only for mouse really)
        if (e.type.startsWith('touch')) return;

        const chkEditBg = document.getElementById('chk-edit-bg');
        if (State.background && chkEditBg && chkEditBg.checked) {
             canvas.style.cursor = 'move';
             return;
        }

        const frame = State.frames[State.currentFrameIndex];
        let hovering = false;
        let hoverIdx = -1;
        
        for (let i=0; i < frame.points.length; i++) {
            const p = frame.points[i];
            const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
            if (dist <= CONFIG.selectionRadius) {
                hovering = true;
                hoverIdx = i;
                break;
            }
        }

        if (hovering && State.isIKEnabled && IK_CHAINS[hoverIdx]) {
            canvas.style.cursor = 'grab'; 
        } else {
            canvas.style.cursor = hovering ? 'pointer' : 'crosshair';
        }
    }
}

function handleMouseUp(e) {
    State.isDraggingBg = false; 
    
    if (State.draggedPointIndex !== null) {
        State.draggedPointIndex = null;
        State.ikDragData = null; // Clear IK data
        renderTimeline(); 
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

// --- Inverse Kinematics Logic ---
function solveTwoJointIK(points, ikData, targetX, targetY) {
    const { rootIdx, jointIdx, effectorIdx, d1, d2, bendDir } = ikData;
    
    const root = points[rootIdx];
    const joint = points[jointIdx];
    const effector = points[effectorIdx];

    // Distance from Root to Target
    const distTarget = Math.hypot(targetX - root.x, targetY - root.y);
    
    // Clamp Target Distance (Cannot stretch beyond arm length)
    // Use epsilon to avoid NaN
    const maxDist = (d1 + d2) * 0.9999; 
    let validDist = distTarget;
    
    if (distTarget > maxDist) {
        validDist = maxDist;
    } else if (distTarget < Math.abs(d1 - d2) + 0.001) {
        // Don't let it fold onto itself completely (singularity)
        validDist = Math.abs(d1 - d2) + 0.001;
    }
    
    // Law of Cosines
    // d2^2 = d1^2 + validDist^2 - 2*d1*validDist * cos(Alpha)
    const cosAlpha = (d1*d1 + validDist*validDist - d2*d2) / (2 * d1 * validDist);
    // Clamp safely
    const angleAlpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha))); 
    
    // Angle of the Target Vector relative to X-axis
    const angleToTarget = Math.atan2(targetY - root.y, targetX - root.x);
    
    // Use stored bend preference (or dynamic if we wanted flip capability, but fixed is more stable)
    // We can also check cross product to maintain consistency, but fixed `bendDir` from start of drag is smoothest
    
    const angleRoot = angleToTarget + (angleAlpha * bendDir);
    
    const newJointX = root.x + Math.cos(angleRoot) * d1;
    const newJointY = root.y + Math.sin(angleRoot) * d1;
    
    // Joint to Target
    const angleJointToTarget = Math.atan2(targetY - newJointY, targetX - newJointX);
    const newEffectorX = newJointX + Math.cos(angleJointToTarget) * d2;
    const newEffectorY = newJointY + Math.sin(angleJointToTarget) * d2;
    
    // Apply
    joint.x = newJointX;
    joint.y = newJointY;
    
    effector.x = newEffectorX;
    effector.y = newEffectorY;
}

// --- Drawing ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Use clearRect

    // 1. Draw Background (Rotoscoping)
    if (State.background && State.background.media) {
        ctx.save();
        ctx.globalAlpha = State.background.opacity;
        
        const media = State.background.media;
        
        // Sync Video Time
        if (State.background.type === 'video') {
            let targetTime = 0;
            if (State.isPlaying) {
                targetTime = State.playCurrentGlobalTime;
            } else {
                // Determine time based on current frame start
                for (let i = 0; i < State.currentFrameIndex; i++) {
                    targetTime += State.frames[i].duration;
                }
            }
            
            if (Math.abs(media.currentTime - targetTime) > 0.1) {
                media.currentTime = targetTime;
            }
        }

        // Apply Transform
        // 1. Translate to center + offset
        ctx.translate(canvas.width/2 + State.background.x, canvas.height/2 + State.background.y);
        // 2. Scale
        ctx.scale(State.background.scale, State.background.scale);
        
        // Calculate centered draw pos for the media itself
        let mWidth = media.videoWidth || media.width;
        let mHeight = media.videoHeight || media.height;
        
        if (mWidth && mHeight) {
             ctx.drawImage(media, -mWidth/2, -mHeight/2, mWidth, mHeight);
        }
        
        ctx.restore();
    }
    
    if (State.isPlaying) {
        // ... (Playback Render) ...
        drawStickman(ctx, getCurrentInterpolatedPose(), CONFIG.skeletonColor, 1, 1, 0, 0, true);
        
        if (State.playCurrentGlobalTime - State.playLastScuffTime > 0.15) {
             // Audio Removed
        }

    } else {
        // ... (Edit Mode Render) ...
        
        // 1. Onion Skin
        if (State.isOnionSkinEnabled && State.currentFrameIndex > 0) {
            const prevFrame = State.frames[State.currentFrameIndex - 1];
            drawStickman(ctx, prevFrame.points, CONFIG.onionSkinColor, 0.4, 1, 0, 0, false);
        }
        
        // 2. Current Frame
        drawStickman(ctx, State.frames[State.currentFrameIndex].points, CONFIG.skeletonColor, 1, 1, 0, 0, false);

        // 3. Selection & Motion Trails
        if (State.selectedPointIndex !== null) {
            const currentPoint = State.frames[State.currentFrameIndex].points[State.selectedPointIndex];
            
            // --- Motion Trail Logic ---
            // Draw path of this point across ALL frames (or a window)
            ctx.save();
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]); // Dotted Line
            ctx.beginPath();
            
            // Loop through all frames to find position of the *same* point ID
            // Since point index matches ID in this rig, we use selectedPointIndex
            let hasStarted = false;
            
            State.frames.forEach((frame, idx) => {
                const p = frame.points[State.selectedPointIndex];
                if (idx === 0) {
                    ctx.moveTo(p.x, p.y);
                    hasStarted = true;
                } else {
                    ctx.lineTo(p.x, p.y);
                }
                
                // Draw small dot at each frame keyframe
                // Don't stroke the path yet, just adding to path
            });
            ctx.stroke();
            
            // Draw Keyframe Dots on the path
            ctx.setLineDash([]);
            ctx.fillStyle = 'cyan';
            State.frames.forEach((frame, idx) => {
                const p = frame.points[State.selectedPointIndex];
                // Highlight current frame's point differently?
                const r = idx === State.currentFrameIndex ? 4 : 2;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fill();
            });
            
            ctx.restore();
            // --------------------------

            // Highlight Selected Point
            ctx.beginPath();
            ctx.strokeStyle = '#f44336'; 
            ctx.lineWidth = 2;
            ctx.arc(currentPoint.x, currentPoint.y, CONFIG.selectionRadius + 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1; 
        }
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
            
            // Visual feedback for interaction
            const isSelected = State.selectedPointIndex === p.id && !State.isPlaying;
            
            // Determine Color
            if (isSelected) context.fillStyle = '#ff5252'; 
            else context.fillStyle = CONFIG.junctionColor;
            
            let px = p.x;
            let py = p.y;
            
            if (useJitter) {
                px += (Math.random() - 0.5) * 2;
                py += (Math.random() - 0.5) * 2;
            }

            context.arc(px, py, CONFIG.pointRadius, 0, Math.PI * 2);
            
            // Passthrough Visualization (Hollow if ignored)
            // Note: In playback 'points' is the interpolated result so it doesn't have 'isIgnored'
            // We check this mainly for Edit mode where we pass raw frame points.
            if (p.isIgnored && !State.isPlaying) {
                 context.lineWidth = 2;
                 context.strokeStyle = context.fillStyle;
                 context.fillStyle = 'rgba(0,0,0,0.5)'; // Transparent center
                 context.fill();
                 context.stroke();
            } else {
                 context.fill();
            }
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
    
    // Persist selection if strictly valid, otherwise deselect
    if (State.selectedPointIndex !== null) {
        selectPoint(State.selectedPointIndex); // Refresh UI for new frame data
    } else {
        deselectPoint();
    }
    
    frameNumDisplay.textContent = index + 1;
    renderTimeline(); // Refresh to update active class
    draw();
}

function addNewFrame() {
    History.saveState();
    const currentPoints = State.frames[State.currentFrameIndex].points;
    const newPoints = JSON.parse(JSON.stringify(currentPoints));
    
    const newFrame = {
        id: Date.now(),
        duration: 0.5,
        points: newPoints
    };

    State.frames.splice(State.currentFrameIndex + 1, 0, newFrame);
    State.currentFrameIndex++;
    deselectPoint();
    renderTimeline();
    draw();
}

function deleteFrame(index) {
    if (State.frames.length <= 1) return; // Prevention
    
    History.saveState();
    State.frames.splice(index, 1);
    if (State.currentFrameIndex >= State.frames.length) {
        State.currentFrameIndex = State.frames.length - 1;
    }
    deselectPoint();
    renderTimeline();
    draw();
}

// --- Playback Logic ---
function startPlayback() {
    // Audio Removed
    State.isPlaying = true;
    State.playStartTime = performance.now();
    State.playCurrentGlobalTime = 0;
    
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
    
    // Prevent div by zero
    if (totalDuration <= 0) totalDuration = 0.1;

    let elapsed = (timestamp - State.playStartTime) / 1000;
    let effectiveTime = 0;

    if (State.playbackMode === 'loop') {
        if (elapsed > totalDuration) {
            elapsed = elapsed % totalDuration;
        }
        effectiveTime = elapsed;
    
    } else if (State.playbackMode === 'reverse') {
        // Reverse Loop: End -> Start -> End
        if (elapsed > totalDuration) {
            elapsed = elapsed % totalDuration;
        }
        effectiveTime = totalDuration - elapsed;

    } else if (State.playbackMode === 'pingpong') {
        const cycle = totalDuration * 2;
        let t = elapsed % cycle;
        if (t <= totalDuration) {
            effectiveTime = t;
        } else {
            effectiveTime = totalDuration - (t - totalDuration);
        }
    
    } else if (State.playbackMode === 'once') {
        if (elapsed >= totalDuration) {
            effectiveTime = totalDuration;
            State.playCurrentGlobalTime = effectiveTime; // Set final pose
            draw();
            stopPlayback();
            return;
        }
        effectiveTime = elapsed;
    }

    State.playCurrentGlobalTime = effectiveTime;
    draw();
    requestAnimationFrame(playbackLoop);
}

// Refactored to allow Independent Joint Interpolation (Tweens/Passthrough)
function getPoseAtTime(globalTime) {
    const numPoints = 12; // Standard Rig Size
    const resultPoints = new Array(numPoints);
    
    // 1. Pre-calculate start times for all frames
    // (Optimization: Could be cached in State, but fast enough for <100 frames)
    const frameStartTimes = [];
    let t = 0;
    for (let i = 0; i < State.frames.length; i++) {
        frameStartTimes.push(t);
        t += State.frames[i].duration;
    }
    const totalDuration = t;

    // 2. Resolve every point independently
    for (let pIdx = 0; pIdx < numPoints; pIdx++) {
        
        // Find Prev Key (Last non-ignored frame <= globalTime)
        let prevFrame = null;
        let prevTime = 0;
        
        // Find Next Key (First non-ignored frame > globalTime)
        let nextFrame = null;
        let nextTime = totalDuration;

        // Search Backwards for Prev
        // We find the 'current frame index' interval first to start search
        let tentativeIdx = 0;
        for(let i=0; i<frameStartTimes.length; i++) {
            if (globalTime >= frameStartTimes[i]) tentativeIdx = i;
        }

        // Scan back from tentative
        for (let i = tentativeIdx; i >= 0; i--) {
            if (!State.frames[i].points[pIdx].isIgnored) {
                prevFrame = State.frames[i];
                prevTime = frameStartTimes[i];
                break;
            }
        }
        // If not found (e.g. Frame 0 is ignored?), fallback to Frame 0
        if (!prevFrame) {
            prevFrame = State.frames[0];
            prevTime = 0;
        }

        // Scan forward for Next
        for (let i = tentativeIdx + 1; i < State.frames.length; i++) {
             if (!State.frames[i].points[pIdx].isIgnored) {
                nextFrame = State.frames[i];
                nextTime = frameStartTimes[i];
                break;
            }
        }
        
        // Handle Edge Case: No future keyframe? 
        // If looping, we might look at Frame 0? 
        // For simplicity in this logic, we hold the last value.
        if (!nextFrame) {
             // If we are past the last actual keyframe for this point
             resultPoints[pIdx] = { ...prevFrame.points[pIdx] }; // Hold
             continue;
        }

        // 3. Interpolate
        const duration = nextTime - prevTime;
        let localT = 0;
        if (duration > 0.0001) {
            localT = (globalTime - prevTime) / duration;
        }
        localT = Math.max(0, Math.min(1, localT));
        
        // Use Easing from the Target Keyframe (nextFrame)
        const pointStart = prevFrame.points[pIdx];
        const pointEnd = nextFrame.points[pIdx];
        
        // Basic Linear Interpolation Helper
        const type = pointEnd.easing || 'easeInOutCubic';
        const fn = EasingFunctions[type] || EasingFunctions[linear];
        const easedT = fn(localT);

        resultPoints[pIdx] = {
            id: pIdx,
            x: pointStart.x + (pointEnd.x - pointStart.x) * easedT,
            y: pointStart.y + (pointEnd.y - pointStart.y) * easedT
        };
    }
    
    // Note: We are returning raw interpolated points. 
    // FK (Forward Kinematics) parenting logic in `interpolatePoints` 
    // was nice for rotation-arc preservation, but doing purely linear point-to-point 
    // is often more predictable for "Passthrough" behavior tweening.
    // If we wanted true FK arc interpolation with Passthrough, it gets very complex mathematically.
    // Sticking to Cartesian Linear Interpolation for robustness here.
    
    return resultPoints;
}

function getCurrentInterpolatedPose() {
    return getPoseAtTime(State.playCurrentGlobalTime);
}

// Expanded Easing Functions
const EasingFunctions = {
    linear: t => t,
    easeInOutCubic: t => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeOutBack: t => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeOutElastic: t => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    easeOutBounce: t => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
            return n1 * t * t;
        } else if (t < 2 / d1) {
            return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
            return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    }
};

// Hardcoded topological sort order (Parent -> Children) for FK Calculation
const FK_TRAVERSAL_ORDER = [7, 2, 8, 10, 1, 9, 11, 0, 3, 5, 4, 6];

// Updated Interpolate Points for Per-Point Easing
function interpolatePoints(pointsA, pointsB, linearT) {
    const resultPoints = new Array(pointsA.length);
    const defaultEasing = 'easeInOutCubic';

    // Helper to get eased T for a specific point index
    const getT = (idx) => {
        // We use the easing function defined on the TARGET point (Frame B)
        // because it defines how we get *to* that state.
        const type = pointsB[idx].easing || defaultEasing;
        const fn = EasingFunctions[type] || EasingFunctions[defaultEasing];
        return fn(linearT);
    };

    // 1. Root (Pelvis id:7)
    const rootA = pointsA[7];
    const rootB = pointsB[7];
    
    if (!rootA || !rootB) return pointsA; 

    // Calculate T specifically for Root
    const tRoot = getT(7);

    resultPoints[7] = {
        id: 7,
        x: rootA.x + (rootB.x - rootA.x) * tRoot,
        y: rootA.y + (rootB.y - rootA.y) * tRoot,
        easing: rootB.easing // Carry over easing property
    };

    // 2. Children
    for (let i = 0; i < FK_TRAVERSAL_ORDER.length; i++) {
        const idx = FK_TRAVERSAL_ORDER[i];
        if (idx === 7) continue; 

        const parentIdx = PARENT_MAP[idx];
        const parentNew = resultPoints[parentIdx]; 

        const selfA = pointsA[idx];
        const parentA = pointsA[parentIdx];
        
        const selfB = pointsB[idx];
        const parentB = pointsB[parentIdx];

        // Specific T for this joint's rotation/extension
        const tJoint = getT(idx);

        const dxA = selfA.x - parentA.x;
        const dyA = selfA.y - parentA.y;
        const angleA = Math.atan2(dyA, dxA);
        const lenA = Math.sqrt(dxA*dxA + dyA*dyA);

        const dxB = selfB.x - parentB.x;
        const dyB = selfB.y - parentB.y;
        const angleB = Math.atan2(dyB, dxB);
        const lenB = Math.sqrt(dxB*dxB + dyB*dyB);

        let diff = angleB - angleA;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const angleT = angleA + diff * tJoint;
        const lenT = lenA + (lenB - lenA) * tJoint;

        resultPoints[idx] = {
            id: idx,
            x: parentNew.x + Math.cos(angleT) * lenT,
            y: parentNew.y + Math.sin(angleT) * lenT,
            easing: selfB.easing // Carry over easing property
        };
    }

    return resultPoints;
}

// --- Export ---
function showExportModal() {
    const FPS = 30; // Baking Frame Rate
    const bakedFrames = [];
    
    // Calculate total duration based on keyframes
    let totalDuration = 0;
    for (let i = 0; i < State.frames.length - 1; i++) {
        totalDuration += State.frames[i].duration;
    }
    
    // Determine Export Duration based on Mode
    let exportDuration = totalDuration;
    if (State.playbackMode === 'pingpong') {
        exportDuration = totalDuration * 2;
    }
    
    // Generate In-Between Frames
    // Step through time at 1/FPS increments
    let t = 0;
    // We add a tiny epsilon to ensure we catch the exact end point if float math aligns
    while (t <= exportDuration + 0.001) {
        
        // Calculate Effective Time based on Playback Mode
        let effectiveTime = t;
        
        if (State.playbackMode === 'pingpong') {
            const cycleHalf = totalDuration;
            // T goes from 0 -> 2*Total
            // If T <= Total: Normal
            // If T > Total: Total - (T - Total) = 2*Total - T
            if (t <= cycleHalf) {
                effectiveTime = t;
            } else {
                effectiveTime = (cycleHalf * 2) - t;
            }
        } else if (State.playbackMode === 'reverse') {
            effectiveTime = totalDuration - t;
        }
        
        // Clamp safely to track range
        effectiveTime = Math.max(0, Math.min(totalDuration, effectiveTime));

        const pose = getPoseAtTime(effectiveTime);
        
        bakedFrames.push({
            time: parseFloat(t.toFixed(3)),
            points: pose.map(p => ({
                id: p.id,
                x: Math.round(p.x * 10) / 10,
                y: Math.round(p.y * 10) / 10
            }))
        });
        t += 1 / FPS;
    }

    const exportData = {
        meta: {
            name: "stickman_project",
            fps: FPS,
            mode: State.playbackMode,
            totalDuration: parseFloat(exportDuration.toFixed(2)),
            totalFrames: bakedFrames.length
        },
        // Original Keyframes (for editing)
        keyframes: State.frames.map((f, i) => ({
            id: i + 1,
            duration: f.duration,
            points: f.points.map(p => {
                const pt = { id: p.id, x: Math.round(p.x), y: Math.round(p.y) };
                if (p.easing) pt.easing = p.easing;
                return pt;
            })
        })),
        // Baked Animation (Result with in-betweens)
        bakedAnimation: bakedFrames
    };
    
    exportOutput.value = JSON.stringify(exportData, null, 2);
    exportModal.classList.remove('hidden');
}

// Start
init();
