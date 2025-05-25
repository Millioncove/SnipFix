import { Timeline } from "./TrackTimeline.js";
import { extractAudioStreamNamesFromFileData, isStringInObjectWithArrays, blobToUint8Array, CreateDownloadLink, respace } from "./Utils.js"
import Crunker from 'https://unpkg.com/crunker@latest/dist/crunker.esm.js';
import { setVideo, setEditorVisibility } from "./script.js";
import { icons } from "./GalleryEntry.js";
import { audioFilePrefix } from "./MediaTrack.js";
const { createFFmpeg, fetchFile } = FFmpeg;

const debug = false;

const tasks = Object.freeze({
    NONE: Symbol("none"),
    WRITING: Symbol("Writing to file system..."),
    FINDING_KEYFRAMES: Symbol("Finding keyframes..."),
    RENDERING: Symbol("Rendering..."),
    EXTRACTING: Symbol("Extracting audio..."),
    REMOVING: Symbol("Removing audio..."),
    ADDING_AUDIO: Symbol("Adding audio..."),
    MERGING: Symbol("Merging audio..."),
    COMPRESSING: Symbol("Compressing file size..."),
    SCALING: Symbol("Scaling Audio...")
})

export class SnipFix {
    #ffmpeg;
    #crunker;
    #currentTask;
    #programmableStyleSheet;
    #keyframeSearchStartTime;
    #snapToKeyframes = true;
    files = {
        loudInput: "loudInput.mp4",
        loudInputAudioStreams: [],
        silencedInput: "silencedInput.mp4",
        segmentBetweenBoundsSilent: "segmentBetweenBoundsSilent.mp4",
        segmentBetweenBoundsAudioStreams: [],
        segmentBetweenBoundsAudioStreamsVolumeAdjusted: [],
        segmentBetweenBoundsAudioMergedUselessWAV: "segmentBetweenBoundsMergedAudio.wav",
        segmentBetweenBoundsAudioMergedWell: "segmentBetweenBoundsMergedAudio.aac",
        segmentBetweenBoundsLoud: "segmentBetweenBoundsLoud.mp4",
        segmentBetweenBoundsLoudCompressed: "segmentBetweenBoundsLoudCompressed.mp4",
    };
    timeline;

    get isBusyProcessing() {
        return this.#currentTask != tasks.NONE;
    }

    get currentTask() {
        return this.#currentTask;
    }

