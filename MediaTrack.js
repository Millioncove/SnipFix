export class MediaTrack extends HTMLElement {
    timeline;
    isVideoTrack = false;

    constructor(timeline, trackName, videoElementIfVideoTrack) {
        super();
        this.timeline = timeline;

        // Create shadow tree
        const trackTemplate = document.getElementById("media-track-template").content;
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(trackTemplate.cloneNode(true));

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
        const startPercentage = (this.timeline.boundStartTime / this.timeline.duration) * 100;
        const endPercentage = (this.timeline.boundEndTime / this.timeline.duration) * 100;
        const spacePercentage = endPercentage - startPercentage;
        const clipDiv = this.shadowRoot.querySelector("#Clip");
        clipDiv.style.marginLeft = startPercentage + "%";
        clipDiv.style.width = spacePercentage + "%";
    }
}

customElements.define(
    "media-track",
    MediaTrack
);