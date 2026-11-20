#!/bin/bash
# Prueba de «Cómo llegar» y «Añadir al calendario» en el emulador Android.
set -x
mkdir -p prueba
adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n io.github.backlineapp/.MainActivity
sleep 25
PID=$(adb shell pidof io.github.backlineapp | tr -d '\r')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node .github/prueba-enlaces.js || true
adb logcat -d > prueba/logcat.txt
grep -E "START u0|ActivityNotFound|No Activity found|Intent" prueba/logcat.txt > prueba/intents.txt || true
cat prueba/intents.txt | tail -40
