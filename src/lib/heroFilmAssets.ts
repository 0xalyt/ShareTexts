/** One versioned source for the player and the HTML's high-priority preload. */
export const heroFilmPhoneMedia = '(max-width: 639px)';

export const heroFilmAssets = {
  movie: '/film/sharetexts-reference-v6-light.mp4',
  fullMovie: '/film/sharetexts-reference-v6-light-full.mp4',
  poster: '/film/sharetexts-reference-v6-light-poster.jpg',
  mobile: {
    movie: '/film/sharetexts-reference-v6-light-mobile.mp4',
    poster: '/film/sharetexts-reference-v6-light-mobile-poster.jpg',
  },
} as const;

export const heroFilmDarkAssets = {
  movie: '/film/sharetexts-reference-v6-dark.mp4',
  fullMovie: '/film/sharetexts-reference-v6-dark-full.mp4',
  poster: '/film/sharetexts-reference-v6-dark-poster.jpg',
  mobile: {
    movie: '/film/sharetexts-reference-v6-dark-mobile.mp4',
    poster: '/film/sharetexts-reference-v6-dark-mobile-poster.jpg',
  },
} as const;
