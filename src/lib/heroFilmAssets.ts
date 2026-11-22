/** One versioned source for the player and the HTML's high-priority preload. */
export const heroFilmPhoneMedia = '(max-width: 639px)';

export const heroFilmAssets = {
  movie: '/film/sharetexts-launch-v5-light.mp4',
  fullMovie: '/film/sharetexts-launch-v5-light-full.mp4',
  poster: '/film/sharetexts-launch-v5-light-poster.jpg',
  mobile: {
    movie: '/film/sharetexts-launch-v5-light-mobile.mp4',
    poster: '/film/sharetexts-launch-v5-light-mobile-poster.jpg',
  },
} as const;

export const heroFilmDarkAssets = {
  movie: '/film/sharetexts-launch-v5-dark.mp4',
  fullMovie: '/film/sharetexts-launch-v5-dark-full.mp4',
  poster: '/film/sharetexts-launch-v5-dark-poster.jpg',
  mobile: {
    movie: '/film/sharetexts-launch-v5-dark-mobile.mp4',
    poster: '/film/sharetexts-launch-v5-dark-mobile-poster.jpg',
  },
} as const;
