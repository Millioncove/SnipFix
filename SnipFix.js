import { Timeline } from "./TrackTimeline.js";
import { extractAudioStreamNamesFromFileData, isStringInObjectWithArrays, blobToUint8Array, CreateDownloadLink } from "./Utils.js"
import Crunker from 'https://unpkg.com/crunker@latest/dist/crunker.esm.js';
const { createFFmpeg } = FFmpeg;

const tasks = Object.freeze({
    NONE: Symbol("none"),
    WRITING: Symbol("writing"),
    FINDING_KEYFRAMES: Symbol("finding_keyframes"),
    RENDERING: Symbol("rendering"),
    EXTRACTING: Symbol("extracting"),
    REMOVING: Symbol("removing"),
    ADDING_AUDIO: Symbol("adding_audio"),
    MERGING: Symbol("merging"),
})

export class SnipFix {
    #ffmpeg;
    #crunker;
    #currentTask;
    #programmableStyleSheet;
    #keyframeSearchStartTime;
    files = {
        loudInput: "loudInput.mp4",
        loudInputAudioStreams: [],
        silencedInput: "silencedInput.mp4",
        segmentBetweenBoundsSilent: "segmentBetweenBoundsSilent.mp4",
        segmentBetweenBoundsAudioStreams: [],
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
    }

    constructor() {
        this.#ffmpeg = createFFmpeg({ log: false });
        this.#ffmpeg.setLogger(this.#ffmpegLogHandler.bind(this)); // javascript is massive feces
        this.#crunker = new Crunker(); // TODO: Investigate if sample rate matters here.
        this.currentTask = tasks.NONE;
        this.#programmableStyleSheet = new CSSStyleSheet();
        document.adoptedStyleSheets.push(this.#programmableStyleSheet);
        this.timeline = new Timeline();

        // Keep video within bounds when bounds or playhead are moved.
        // Also make sure the inside of the bounds has a slight color shift.
        for (const slider of document.getElementsByClassName("timeline-slider")) {
            slider.addEventListener("input", this.timeline.keepMediaWithinBounds.bind(this.timeline));
        }

        for (const bound of document.getElementsByClassName("bound")) {
            bound.addEventListener("mouseup", (e) => {
                this.findKeyframePtsAroundTime(this.timeline.timeOfFrame(e.target.value), 1.6);
            });
        }

        // Seek in the video by dragging the playhead.
        this.timeline.playhead.addEventListener("input", () => { this.timeline.pause(); this.timeline.syncMediaToPlayhead(); });

        // Add functionality to play button(s).
        for (const button of document.getElementsByClassName("play-pause")) {
            button.addEventListener("click", this.timeline.togglePlaying.bind(this.timeline)); // wtf javascript
        }
    }

    loadFFmpeg() {
        this.#ffmpeg.load();
    }

    #ffmpegLogHandler(typeAndMessage) {

        switch (this.currentTask) {
            // Catch showinfo messages to find keyframe pts times.
            case tasks.FINDING_KEYFRAMES:
                if (typeAndMessage.type == "fferr" && typeAndMessage.message.includes("iskey:1")) {
                    this.#extractPtsTimeFromShowinfoExcerpt(typeAndMessage.message);
                    return;
                }
                break;
        }

        if (typeAndMessage.type == "ffout" && typeAndMessage.message.includes("FFMPEG_END")) {
            if (this.currentTask == tasks.FINDING_KEYFRAMES) { console.log(this.timeline.keyframePts); }
            this.currentTask = tasks.NONE;
            console.log("FFmpeg is no longer busy.");
        }

        console.log(`[${typeAndMessage.type}] ` + typeAndMessage.message);
    }

