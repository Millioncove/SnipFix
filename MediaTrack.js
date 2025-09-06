export const audioFilePrefix = "AudioTrack_";

const curvePower = 2;

export class MediaTrack extends HTMLElement {
    timeline;
    isVideoTrack = false;
    name;
    volumePercentage = 100;
    #audioCtx;
    #source;
    #gainNode;
    #linearGain = 1.0;

    get linearGain() { return this.#linearGain; }

    // 1.0 is no change in volume. Should be linear?
    set linearGain(value) {
        this.#linearGain = value;
        this.#gainNode.gain.value = this.#linearGain;
    }

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
            this.#setupGainNode();
        }
        else {
            this.isVideoTrack = true;
            this.mediaElement = videoElementIfVideoTrack;
            this.shadowRoot.querySelector("#Volume").className = "hidden";
        }

        // Register event handler for volume slider.
        this.shadowRoot.querySelector("#Volume").oninput = (slider) => {
            this.volumePercentage = slider.target.value;
            this.linearGain = this.#gainCurve(this.volumePercentage);
        };
    }

    #setupGainNode() {
        this.mediaElement = this.shadowRoot.querySelector("#audio");
        this.#audioCtx = new AudioContext();
        this.#source = this.#audioCtx.createMediaElementSource(this.mediaElement);
        this.#gainNode = this.#audioCtx.createGain();
        this.#source.connect(this.#gainNode);
        this.#gainNode.connect(this.#audioCtx.destination);
    }

    // Power function where 0 -> 0.0, 100 -> 1.0, 200 -> 2**curvePower
    #gainCurve(percentage) {
        if (percentage == 0) { return 0; }
        else {
            return (percentage / 100) ** curvePower;
        }
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