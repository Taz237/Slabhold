/**
 * next/image's getImageProps reads its options from a value the bundler fills
 * in. Tests load it directly, with the default options and no remote image
 * hosts, and outside test mode it rejects every remote photo. Import this
 * before any component that draws a photo with getImageProps.
 */
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
