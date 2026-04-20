"use client";

import { useEffect, useMemo, useState } from "react";

type SupportedLanguage = "en" | "de";
type StudyMode = "fi_to_target" | "target_to_fi" | "multiple_choice";

type WordEntry = {
  id: string;
  fi: string;
  target: string;
  language: SupportedLanguage;
  listId: string;
  streak: number;
  intervalDays: number;
  dueAt: string | null;
  lastReviewedAt: string | null;
  correctAnswers: number;
  wrongAnswers: number;
};

type ImportDraft = {
  id: string;
  fi: string;
  target: string;
  language: SupportedLanguage;
  listId: string;
};

type StudyQuestion = {
  wordId: string;
  askedWord: string;
  prompt: string;
  expectedAnswer: string;
  choices?: string[];
};

type WrongAnswerLog = {
  id: string;
  askedWord: string;
  givenAnswer: string;
  correctAnswer: string;
};

const STORAGE_KEY_WORDS = "sanatreeni.v1.words";

const DEFAULT_LIST_ID = "default-list";

const EXAMPLE_WORDS: WordEntry[] = [
  {
    id: "1",
    fi: "koira",
    target: "dog",
    language: "en",
    listId: DEFAULT_LIST_ID,
    streak: 0,
    intervalDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    correctAnswers: 0,
    wrongAnswers: 0,
  },
  {
    id: "2",
    fi: "kirja",
    target: "book",
    language: "en",
    listId: DEFAULT_LIST_ID,
    streak: 0,
    intervalDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    correctAnswers: 0,
    wrongAnswers: 0,
  },
  {
    id: "3",
    fi: "koulu",
    target: "school",
    language: "en",
    listId: DEFAULT_LIST_ID,
    streak: 0,
    intervalDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    correctAnswers: 0,
    wrongAnswers: 0,
  },
  {
    id: "4",
    fi: "omena",
    target: "apple",
    language: "en",
    listId: DEFAULT_LIST_ID,
    streak: 0,
    intervalDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    correctAnswers: 0,
    wrongAnswers: 0,
  },
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function withProgress(entry: Omit<WordEntry, "streak" | "intervalDays" | "dueAt" | "lastReviewedAt" | "correctAnswers" | "wrongAnswers" | "listId"> & Partial<WordEntry>): WordEntry {
  return {
    ...entry,
    listId: entry.listId ?? DEFAULT_LIST_ID,
    streak: entry.streak ?? 0,
    intervalDays: entry.intervalDays ?? 0,
    dueAt: entry.dueAt ?? null,
    lastReviewedAt: entry.lastReviewedAt ?? null,
    correctAnswers: entry.correctAnswers ?? 0,
    wrongAnswers: entry.wrongAnswers ?? 0,
  };
}

function getPriority(word: WordEntry, now: number): number {
  const dueTime = word.dueAt ? new Date(word.dueAt).getTime() : 0;
  const overdueDays = dueTime === 0 || Number.isNaN(dueTime) ? 3 : Math.max(0, (now - dueTime) / DAY_IN_MS);
  return overdueDays * 4 + word.wrongAnswers * 3 - word.streak;
}

function getNextIntervalDays(word: WordEntry, isCorrect: boolean): number {
  if (!isCorrect) {
    return 0;
  }

  if (word.intervalDays <= 0) {
    return 1;
  }

  return Math.min(30, Math.max(1, Math.round(word.intervalDays * 1.8 + 1)));
}

function pickRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export default function Home() {
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const selectedListId = DEFAULT_LIST_ID;
  const [words, setWords] = useState<WordEntry[]>(() => {
    if (typeof window === "undefined") {
      return EXAMPLE_WORDS;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY_WORDS);
    if (!saved) {
      return EXAMPLE_WORDS;
    }

    try {
      const parsed = JSON.parse(saved) as WordEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((entry) => withProgress(entry));
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY_WORDS);
    }

    return EXAMPLE_WORDS;
  });
  const [mode, setMode] = useState<StudyMode>("fi_to_target");
  const [question, setQuestion] = useState<StudyQuestion | null>(null);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [wrongAnswerLog, setWrongAnswerLog] = useState<WrongAnswerLog[]>([]);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrInputKey, setOcrInputKey] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORDS, JSON.stringify(words));
  }, [words]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60_000);

    return () => window.clearInterval(timerId);
  }, []);

  const filteredWords = useMemo(
    () => words.filter((word) => word.language === language),
    [language, words],
  );

  const dueWords = useMemo(() => {
    return filteredWords
      .filter((word) => !word.dueAt || new Date(word.dueAt).getTime() <= nowTimestamp)
      .sort((left, right) => getPriority(right, nowTimestamp) - getPriority(left, nowTimestamp));
  }, [filteredWords, nowTimestamp]);

  function addWords(entries: Array<{ fi: string; target: string; language: SupportedLanguage }>) {
    const normalizedEntries = entries.reduce<WordEntry[]>((result, entry) => {
      const fi = entry.fi.trim();
      const target = entry.target.trim();

      if (!fi || !target) {
        return result;
      }

      result.push({
        id: crypto.randomUUID(),
        fi,
        target,
        language: entry.language,
        listId: selectedListId,
        streak: 0,
        intervalDays: 0,
        dueAt: null,
        lastReviewedAt: null,
        correctAnswers: 0,
        wrongAnswers: 0,
      });

      return result;
    }, []);

    if (normalizedEntries.length === 0) {
      return;
    }

    setWords((current) => [...normalizedEntries.reverse(), ...current]);
  }

  function updateImportDraft(id: string, field: "fi" | "target", value: string) {
    setImportDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              [field]: value,
            }
          : draft,
      ),
    );
  }

  function removeImportDraft(id: string) {
    setImportDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  function commitImportDrafts() {
    const validDrafts = importDrafts.filter(
      (draft) => draft.fi.trim() && draft.target.trim(),
    );

    addWords(validDrafts);
    setImportDrafts([]);
    setImportMessage(
      validDrafts.length > 0
        ? `Tallennettiin ${validDrafts.length} tarkistettua sanaa.`
        : "Ei tallennettavia sanoja.",
    );
  }

  function discardImportDrafts() {
    setImportDrafts([]);
    setImportMessage("Tunnistetut sanat hylättiin.");
  }

  function createQuestion() {
    if (filteredWords.length < 2) {
      setQuestion(null);
      setHasAnsweredCurrent(false);
      setFeedback("Lisää vähintään 2 sanaa tähän kieleen.");
      return;
    }

    const candidatePool = (dueWords.length > 0 ? dueWords : [...filteredWords].sort(
      (left, right) => getPriority(right, nowTimestamp) - getPriority(left, nowTimestamp),
    )).slice(0, 5);
    const entry = pickRandomItem(candidatePool);
    const distractors = shuffleArray(
      filteredWords.filter((item) => item.id !== entry.id).map((item) => item.target),
    ).slice(0, 3);

    if (mode === "fi_to_target") {
      setQuestion({
        wordId: entry.id,
        askedWord: entry.fi,
        prompt: `Mikä on sana \"${entry.fi}\" ${language === "en" ? "englanniksi" : "saksaksi"}?`,
        expectedAnswer: entry.target,
      });
    }

    if (mode === "target_to_fi") {
      setQuestion({
        wordId: entry.id,
        askedWord: entry.target,
        prompt: `Mitä \"${entry.target}\" on suomeksi?`,
        expectedAnswer: entry.fi,
      });
    }

    if (mode === "multiple_choice") {
      const choices = shuffleArray([entry.target, ...distractors]);
      setQuestion({
        wordId: entry.id,
        askedWord: entry.fi,
        prompt: `Valitse oikea käännös sanalle \"${entry.fi}\"`,
        expectedAnswer: entry.target,
        choices,
      });
    }

    setHasAnsweredCurrent(false);
    setAnswer("");
    setFeedback("");
  }

  function submitAnswer(nextAnswer?: string) {
    if (!question || hasAnsweredCurrent) {
      return;
    }

    const rawGivenAnswer = (nextAnswer ?? answer).trim();
    const given = normalizeWord(rawGivenAnswer);
    const expected = normalizeWord(question.expectedAnswer);
    const isCorrect = given === expected;
    const reviewedAt = new Date().toISOString();

    setScore((current) => ({
      correct: current.correct + (isCorrect ? 1 : 0),
      total: current.total + 1,
    }));

    setWords((current) =>
      current.map((word) => {
        if (word.id !== question.wordId) {
          return word;
        }

        const nextIntervalDays = getNextIntervalDays(word, isCorrect);

        return {
          ...word,
          streak: isCorrect ? word.streak + 1 : 0,
          intervalDays: nextIntervalDays,
          dueAt: isCorrect
            ? new Date(Date.now() + nextIntervalDays * DAY_IN_MS).toISOString()
            : reviewedAt,
          lastReviewedAt: reviewedAt,
          correctAnswers: word.correctAnswers + (isCorrect ? 1 : 0),
          wrongAnswers: word.wrongAnswers + (isCorrect ? 0 : 1),
        };
      }),
    );

    setFeedback(
      isCorrect
        ? "Jes, oikein!"
        : `Melkein! Oikea vastaus oli: ${question.expectedAnswer}`,
    );

    if (!isCorrect) {
      setWrongAnswerLog((current) => [
        {
          id: crypto.randomUUID(),
          askedWord: question.askedWord,
          givenAnswer: rawGivenAnswer || "(ei vastausta)",
          correctAnswer: question.expectedAnswer,
        },
        ...current,
      ]);
    }

    setHasAnsweredCurrent(true);
  }

  async function importFromImage() {
    if (!ocrFile) {
      setImportMessage("Valitse ensin kuva.");
      return;
    }

    setIsImporting(true);
    setImportMessage("");

    try {
      const formData = new FormData();
      formData.append("image", ocrFile);
      formData.append("targetLanguage", language);

      const response = await fetch("/api/import-words", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        words?: Array<{ fi: string; target: string }>;
        message?: string;
      };

      if (!response.ok) {
        setImportMessage(payload.message ?? "Tuonti epäonnistui.");
        return;
      }

      const imported = (payload.words ?? []).map((item) => ({
        id: crypto.randomUUID(),
        fi: item.fi,
        target: item.target,
        language,
        listId: selectedListId,
      }));

      setImportDrafts(imported);
      setImportMessage(
        imported.length > 0
          ? `Tunnistettiin ${imported.length} sanaa. Tarkista ennen tallennusta.`
          : "Sanoja ei tunnistettu.",
      );
      setOcrFile(null);
      setOcrInputKey((current) => current + 1);
    } catch {
      setImportMessage("Yhteysvirhe tuonnissa.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <section className="rounded-3xl border border-amber-200 bg-[linear-gradient(120deg,#ffe7a8_0%,#fff4d6_45%,#f6e1ff_100%)] p-6 shadow-[0_12px_40px_rgba(152,101,12,0.18)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Sanatreeni</p>
        <h1 className="mt-2 text-3xl font-bold text-amber-950 sm:text-4xl">Koeharjoittelu puhelimessa</h1>
        <p className="mt-3 max-w-3xl text-amber-900">
          Lisää sanat nopeasti tai tuo ne kuvasta. Treenaa neljällä harjoitustyylillä ja
          jatkossa vaihda englannista myös saksaan ilman appin vaihtoa.
        </p>
      </section>

      <section className="grid gap-6">
        <article className="rounded-3xl bg-white/85 p-5 shadow-lg ring-1 ring-fuchsia-100 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-fuchsia-950">Kuvasta sanalistaksi</h2>
            <select
              className="rounded-xl border border-fuchsia-300 bg-white px-3 py-2 text-sm"
              value={language}
              onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
            >
              <option value="en">Englanti</option>
              <option value="de">Saksa</option>
            </select>
          </div>
          <p className="mt-2 text-sm text-fuchsia-900">
            Ota kuva kirjasta. API yrittää tunnistaa suomi-{language === "en" ? "englanti" : "saksa"}
            sanaparit automaattisesti.
          </p>
          <input
            key={ocrInputKey}
            type="file"
            accept="image/*"
            className="mt-4 w-full rounded-xl border border-fuchsia-200 bg-white p-2"
            onChange={(event) => setOcrFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="mt-3 rounded-xl bg-fuchsia-400 px-4 py-2 font-semibold text-fuchsia-950 hover:bg-fuchsia-300 disabled:opacity-60"
            onClick={importFromImage}
            disabled={isImporting}
          >
            {isImporting ? "Tunnistetaan..." : "Tunnista ja lisää sanat"}
          </button>
          {importMessage ? <p className="mt-2 text-sm text-fuchsia-900">{importMessage}</p> : null}
          {importDrafts.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-fuchsia-950">Tarkista tunnistetut sanat</p>
                <p className="text-xs text-fuchsia-900/80">Poista virheelliset rivit tai korjaa teksti.</p>
              </div>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                {importDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="grid gap-2 rounded-xl border border-fuchsia-100 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      className="rounded-lg border border-fuchsia-200 px-3 py-2 text-sm"
                      value={draft.fi}
                      onChange={(event) => updateImportDraft(draft.id, "fi", event.target.value)}
                      placeholder="Suomeksi"
                    />
                    <input
                      className="rounded-lg border border-fuchsia-200 px-3 py-2 text-sm"
                      value={draft.target}
                      onChange={(event) => updateImportDraft(draft.id, "target", event.target.value)}
                      placeholder={draft.language === "en" ? "Englanniksi" : "Saksaksi"}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                      onClick={() => removeImportDraft(draft.id)}
                    >
                      Poista
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-600"
                  onClick={commitImportDrafts}
                >
                  Tallenna tarkistetut sanat
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-fuchsia-200 px-4 py-2 text-sm font-semibold text-fuchsia-950 hover:bg-white"
                  onClick={discardImportDrafts}
                >
                  Hylkää tuonti
                </button>
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-xs text-fuchsia-900/80">
            Huom: lisää OPENAI_API_KEY ympäristömuuttujaan, jotta kuvatunnistus toimii.
          </p>
        </article>
      </section>

      <section className="rounded-3xl bg-white/90 p-5 shadow-lg ring-1 ring-sky-100 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-sky-950">Harjoittelu</h2>
          <select
            className="rounded-xl border border-sky-300 bg-white px-3 py-2 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value as StudyMode)}
          >
            <option value="fi_to_target">Suomi -&gt; vieras kieli</option>
            <option value="target_to_fi">Vieras kieli -&gt; suomi</option>
            <option value="multiple_choice">Monivalinta</option>
          </select>
          <button
            type="button"
            className="rounded-xl bg-sky-400 px-4 py-2 font-semibold text-sky-950 hover:bg-sky-300"
            onClick={createQuestion}
          >
            Uusi kysymys
          </button>
        </div>

        <p className="mt-3 text-sm font-medium text-sky-900">
          Pisteet: {score.correct} / {score.total}
        </p>
        <div className="mt-3 grid gap-3">
          <div className="rounded-2xl border border-sky-100 bg-white p-3">
            <p className="text-sm font-semibold text-sky-950">Treenaa nyt</p>
            <p className="mt-1 text-2xl font-bold text-sky-900">{dueWords.length}</p>
            <p className="text-xs text-sky-900/70">Sanat, jotka kannattaa kerrata seuraavaksi</p>
          </div>
        </div>

        {question ? (
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <p className="text-lg font-semibold text-sky-950">{question.prompt}</p>

            {question.choices ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="rounded-xl border border-sky-300 bg-white px-3 py-2 text-left text-sky-950 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => submitAnswer(choice)}
                    disabled={hasAnsweredCurrent}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitAnswer();
                }}
              >
                <input
                  className="flex-1 rounded-xl border border-sky-300 bg-white px-3 py-2"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Kirjoita vastaus"
                  disabled={hasAnsweredCurrent}
                />
                <button
                  type="submit"
                  className="rounded-xl bg-sky-500 px-4 py-2 font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={hasAnsweredCurrent}
                >
                  Tarkista
                </button>
              </form>
            )}

            {feedback ? <p className="mt-3 text-sm font-medium text-sky-900">{feedback}</p> : null}
            {hasAnsweredCurrent ? (
              <button
                type="button"
                className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                onClick={createQuestion}
              >
                Seuraava sana
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-sky-900/80">Paina &quot;Uusi kysymys&quot; aloittaaksesi.</p>
        )}

        {score.total > 0 ? (
          <div className="mt-4 rounded-2xl border border-sky-100 bg-white p-4">
            <p className="text-sm font-semibold text-sky-950">Testin yhteenveto</p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold">
              <p className="text-emerald-700">Oikeat vastaukset: {score.correct} / {score.total}</p>
              <p className="text-rose-700">Väärät vastaukset: {score.total - score.correct} / {score.total}</p>
            </div>

            {wrongAnswerLog.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-sky-950">Väärin menneet kohdat</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {wrongAnswerLog.map((item) => (
                    <li key={item.id} className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                      <p className="font-medium text-sky-950">Kysytty sana: {item.askedWord}</p>
                      <p className="text-rose-700">Lapsen vastaus: {item.givenAnswer}</p>
                      <p className="text-emerald-700">Oikea vastaus: {item.correctAnswer}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
