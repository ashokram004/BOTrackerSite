const isUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

export const getPosterUrl = (payload) => {
  const posterUrl = payload && typeof payload === 'object' ? payload.posterUrl : '';
  return isUrl(posterUrl) ? posterUrl.trim() : '';
};
