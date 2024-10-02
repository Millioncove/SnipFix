import { SnipFix } from "./SnipFix.js";
import { CreateDownloadLink } from "./Utils.js";
const { fetchFile } = FFmpeg;

const upload = document.getElementById('upload');
const editButton = document.getElementById('EditButton');
const exportButton = document.getElementById('ExportButton');
const video = document.getElementById("video");
const editor = document.getElementById("SnipFixEditor");
const programmableStyleSheet = new CSSStyleSheet();
document.adoptedStyleSheets.push(programmableStyleSheet);

const snipFix = new SnipFix(programmableStyleSheet);

upload.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    await snipFix.writeLoudInputVideo(await fetchFile(file));

    const data = snipFix.readMediaFile(snipFix.files.silencedInput);
    const silentVideoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const silentVideoURL = URL.createObjectURL(silentVideoBlob);

    video.src = silentVideoURL;
    snipFix.timeline.videoTrack = snipFix.timeline.createMediaTrack("Video", video);

    await snipFix.findKeyframePtsAroundTime(0, 1)
    await snipFix.findKeyframePtsAroundTime(snipFix.timeline.duration, 1)

    document.getElementById("MainPlayPause").disabled = false;
    upload.hidden = true;
    programmableStyleSheet.replaceSync("#SnipFixEditor { display: flex; }");

    // The edit button.
    editButton.addEventListener('click', async () => {

        console.log(snipFix.CalculateTargetBitrateFromVideoLength());
        await snipFix.renderSegmentBetweenBounds();

        const data = snipFix.readMediaFile(snipFix.files.segmentBetweenBoundsSilent);
        const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
        const trimResult = URL.createObjectURL(videoBlob);

        video.src = trimResult;
        video.currentTime = 0.2; // So video doesn't load forever ¯\_(ツ)_/¯

        const trimmedResult = snipFix.readMediaFile(snipFix.files.segmentBetweenBoundsLoud);
        const finalBlob = new Blob([trimmedResult.buffer], { type: 'video/mp4' });
        const trimmedResultURL = URL.createObjectURL(finalBlob);

        CreateDownloadLink('trimmed-video-loud.mp4', 'Download trimmed video with merged audio!!', trimmedResultURL);
    });


});


// Update the timeline sliders steps.
video.addEventListener('loadedmetadata', (event) => {
    // TODO: Actually get the framerate instead of assuming 60.
    console.warn("Should not assume framerate of 60 fps but I do right now!");
    snipFix.timeline.frameRate = 60.0;
    snipFix.timeline.duration = event.target.duration;

    // Set number of slider steps to amount of frames in video.
    for (const slider of document.getElementsByClassName("timeline-slider")) {
        slider.max = Math.round((snipFix.timeline.duration * snipFix.timeline.frameRate)) - 1; // Number of frames in video (-1 since the first frame has index 0)
    }
    snipFix.timeline.startBound.value = 0;
    snipFix.timeline.endBound.value = snipFix.timeline.endBound.max;
    snipFix.timeline.syncPlayheadToMedia();
});

window.onload = () => {
    // Prevent dragging of any element.
    for (const element of document.querySelectorAll('*')) {
        element.setAttribute('draggable', 'false');
    }

    snipFix.timeline.colorizeAllClips();
    snipFix.timeline.syncBoundHeightToNumTracks();
    snipFix.loadFFmpeg();
    video.load()
}
