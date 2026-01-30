/**
 * Stickman Animation Application
 * Handles Logic, Rendering, and State Management
 */

// --- Constants & Config ---
const CONFIG = {
  pointRadius: 6,
  selectionRadius: 15,
  skeletonColor: "#3b82f6", // Neon Blue
  junctionColor: "#ffffff",
  onionSkinColor: "rgba(255, 255, 255, 0.2)",
  maxFPS: 60,
};

// --- Initial Data ---
// 12-Point Rig Hierarchy
// Root is usually the Pelvis (index 6 in our list)
const SKELETON_HIERARCHY = {
  // ID: { parent: ParentID or null, children: [ChildIDs] }
  0: { id: 0, name: "head", parent: 1 },
  1: { id: 1, name: "neck", parent: 2 },
  2: { id: 2, name: "spine_mid", parent: 6 },
  3: { id: 3, name: "l_elbow", parent: 1 },
  4: { id: 4, name: "l_hand", parent: 3 },
  5: { id: 5, name: "r_elbow", parent: 1 },
  6: { id: 6, name: "r_hand", parent: 5 },
  7: { id: 7, name: "spine_pelvis", parent: null }, // ROOT
  8: { id: 8, name: "l_knee", parent: 7 },
  9: { id: 9, name: "l_foot", parent: 8 },
  10: { id: 10, name: "r_knee", parent: 7 },
  11: { id: 11, name: "r_foot", parent: 10 },
};

// Re-mapping for array based structure to match prompt "12 points"
// Let's use an array of points and map indices manually for connections
// Points: [Head, Neck, SpineMid, LElbow, LHand, RElbow, RHand, Pelvis, LKnee, LFoot, RKnee, RFoot]
// Indices:
// 0: Head
// 1: Neck
// 2: SpineMid
// 3: LElbow
// 4: LHand
// 5: RElbow
// 6: RHand
// 7: Pelvis (ROOT)
// 8: LKnee
// 9: LFoot
// 10: RKnee
// 11: RFoot

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
  [10, 11], // RKnee -> RFoot
];

const PARENT_MAP = {
  0: 1,
  1: 2,
  2: 7,
  3: 1,
  4: 3,
  5: 1,
  6: 5,
  7: null,
  8: 7,
  9: 8,
  10: 7,
  11: 10,
};

// Initial T-Pose Coordinates (relative to 800x600 canvas center)
// Center X = 400, Y = 300
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
    { id: 11, x: 430, y: 470 }, // RFoot
  ];
}

// --- Application State ---
const State = {
  frames: [
    {
      id: 1,
      duration: 0.5,
      points: getInitialPose(),
    },
    {
      id: 2,
      duration: 0.5,
      points: getInitialPose(), // Second frame for convenience
    },
  ],
  currentFrameIndex: 0,
  isPlaying: false,
  draggedPointIndex: null,
  isOnionSkinEnabled: true,
  lastFrameTime: 0,
  elapsedSinceFrame: 0, // For playback interpolation
  playStartTime: 0,
  playCurrentGlobalTime: 0,
};

// --- DOM Elements ---
const canvas = document.getElementById("anim-canvas");
const ctx = canvas.getContext("2d");
const timelineTrack = document.getElementById("timeline-track");
const frameNumDisplay = document.getElementById("current-frame-num");
const btnPlay = document.getElementById("btn-play");
const btnStop = document.getElementById("btn-stop");
const btnExport = document.getElementById("btn-export");
const btnAddFrame = document.getElementById("btn-add-frame");
const exportModal = document.getElementById("export-modal");
const exportOutput = document.getElementById("export-output");
const closeModalBtn = document.querySelector(".close-modal");
const btnCopy = document.getElementById("btn-copy");
const chkOnionSkin = document.getElementById("chk-onion-skin");

// --- Initialization ---
function init() {
  renderTimeline();
  draw();
  setupEventListeners();
}

