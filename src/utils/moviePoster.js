const isUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

export const getPosterUrl = (payload) => {
  const posterUrl = typeof payload === 'string'
    ? payload
    : payload && typeof payload === 'object'
      ? payload.posterUrl
      : '';
  return isUrl(posterUrl) ? posterUrl.trim() : '';
};
