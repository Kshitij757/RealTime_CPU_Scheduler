/**
 * scheduler.js
 * Core CPU Scheduling Algorithms Engine
 * Designed for real-time visualization of states and metrics.
 */

// Helper to deep copy processes and initialize remaining fields
function initProcesses(processes) {
    return processes.map(p => ({
        id: p.id,
        arrival: parseInt(p.arrival),
        burst: parseInt(p.burst),
        priority: p.priority !== null && p.priority !== undefined ? parseInt(p.priority) : 0,
        remaining: parseInt(p.burst),
        completion: 0,
        turnaround: 0,
        waiting: 0,
        startTime: -1
    }));
}

/**
 * 1. First Come First Served (FCFS)
 */
function runFCFS(rawProcesses) {
    let processes = initProcesses(rawProcesses).sort((a, b) => a.arrival - b.arrival);
    let time = 0;
    let timeline = [];
    
    processes.forEach(p => {
        if (time < p.arrival) {
            timeline.push({ id: "IDLE", start: time, end: p.arrival });
            time = p.arrival;
        }
        let start = time;
        p.startTime = start;
        time += p.burst;
        p.completion = time;
        p.turnaround = p.completion - p.arrival;
        p.waiting = p.turnaround - p.burst;
        timeline.push({ id: p.id, start, end: time });
    });
    
    return { results: processes, timeline };
}

/**
 * 2. Shortest Job First (SJF) - Non-preemptive
 */
function runSJF(rawProcesses) {
    let processes = initProcesses(rawProcesses);
    let n = processes.length;
    let time = 0;
    let completed = 0;
    let timeline = [];
    let isCompleted = new Array(n).fill(false);
    
    while (completed < n) {
        let idx = -1;
        let minBurst = Infinity;
        
        for (let i = 0; i < n; i++) {
            if (processes[i].arrival <= time && !isCompleted[i]) {
                if (processes[i].burst < minBurst) {
                    minBurst = processes[i].burst;
                    idx = i;
                } else if (processes[i].burst === minBurst) {
                    if (processes[i].arrival < processes[idx].arrival) {
                        idx = i;
                    }
                }
            }
        }
        
        if (idx !== -1) {
            let p = processes[idx];
            let start = time;
            p.startTime = start;
            time += p.burst;
            p.completion = time;
            p.turnaround = p.completion - p.arrival;
            p.waiting = p.turnaround - p.burst;
            timeline.push({ id: p.id, start, end: time });
            isCompleted[idx] = true;
            completed++;
        } else {
            // Find next arrival to advance time
            let nextArrival = Infinity;
            for (let i = 0; i < n; i++) {
                if (!isCompleted[i] && processes[i].arrival > time) {
                    nextArrival = Math.min(nextArrival, processes[i].arrival);
                }
            }
            let endIdle = nextArrival === Infinity ? time + 1 : nextArrival;
            timeline.push({ id: "IDLE", start: time, end: endIdle });
            time = endIdle;
        }
    }
    
    return { results: processes, timeline };
}

/**
 * 3. Shortest Remaining Time First (SRTF) - Preemptive SJF
 */
function runSRTF(rawProcesses) {
    let processes = initProcesses(rawProcesses);
    let n = processes.length;
    let time = 0;
    let completed = 0;
    let timeline = [];
    let lastId = null;
    let segmentStart = 0;
    
    while (completed < n) {
        let idx = -1;
        let minRemaining = Infinity;
        
        for (let i = 0; i < n; i++) {
            if (processes[i].arrival <= time && processes[i].remaining > 0) {
                if (processes[i].remaining < minRemaining) {
                    minRemaining = processes[i].remaining;
                    idx = i;
                } else if (processes[i].remaining === minRemaining) {
                    if (processes[i].arrival < processes[idx].arrival) {
                        idx = i;
                    }
                }
            }
        }
        
        if (idx !== -1) {
            let p = processes[idx];
            if (p.startTime === -1) p.startTime = time;
            
            if (lastId !== p.id) {
                if (lastId !== null) {
                    timeline.push({ id: lastId, start: segmentStart, end: time });
                }
                lastId = p.id;
                segmentStart = time;
            }
            p.remaining--;
            time++;
            if (p.remaining === 0) {
                p.completion = time;
                p.turnaround = p.completion - p.arrival;
                p.waiting = p.turnaround - p.burst;
                completed++;
            }
        } else {
            if (lastId !== "IDLE") {
                if (lastId !== null) {
                    timeline.push({ id: lastId, start: segmentStart, end: time });
                }
                lastId = "IDLE";
                segmentStart = time;
            }
            time++;
        }
    }
    
    if (lastId !== null) {
        timeline.push({ id: lastId, start: segmentStart, end: time });
    }
    
    return { results: processes, timeline: mergeTimeline(timeline) };
}

