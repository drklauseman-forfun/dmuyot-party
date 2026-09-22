/**
 * GIFs on Giphy, which is where the memes effect gets its pictures.
 *
 * Nothing is copied into this repository. The files stay on Giphy and are
 * played from there, and an animation stores only ids. That is the safety
 * rule as much as the licensing one: whatever link someone pastes, only the id
 * survives, and the only address ever asked for is built here from it — so a
 * shared animation cannot point everyone's phone at some other site.
 */

const ID = /^[A-Za-z0-9]{6,40}$/;

/**
 * The id in a Giphy link, or in a bare id; null for anything else.
 *
 * Giphy links come in several shapes, and people paste whichever they have:
 *   giphy.com/gifs/some-words-ID          (the page, from the address bar)
 *   giphy.com/embed/ID                    (the embed code)
 *   media.giphy.com/media/ID/giphy.gif    (the file, from "Copy link")
 *   media2.giphy.com/media/v1.xxx/ID/giphy.gif
 *   i.giphy.com/ID.gif
 * Short gph.is links would need a request to resolve, so they are refused.
 */
export function giphyId(input: string): string | null {
  const text = input.trim();
  if (ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'giphy.com' && !host.endsWith('.giphy.com')) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  const media = parts.indexOf('media');
  let candidate: string | undefined;
  if (media !== -1) {
    candidate = parts[media + 1]?.startsWith('v1.') ? parts[media + 2] : parts[media + 1];
  } else if (parts[0] === 'gifs' || parts[0] === 'stickers') {
    // The id is the last dash-separated part: the words before it are a title.
    candidate = parts[1]?.split('-').pop();
  } else if (parts[0] === 'embed') {
    candidate = parts[1];
  } else if (host === 'i.giphy.com' && parts.length === 1) {
    candidate = parts[0].replace(/\.(gif|webp|mp4)$/i, '');
  }
  return candidate && ID.test(candidate) ? candidate : null;
}

/**
 * The GIF as a small silent video, 200 pixels wide.
 *
 * A GIF itself cannot move inside the effects canvas — WebGL draws one frame
 * of an image and stops, and decoding the frames would need another library.
 * Giphy keeps every GIF as a video too, which three.js plays as a texture on
 * every phone, and at a fraction of the size: tens of kilobytes, rather than
 * the megabyte or two of the GIF.
 */
export function giphyVideoUrl(id: string): string {
  return `https://media.giphy.com/media/${id}/200w.mp4`;
}

/** A still frame of the GIF, for thumbnails in the builder. */
export function giphyStillUrl(id: string): string {
  return `https://media.giphy.com/media/${id}/200w_s.gif`;
}

/**
 * Well-known memes, picked by hand and each checked by eye. The memes effect
 * starts with this list, and בארי אזומה uses it. Left out on purpose: green
 * screen versions, which show a green box, and anything much over half a
 * megabyte, which would arrive late on phone data.
 */
export const MEME_GIFS: readonly string[] = [
  'NTur7XlVDUdqM', // This is fine
  '6nWhy3ulBL7GSCvKw6', // Surprised Pikachu
  'sU511xfb7ORqw', // Confused Travolta
  'WRuBiZKB6xgsS9DrFA', // Monkey puppet side-eye
  'QBd2kLB5qDmysEXre9', // Mr Bean waiting
  'BQUITFiYVtNte', // SpongeBob, imagination
  'DfLwM9kttDFEQ', // Leonardo DiCaprio, cheers
  'lgcUUCXgC8mEo', // Rick Astley, rickroll
  'sIIhZliB2McAo', // Nyan Cat
  'Q81NcsY6YxK7jxnr4v', // Success kid
  '26FPzgftlRfgwkEw0', // Crying Jordan
  '14b13BDH3V81wc', // Baby Groot dancing
  'XIqCQx02E1U9W', // Kermit typing
  'l4Jz3a8jO92crUlWM', // Salt Bae
  'BmmfETghGOPrW', // Zach Galifianakis calculating
  'lzYEj4dw7rcJJCsvjo', // Distracted boyfriend
  'b9aScKLxdv0Y0', // Orson Welles, slow clap
  'xTiTnoORMNaANLYrHW', // Drake, Hotline Bling
  'we4Hp4J3n7riw', // Gordon Ramsay, it's raw
  'COYGe9rZvfiaQ', // Homer backing into the bushes
  'dkBXo121oUIE', // Jackie Chan confused
  'fXJyMfUdqVCMPAnPJM', // Kombucha girl
  'JYZ397GsFrFtu', // Michael Scott, no
  'OK27wINdQS5YQ', // Kramer, mind blown
  'xL7PDV9frcudO', // Nick Young, question marks
  'COYggJB0KnADm', // Oprah, you get a car
  '5DCLZUqb0ImZy', // Roll Safe, think about it
  'l44Q6HJ7lkiweTQ6k', // Sad Pablo Escobar
  'cxnvN8s3FVNII', // Steve Harvey, what
  'xUOxeZn47mrdabqDNC', // Thanos
  '4g6xgP7FXjy12', // The Rock
  'oW4csEbiMzVjq', // Tobey Maguire's Spider-Man strut
  'RIq4eoF2iw3eZeJMtv', // Woman yelling at a cat
  '11qCjC856PSmnm', // Elmo in flames
  'V1dH38rUl9yX7xU8nh', // Keanu, you're breathtaking
];
