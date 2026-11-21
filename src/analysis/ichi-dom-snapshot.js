const collectIchiDomSnapshot = (document) => ({
  queryText: Array.from(
    document.querySelectorAll(".query-text"),
    (element) => element.textContent,
  ),
  wordChunks: Array.from(
    document.querySelectorAll(".word-chunk .jspPane"),
    (element) => ({ html: element.innerHTML, text: element.textContent }),
  ),
});

module.exports = { collectIchiDomSnapshot };