/**
 * 4. Round Robin (RR)
 */
function runRR(rawProcesses, quantum) {
    let processes = initProcesses(rawProcesses);
    let n = processes.length;
    let time = 0;
    let completed = 0;
    let timeline = [];
    
    let readyQueue = [];
    let inQueue = new Array(n).fill(false);
    
    // Sort processes by arrival initially
    let sorted = [...processes].sort((a, b) => a.arrival - b.arrival);
    
    // Check arrivals at time t=0
    sorted.forEach((p, idx) => {
        if (p.arrival <= time) {
            readyQueue.push(p);
            inQueue[processes.indexOf(p)] = true;
        }
    });
    
    while (completed < n) {
        if (readyQueue.length > 0) {
            let p = readyQueue.shift();
            if (p.startTime === -1) p.startTime = time;
            
            let execTime = Math.min(p.remaining, quantum);
            let start = time;
            
            p.remaining -= execTime;
            
            // Queue new arrivals during execution
            for (let t = 1; t <= execTime; t++) {
                sorted.forEach(sp => {
                    let spIdx = processes.indexOf(sp);
                    if (sp.arrival === start + t && !inQueue[spIdx]) {
                        readyQueue.push(sp);
                        inQueue[spIdx] = true;
                    }
                });
            }
            
            time += execTime;
            timeline.push({ id: p.id, start, end: time });
            
            if (p.remaining > 0) {
                readyQueue.push(p);
            } else {
                p.completion = time;
                p.turnaround = p.completion - p.arrival;
                p.waiting = p.turnaround - p.burst;
                completed++;
            }
        } else {
            // Find next arrival time
            let nextArrival = Infinity;
            sorted.forEach(sp => {
                let spIdx = processes.indexOf(sp);
                if (!inQueue[spIdx] && sp.arrival > time) {
                    nextArrival = Math.min(nextArrival, sp.arrival);
                }
            });
            let endIdle = nextArrival === Infinity ? time + 1 : nextArrival;
            timeline.push({ id: "IDLE", start: time, end: endIdle });
            time = endIdle;
            
            // Push newly arrived process
            sorted.forEach(sp => {
                let spIdx = processes.indexOf(sp);
                if (sp.arrival <= time && !inQueue[spIdx]) {
                    readyQueue.push(sp);
                    inQueue[spIdx] = true;
                }
            });
        }
    }
    
    return { results: processes, timeline };
}

/**
 * 5. Priority Scheduling - Non-preemptive
 * (Lower value = Higher priority)
 */
function runPriority(rawProcesses) {
    let processes = initProcesses(rawProcesses);
    let n = processes.length;
    let time = 0;
    let completed = 0;
    let timeline = [];
    let isCompleted = new Array(n).fill(false);
    
    while (completed < n) {
        let idx = -1;
        let highestPriority = Infinity;
        
        for (let i = 0; i < n; i++) {
            if (processes[i].arrival <= time && !isCompleted[i]) {
                if (processes[i].priority < highestPriority) {
                    highestPriority = processes[i].priority;
                    idx = i;
                } else if (processes[i].priority === highestPriority) {
                    if (processes[i].arrival < processes[idx].arrival) {
                        idx = i;
                    }
                }
            }
        }
        
        if (idx !== -1) {
            let p = processes[idx];
            let start = time;
            p.startTime = start;
            time += p.burst;
            p.completion = time;
            p.turnaround = p.completion - p.arrival;
            p.waiting = p.turnaround - p.burst;
            timeline.push({ id: p.id, start, end: time });
            isCompleted[idx] = true;
            completed++;
        } else {
            let nextArrival = Infinity;
            for (let i = 0; i < n; i++) {
                if (!isCompleted[i] && processes[i].arrival > time) {
                    nextArrival = Math.min(nextArrival, processes[i].arrival);
                }
            }
            let endIdle = nextArrival === Infinity ? time + 1 : nextArrival;
            timeline.push({ id: "IDLE", start: time, end: endIdle });
            time = endIdle;
        }
    }
    
    return { results: processes, timeline };
}