// --- Event Listeners ---
function setupEventListeners() {
  // Canvas Interaction
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp);

  // Controls
  btnPlay.addEventListener("click", startPlayback);
  btnStop.addEventListener("click", stopPlayback);
  btnAddFrame.addEventListener("click", addNewFrame);

  // Onion Skin
  chkOnionSkin.addEventListener("change", (e) => {
    State.isOnionSkinEnabled = e.target.checked;
    if (!State.isPlaying) draw();
  });

  // Export
  btnExport.addEventListener("click", showExportModal);
  closeModalBtn.addEventListener("click", () =>
    exportModal.classList.add("hidden"),
  );
  btnCopy.addEventListener("click", () => {
    exportOutput.select();
    document.execCommand("copy");
    btnCopy.textContent = "Copied!";
    setTimeout(() => (btnCopy.textContent = "Copy to Clipboard"), 2000);
  });
}

// --- Canvas Logic ---
function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

function handleMouseDown(e) {
  if (State.isPlaying) return;
  const pos = getMousePos(e);
  const frame = State.frames[State.currentFrameIndex];

  // Find clicked point - Check in reverse order to grab top-most if overlap (though points are same z)
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
    // Implement Hierarchical Dragging
    const frame = State.frames[State.currentFrameIndex];
    const pointIndex = State.draggedPointIndex;
    const point = frame.points[pointIndex];

    const dx = pos.x - point.x;
    const dy = pos.y - point.y;

    // Move the point
    point.x = pos.x;
    point.y = pos.y;

    // Move children recursively (Forward Kinematics logic)
    moveChildren(pointIndex, dx, dy, frame.points);

    draw();
  } else {
    // Hover effect
    const frame = State.frames[State.currentFrameIndex];
    let hovering = false;
    for (let p of frame.points) {
      const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
      if (dist <= CONFIG.selectionRadius) {
        hovering = true;
        break;
      }
    }
    canvas.style.cursor = hovering ? "pointer" : "crosshair";
  }
}

function handleMouseUp() {
  State.draggedPointIndex = null;
}

// Recursive function to move children
function moveChildren(parentId, dx, dy, points) {
  // Find all direct children
  for (let i = 0; i < points.length; i++) {
    if (PARENT_MAP[i] === parentId) {
      points[i].x += dx;
      points[i].y += dy;
      // Recurse
      moveChildren(i, dx, dy, points);
    }
  }
}

// --- Drawing ---
function draw() {
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (State.isPlaying) {
    // Render Interpolated Frame
    drawStickman(getCurrentInterpolatedPose(), CONFIG.skeletonColor, 1);
  } else {
    // Onion Skin (Previous Frame)
    if (State.isOnionSkinEnabled && State.currentFrameIndex > 0) {
      const prevFrame = State.frames[State.currentFrameIndex - 1];
      drawStickman(prevFrame.points, CONFIG.onionSkinColor, 0.4);
    }

    // Current Frame
    drawStickman(
      State.frames[State.currentFrameIndex].points,
      CONFIG.skeletonColor,
      1,
    );
  }
}