    // Writes a video file to the ffmpeg file system and extracts audio streams into files.
    async writeLoudInputVideo(fileData) {

        console.log(fileData);
        this.#ffmpeg.FS('writeFile', this.files.loudInput, fileData);

        var streamNames = extractAudioStreamNamesFromFileData(fileData);

        for (let i = 0; i < streamNames.length; i++) {
            const stream = streamNames[i];
            await this.#extractAudioStreamFromLoudInput(i);

            const data = this.readMediaFile(this.files.loudInputAudioStreams[i]);
            const audioBlob = new Blob([data.buffer], { type: 'audio/mpeg' });
            const audioURL = URL.createObjectURL(audioBlob);

            const newAudioTrack = this.timeline.createMediaTrack(stream);
            newAudioTrack.mediaElement.src = audioURL;

            CreateDownloadLink(`audio${i}.aac`, `Download audio ${i} `, audioURL);
        }
        await this.silenceLoudInput();
    }

    // Returns the file data of a file if it exists in the ffmpeg file system. 
    readMediaFile(file) {
        if (!isStringInObjectWithArrays(file, this.files)) { console.error("Trying to read file that doesn't exist: " + file); return; }
        return this.#ffmpeg.FS('readFile', file);
    }

    #extractPtsTimeFromShowinfoExcerpt(showinfoFrameOutput) {
        let frameInfoPoints = showinfoFrameOutput.split(" ").filter(str => str.length > 0);

        for (const infoPoint of frameInfoPoints) {
            if (infoPoint.startsWith("pts_time:")) {
                const foundKeyframePtsTime = this.#keyframeSearchStartTime + parseFloat(infoPoint.substring("pts_time:".length));
                if (!this.timeline.keyframePts.includes(foundKeyframePtsTime)) {
                    this.timeline.keyframePts.push(foundKeyframePtsTime);
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

    async #renderSegmentOfMedia(inputFileName, fromTime, toTime, outputFileName) {
        if (this.isBusyProcessing) {
            console.error("Cannot start rendering when busy.");
            return;
        }

        this.currentTask = tasks.RENDERING;
        await this.#ffmpeg.run('-i', inputFileName, '-ss', fromTime.toString(), '-to', toTime.toString(), "-c", "copy", outputFileName);
    }

    async renderSegmentBetweenBounds() {
        await this.#renderSegmentOfMedia(this.files.silencedInput,
            this.timeline.closestKeyframePtsToStartBound,
            this.timeline.closestKeyframePtsToEndBound,
            this.files.segmentBetweenBoundsSilent);

        this.files.segmentBetweenBoundsAudioStreams = []; // Remove discarded audio streams if any from previous cuts.

        for (let i = 0; i < this.files.loudInputAudioStreams.length; i++) {
            const audioStreamName = this.files.loudInputAudioStreams[i];
            const segmentAudioStreamName = "segmentBetweenBoundsAudio" + i + ".aac";
            this.files.segmentBetweenBoundsAudioStreams.push(segmentAudioStreamName);

            await this.#renderSegmentOfMedia(audioStreamName,
                this.timeline.closestKeyframePtsToStartBound,
                this.timeline.closestKeyframePtsToEndBound,
                segmentAudioStreamName);

            const data = this.readMediaFile(segmentAudioStreamName);
            const audioBlob = new Blob([data.buffer], { type: 'audio/mpeg' });
            const audioURL = URL.createObjectURL(audioBlob);
            this.timeline.audioTracks[i].mediaElement.src = audioURL;
        }

        await this.#createMergedAudioFile();
        await this.#addAudioStreamsToSegmentBetweenBounds(this.files.segmentBetweenBoundsAudioMergedWell);
        await this.#CompressSegmentBetweenBounds();
    }

    CalculateTargetBitrateFromVideoLength() {
        const endTime = this.timeline.endBound.value / this.timeline.frameRate;
        const startTime = this.timeline.startBound.value / this.timeline.frameRate;
        const trimmedDuration = endTime - startTime;

        return (64 * 1024 * 1024) / trimmedDuration;
    }

