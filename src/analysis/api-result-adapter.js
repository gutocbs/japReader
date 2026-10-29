class ApiResponseValidationError extends Error {
  constructor() {
    super("Invalid analysis response.");
    this.name = "ApiResponseValidationError";
  }
}

const invalidResponse = () => {
  throw new ApiResponseValidationError();
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeDigits = (value) =>
  value.replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
  );

const hasEquivalentDigits = (left, right) =>
  normalizeDigits(left) === normalizeDigits(right);

const emptyWord = (word) => ({
  word,
  dictForm: "",
  dictFormReading: "",
  rubyReading: "",
  definitions: "",
});

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDefinitions = (glosses) => {
  if (!Array.isArray(glosses) || glosses.length === 0) return "";

  const rows = glosses
    .filter(
      (gloss) =>
        isObject(gloss) &&
        typeof gloss.pos === "string" &&
        typeof gloss.gloss === "string",
    )
    .map((gloss) => {
      const info =
        typeof gloss.info === "string"
          ? `<span class="ichiran-info">${escapeHtml(gloss.info)}</span>`
          : "";

      return `<div class="ichiran-gloss"><span class="ichiran-pos">${escapeHtml(gloss.pos)}</span><span class="ichiran-gloss-text">${escapeHtml(gloss.gloss)}</span>${info}</div>`;
    });

  return rows.length === 0
    ? ""
    : `<div class="ichiran-definition">${rows.join("")}</div>`;
};

const isLexicalCandidate = (value) =>
  isObject(value) &&
  typeof value.text === "string" &&
  typeof value.kana === "string";

const defaultCandidates = (value) => {
  if (isLexicalCandidate(value)) return [value];

  if (isObject(value)) {
    if (!Array.isArray(value.alternative) || value.alternative.length === 0) {
      return [];
    }
    return defaultCandidates(value.alternative[0]);
  }

  if (!Array.isArray(value)) return [];
  return value.flatMap(defaultCandidates);
};

const dictionaryForm = (candidate) => {
  if (!Array.isArray(candidate.conj)) {
    return {
      dictForm: candidate.text,
      dictFormReading: candidate.kana,
      gloss: undefined,
    };
  }

  const conjugation = candidate.conj.find(
    (entry) =>
      isObject(entry) &&
      entry.readok === true &&
      typeof entry.reading === "string" &&
      entry.reading.trim().length > 0,
  );

  if (!conjugation) {
    return {
      dictForm: candidate.text,
      dictFormReading: candidate.kana,
      gloss: undefined,
    };
  }

  const reading = conjugation.reading.trim();
  const bracketed = /^(.*?)\s*【([^】]+)】$/.exec(reading);
  if (!bracketed || bracketed[1].trim().length === 0) {
    return {
      dictForm: reading,
      dictFormReading: reading,
      gloss: conjugation.gloss,
    };
  }

  return {
    dictForm: bracketed[1].trim(),
    dictFormReading: bracketed[2],
    gloss: conjugation.gloss,
  };
};

const sourceCharacter = (text, offset) =>
  String.fromCodePoint(text.codePointAt(offset));

const adaptChunk = (chunk, expectedText) => {
  const words = [];
  const candidates = defaultCandidates(chunk.analysis);
  let offset = chunk.start;
  const end = chunk.start + chunk.length;

  for (const candidate of candidates) {
    if (candidate.text.length === 0) invalidResponse();

    while (
      offset < end &&
      !hasEquivalentDigits(
        expectedText.slice(offset, offset + candidate.text.length),
        candidate.text,
      )
    ) {
      const word = sourceCharacter(expectedText, offset);
      words.push(emptyWord(word));
      offset += word.length;
    }

    if (
      offset + candidate.text.length > end ||
      !hasEquivalentDigits(
        expectedText.slice(offset, offset + candidate.text.length),
        candidate.text,
      )
    ) {
      invalidResponse();
    }

    const root = dictionaryForm(candidate);
    const definitions = formatDefinitions(candidate.gloss);
    words.push({
      word: expectedText.slice(offset, offset + candidate.text.length),
      dictForm: root.dictForm,
      dictFormReading: root.dictFormReading,
      rubyReading: candidate.kana,
      definitions: definitions || formatDefinitions(root.gloss),
    });
    offset += candidate.text.length;
  }

  while (offset < end) {
    const word = sourceCharacter(expectedText, offset);
    words.push(emptyWord(word));
    offset += word.length;
  }

  return words;
};

const validateChunks = (response, expectedText) => {
  if (!Array.isArray(response.chunks)) invalidResponse();

  const chunks = [...response.chunks].sort(
    (left, right) => left?.index - right?.index,
  );
  let offset = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (
      !isObject(chunk) ||
      !Number.isInteger(chunk.index) ||
      chunk.index !== index ||
      !Number.isInteger(chunk.start) ||
      chunk.start !== offset ||
      !Number.isInteger(chunk.length) ||
      chunk.length < 0 ||
      typeof chunk.text !== "string" ||
      chunk.text.length !== chunk.length ||
      !hasEquivalentDigits(
        expectedText.slice(chunk.start, chunk.start + chunk.length),
        chunk.text,
      ) ||
      (chunk.analysis !== null && !Array.isArray(chunk.analysis))
    ) {
      invalidResponse();
    }
    offset += chunk.length;
  }

  if (offset !== expectedText.length) invalidResponse();
  return chunks;
};

const adaptAnalyzeResponse = (response, expectedText) => {
  if (
    !isObject(response) ||
    typeof expectedText !== "string" ||
    typeof response.text !== "string" ||
    !hasEquivalentDigits(response.text, expectedText)
  ) {
    invalidResponse();
  }

  const chunks = validateChunks(response, expectedText);
  return {
    words: chunks.flatMap((chunk) => adaptChunk(chunk, expectedText)),
    fullText: expectedText,
  };
};

module.exports = { adaptAnalyzeResponse, ApiResponseValidationError };