/**
 * 6. Preemptive Priority Scheduling
 * (Lower value = Higher priority)
 */
function runPreemptivePriority(rawProcesses) {
    let processes = initProcesses(rawProcesses);
    let n = processes.length;
    let time = 0;
    let completed = 0;
    let timeline = [];
    let lastId = null;
    let segmentStart = 0;
    
    while (completed < n) {
        let idx = -1;
        let highestPriority = Infinity;
        
        for (let i = 0; i < n; i++) {
            if (processes[i].arrival <= time && processes[i].remaining > 0) {
                if (processes[i].priority < highestPriority) {
                    highestPriority = processes[i].priority;
                    idx = i;
                } else if (processes[i].priority === highestPriority) {
                    if (processes[i].arrival < processes[idx].arrival) {
                        idx = i;
                    }
                }
            }
        }
        
        if (idx !== -1) {
            let p = processes[idx];
            if (p.startTime === -1) p.startTime = time;
            
            if (lastId !== p.id) {
                if (lastId !== null) {
                    timeline.push({ id: lastId, start: segmentStart, end: time });
                }
                lastId = p.id;
                segmentStart = time;
            }
            p.remaining--;
            time++;
            if (p.remaining === 0) {
                p.completion = time;
                p.turnaround = p.completion - p.arrival;
                p.waiting = p.turnaround - p.burst;
                completed++;
            }
        } else {
            if (lastId !== "IDLE") {
                if (lastId !== null) {
                    timeline.push({ id: lastId, start: segmentStart, end: time });
                }
                lastId = "IDLE";
                segmentStart = time;
            }
            time++;
        }
    }
    
    if (lastId !== null) {
        timeline.push({ id: lastId, start: segmentStart, end: time });
    }
    
    return { results: processes, timeline: mergeTimeline(timeline) };
}

/**
 * 7. Multi-Level Feedback Queue (MLFQ)
 * 3 Queues:
 * - Q1: Round Robin (quantum = q1Quantum, default 2)
 * - Q2: Round Robin (quantum = q2Quantum, default 4)
 * - Q3: FCFS
 * Preemption: A process in Q1 will preempt Q2/Q3. A process in Q2 will preempt Q3.
 * Aging: After `agingInterval` time units of waiting, a process is promoted to the next higher queue.
 */
