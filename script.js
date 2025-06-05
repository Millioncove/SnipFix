import { SnipFix } from "./SnipFix.js";

const uploadPage = document.getElementById('UploadPage');
const editButton = document.getElementById('EditButton');
const video = document.getElementById("video");
const videoWrapper = document.getElementById("VideoWrapper");
const programmableStyleSheet = new CSSStyleSheet();
const progressBarContainer = document.getElementById('ProgressBarContainer');
const progressBar = document.getElementById('ProgressBar');
const arrowSkipTime = 2; // seconds
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

export function updateProgress(ratio) {
    const validPercentage = Math.min(Math.max(ratio * 100, 0), 100); // Ensure 0-100
    progressBar.style.width = validPercentage + '%';
    progressBar.setAttribute('aria-valuenow', validPercentage);
    progressBarContainer.style.display = (validPercentage == 0 || validPercentage == 100 ? "none" : "inherit");
}

export function toggleVideoFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        videoWrapper.requestFullscreen();
    }
}

document.onfullscreenchange = () => {
    video.classList.toggle("video-height", !document.fullscreenElement);
    document.getElementById("FullscreenButton").classList.toggle("active", !!document.fullscreenElement);

}

// Update the timeline sliders steps.
video.addEventListener('loadedmetadata', (event) => {
    snipFix.timeline.duration = event.target.duration;
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

    // Fullscreen button click handler
    document.getElementById('FullscreenButton').onclick = toggleVideoFullscreen;

    // Keyboard controls!
    document.addEventListener('keydown', function (e) {
        // Ignore if typing in an input or textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.key === 'f' || e.key === 'F') {
            // 'f' key: toggle fullscreen
            toggleVideoFullscreen();
            e.preventDefault();
        } else if (e.key === ' ') {
            // Spacebar: play/pause
            snipFix.timeline.togglePlaying();
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            // Left arrow: skip backward 2 seconds
            snipFix.timeline.currentTime = snipFix.timeline.currentTime - arrowSkipTime;
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            // Right arrow: skip forward 2 seconds
            snipFix.timeline.currentTime = snipFix.timeline.currentTime + arrowSkipTime;
            e.preventDefault();
        }
    });
}
