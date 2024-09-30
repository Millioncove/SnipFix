export class MediaTrack extends HTMLElement {
    startBoundTime;
    endBoundTime;
    isVideoTrack = false;

    constructor(trackName, videoElementIfVideoTrack) {
        super();

        // Create shadow tree
        const trackTemplate = document.getElementById("media-track-template").content;

        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.appendChild(trackTemplate.cloneNode(true));

        // Apply stylesheet to shadow tree.
        this.sheet = new CSSStyleSheet();
        shadowRoot.adoptedStyleSheets = [this.sheet];

        // Track name
        if (trackName == null) {
            this.name = this.getAttribute("name");
        } else {
            this.name = trackName;
            this.setAttribute("name", trackName);
        }
        if (this.name == null) {
            console.error("media-track elements must have a name attribute!");
        } else {
            this.shadowRoot.querySelector("#TrackName").innerText = this.name;
        }

        // Set this track's corresponding media element.
        if (videoElementIfVideoTrack == null) {
            this.mediaElement = this.shadowRoot.querySelector("#audio");
        }
        else {
            this.isVideoTrack = true;
            this.mediaElement = videoElementIfVideoTrack;
            this.shadowRoot.querySelector("#Volume").className = "hidden";
        }

        // Register event handler for volume slider.
        this.shadowRoot.querySelector("#Volume").oninput = (slider) => {
            this.volumePercentage = slider.originalTarget.value;
            this.mediaElement.volume = Math.min(this.volumePercentage / 100.0, 1);
        };
    }

    colorizeTrack() {
        const startPercentage = (this.startBoundTime / this.mediaElement.duration) * 100;
        const endPercentage = (this.endBoundTime / this.mediaElement.duration) * 100;
        const spacePercentage = endPercentage - startPercentage;

        this.sheet.replaceSync(".clip { margin-left: " + startPercentage + "%; width: " + spacePercentage + "%}");
    }
}

customElements.define(
    "media-track",
    MediaTrack
);