    set currentTask(task) {
        if (!Object.values(tasks).includes(task)) { console.error("Trying to set unrecognized task: " + task); }
        else { this.#currentTask = task; }

        for (const processingButton of document.getElementsByClassName("video-processing-starter")) {
            processingButton.disabled = this.isBusyProcessing;
        }

        for (const processingButton of document.getElementsByClassName("processing-indicator")) {
            processingButton.style.display = this.isBusyProcessing ? "flex" : "none";
        }

        for (const processingStatus of document.getElementsByClassName("processing-status")) {
            processingStatus.textContent = task.description;
        }

        for (const bound of document.getElementsByClassName("bound")) {
            bound.disabled = this.isBusyProcessing;
        }
        const cursor = this.isBusyProcessing ? "not-allowed" : "pointer";
        this.#programmableStyleSheet.replaceSync(`.timeline-slider::-moz-range-thumb { cursor: ${cursor}; }`)

        // Let the user know they don't have to wait for the compressed file.
        document.getElementById("Hint").style.display = task == tasks.COMPRESSING ? "flex" : "none";
    }

    get snapToKeyframes() {
        return this.#snapToKeyframes;
    }

    set snapToKeyframes(yesOrNo) {
        for (const bound of document.getElementsByClassName("bound")) {
            bound.attributes.list.value = yesOrNo ? "KeyFrameTimes" : "";
        }
    }

    constructor() {
        this.#ffmpeg = createFFmpeg({ log: false });
        this.#ffmpeg.setLogger(this.#ffmpegLogHandler.bind(this)); // javascript is massive feces
        this.#crunker = new Crunker(); // TODO: Investigate if sample rate matters here.
        this.#programmableStyleSheet = new CSSStyleSheet();
        document.adoptedStyleSheets.push(this.#programmableStyleSheet);
        this.timeline = new Timeline();
        this.currentTask = tasks.NONE;

        if (debug) {
            window.ffmpeg = this.#ffmpeg;
            window.snipFix = this;
        }

        // Keep video within bounds when bounds or playhead are moved.
        // Also make sure the inside of the bounds has a slight color shift.
        for (const slider of document.getElementsByClassName("timeline-slider")) {
            slider.addEventListener("input", this.timeline.keepMediaWithinBounds.bind(this.timeline));
        }

        // Seek in the video by dragging the playhead.
        this.timeline.playhead.addEventListener("input", () => {
            this.timeline.pause();
            this.timeline.syncMediaToPlayhead();
            this.timeline.updateCurrentTimeIndicator();
        });

        // Add functionality to play button(s).
        for (const button of document.getElementsByClassName("play-pause")) {
            button.addEventListener("click", this.timeline.togglePlaying.bind(this.timeline)); // wtf javascript
        }
    }

    loadFFmpeg() {
        this.#ffmpeg.load();
    }

    #ffmpegLogHandler(typeAndMessage) {

        // Try to scan for the framerate of the video.
        if (this.timeline.frameRate == undefined && typeAndMessage.message.includes("Video:")) {
            this.#extractFrameRate(typeAndMessage.message);
        }

        // Miscellaneous output scanners...
        switch (this.currentTask) {
            // Catch showinfo messages to find keyframe pts times.
            case tasks.FINDING_KEYFRAMES:
                if (typeAndMessage.type == "fferr" && typeAndMessage.message.includes("iskey:1")) {
                    this.#extractPtsTimeFromShowinfoExcerpt(typeAndMessage.message);
                    return;
                }
                break;
        }

        // Scan for end of current "run" call to clear busy state.
        if (typeAndMessage.type == "ffout" && typeAndMessage.message.includes("FFMPEG_END")) {
            if (this.currentTask == tasks.FINDING_KEYFRAMES) { console.log(this.timeline.keyframePts); }
            this.currentTask = tasks.NONE;
            console.log("FFmpeg is no longer busy.");
        }

        console.log(`[${typeAndMessage.type}] ` + typeAndMessage.message);
    }

    // Writes a video file to the ffmpeg file system and extracts audio streams into files.
    async writeLoudInputVideo(fileData) {
        this.#ffmpeg.FS('writeFile', this.files.loudInput, fileData);

        var streamNames = extractAudioStreamNamesFromFileData(fileData);

        for (let i = 0; i < streamNames.length || i == 0; i++) {
            const streamName = streamNames.length == 0 ? "Audio" : streamNames[i];
            await this.#extractAudioStreamFromLoudInput(i, streamName);
            const audioBlob = this.fileToBlobURL(this.files.loudInputAudioStreams[i], 'audio/mpeg');
            const newAudioTrack = this.timeline.createMediaTrack(streamName);
            newAudioTrack.mediaElement.src = audioBlob.url;
            CreateDownloadLink(icons.AUDIO, `${streamName}.aac`, streamName, audioBlob.url, audioBlob.size);
        }
        await this.silenceLoudInput();
    }

    // Returns the file data of a file if it exists in the ffmpeg file system. 
    readMediaFile(fileName) {
        fileName = respace(fileName);
        if (!isStringInObjectWithArrays(fileName, this.files)) { console.error("Trying to read file that doesn't exist: " + fileName); return; }
        return this.#ffmpeg.FS('readFile', fileName);
    }

    #extractFrameRate(videoMetaData) {
        const tokens = videoMetaData.replaceAll(",", "").split(" ");
        const fpsUnitIndex = tokens.indexOf("fps");
        if (fpsUnitIndex > 1) {
            const supposedFps = parseInt(tokens[fpsUnitIndex - 1]);
            if (0 < supposedFps && supposedFps < 9999) {
                this.timeline.frameRate = supposedFps;
                console.log(`Found the framerate to be ${supposedFps} fps.`);
            }
        }
    }