    async #CompressSegmentBetweenBounds() {
        this.currentTask = tasks.RENDERING;
        const targetBitrate = Math.floor(this.CalculateTargetBitrateFromVideoLength() * 0.95).toString();

        await this.#ffmpeg.run("-i", this.files.segmentBetweenBoundsLoud, "-b:v", targetBitrate,
            "-maxrate", targetBitrate, this.files.segmentBetweenBoundsLoudCompressed);
        const compressedResult = this.readMediaFile(this.files.segmentBetweenBoundsLoudCompressed);
        const compressedBlob = new Blob([compressedResult.buffer], { type: 'video/mp4' });
        CreateDownloadLink("Trimmed-video-compressed.mp4", "Download compressed trimmed video!", URL.createObjectURL(compressedBlob));
    }

    async #extractAudioStreamFromLoudInput(streamIndex) {
        if (this.isBusyProcessing) {
            console.error("Cannot start audio extraction when busy.");
            return;
        }

        this.currentTask = tasks.EXTRACTING;
        const newAudioStreamFileName = "loudInputAudio" + streamIndex + ".aac";
        this.files.loudInputAudioStreams.push(newAudioStreamFileName);
        await this.#ffmpeg.run("-i", this.files.loudInput, "-filter:a", "loudnorm", "-map", "0:a:" + streamIndex.toString(), /*"-c", "copy",*/ newAudioStreamFileName);
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
        const silencedResult = this.readMediaFile(this.files.silencedInput);
        const silencedBlob = new Blob([silencedResult.buffer], { type: 'video/mp4' });
        const silencedResultURL = URL.createObjectURL(silencedBlob);
        CreateDownloadLink('video-silenced.mp4', 'Download silent video.', silencedResultURL);
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

    // Was supposed to merge all the audio streams of a video file into a single audio stream,
    // but the amix filter does not work in ffmpeg.wasm for some reason :(
    async #combineAudioStreamsOfSegmentBetweenBounds() {
        let streamFlags = "";
        for (let i = 0; i < this.files.segmentBetweenBoundsAudioStreams.length; i++) {
            streamFlags += `[0:a:${i}]`;
        }

        const allFlags = `-i ${this.files.segmentBetweenBoundsLoud} -filter_complex '${streamFlags}amix=inputs=${this.files.segmentBetweenBoundsAudioStreams.length.toString()}:duration=longest[aout]' -map 0:v -map '[aout]' -c:v copy -ac 2 ${this.files.segmentBetweenBoundsFinal}`.split(" ");
        this.currentTask = tasks.MERGING;
        await this.#ffmpeg.run(...allFlags);
    }

    async #createMergedAudioFile() {
        const dataOfAudioFiles = [];
        for (const audioFileName of this.files.segmentBetweenBoundsAudioStreams) {
            dataOfAudioFiles.push(this.readMediaFile(audioFileName));
        }

        console.log(dataOfAudioFiles[0].buffer)
        const buffers = await Promise.all(
            Array.from(dataOfAudioFiles).map(async (file) => this.#crunker._context.decodeAudioData(file.buffer))
        );
        const merged = await this.#crunker.mergeAudio(buffers);
        const output = await this.#crunker.export(merged, 'audio/mp3');
        const uint8Array = await blobToUint8Array(output.blob);
        await this.#ffmpeg.FS('writeFile', this.files.segmentBetweenBoundsAudioMergedUselessWAV, uint8Array);
        await this.#ffmpeg.run("-i", this.files.segmentBetweenBoundsAudioMergedUselessWAV, this.files.segmentBetweenBoundsAudioMergedWell);
        const mergedResult = this.readMediaFile(this.files.segmentBetweenBoundsAudioMergedWell);
        const mergedBlob = new Blob([mergedResult.buffer], { type: 'video/mp4' });
        CreateDownloadLink("mergedAudio.wav", "Download merged audio", URL.createObjectURL(mergedBlob));
    }
}