function runMLFQ(rawProcesses, q1Quantum = 2, q2Quantum = 4, agingInterval = 20) {
    let processes = initProcesses(rawProcesses);
    let n = processes.length;
    let time = 0;
    let completed = 0;
    let timeline = [];
    
    // Track which queue each process is currently in: 1, 2, or 3
    let pQueues = processes.map(p => ({
        process: p,
        qNumber: 1, // Start in Q1
        lastQueueTime: p.arrival // For aging calculations
    }));
    
    let lastId = null;
    let segmentStart = 0;
    
    while (completed < n) {
        // 1. Process aging promotion
        if (agingInterval > 0) {
            pQueues.forEach(pq => {
                if (pq.process.remaining > 0 && pq.process.arrival <= time) {
                    let waitInQueue = time - pq.lastQueueTime;
                    if (waitInQueue >= agingInterval) {
                        if (pq.qNumber > 1) {
                            pq.qNumber--;
                            pq.lastQueueTime = time;
                        }
                    }
                }
            });
        }
        
        // 2. Select active process from the queues
        // Q1 processes
        let q1 = pQueues.filter(pq => pq.qNumber === 1 && pq.process.arrival <= time && pq.process.remaining > 0);
        // Q2 processes
        let q2 = pQueues.filter(pq => pq.qNumber === 2 && pq.process.arrival <= time && pq.process.remaining > 0);
        // Q3 processes
        let q3 = pQueues.filter(pq => pq.qNumber === 3 && pq.process.arrival <= time && pq.process.remaining > 0);
        
        let selectedPq = null;
        let quantum = 1;
        
        if (q1.length > 0) {
            // Q1 is scheduled by arrival/FCFS order in the queue
            selectedPq = q1.sort((a, b) => a.lastQueueTime - b.lastQueueTime)[0];
            quantum = q1Quantum;
        } else if (q2.length > 0) {
            selectedPq = q2.sort((a, b) => a.lastQueueTime - b.lastQueueTime)[0];
            quantum = q2Quantum;
        } else if (q3.length > 0) {
            selectedPq = q3.sort((a, b) => a.lastQueueTime - b.lastQueueTime)[0];
            quantum = Infinity; // Run to completion unless preempted by new arrival in Q1/Q2
        }
        
        if (selectedPq) {
            let p = selectedPq.process;
            if (p.startTime === -1) p.startTime = time;
            
            // Execute either for quantum, until remaining, or until preemption
            let start = time;
            let execLimit = Math.min(p.remaining, quantum);
            let ranTime = 0;
            
            // Check step-by-step for preemption by new arrivals
            for (let step = 0; step < execLimit; step++) {
                // If a process arrives in a higher queue, we must preempt
                let curTime = time + step;
                
                // Let's check if there are any higher queue arrivals at this exact instant
                let higherArrived = false;
                for (let i = 0; i < n; i++) {
                    let other = processes[i];
                    if (other.arrival === curTime && other.remaining > 0) {
                        let otherPq = pQueues.find(pq => pq.process === other);
                        if (otherPq.qNumber < selectedPq.qNumber) {
                            higherArrived = true;
                            break;
                        }
                    }
                }
                
                if (higherArrived && step > 0) {
                    break;
                }
                ranTime++;
            }
            
            // Record execution in timeline
            if (lastId !== p.id) {
                if (lastId !== null) {
                    timeline.push({ id: lastId, start: segmentStart, end: start });
                }
                lastId = p.id;
                segmentStart = start;
            }
            
            p.remaining -= ranTime;
            time += ranTime;
            
            if (p.remaining === 0) {
                p.completion = time;
                p.turnaround = p.completion - p.arrival;
                p.waiting = p.turnaround - p.burst;
                completed++;
            } else {
                // Demote if it used its full quantum
                if (ranTime === quantum) {
                    if (selectedPq.qNumber < 3) {
                        selectedPq.qNumber++;
                    }
                }
                selectedPq.lastQueueTime = time;
            }
        } else {
            // CPU is idle
            if (lastId !== "IDLE") {
                if (lastId !== null) {
                    timeline.push({ id: lastId, start: segmentStart, end: time });
                }
                lastId = "IDLE";
                segmentStart = time;
            }
            // Advance time to next arrival
            let nextArrival = Infinity;
            processes.forEach(p => {
                if (p.remaining > 0 && p.arrival > time) {
                    nextArrival = Math.min(nextArrival, p.arrival);
                }
            });
            time = nextArrival === Infinity ? time + 1 : nextArrival;
        }
    }
    
    if (lastId !== null) {
        timeline.push({ id: lastId, start: segmentStart, end: time });
    }
    
    return { results: processes, timeline: mergeTimeline(timeline) };
}

/**
 * Utility to merge consecutive timeline chunks with the same ID
 */
function mergeTimeline(timeline) {
    if (timeline.length === 0) return [];
    let merged = [];
    timeline.forEach(seg => {
        if (merged.length > 0 && merged[merged.length - 1].id === seg.id) {
            merged[merged.length - 1].end = seg.end;
        } else {
            if (seg.start !== seg.end) {
                merged.push({ ...seg });
            }
        }
    });
    return merged;
}

// Export for browser modules or node environments if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runFCFS,
        runSJF,
        runSRTF,
        runRR,
        runPriority,
        runPreemptivePriority,
        runMLFQ
    };
}
