export const icons = Object.freeze({
    VIDEO: "fa-file-video-o",
    IMAGE: "fa-file-image-o",
    AUDIO: "fa-file-audio-o",
});

const ICON_SIZE = "fa-3x";

export class GalleryEntry extends HTMLElement {
    constructor(URL, icon, fileName, fileSize, EntryTitle = "") {
        super();

        // Create shadow tree
        const entryTemplate = document.getElementById("gallery-entry-template").content;
        this.attachShadow({ mode: "open" });
        this.shadowRoot.appendChild(entryTemplate.cloneNode(true));

        // Fill in the template with the provided data
        this.shadowRoot.querySelector("#FileIcon").classList.value = ["fa", icon, ICON_SIZE].join(" ");
        this.shadowRoot.querySelector("#EntryTitle").textContent = EntryTitle;
        this.shadowRoot.querySelector("#FileSize").textContent = fileSize;
        this.shadowRoot.querySelector("#FileName").textContent = fileName;
        this.shadowRoot.querySelector("#DownloadButton").href = URL;
        this.shadowRoot.querySelector("#DownloadButton").download = fileName;
        this.shadowRoot.querySelector("#DeleteButton").onclick = () => { this.shadowRoot.querySelector("#EntryContainer").style.display = "none"; };

        document.querySelector("#FileGalleryContainer").appendChild(this);
    }
}

customElements.define(
    "gallery-entry",
    GalleryEntry
);