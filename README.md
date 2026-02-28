# HackIllinois26
HackIllinois 2026 Submission

## React Native (Expo) app

**Use the HackAstra conda env** when running the app:

```bash
conda activate HackAstra
cd HackIllinois26   # if not already here
npm start
```

Or run the script (activates HackAstra for you):

```bash
./run.sh
```

---

## How to test the app on your phone

The app runs in **Expo Go**. Your phone and computer must be on the **same Wi‑Fi network**.

### 1. Start the dev server

From the project root (with HackAstra conda env active):

```bash
conda activate HackAstra
cd HackIllinois26
npm start
```

(or run `./run.sh` from inside `HackIllinois26`)

A terminal UI will open and show a **QR code**.

### 2. Install Expo Go on your phone

- **Android:** [Expo Go on Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **iOS:** [Expo Go on the App Store](https://apps.apple.com/app/expo-go/id982107779)

### 3. Open the app on your phone

- **Android:** Open the **Expo Go** app and tap **“Scan QR code”**. Scan the QR code from the terminal.
- **iOS:** Open the **Camera** app, point it at the QR code, then tap the banner that appears to open the project in Expo Go.

The app will load and you’ll see the blank home screen. If you change the code and save, the app will reload on your phone.

### Troubleshooting

- **“Couldn’t connect” or “Network response timed out”**  
  Confirm phone and computer are on the same Wi‑Fi. Disable VPN on either if you use one. Try turning the phone’s Wi‑Fi off and on.

- **Tunnel mode (works across different networks):**  
  In the terminal where `npm start` is running, press `s` to switch to “tunnel”. Wait for the new QR code and scan it again. Slower but works when phone and PC aren’t on the same LAN.

- **“Incompatible SDK version” / Expo Go out of date**  
  This project is pinned to **Expo SDK 51** so it works with older Expo Go builds (e.g. from the store on older devices). If you still see an SDK error, your Expo Go may need a newer build—check for app updates, or use [expo.dev/go](https://expo.dev/go) to install a specific Expo Go version that matches SDK 51.
