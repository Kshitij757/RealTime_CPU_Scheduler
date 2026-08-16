/**
 * script.js
 * Controller and UI Coordinator for Nexus CPU Scheduler Studio
 */

let processes = [];
let chartInstance = null;

// Simulation State
let simClock = 0;
let simIntervalId = null;
let simTimeline = [];
let simResults = [];
let isSimulationRunning = false;
let maxSimTime = 0;

// Vibrant palette for processes
const PROCESS_COLORS = [
    "#06b6d4", // Cyan
    "#10b981", // Emerald
    "#a855f7", // Purple
    "#f59e0b", // Amber
    "#ec4899", // Pink
    "#ef4444", // Red
    "#3b82f6", // Blue
    "#f97316", // Orange
    "#14b8a6", // Teal
    "#84cc16"  // Lime
];

/**
 * Handle changing algorithms: Show/Hide fields
 */
function handleAlgorithmChange() {
    const alg = document.getElementById("algorithm").value;
    
    // Toggle priority
    const priorityContainer = document.getElementById("priorityContainer");
    const thPriority = document.getElementById("thPriority");
    const isPriorityAlg = alg === "Priority" || alg === "PreemptivePriority";
    priorityContainer.classList.toggle("hidden", !isPriorityAlg);
    thPriority.classList.toggle("hidden", !isPriorityAlg);

    // Toggle Round Robin quantum
    const quantumContainer = document.getElementById("quantumContainer");
    quantumContainer.classList.toggle("hidden", alg !== "RoundRobin");

    // Toggle MLFQ parameters
    const mlfqParams = document.getElementById("mlfqParams");
    mlfqParams.classList.toggle("hidden", alg !== "MLFQ");
    
    // Refresh table columns to display Priority if relevant
    displayProcesses();
}

/**
 * Add single process from UI input
 */
function handleAddProcess() {
    const arrival = parseInt(document.getElementById("arrival").value);
    const burst = parseInt(document.getElementById("burst").value);
    const alg = document.getElementById("algorithm").value;
    
    let priority = 0;
    if (alg === "Priority" || alg === "PreemptivePriority") {
        priority = parseInt(document.getElementById("priority").value);
        if (isNaN(priority) || priority < 0) {
            alert("Please enter a valid priority >= 0!");
            return;
        }
    }

    if (isNaN(arrival) || arrival < 0) {
        alert("Please enter a valid arrival time >= 0!");
        return;
    }
    if (isNaN(burst) || burst <= 0) {
        alert("Please enter a valid burst time > 0!");
        return;
    }

    const nextId = "P" + (processes.length + 1);
    const color = PROCESS_COLORS[processes.length % PROCESS_COLORS.length];

    processes.push({
        id: nextId,
        arrival,
        burst,
        priority,
        color
    });

    displayProcesses();
    resetSchedulerVisuals();
}

/**
 * Generate 5 random processes
 */
function generateRandomProcesses() {
    resetSimulation();
    const count = 5;
    for (let i = 0; i < count; i++) {
        const id = "P" + (i + 1);
        const arrival = Math.floor(Math.random() * 6); // 0-5
        const burst = Math.floor(Math.random() * 8) + 2; // 2-9
        const priority = Math.floor(Math.random() * 5) + 1; // 1-5
        const color = PROCESS_COLORS[i % PROCESS_COLORS.length];

        processes.push({ id, arrival, burst, priority, color });
    }
    displayProcesses();
}

/**
 * Toggle Compare Mode
 */
function toggleCompareMode() {
    const compareChecked = document.getElementById("compareMode").checked;
    document.getElementById("comparisonSelector").classList.toggle("hidden", !compareChecked);
    document.getElementById("dashboardControls").classList.toggle("hidden", compareChecked);
    document.getElementById("comparisonControls").classList.toggle("hidden", !compareChecked);
    document.getElementById("liveStatusContainer").classList.toggle("hidden", compareChecked);
    
    resetSchedulerVisuals();
}

/**
 * Display input processes table
 */
