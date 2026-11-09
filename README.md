# Line Caller

Playtime tracker and lineup suggester for ultimate. It runs fully offline on the device.

## Get the APK without installing anything

1. Upload this folder to a GitHub repository, including `.github`.
2. Open the Actions tab and wait for **Build Android APK** to finish.
3. On the device, open `https://github.com/OWNER/REPO/releases/latest/download/app-debug.apk` and install it. Every push to `main` makes a new build at the same link, and each one installs over the last.

## Build with Android Studio instead

    npm ci
    npm run android
    npx cap open android

## Voice

The APK recognizes speech on the device with [Vosk](https://alphacephei.com/vosk/), so it needs no internet at the field. The build downloads the small English model and packs it into the app. Audio is never saved or sent anywhere; the words go to the parser in `src/engine.js`.

## Change the app

- `src/engine.js`: lineup scoring. The weights for Develop, Balanced and Win are in `MODES` at the top.
- `src/app.js`: screens and actions.
- `src/style.css`: look and layout.
- `npm test` plays simulated games and checks every suggested line against the rules.
- `npm run android` rebuilds the page and copies it into the Android project.
