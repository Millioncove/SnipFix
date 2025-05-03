import { SnipFix } from "./SnipFix.js";

const uploadPage = document.getElementById('UploadPage');
const editButton = document.getElementById('EditButton');
const exportButton = document.getElementById('ExportButton');
const video = document.getElementById("video");
const editor = document.getElementById("SnipFixEditor");
const programmableStyleSheet = new CSSStyleSheet();
document.adoptedStyleSheets.push(programmableStyleSheet);

const snipFix = new SnipFix(programmableStyleSheet);

export function setVideo(url) {
    video.src = url;
    video.currentTime = 0.2; // So video doesn't load forever ¯\_(ツ)_/¯
    snipFix.timeline.videoTrack = snipFix.timeline.createMediaTrack("Video", document.getElementById("video"));
}

export function setEditorVisibility(visible) {
    if (visible) {
        uploadPage.style.display = "none";
        document.getElementById("SnipFixEditor").style.display = "flex";
        document.getElementById("FileGallery").style.display = "flex";
    } else {
        uploadPage.style.display = "flex";
        document.getElementById("SnipFixEditor").style.display = "none";
        document.getElementById("FileGallery").style.display = "none";
    }
}

document.getElementById("Upload").addEventListener('change', snipFix.UploadListener.bind(snipFix));


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
    snipFix.timeline.colorizeAllClips();
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
    editButton.addEventListener('click', snipFix.PerformMainEdit.bind(snipFix));
}
