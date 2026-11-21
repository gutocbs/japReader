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

const partOfSpeechTitles = {
  v1: "Ichidan verb",
  v5k: "Godan verb with 'ku' ending",
  v5t: "Godan verb with 'tsu' ending",
  vi: "intransitive verb",
  vt: "transitive verb",
};

const formatPartOfSpeech = (value) =>
  escapeHtml(value).replace(/[A-Za-z0-9-]+/g, (tag) => {
    const title = partOfSpeechTitles[tag];
    return title ? `<span title="${escapeHtml(title)}">${tag}</span>` : tag;
  });

const formatGlossList = (glosses) => {
  if (!Array.isArray(glosses) || glosses.length === 0) {
    return '<ol class="gloss-definitions"></ol>';
  }

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
          ? ` <span class="gloss-info">${escapeHtml(gloss.info)}</span>`
          : "";
      return `<li><span class="pos-desc">${formatPartOfSpeech(gloss.pos)}</span> <span class="gloss-desc">${escapeHtml(gloss.gloss)}</span>${info}</li>`;
    });

  return `<ol class="gloss-definitions">${rows.join("")}</ol>`;
};

const formatConjugations = (candidate) => {
  if (!Array.isArray(candidate.conj)) return undefined;

  const conjugations = candidate.conj.filter(
    (entry) =>
      isObject(entry) &&
      entry.readok === true &&
      typeof entry.reading === "string" &&
      entry.reading.trim().length > 0,
  );
  if (conjugations.length === 0) return undefined;

  const items = conjugations.map((conjugation) => {
    const properties = Array.isArray(conjugation.prop)
      ? conjugation.prop
          .filter(
            (property) =>
              isObject(property) &&
              typeof property.pos === "string" &&
              typeof property.type === "string",
          )
          .map((property) => {
            const negative =
              property.neg === true
                ? ' <span class="conj-neg">Negative</span>'
                : "";
            const formal =
              property.fml === true
                ? ' <span class="conj-formal">Formal</span>'
                : "";
            return `<div class="conj-prop"><span class="pos-desc">[${formatPartOfSpeech(property.pos)}]</span> <span class="conj-type">${escapeHtml(property.type)}</span>${negative}${formal}</div>`;
          })
          .join("")
      : "";
    return `<div class="conjugation">${properties}<div class="conj-gloss"><dl><dt>${escapeHtml(conjugation.reading.trim())}</dt><dd>${formatGlossList(conjugation.gloss)}</dd></dl></div></div>`;
  });

  return `<div class="conjugations">${items.join("")}</div>`;
};

const formatConjugationDefinitions = (candidate) => {
  const conjugations = formatConjugations(candidate);
  if (!conjugations) return undefined;

  const surfaceReading =
    typeof candidate.reading === "string" && candidate.reading.trim().length > 0
      ? candidate.reading.trim()
      : `${candidate.text} 【${candidate.kana}】`;
  return `<dl class="alternatives"><dt>${escapeHtml(surfaceReading)}</dt><dd>${formatGlossList(candidate.gloss)}${conjugations}</dd></dl>`;
};

const compoundComponents = (candidate) =>
  Array.isArray(candidate.components)
    ? candidate.components.filter(isLexicalCandidate)
    : [];

const formatCompoundDefinitions = (candidate) => {
  const components = compoundComponents(candidate);
  if (components.length === 0) return "";

  const surfaceReading =
    typeof candidate.reading === "string" && candidate.reading.trim().length > 0
      ? candidate.reading.trim()
      : `${candidate.text} 【${candidate.kana}】`;
  const compoundWords = Array.isArray(candidate.compound)
    ? candidate.compound.filter((word) => typeof word === "string")
    : components.map((component) => component.text);
  const entries = components
    .map((component) => {
      const reading =
        typeof component.reading === "string" &&
        component.reading.trim().length > 0
          ? component.reading.trim()
          : component.text;
      const suffix =
        typeof component.suffix === "string"
          ? `<span class="suffix-desc">[${escapeHtml(component.suffix)}]</span>`
          : "";
      const definitions = suffix || formatGlossList(component.gloss);
      const conjugations = formatConjugations(component) || "";
      return `<dt>${escapeHtml(reading)}</dt><dd>${definitions}${conjugations}</dd>`;
    })
    .join("");

  return `<dl class="alternatives"><dt>${escapeHtml(surfaceReading)}</dt><dd><span class="compound-desc">Compound word: <span class="compound-desc-word">${escapeHtml(compoundWords.join(" + "))}</span></span><dl class="compounds">${entries}</dl></dd></dl>`;
};

const formatDefinitions = (candidate) => {
  const compoundDefinitions = formatCompoundDefinitions(candidate);
  if (compoundDefinitions) return compoundDefinitions;

  const glosses = candidate.gloss;
  const hasGlosses =
    Array.isArray(glosses) &&
    glosses.some(
      (gloss) =>
        isObject(gloss) &&
        typeof gloss.pos === "string" &&
        typeof gloss.gloss === "string",
    );
  if (!hasGlosses) return "";

  const reading =
    typeof candidate.reading === "string" && candidate.reading.trim().length > 0
      ? candidate.reading.trim()
      : `${candidate.text} 【${candidate.kana}】`;
  return `<dl class="alternatives"><dt>${escapeHtml(reading)}</dt><dd>${formatGlossList(glosses)}</dd></dl>`;
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
  const components = compoundComponents(candidate);
  if (components.length > 0) return dictionaryForm(components[0]);

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
    const definitions =
      formatConjugationDefinitions(candidate) || formatDefinitions(candidate);
    words.push({
      word: expectedText.slice(offset, offset + candidate.text.length),
      dictForm: root.dictForm,
      dictFormReading: root.dictFormReading,
      rubyReading: candidate.kana,
      definitions,
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
