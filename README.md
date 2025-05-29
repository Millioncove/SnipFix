# SnipFix
Snipfix is a web application that cuts video files to clip-suitable length. It also allows you to adjust audio levels of multiple audio streams individually. On top of that you can download any media elements that constitute your clip at your desire. 

The processing time is very fast after the video loads into the editor. Although if you want to have a compressed version (<10MB) for sending in e.g. Discord, you may have to keep waiting a few seconds after the clipping is done.

## [Try it out!](https://millioncove.github.io/SnipFix/) 
* Leaves no watermarks.
* No account needed.
* Your files don't get sent anywhere.
* Tiny file size for sending in chats. 
* Free forever.

## How it works
SnipFix uses [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) for video manipulation. This lets the entire application run inside the users browser. No files are uploaded to any server for processing and everything is local to the users machine.

### Old ffmpeg version...
Currently, SnipFix uses the 0.10.1 version of ffmpeg.wasm. This version lacks some features and contains some bugs that needed workarounds.

A port to version 0.12 of ffmpeg.wasm was attempted. But for unknown reasons, videos loading into the editor needed at least twice the time to load. When a 30 second clip used to take 7 seconds to load, doubling that waiting time could not be warranted.

The porting attempt remains in an old branch.

## License
MIT