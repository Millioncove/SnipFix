function isHumanReadable(char) {
    // Regular expression to match human-readable Unicode characters
    const humanReadableRegex = /^[\u0020-\u007E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]*$/;
    return humanReadableRegex.test(char);
}

export function extractAudioStreamNamesFromFileData(file) {
    const results = [];
    for (let i = 0; i < file.length; i++) {
        if (file[i] == 110 &&
            file[i + 1] == 97 &&
            file[i + 2] == 109 &&
            file[i + 3] == 101) {
            var audioStreamName = "";
            for (let j = 0; j < 256; j++) {
                if (file[i + 4 + j] == 0) { break; }
                audioStreamName += String.fromCharCode(file[i + 4 + j]);
            }
            if (isHumanReadable(audioStreamName)) { results.push(audioStreamName); }
        }
    }
    return results;
}

export function isStringInObjectWithArrays(string, object) {
    // Check if the string is a direct property of the files object
    if (Object.values(object).includes(string)) {
        return true;
    }

    // Check if the string is an element in any array property of the files object
    for (const key in object) {
        if (Array.isArray(object[key]) && object[key].includes(string)) {
            return true;
        }
    }

    return false;
}

export function blobToUint8Array(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function () {
            // reader.result contains an ArrayBuffer
            const arrayBuffer = reader.result;
            // Convert ArrayBuffer to Uint8Array
            const uint8Array = new Uint8Array(arrayBuffer);
            resolve(uint8Array);
        };

        reader.onerror = function () {
            reject(new Error('Failed to read the Blob'));
        };

        // Read the Blob as an ArrayBuffer
        reader.readAsArrayBuffer(blob);
    });
}

export function CreateDownloadLink(fileName, linkText, URL) {
    // Create download link
    const a = document.createElement('a');
    a.href = URL;
    a.download = fileName;
    a.textContent = linkText;
    document.body.appendChild(a);
}