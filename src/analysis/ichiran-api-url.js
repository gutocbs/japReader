const DEFAULT_ICHIRAN_API_BASE_URL = "http://127.0.0.1:18080";

const normalizeIchiranApiBaseUrl = (value) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Ichiran API base URL must be an origin");
  }

  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Ichiran API base URL must be an origin");
  }

  return url.origin;
};

const resolveIchiranApiEndpoint = (value, warn = () => {}) => {
  try {
    return `${normalizeIchiranApiBaseUrl(value)}/analyze`;
  } catch {
    warn("Invalid Ichiran API base URL; using the default.");
    return `${DEFAULT_ICHIRAN_API_BASE_URL}/analyze`;
  }
};

module.exports = {
  DEFAULT_ICHIRAN_API_BASE_URL,
  normalizeIchiranApiBaseUrl,
  resolveIchiranApiEndpoint,
};