function displayProcesses() {
    const alg = document.getElementById("algorithm").value;
    const isPriorityAlg = alg === "Priority" || alg === "PreemptivePriority";
    
    // Toggle header
    document.getElementById("thPriority").classList.toggle("hidden", !isPriorityAlg);

    const tbody = document.getElementById("processTableBody");
    tbody.innerHTML = "";

    if (processes.length === 0) {
        document.getElementById("emptyStateMsg").classList.remove("hidden");
        return;
    } else {
        document.getElementById("emptyStateMsg").classList.add("hidden");
    }

    processes.forEach((p, idx) => {
        const row = document.createElement("tr");
        row.id = `row-${p.id}`;
        
        let priorityCell = isPriorityAlg ? `<td>${p.priority}</td>` : "";

        // Find metrics if they exist
        let completion = "-";
        let turnaround = "-";
        let waiting = "-";

        if (simResults.length > 0) {
            let res = simResults.find(r => r.id === p.id);
            if (res) {
                completion = res.completion;
                turnaround = res.turnaround;
                waiting = res.waiting;
            }
        }

        row.innerHTML = `
            <td><span class="proc-badge" style="--proc-color: ${p.color}">${p.id}</span></td>
            <td>${p.arrival}</td>
            <td>${p.burst}</td>
            ${priorityCell}
            <td id="comp-${p.id}">${completion}</td>
            <td id="tat-${p.id}">${turnaround}</td>
            <td id="wt-${p.id}">${waiting}</td>
            <td>
                <button class="btn-table-del" onclick="deleteProcess(${idx})" title="Delete Process">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Delete single process
 */
function deleteProcess(index) {
    processes.splice(index, 1);
    // Re-id processes to maintain P1, P2... ordering
    processes.forEach((p, idx) => {
        p.id = "P" + (idx + 1);
        p.color = PROCESS_COLORS[idx % PROCESS_COLORS.length];
    });
    resetSimulation();
}

/**
 * Run/Pause simulation
 */
function toggleSimulation() {
    if (processes.length === 0) {
        alert("Please add processes first!");
        return;
    }

    if (isSimulationRunning) {
        // Pause
        pauseSimulation();
    } else {
        // Play
        startSimulation();
    }
}

/**
 * Start play simulation
 */
function startSimulation() {
    // If starting fresh
    if (simClock === 0) {
        calculateSchedule();
    }

    isSimulationRunning = true;
    document.getElementById("btnPlay").innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
    document.getElementById("btnPlay").className = "btn btn-action btn-secondary";

    const speed = 1100 - parseInt(document.getElementById("speedSlider").value) * 100; // 100ms - 1000ms
    
    simIntervalId = setInterval(() => {
        stepSimulation();
    }, speed);
}

/**
 * Pause play simulation
 */
function pauseSimulation() {
    isSimulationRunning = false;
    document.getElementById("btnPlay").innerHTML = `<i class="fa-solid fa-play"></i> Run`;
    document.getElementById("btnPlay").className = "btn btn-action btn-primary";
    clearInterval(simIntervalId);
}

/**
 * Run scheduler calculation once to populate simTimeline and simResults
 */
function calculateSchedule() {
    const alg = document.getElementById("algorithm").value;
    let schedule = null;

    if (alg === "FCFS") {
        schedule = runFCFS(processes);
    } else if (alg === "SJF") {
        schedule = runSJF(processes);
    } else if (alg === "SRTF") {
        schedule = runSRTF(processes);
    } else if (alg === "RoundRobin") {
        const q = parseInt(document.getElementById("quantum").value) || 2;
        schedule = runRR(processes, q);
    } else if (alg === "Priority") {
        schedule = runPriority(processes);
    } else if (alg === "PreemptivePriority") {
        schedule = runPreemptivePriority(processes);
    } else if (alg === "MLFQ") {
        const q1 = parseInt(document.getElementById("q1Quantum").value) || 2;
        const q2 = parseInt(document.getElementById("q2Quantum").value) || 4;
        const aging = parseInt(document.getElementById("agingInterval").value) || 0;
        schedule = runMLFQ(processes, q1, q2, aging);
    }

    if (schedule) {
        simTimeline = schedule.timeline;
        simResults = schedule.results;
        maxSimTime = simTimeline.length > 0 ? simTimeline[simTimeline.length - 1].end : 0;
    }
}

/**
 * Step simulation clock forward by 1
 */
function stepSimulation() {
    if (processes.length === 0) {
        alert("Please add processes first!");
        return;
    }

    if (simClock === 0 && simTimeline.length === 0) {
        calculateSchedule();
    }

    if (simClock >= maxSimTime) {
        // Simulation completed
        pauseSimulation();
        finalizeSimulation();
        return;
    }

    simClock++;
    document.getElementById("clockVal").innerText = simClock;
    updateSimulationFrame();
}

/**
 * Refresh UI states for the current simClock tick
 */
function updateSimulationFrame() {
    // 1. Identify active running process in CPU
    let activeSegment = simTimeline.find(seg => seg.start <= (simClock - 1) && simClock <= seg.end);
    let cpuDisplay = document.getElementById("cpuDisplay");
    
    // Remove active row highlight
    document.querySelectorAll("#processTableBody tr").forEach(row => {
        row.classList.remove("proc-row-active");
    });

    if (activeSegment && activeSegment.id !== "IDLE") {
        let activeProc = processes.find(p => p.id === activeSegment.id);
        cpuDisplay.innerHTML = `<div class="cpu-running-box" style="--proc-color: ${activeProc.color}">${activeProc.id}</div>`;
        
        // Highlight corresponding row in table
        let activeRow = document.getElementById(`row-${activeProc.id}`);
        if (activeRow) activeRow.classList.add("proc-row-active");
    } else {
        cpuDisplay.innerHTML = `<div class="cpu-idle">IDLE</div>`;
    }

    // 2. Identify and display Ready Queue contents at current tick
    let readyQueue = [];
    processes.forEach(p => {
        let res = simResults.find(r => r.id === p.id);
        if (res) {
            // Process arrived, not completed, and is NOT the currently executing CPU process
            let isArrived = p.arrival <= simClock;
            let isCompleted = res.completion <= simClock;
            let isActive = activeSegment && activeSegment.id === p.id;
            
            if (isArrived && !isCompleted && !isActive) {
                readyQueue.push(p);
            }
        }
    });

    let queueDisplay = document.getElementById("queueDisplay");
    if (readyQueue.length > 0) {
        // Sort queue visualizer representation by arrival or priorities if Priority algs
        const alg = document.getElementById("algorithm").value;
        if (alg === "Priority" || alg === "PreemptivePriority") {
            readyQueue.sort((a, b) => a.priority - b.priority);
        } else if (alg === "SJF" || alg === "SRTF") {
            // Shortest remaining/burst
            readyQueue.sort((a, b) => {
                let aRes = simResults.find(r => r.id === a.id);
                let bRes = simResults.find(r => r.id === b.id);
                // SRTF remaining vs SJF burst
                if (alg === "SRTF") {
                    let aRem = a.burst - getExecutedTime(a.id, simClock);
                    let bRem = b.burst - getExecutedTime(b.id, simClock);
                    return aRem - bRem;
                }
                return a.burst - b.burst;
            });
        }
        
        queueDisplay.innerHTML = readyQueue.map(p => `
            <div class="queue-item" style="--proc-color: ${p.color}">${p.id}</div>
        `).join("");
    } else {
        queueDisplay.innerHTML = `<span class="empty-msg">Queue Empty</span>`;
    }

    // 3. Render partial Gantt chart up to current simClock
    renderGanttChart(simClock);
}

/**
 * Calculate process executed time before/during simulation clock
 */
function getExecutedTime(procId, atTime) {
    let executed = 0;
    simTimeline.forEach(seg => {
        if (seg.id === procId && seg.start < atTime) {
            executed += Math.min(seg.end, atTime) - seg.start;
        }
    });
    return executed;
}

/**
 * Draw Gantt Chart dynamically up to endTime
 */
function renderGanttChart(limitTime) {
    const ganttContainer = document.getElementById("ganttChart");
    ganttContainer.innerHTML = "";

    if (simTimeline.length === 0) return;

    let totalDuration = maxSimTime;
    if (totalDuration === 0) return;

    // Filter segments up to current limitTime
    let visibleSegments = [];
    simTimeline.forEach(seg => {
        if (seg.start < limitTime) {
            visibleSegments.push({
                id: seg.id,
                start: seg.start,
                end: Math.min(seg.end, limitTime)
            });
        }
    });

    visibleSegments.forEach(seg => {
        let duration = seg.end - seg.start;
        let percentage = (duration / totalDuration) * 100;
        
        let box = document.createElement("div");
        box.style.width = `${percentage}%`;
        
        if (seg.id === "IDLE") {
            box.className = "gantt-box idle-seg";
            box.innerHTML = `
                <span class="gantt-lbl">IDLE</span>
                <span class="gantt-time">${seg.start}</span>
            `;
        } else {
            let proc = processes.find(p => p.id === seg.id);
            box.className = "gantt-box";
            box.style.setProperty("--proc-color", proc.color);
            box.innerHTML = `
                <span class="gantt-lbl">${seg.id}</span>
                <span class="gantt-time">${seg.start}</span>
            `;
        }
        ganttContainer.appendChild(box);
    });

    // Add final clock time stamp label at the end
    if (visibleSegments.length > 0) {
        let lastSeg = visibleSegments[visibleSegments.length - 1];
        let stamp = document.createElement("div");
        stamp.style.position = "absolute";
        stamp.style.right = `${100 - (lastSeg.end / totalDuration) * 100}%`;
        stamp.style.bottom = "4px";
        stamp.style.fontSize = "0.7rem";
        stamp.style.fontFamily = "var(--font-mono)";
        stamp.style.color = "var(--text-muted)";
        stamp.innerText = lastSeg.end;
        ganttContainer.appendChild(stamp);
    }
}

/**
 * Handle simulation completed: populate tables, render cards and graphs
 */
function finalizeSimulation() {
    // Populate Results in Table
    displayProcesses();

    // Calculate Summary Metrics
    let totalWait = 0;
    let totalTurnaround = 0;
    let completedCount = processes.length;
    
    simResults.forEach(r => {
        totalWait += r.waiting;
        totalTurnaround += r.turnaround;
    });

    let avgWait = (totalWait / completedCount).toFixed(2);
    let avgTurnaround = (totalTurnaround / completedCount).toFixed(2);
    
    // CPU Utilization
    let totalIdle = 0;
    simTimeline.forEach(seg => {
        if (seg.id === "IDLE") {
            totalIdle += (seg.end - seg.start);
        }
    });
    let cpuUtil = maxSimTime > 0 ? (((maxSimTime - totalIdle) / maxSimTime) * 100).toFixed(1) : 100;
    
    // Throughput (processes per unit time)
    let throughput = maxSimTime > 0 ? (completedCount / maxSimTime).toFixed(3) : 0;

    // Display values in cards
    document.getElementById("metricAWT").innerText = `${avgWait} cycles`;
    document.getElementById("metricATAT").innerText = `${avgTurnaround} cycles`;
    document.getElementById("metricUtil").innerText = `${cpuUtil}%`;
    document.getElementById("metricThroughput").innerText = `${throughput} proc/cycle`;

    // Render metrics single run chart
    renderRunChart();
}

/**
 * Render metrics chart for single run
 */
function renderRunChart() {
    let ctx = document.getElementById("chart").getContext("2d");
    let labels = simResults.map(r => r.id);
    let completionTimes = simResults.map(r => r.completion);
    let turnaroundTimes = simResults.map(r => r.turnaround);
    let waitingTimes = simResults.map(r => r.waiting);

    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Completion Time", data: completionTimes, backgroundColor: "#3b82f6" },
                { label: "Turnaround Time", data: turnaroundTimes, backgroundColor: "#10b981" },
                { label: "Waiting Time", data: waitingTimes, backgroundColor: "#ef4444" }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#94a3b8" } }
            },
            scales: {
                x: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } },
                y: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } }
            }
        }
    });
}

/**
 * Side-by-Side Multi-Algorithm Comparison Mode Engine
 */
function runComparisonAnalysis() {
    if (processes.length === 0) {
        alert("Please add processes first!");
        return;
    }

    // Get checked algorithms
    const checkboxes = document.querySelectorAll("#comparisonSelector input[type='checkbox']");
    let selectedAlgs = [];
    checkboxes.forEach(cb => {
        if (cb.checked) selectedAlgs.push(cb.value);
    });

    if (selectedAlgs.length === 0) {
        alert("Please select at least one algorithm to compare!");
        return;
    }

    let comparisonData = [];

    // Run each algorithm on the current processes workload
    selectedAlgs.forEach(alg => {
        let schedule = null;
        if (alg === "FCFS") schedule = runFCFS(processes);
        else if (alg === "SJF") schedule = runSJF(processes);
        else if (alg === "SRTF") schedule = runSRTF(processes);
        else if (alg === "RoundRobin") {
            const q = parseInt(document.getElementById("quantum").value) || 2;
            schedule = runRR(processes, q);
        }
        else if (alg === "Priority") schedule = runPriority(processes);
        else if (alg === "PreemptivePriority") schedule = runPreemptivePriority(processes);
        else if (alg === "MLFQ") {
            const q1 = parseInt(document.getElementById("q1Quantum").value) || 2;
            const q2 = parseInt(document.getElementById("q2Quantum").value) || 4;
            const aging = parseInt(document.getElementById("agingInterval").value) || 0;
            schedule = runMLFQ(processes, q1, q2, aging);
        }

        if (schedule) {
            let totalWait = 0;
            let totalTurnaround = 0;
            schedule.results.forEach(r => {
                totalWait += r.waiting;
                totalTurnaround += r.turnaround;
            });
            let avgWait = totalWait / processes.length;
            let avgTurnaround = totalTurnaround / processes.length;
            
            comparisonData.push({
                algorithmName: alg,
                awt: parseFloat(avgWait.toFixed(2)),
                atat: parseFloat(avgTurnaround.toFixed(2))
            });
        }
    });

    // Populate comparison chart
    let ctx = document.getElementById("chart").getContext("2d");
    let labels = comparisonData.map(d => d.algorithmName);
    let awtData = comparisonData.map(d => d.awt);
    let atatData = comparisonData.map(d => d.atat);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Average Waiting Time (AWT)", data: awtData, backgroundColor: "#06b6d4" },
                { label: "Average Turnaround Time (ATAT)", data: atatData, backgroundColor: "#a855f7" }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#94a3b8" } }
            },
            scales: {
                x: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } },
                y: { grid: { color: "#1e293b" }, ticks: { color: "#94a3b8" } }
            }
        }
    });

    // Hide clock and ready queue displays in comparison mode
    document.getElementById("liveStatusContainer").classList.add("hidden");
}

/**
 * Reset scheduler visual outputs (but preserve added processes list)
 */
function resetSchedulerVisuals() {
    pauseSimulation();
    simClock = 0;
    simTimeline = [];
    simResults = [];
    maxSimTime = 0;
    
    document.getElementById("clockVal").innerText = "0";
    document.getElementById("cpuDisplay").innerHTML = `<div class="cpu-idle">IDLE</div>`;
    document.getElementById("queueDisplay").innerHTML = `<span class="empty-msg">Queue Empty</span>`;
    document.getElementById("ganttChart").innerHTML = "";

    document.getElementById("metricAWT").innerText = "-";
    document.getElementById("metricATAT").innerText = "-";
    document.getElementById("metricUtil").innerText = "-";
    document.getElementById("metricThroughput").innerText = "-";

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    displayProcesses();
}

/**
 * Reset everything
 */
function resetSimulation() {
    processes = [];
    resetSchedulerVisuals();
}

// Bind slider text
document.getElementById("speedSlider").addEventListener("input", function(e) {
    const delay = 1100 - parseInt(e.target.value) * 100;
    document.getElementById("speedVal").innerText = `${delay}ms`;
    
    // If playing, restart interval with new speed
    if (isSimulationRunning) {
        clearInterval(simIntervalId);
        simIntervalId = setInterval(() => {
            stepSimulation();
        }, delay);
    }
});

// Initialize algorithm inputs on load
handleAlgorithmChange();