function drawStickman(points, color, opacity) {
  ctx.globalAlpha = opacity;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw Connections
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;

  CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = points[startIndex];
    const end = points[endIndex];
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  });
  ctx.stroke();

  // Draw Joints
  points.forEach((p) => {
    ctx.beginPath();
    ctx.fillStyle = CONFIG.junctionColor;
    ctx.arc(p.x, p.y, CONFIG.pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1.0;
}

// --- Timeline & Frames ---
function renderTimeline() {
  timelineTrack.innerHTML = "";

  State.frames.forEach((frame, index) => {
    // Frame Card
    const card = document.createElement("div");
    card.className = `frame-card ${index === State.currentFrameIndex ? "active" : ""}`;
    card.textContent = index + 1;
    card.onclick = () => selectFrame(index);

    if (State.frames.length > 1) {
      const delBtn = document.createElement("div");
      delBtn.className = "delete-frame";
      delBtn.innerHTML = "&times;";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteFrame(index);
      };
      card.appendChild(delBtn);
    }

    timelineTrack.appendChild(card);

    // Transition Bar (if not last frame)
    if (index < State.frames.length - 1) {
      const transBar = document.createElement("div");
      transBar.className = "transition-bar";

      const range = document.createElement("input");
      range.type = "range";
      range.min = "0.1";
      range.max = "5.0";
      range.step = "0.1";
      range.value = frame.duration;
      range.oninput = (e) => {
        frame.duration = parseFloat(e.target.value);
        label.textContent = frame.duration + "s";
      };

      const label = document.createElement("span");
      label.className = "duration-label";
      label.textContent = frame.duration + "s";

      transBar.appendChild(range);
      transBar.appendChild(label);
      timelineTrack.appendChild(transBar);
    }
  });

  // Scroll to end if we just added
  // timelineTrack.scrollLeft = timelineTrack.scrollWidth;
}

function selectFrame(index) {
  if (State.isPlaying) return;
  State.currentFrameIndex = index;
  frameNumDisplay.textContent = index + 1;
  renderTimeline();
  draw();
}

function addNewFrame() {
  // Clone current frame
  const currentPoints = State.frames[State.currentFrameIndex].points;
  const newPoints = JSON.parse(JSON.stringify(currentPoints));

  const newFrame = {
    id: Date.now(),
    duration: 0.5,
    points: newPoints,
  };

  // Insert after current or at end
  State.frames.splice(State.currentFrameIndex + 1, 0, newFrame);

  // Switch to new frame
  selectFrame(State.currentFrameIndex + 1);
}

function deleteFrame(index) {
  State.frames.splice(index, 1);
  if (State.currentFrameIndex >= State.frames.length) {
    State.currentFrameIndex = State.frames.length - 1;
  }
  selectFrame(State.currentFrameIndex);
}

// --- Playback Logic ---
function startPlayback() {
  State.isPlaying = true;
  State.playStartTime = performance.now();
  State.playCurrentGlobalTime = 0;

  btnPlay.classList.add("hidden");
  btnStop.classList.remove("hidden");

  requestAnimationFrame(playbackLoop);
}

function stopPlayback() {
  State.isPlaying = false;
  btnPlay.classList.remove("hidden");
  btnStop.classList.add("hidden");
  draw();
}

function playbackLoop(timestamp) {
  if (!State.isPlaying) return;

  // Calculate total duration of animation
  let totalDuration = 0;
  for (let i = 0; i < State.frames.length - 1; i++) {
    totalDuration += State.frames[i].duration;
  }

  // Get elapsed time in seconds relative to animation loop
  let elapsed = (timestamp - State.playStartTime) / 1000;

  // Loop
  if (elapsed > totalDuration) {
    State.playStartTime = timestamp;
    elapsed = 0;
  }

  State.playCurrentGlobalTime = elapsed;
  draw();
  requestAnimationFrame(playbackLoop);
}

function getCurrentInterpolatedPose() {
  // Find which frame segment we are in
  let timeAccumulator = 0;

  for (let i = 0; i < State.frames.length - 1; i++) {
    const frameDuration = State.frames[i].duration;

    if (
      State.playCurrentGlobalTime >= timeAccumulator &&
      State.playCurrentGlobalTime < timeAccumulator + frameDuration
    ) {
      // We are between Frame i and Frame i+1
      const timeInFrame = State.playCurrentGlobalTime - timeAccumulator;
      const t = timeInFrame / frameDuration; // Normalized 0-1

      return interpolatePoints(
        State.frames[i].points,
        State.frames[i + 1].points,
        t,
      );
    }

    timeAccumulator += frameDuration;
  }

  // Fallback (End of animation)
  return State.frames[State.frames.length - 1].points;
}

function interpolatePoints(pointsA, pointsB, t) {
  // Simple Linear Interpolation
  return pointsA.map((pA, index) => {
    const pB = pointsB[index];
    return {
      id: pA.id,
      x: pA.x + (pB.x - pA.x) * t,
      y: pA.y + (pB.y - pA.y) * t,
    };
  });
}

// --- Export ---
function showExportModal() {
  const exportData = {
    animationName: "my_stickman_anim",
    totalFrames: State.frames.length,
    version: "1.0",
    frames: State.frames.map((f, i) => ({
      frameId: i + 1,
      durationToNext: i < State.frames.length - 1 ? f.duration : 0,
      points: f.points.map((p) => ({
        id: p.id, // Ideally map back to names like 'head', but ID is fine
        name: SKELETON_HIERARCHY[p.id].name,
        x: Math.round(p.x),
        y: Math.round(p.y),
      })),
    })),
  };

  exportOutput.value = JSON.stringify(exportData, null, 2);
  exportModal.classList.remove("hidden");
}

// Start
init();
