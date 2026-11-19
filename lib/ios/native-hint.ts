/**
 * A tiny script for <head>: inside the iOS app it tags <html data-native>
 * before the first paint, so CSS can hide what the app must never show (the
 * App Store button) without waiting for React. isNativeApp() in
 * lib/ios/platform.ts stays the check for code. Its own file, so the root
 * layout imports nothing else from the native side.
 */
export const NATIVE_HINT_SCRIPT = `try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()===true)document.documentElement.dataset.native=""}catch(e){}`;
