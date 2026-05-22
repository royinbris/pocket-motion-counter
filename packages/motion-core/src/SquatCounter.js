export class SquatCounter {
    config;
    count = 0;
    state = 'idle';
    isActive = false;
    // LPF state
    lastFilteredMag = 9.8;
    // Callback lists
    countCallbacks = [];
    stateChangeCallbacks = [];
    completeCallbacks = [];
    debugCallbacks = [];
    // Timing control
    lastStateTransitionTime = 0;
    repStartTime = 0;
    constructor(config) {
        this.config = {
            lpfAlpha: 0.15,
            thresholdDown: 1.2, // Deviation from gravity (9.8 - 1.2 = 8.6 m/s^2)
            thresholdUp: 1.2, // Deviation from gravity (9.8 + 1.2 = 11.0 m/s^2)
            minRepDurationMs: 1200, // Regular squat takes at least 1.2s
            targetCount: config?.targetCount,
            ...config
        };
    }
    start() {
        this.isActive = true;
        this.reset();
    }
    stop() {
        this.isActive = false;
    }
    reset() {
        this.count = 0;
        this.state = 'idle';
        this.lastFilteredMag = 9.8;
        this.lastStateTransitionTime = Date.now();
        this.repStartTime = 0;
        this.notifyStateChange();
    }
    feed(sample) {
        if (!this.isActive)
            return;
        // Calculate acceleration magnitude (norm of 3D vector)
        const mag = Math.sqrt(sample.accelX * sample.accelX +
            sample.accelY * sample.accelY +
            sample.accelZ * sample.accelZ);
        // Apply Low-pass filter (EMA)
        const filteredMag = this.config.lpfAlpha * mag + (1 - this.config.lpfAlpha) * this.lastFilteredMag;
        this.lastFilteredMag = filteredMag;
        this.processFsm(filteredMag, sample.timestamp);
        this.triggerDebug(mag, filteredMag);
    }
    processFsm(mag, timestamp) {
        const gravity = 9.80665;
        const now = timestamp || Date.now();
        const timeInState = now - this.lastStateTransitionTime;
        switch (this.state) {
            case 'idle':
                // Descending detection: Acceleration drops below gravity - thresholdDown (freefall effect during squat start)
                if (mag < gravity - this.config.thresholdDown) {
                    this.changeState('descending', now);
                    this.repStartTime = now;
                }
                break;
            case 'descending':
                // Transition to Valley when acceleration returns close to gravity or rises (releasing downward speed)
                if (mag >= gravity - 0.2) {
                    this.changeState('valley', now);
                }
                break;
            case 'valley':
                // Transition to Ascending when acceleration shoots up above gravity + thresholdUp (pushing floor to rise)
                if (mag > gravity + this.config.thresholdUp) {
                    this.changeState('ascending', now);
                }
                // Timeout check: if stayed in valley/descending too long without going up, reset to idle (not a clean rep)
                if (timeInState > 4000) {
                    this.changeState('idle', now);
                }
                break;
            case 'ascending':
                // Return to Idle when acceleration stabilizes back around normal gravity range
                if (mag <= gravity + 0.3) {
                    const repDuration = now - this.repStartTime;
                    // Validate rep duration
                    if (repDuration >= this.config.minRepDurationMs) {
                        this.count++;
                        this.notifyCount();
                        if (this.config.targetCount && this.count >= this.config.targetCount) {
                            this.notifyComplete();
                            this.stop();
                        }
                    }
                    this.changeState('idle', now);
                }
                break;
        }
    }
    changeState(newState, timestamp) {
        if (this.state !== newState) {
            this.state = newState;
            this.lastStateTransitionTime = timestamp;
            this.notifyStateChange();
        }
    }
    // Event registration
    onCount(cb) {
        this.countCallbacks.push(cb);
    }
    onStateChange(cb) {
        this.stateChangeCallbacks.push(cb);
    }
    onComplete(cb) {
        this.completeCallbacks.push(cb);
    }
    onDebug(cb) {
        this.debugCallbacks.push(cb);
    }
    // Getters
    getCount() {
        return this.count;
    }
    getCurrentState() {
        return this.state;
    }
    // Notification dispatchers
    notifyCount() {
        this.countCallbacks.forEach(cb => cb(this.count));
    }
    notifyStateChange() {
        this.stateChangeCallbacks.forEach(cb => cb(this.state));
    }
    notifyComplete() {
        this.completeCallbacks.forEach(cb => cb());
    }
    triggerDebug(rawMag, filteredMag) {
        this.debugCallbacks.forEach(cb => cb({
            magnitude: rawMag,
            filteredMagnitude: filteredMag,
            state: this.state
        }));
    }
}