    #extractPtsTimeFromShowinfoExcerpt(showinfoFrameOutput) {
        const keyframesListElem = document.getElementById("KeyFrameTimes");
        let frameInfoPoints = showinfoFrameOutput.split(" ").filter(str => str.length > 0);
        for (const infoPoint of frameInfoPoints) {
            if (infoPoint.startsWith("pts_time:")) {
                const foundKeyframePtsTime = this.#keyframeSearchStartTime + parseFloat(infoPoint.substring("pts_time:".length));
                const oneFrameDuration = 1 / this.timeline.frameRate;
                if (!this.timeline.keyframePts.some(pts => Math.abs(pts - foundKeyframePtsTime) < oneFrameDuration)) {
                    this.timeline.keyframePts.push(foundKeyframePtsTime);
                    keyframesListElem.appendChild(new Option("", Math.round(this.timeline.frameRate * foundKeyframePtsTime)));
                };
            }
        }
    }

    async findKeyframePtsAroundTime(aroundTimeSeconds, searchTimeWindowSeconds) {
        if (this.isBusyProcessing) {
            console.error("Cannot start keyframe search when busy.");
            return;
        }

        this.#keyframeSearchStartTime = parseFloat(aroundTimeSeconds) - parseFloat(searchTimeWindowSeconds) / 2;
        searchTimeWindowSeconds = Math.min(searchTimeWindowSeconds, this.timeline.duration); // Only look for keyframes INSIDE video.
        if (this.#keyframeSearchStartTime < 0) { this.#keyframeSearchStartTime = 0 }
        if (this.#keyframeSearchStartTime > this.timeline.duration) {
            this.#keyframeSearchStartTime = this.timeline.duration - searchTimeWindowSeconds
        }

        this.currentTask = tasks.FINDING_KEYFRAMES;
        await this.#ffmpeg.run("-ss", this.#keyframeSearchStartTime.toString(), '-i', this.files.loudInput, "-t", searchTimeWindowSeconds.toString(),
            '-vf', "select='eq(pict_type,I)',showinfo", '-f', 'null', "-")
    }

    async findKeyframePtsFull() {
        if (this.isBusyProcessing) {
            console.error("Cannot start keyframe search when busy.");
            return;
        }

        this.#keyframeSearchStartTime = 0;

        this.currentTask = tasks.FINDING_KEYFRAMES;
        await this.#ffmpeg.run('-i', this.files.loudInput, '-vf', "select='eq(pict_type,I)',showinfo", '-f', 'null', "-");
    }

    async #trimSegmentOfMedia(inputFileName, outputFileName, fromTime = 0, toTime = Infinity) {
        if (this.isBusyProcessing) {
            console.error("Cannot start rendering when busy.");
            return;
        }

        let ss = [];
        if (fromTime != 0) {
            ss = ['-ss', fromTime.toString()];
        }

        let to = [];
        if (toTime != Infinity) {
            to = ['-to', toTime.toString()];
        }

        this.currentTask = tasks.RENDERING;
        await this.#ffmpeg.run('-i', inputFileName, ...ss, ...to, "-c", "copy", outputFileName);
    }

    async renderSegmentBetweenBounds() {
        let endTime = Infinity;
        const oneFrameDuration = 1 / this.timeline.frameRate;
        if (Math.abs(this.timeline.closestKeyframePtsToEndBound - this.timeline.duration) > oneFrameDuration) {
            endTime = this.timeline.closestKeyframePtsToEndBound;
        }
        await this.#trimSegmentOfMedia(this.files.silencedInput,
            this.files.segmentBetweenBoundsSilent,
            this.timeline.closestKeyframePtsToStartBound,
            endTime
        );

        this.files.segmentBetweenBoundsAudioStreams = []; // Remove discarded audio streams if any from previous cuts.

        for (let i = 0; i < this.files.loudInputAudioStreams.length; i++) {
            const audioStreamName = this.files.loudInputAudioStreams[i];
            const segmentAudioStreamName = respace(audioStreamName.replace(".aac", "") + "BetweenBounds.aac");
            this.files.segmentBetweenBoundsAudioStreams.push(segmentAudioStreamName);

            await this.#trimSegmentOfMedia(audioStreamName,
                segmentAudioStreamName,
                this.timeline.closestKeyframePtsToStartBound,
                endTime
            );

            const audioBlob = this.fileToBlobURL(segmentAudioStreamName, 'audio/mpeg');
            this.timeline.audioTracks[i].mediaElement.src = audioBlob.url;
        }

        await this.#scaleAudioFiles();
        await this.#createMergedAudioFile();
        await this.#addAudioStreamsToSegmentBetweenBounds(this.files.segmentBetweenBoundsAudioMergedWell);
    }

    CalculateTargetBitrateFromVideoLength() {
        const endTime = this.timeline.endBound.value / this.timeline.frameRate;
        const startTime = this.timeline.startBound.value / this.timeline.frameRate;
        const trimmedDuration = endTime - startTime;

        return (64 * 1024 * 1024) / trimmedDuration;
    }

    async #CompressSegmentBetweenBounds() {
        this.currentTask = tasks.COMPRESSING;
        const targetBitrate = Math.floor(this.CalculateTargetBitrateFromVideoLength() * 0.95).toString();

        await this.#ffmpeg.run("-i", respace(this.files.segmentBetweenBoundsLoud), "-b:v", targetBitrate,
            "-maxrate", targetBitrate, respace(this.files.segmentBetweenBoundsLoudCompressed));

        const compressedResult = this.fileToBlobURL(this.files.segmentBetweenBoundsLoudCompressed, 'video/mp4');
        CreateDownloadLink(icons.VIDEO, "Trimmed-compressed.mp4", "Compressed trimmed video (merged audio)", compressedResult.url, compressedResult.size);
    }

    async #extractAudioStreamFromLoudInput(streamIndex, nameForFile) {
        if (this.isBusyProcessing) {
            console.error("Cannot start audio extraction when busy.");
            return;
        }

        this.currentTask = tasks.EXTRACTING;
        const newAudioStreamFileName = respace(audioFilePrefix + nameForFile + ".aac");
        this.files.loudInputAudioStreams.push(newAudioStreamFileName);
        await this.#ffmpeg.run("-i", respace(this.files.loudInput), "-filter:a", "loudnorm", "-map", "0:a:" + streamIndex.toString(), /*"-c", "copy",*/ respace(newAudioStreamFileName));
    }

    // Creates a silent version of the input video file.
    async silenceLoudInput() {
        if (this.isBusyProcessing) {
            console.error("Cannot start audio silencing when busy.");
            return;
        }

        this.currentTask = tasks.REMOVING;
        await this.#ffmpeg.run("-i", this.files.loudInput, "-c", "copy", "-an", this.files.silencedInput);

        // Create download link for silent video.
        const silenced = this.fileToBlobURL(this.files.silencedInput, 'video/mp4');
        CreateDownloadLink(icons.VIDEO, 'video-silenced.mp4', 'Silent video', silenced.url, silenced.size);
    }

    async #addAudioStreamsToSegmentBetweenBounds(...audioFileNames) {
        let audioStreamFileNames = "";
        let audioStreamMapFlags = "";

        for (let i = 0; i < audioFileNames.length; i++) {
            const audioFileName = audioFileNames[i];
            console.log("Adding audio: " + audioFileName);
            audioStreamFileNames += `-i ${audioFileName} `;
            audioStreamMapFlags += `-map ${(i + 1).toString()}:a:0 `;
        }

        const allFlags = `-i ${this.files.segmentBetweenBoundsSilent} ${audioStreamFileNames}${audioStreamMapFlags}-map 0:v:0 -c copy ${this.files.segmentBetweenBoundsLoud}`.split(" ");
        this.currentTask = tasks.ADDING_AUDIO;
        await this.#ffmpeg.run(...allFlags);
    }

    async #scaleAudioFiles() {
        for (const audioFileName of this.files.segmentBetweenBoundsAudioStreams) {
            const correspondingTrack = this.timeline.audioTracks.find((track) => audioFileName.includes(respace(track.name)));
            if (correspondingTrack != undefined) {

                const volumeFactor = correspondingTrack.linearGain;
                const scaledFileName = respace(audioFileName.replace(".aac", "") + "Scaled.aac");

                this.currentTask = tasks.SCALING;
                await this.#ffmpeg.run("-i", audioFileName, "-filter:a", `volume=${volumeFactor}`, scaledFileName);
                this.files.segmentBetweenBoundsAudioStreamsVolumeAdjusted.push(scaledFileName);
            }
            else {
                this.files.segmentBetweenBoundsAudioStreamsVolumeAdjusted.push(audioFileName);
            }
        }
    }

    async #createMergedAudioFile() {
        const dataOfAudioFiles = [];
        for (const audioFileName of this.files.segmentBetweenBoundsAudioStreamsVolumeAdjusted) {
            dataOfAudioFiles.push(this.readMediaFile(audioFileName));
        }

        const buffers = await Promise.all(
            Array.from(dataOfAudioFiles).map(async (file) => this.#crunker._context.decodeAudioData(file.buffer))
        );
        const merged = await this.#crunker.mergeAudio(buffers);
        const output = await this.#crunker.export(merged, 'audio/mp3');
        const uint8Array = await blobToUint8Array(output.blob);
        await this.#ffmpeg.FS('writeFile', this.files.segmentBetweenBoundsAudioMergedUselessWAV, uint8Array);
        await this.#ffmpeg.run("-i", this.files.segmentBetweenBoundsAudioMergedUselessWAV, this.files.segmentBetweenBoundsAudioMergedWell);
        const mergedBlob = this.fileToBlobURL(this.files.segmentBetweenBoundsAudioMergedWell);
        CreateDownloadLink(icons.AUDIO, "mergedAudio.wav", "Merged audio", mergedBlob.url, mergedBlob.size);
    }

    async PerformMainEdit() {
        await this.renderSegmentBetweenBounds();

        this.timeline.removeAllTracks();
        const trimmedResult = this.fileToBlobURL(this.files.segmentBetweenBoundsLoud);
        setVideo(trimmedResult.url);

        CreateDownloadLink(icons.VIDEO, 'trimmed.mp4', 'Trimmed video (merged audio)', trimmedResult.url, trimmedResult.size);

        if (trimmedResult.size >= 10 * (2 ** 20)) {
            await this.#CompressSegmentBetweenBounds();
        }
    }

    fileToBlobURL(filename, MIMEType) {
        const data = this.readMediaFile(filename);
        const fileBlob = new Blob([data.buffer], { type: MIMEType });
        const blobURL = URL.createObjectURL(fileBlob);
        return { url: blobURL, size: fileBlob.size };
    }

    async UploadListener(event) {
        const file = event.target.files[0];
        if (!file) return;

        document.getElementById("UploadButton").style.display = "none";
        await this.writeLoudInputVideo(await fetchFile(file));

        setVideo(this.fileToBlobURL(this.files.silencedInput, 'video/mp4').url);

        await this.findKeyframePtsFull();
        if (this.timeline.keyframePts.length < 2) {
            console.warn("Not even 2 keyframes in this file... Disabling key frame snap.")
            this.snapToKeyframes = false;
        }

        setEditorVisibility(true);
    }
}