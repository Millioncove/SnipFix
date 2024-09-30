import { MediaTrack } from "./MediaTrack.js";

export class Timeline {
    #videoUpdateIntervalID;
    #programmableStyleSheet;
    isPlaying = false;
    videoTrack;
    allTracks = [];
    keyframePts = [];
    #currentTime = null;
    frameRate;
    duration;

    get audioTracks() {
        const foundAudioTracks = [];
        for (const track of this.allTracks) {
            if (!track.isVideoTrack) {
                foundAudioTracks.push(track);
            }
        }
        return foundAudioTracks;
    }

    get currentTime() { return this.#currentTime; }
    set currentTime(value) {
        this.#currentTime = parseFloat(value);
        for (const track of this.allTracks) {
            track.mediaElement.currentTime = this.#currentTime;
        }
        this.syncPlayheadToMedia();
    }

    get currentFrameIndex() {
        if (this.frameRate == null || this.frameRate == undefined) {
            console.error("Cannot get current frame index when frame rate is not set!");
        }
        return Math.floor(this.#currentTime * this.frameRate);
    }
    set currentFrameIndex(newFrame) {
        this.currentTime = parseInt(newFrame) / this.frameRate; // Calls setter inherently...
    }

    constructor() {
        this.Container = document.getElementById('TracksTimeline');
        this.startBound = document.getElementById('TimelineStartBound');
        this.endBound = document.getElementById('TimelineEndBound');
        this.playhead = document.getElementById('Playhead');
        this.#programmableStyleSheet = new CSSStyleSheet();
        document.adoptedStyleSheets.push(this.#programmableStyleSheet);

        // Make sure end bound is after start bound and keep a minimum distance of 1.
        this.startBound.oninput = () => {
            if (parseInt(this.endBound.value) - parseInt(this.startBound.value) <= 1) {
                this.startBound.value = parseInt(this.endBound.value) - 1;
            }
        };
        this.endBound.oninput = () => {
            if (parseInt(this.endBound.value) - parseInt(this.startBound.value) <= 1) {
                this.endBound.value = parseInt(this.startBound.value) + 1;
            }
        };
    }

    play() {
        if (this.allTracks.length <= 0) { console.warn("Cannot play media if there are no tracks!"); return; }

        for (const track of this.allTracks) {
            track.mediaElement.currentTime = this.#currentTime;
            track.mediaElement.play();
        }
        this.#videoUpdateIntervalID = setInterval(() => {
            // TODO: Investigate if more fidelity in time domain can be achieved by
            // calculating currentTime instead of reading from media.
            this.#currentTime = this.videoTrack.mediaElement.currentTime;
            this.syncPlayheadToMedia();
            this.keepMediaWithinBounds();
        }, 1.0 / this.frameRate);

        this.isPlaying = true;
    }

    pause() {
        if (this.allTracks.length <= 0) { console.warn("Cannot pause media if there are no tracks!"); return; }

        for (const track of this.allTracks) {
            track.mediaElement.pause();
        }

        clearInterval(this.#videoUpdateIntervalID);
        this.#videoUpdateIntervalID = null;

        this.isPlaying = false;
    }

    togglePlaying() {
        if (this.allTracks.length <= 0) { console.warn("Cannot play media if there are no tracks!"); return; }

        if (this.videoTrack.mediaElement.ended || this.currentFrameIndex == this.endBound.value) {
            this.currentFrameIndex = this.startBound.value;
        }
        if (!this.isPlaying) { this.play(); }
        else { this.pause(); }
    }

    timeOfFrame(frameIndex) {
        return frameIndex / this.frameRate;
    }

    findClosestKeyframePtsTime(desiredTime) {
        let closestTime = this.keyframePts[0];
        for (const time of this.keyframePts) {
            if (Math.abs(time - desiredTime) < Math.abs(closestTime - desiredTime)) {
                closestTime = time;
            }
        }
        if (Math.abs(closestTime - desiredTime) > 2) { console.warn("Closest keyframe was more than 2 seconds away?!?"); }
        return closestTime;
    }

    get closestKeyframePtsToStartBound() {
        return this.findClosestKeyframePtsTime(this.startBound.value / this.frameRate);
    }

    get closestKeyframePtsToEndBound() {
        return this.findClosestKeyframePtsTime(this.endBound.value / this.frameRate);
    }

    // Sync the playhead with the video time.
    syncPlayheadToMedia() {
        this.playhead.value = this.currentFrameIndex; // slider thumb position = the index of the current frame
    }

    // Sync the video frame with the playhead.
    syncMediaToPlayhead() {
        this.currentFrameIndex = this.playhead.value;
    }

    createMediaTrack(trackName, mediaElement) {
        const newMediaTrack = new MediaTrack(trackName, mediaElement);
        newMediaTrack.setAttribute("draggable", "false");
        this.Container.appendChild(newMediaTrack);
        this.allTracks.push(newMediaTrack);
        this.syncBoundHeightToNumTracks();
        this.colorizeAllClips();
        newMediaTrack.mediaElement.currentTime = this.#currentTime;
        return newMediaTrack;
    }

    syncBoundHeightToNumTracks() {
        this.#programmableStyleSheet.replaceSync(".timeline-slider {height: " + (5 * this.allTracks.length - 1) + "rem}");
    }

    colorizeAllClips() {
        for (const mediaTrack of this.allTracks) {
            mediaTrack.colorizeTrack();
        }
    }

    // Make sure the video stops when it is seeked past or played into a bound.
    keepMediaWithinBounds() {
        const clipStartTime = this.startBound.value / this.frameRate;
        const clipEndTime = this.endBound.value / this.frameRate;

        // Stop the video if it hits the end bound while playing.
        if (this.isPlaying && this.#currentTime >= clipEndTime - (1 / this.frameRate)) {
            this.pause();
            this.currentTime = clipEndTime;
        }

        // Stop the user from dragging the playhead past a bound.
        this.playhead.value = Math.min(Math.max(parseInt(this.playhead.value), parseInt(this.startBound.value)), parseInt(this.endBound.value));

        // Actually keep video within bounds.
        if (this.#currentTime > clipEndTime) {
            this.currentFrameIndex = this.endBound.value;
        }
        if (this.#currentTime < clipStartTime) {
            this.currentFrameIndex = this.startBound.value;
        }
        this.colorizeAllClips();
    }
}
