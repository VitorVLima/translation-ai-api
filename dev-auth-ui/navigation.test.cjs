const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const id = "11111111-1111-4111-8111-111111111111";
const scenarios = ["RESTAURANT", "JOB_INTERVIEW", "FREE_TALK"].map(key => ({
  id: key, displayName: key, description: "Practice", assistantDisplayName: key === "RESTAURANT" ? "Layla" : "Rodrigo",
  assistantAvatarKey: "avatar", assistantAvatarImageUrl: "/api/v1/avatars/avatar/image"
}));
const conversation = (scenario, difficulty = "INTERMEDIATE") => ({ ...scenarios.find(s => s.id === scenario), id, scenario, language: "en", difficulty, title: "Practice" });
const detail = scenario => ({ conversation: conversation(scenario), messages: [
  { role: "ASSISTANT", content: "A scenario-specific opening." },
  { role: "USER", content: "An existing answer." }
] });
const assistantActionLabels = item => item.children.find(child => child.className === "chat-actions")?.children.map(child => child.textContent);

const readingText = "Anna walks to school every morning. She enjoys talking to her friends along the way.";
const readingReply = request => request.path === "/api/v1/reading/generate"
  ? { body: { text: readingText, ...request.body } }
  : request.path === "/api/v1/reading/hint" ? { body: { items: [{ expression: "along the way", explanation: "Significa durante o caminho.", type: "EXPRESSION" }] } }
  : request.path === "/api/v1/reading/questions" ? { body: { questions: [
    { type: "MAIN_IDEA", question: "What does Anna do?", options: ["Walks", "Runs", "Drives", "Flies"], correctOption: 0, explanation: "O texto diz que Anna caminha." },
    { type: "DETAIL", question: "When does she walk?", options: ["Every morning", "At night", "On Sundays", "Never"], correctOption: 0, explanation: "A informação aparece no texto." },
    { type: "VOCABULARY", question: "What does along the way mean?", options: ["During the journey", "At home", "Tomorrow", "Never"], correctOption: 0, explanation: "Significa durante o caminho." }
  ] } } : null;

const vocabularyLesson = { id: "lesson", date: "2026-09-16", englishLevel: "B1", category: "FOOD", progress: {
  quizCompleted: false, quizScore: null, writingCompleted: false, completedAt: null
}, words: [
  { id: "w1", word: "delicious", translation: "delicioso", example: "The soup is delicious.", exampleTranslation: "A sopa está deliciosa.", status: "NEW" },
  { id: "w2", word: "hungry", translation: "com fome", example: "I am hungry after work.", exampleTranslation: "Estou com fome depois do trabalho.", status: "LEARNING" },
  { id: "w3", word: "recipe", translation: "receita", example: "This recipe is easy.", exampleTranslation: "Esta receita é fácil.", status: "REVIEWING" },
  { id: "w4", word: "spicy", translation: "apimentado", example: "The curry is spicy.", exampleTranslation: "O curry é apimentado.", status: "MASTERED" },
  { id: "w5", word: "meal", translation: "refeição", example: "Breakfast is my favorite meal.", exampleTranslation: "O café da manhã é minha refeição favorita.", status: "NEW" },
  { id: "w6", word: "bake", translation: "assar", example: "We bake bread on Sundays.", exampleTranslation: "Nós assamos pão aos domingos.", status: "NEW" },
  { id: "w7", word: "fresh", translation: "fresco", example: "The vegetables are fresh.", exampleTranslation: "Os vegetais estão frescos.", status: "NEW" },
  { id: "w8", word: "taste", translation: "sabor", example: "This sauce has a rich taste.", exampleTranslation: "Este molho tem um sabor rico.", status: "NEW" },
  { id: "w9", word: "slice", translation: "fatia", example: "Would you like a slice of cake?", exampleTranslation: "Você gostaria de uma fatia de bolo?", status: "NEW" },
  { id: "w10", word: "boil", translation: "ferver", example: "Boil the water first.", exampleTranslation: "Ferva a água primeiro.", status: "NEW" }
] };
const vocabularyReply = request => request.path === "/api/v1/vocabulary/today" ? { body: vocabularyLesson }
  : request.path === "/api/v1/vocabulary/quiz" ? { body: {
    score: request.body.answers.filter(answer => answer.wordId === answer.selectedWordId).length,
    total: 5, progress: { quizCompleted: true, quizScore: 5, writingCompleted: false, completedAt: null }
  } }
  : request.path === "/api/v1/vocabulary/evaluate" ? { body: { status: "CORRECT", explanation: "A palavra foi usada corretamente.", progress: {
    quizCompleted: true, quizScore: 5, writingCompleted: true, completedAt: "2026-09-16T18:00:00Z"
  } } }
  : request.path === "/api/v1/speech" ? { body: new Blob(["wav"], { type: "audio/wav" }) }
  : null;

async function openVocabulary(ui) {
  await ui.click("Vocabulário");
  await new Promise(resolve => setImmediate(resolve));
}

async function finishVocabularyStudy(ui) {
  for (let index = 1; index < vocabularyLesson.words.length; index++) await ui.get("vocabulary-next-word").click();
  await ui.get("vocabulary-next-word").click();
}

test("Reading is accessible from the SPA navigation, including collapsed sidebar", async () => {
  const ui = await app();
  await ui.run('appState.sidebarCollapsed = true; applySidebarState()');
  await ui.click("Leitura");
  assert.equal(ui.state().currentView, "reading");
  assert.equal(ui.get("view-reading").hidden, false);
  assert.equal(ui.get("view-chat").hidden, true);
  assert.equal(ui.get("reading-hints").hidden, true);
  assert.equal(ui.calls.some(r => r.path.startsWith("/api/v1/reading/")), false);
});

test("Vocabulary is accessible and loads the authenticated daily lesson", async () => {
  const ui = await app({ handle: vocabularyReply });
  await openVocabulary(ui);
  assert.equal(ui.state().currentView, "vocabulary");
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/vocabulary/today").length, 1);
  assert.equal(ui.get("vocabulary-meta").textContent, "Tema: Comida");
  assert.equal(ui.get("vocabulary-level").textContent, "Nível B1");
  assert.equal(ui.get("vocabulary-count").textContent, "10 palavras");
  assert.equal(ui.get("vocabulary-word-position").textContent, "1 de 10");
  assert.equal(ui.get("vocabulary-word-text").textContent, "delicious");
  assert.equal(ui.get("vocabulary-word-status").textContent, "Nova");
  assert.equal(ui.get("vocabulary-progress-steps").children.length, 10);
  assert.equal(html.includes('id="vocabulary-words"'), false);
  assert.equal(fs.readFileSync(path.join(__dirname, "styles.css"), "utf8").includes(".vocabulary-word-grid"), false);
  assert.equal(html.includes('id="vocabulary-quiz-button"'), false);
  assert.equal(html.includes('id="vocabulary-practice-button"'), false);
  assert.equal(html.includes("Testar vocabulário"), false);
  assert.equal(html.includes("Pratique escrevendo"), false);
  assert.equal(ui.get("vocabulary-exercises-button").textContent, "Começar exercícios");
  assert.equal(ui.get("vocabulary-study-complete").hidden, true);
  assert.equal(ui.get("vocabulary-exercises").hidden, true);
});

test("Vocabulary presents one word at a time and unlocks exercises after all ten", async () => {
  const ui = await app({ handle: vocabularyReply });
  await openVocabulary(ui);
  assert.equal(ui.get("vocabulary-previous-word").disabled, true);
  await ui.get("vocabulary-next-word").click();
  assert.equal(ui.get("vocabulary-word-position").textContent, "2 de 10");
  assert.equal(ui.get("vocabulary-word-text").textContent, "hungry");
  assert.equal(ui.get("vocabulary-word-status").textContent, "Aprendendo");
  assert.equal(ui.get("vocabulary-previous-word").disabled, false);
  await ui.get("vocabulary-previous-word").click();
  assert.equal(ui.get("vocabulary-word-position").textContent, "1 de 10");
  await finishVocabularyStudy(ui);
  assert.equal(ui.get("vocabulary-word-position").textContent, "10 de 10");
  assert.equal(ui.get("vocabulary-study").hidden, true);
  assert.equal(ui.get("vocabulary-study-complete").hidden, false);
  assert.equal(ui.get("vocabulary-exercises").hidden, true);
});

test("Vocabulary uses one progressive five-question quiz, writing step and persisted completion", async () => {
  const ui = await app({ handle: vocabularyReply });
  await openVocabulary(ui);
  await finishVocabularyStudy(ui);
  await ui.get("vocabulary-exercises-button").click();
  assert.equal(ui.get("vocabulary-exercises").hidden, false);
  assert.equal(ui.get("vocabulary-quiz").hidden, false);
  assert.equal(ui.get("vocabulary-practice").hidden, true);
  assert.equal(ui.get("vocabulary-quiz-items").children.length, 1);
  assert.equal(ui.get("vocabulary-exercise-progress").textContent, "0/6 concluídos");

  for (let index = 0; index < 5; index++) {
    const question = ui.get("vocabulary-quiz-items").children[0];
    assert.equal(question.children[1].children.length, 4);
    const expectedWordId = vocabularyLesson.words[index].id;
    const correctOption = question.children[1].children.find(label => label.children[0].value === expectedWordId);
    correctOption.children[0].checked = true;
    await question.children[2].click();
    assert.equal(question.children[3].hidden, false);
    assert.equal(ui.get("vocabulary-exercise-progress").textContent, `${index + 1}/6 concluídos`);
    await question.children[2].click();
  }
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/vocabulary/quiz").length, 1);
  assert.equal(ui.calls.find(r => r.path === "/api/v1/vocabulary/quiz").body.answers.length, 5);
  assert.ok(ui.calls.find(r => r.path === "/api/v1/vocabulary/quiz").body.answers.every(answer =>
    vocabularyLesson.words.some(word => word.id === answer.wordId && vocabularyLesson.words.some(option => option.id === answer.selectedWordId))));
  assert.equal(ui.get("vocabulary-exercise-progress").textContent, "5/6 concluídos");
  assert.equal(ui.get("vocabulary-practice").hidden, false);
  assert.equal(ui.get("vocabulary-quiz-score").textContent, "Resultado: 5 de 5");
  assert.equal(ui.get("vocabulary-word-select").children.length, 10);

  ui.get("vocabulary-word-select").value = "w1";
  ui.get("vocabulary-sentence").value = "The soup is delicious.";
  await ui.get("vocabulary-evaluate").click();
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/vocabulary/evaluate").length, 1);
  assert.equal(ui.get("vocabulary-exercise-progress").textContent, "6/6 concluídos");
  assert.equal(ui.get("vocabulary-completion").hidden, false);
  assert.equal(ui.get("vocabulary-completion-quiz").textContent, "5/5 no quiz");
  assert.equal(ui.get("vocabulary-completion-words").textContent, "10 palavras estudadas");
  assert.equal(ui.get("vocabulary-completion-writing").textContent, "1 frase escrita");
  assert.equal(ui.get("vocabulary-evaluate").disabled, true);
});

test("Vocabulary keeps word and example TTS available through compact controls", async () => {
  const ui = await app({ handle: vocabularyReply });
  await openVocabulary(ui);
  const wordAudio = ui.get("vocabulary-word-audio");
  const exampleAudio = ui.get("vocabulary-example-audio");
  assert.match(html, /id="vocabulary-word-audio" class="secondary vocabulary-audio-button"/);
  assert.match(html, /id="vocabulary-example-audio" class="secondary vocabulary-audio-button"/);
  await wordAudio.click();
  await exampleAudio.click();
  const speechCalls = ui.calls.filter(request => request.path === "/api/v1/speech");
  assert.deepEqual(speechCalls.map(request => request.body), [
    { text: "delicious", language: "en" },
    { text: "The soup is delicious.", language: "en" }
  ]);
});

test("Completed Vocabulary is restored by the Backend and remains available for review", async () => {
  const completed = { ...vocabularyLesson, progress: {
    quizCompleted: true, quizScore: 4, writingCompleted: true, completedAt: "2026-09-16T18:00:00Z"
  } };
  const ui = await app({ handle: request => request.path === "/api/v1/vocabulary/today" ? { body: completed } : vocabularyReply(request) });
  await openVocabulary(ui);
  assert.equal(ui.get("vocabulary-completion").hidden, false);
  assert.equal(ui.get("vocabulary-completion-quiz").textContent, "4/5 no quiz");
  assert.equal(ui.get("vocabulary-completion-words").textContent, "10 palavras estudadas");
  assert.equal(ui.get("vocabulary-study-complete").hidden, true);
  assert.equal(ui.get("vocabulary-exercises").hidden, true);
  assert.equal(ui.get("vocabulary-study").hidden, true);
  await ui.get("vocabulary-review-button").click();
  assert.equal(ui.get("vocabulary-study").hidden, false);
  assert.equal(ui.get("vocabulary-word-position").textContent, "1 de 10");
  await ui.get("vocabulary-next-word").click();
  assert.equal(ui.get("vocabulary-word-position").textContent, "2 de 10");
  assert.equal(ui.calls.some(request => request.path === "/api/v1/vocabulary/quiz"), false);

  await ui.run('resetVocabulary(); appState.currentUser = { id: "owner" }; showView("vocabulary")');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.calls.filter(request => request.path === "/api/v1/vocabulary/today").length, 2);
  assert.equal(ui.get("vocabulary-completion").hidden, false);
  assert.equal(ui.get("vocabulary-completion-quiz").textContent, "4/5 no quiz");
});

test("Vocabulary discards Account A state and starts Account B at the first word", async () => {
  const lessonB = { ...vocabularyLesson, id: "lesson-b", words: vocabularyLesson.words.map((word, index) => ({
    ...word, id: `b-${index + 1}`, status: "NEW"
  })) };
  let account = "a";
  const ui = await app({ handle: request => request.path === "/api/v1/vocabulary/today"
    ? { body: account === "a" ? vocabularyLesson : lessonB } : vocabularyReply(request) });
  await openVocabulary(ui);
  for (let index = 0; index < 5; index++) await ui.get("vocabulary-next-word").click();
  assert.equal(ui.run("vocabularyState.currentWordIndex"), 5);
  assert.equal(ui.get("vocabulary-word-position").textContent, "6 de 10");
  await ui.run("globalThis.pendingVocabularyQuiz = new AbortController(); globalThis.pendingVocabularyEvaluation = new AbortController(); vocabularyState.quizController = pendingVocabularyQuiz; vocabularyState.evaluationController = pendingVocabularyEvaluation;");

  await ui.run("logout()");
  assert.equal(ui.run("vocabularyState.lesson"), null);
  assert.equal(ui.run("vocabularyState.currentWordIndex"), 0);
  assert.equal(ui.run("vocabularyState.quizAnswers.size"), 0);
  assert.equal(ui.run("pendingVocabularyQuiz.signal.aborted"), true);
  assert.equal(ui.run("pendingVocabularyEvaluation.signal.aborted"), true);
  account = "b";
  await ui.run('appState.currentUser = { id: "account-b" }; showView("vocabulary")');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(ui.run("vocabularyState.ownerId"), "account-b");
  assert.equal(ui.run("vocabularyState.lesson.id"), "lesson-b");
  assert.equal(ui.run("vocabularyState.lesson.words[0].id"), "b-1");
  assert.equal(ui.run("vocabularyState.currentWordIndex"), 0);
  assert.equal(ui.get("vocabulary-word-position").textContent, "1 de 10");
});

test("A late Vocabulary response from Account A cannot replace Account B lesson", async () => {
  const lessonB = { ...vocabularyLesson, id: "lesson-b", words: vocabularyLesson.words.map((word, index) => ({
    ...word, id: `b-${index + 1}`
  })) };
  let releaseA, todayCalls = 0;
  const ui = await app({ handle: request => {
    if (request.path !== "/api/v1/vocabulary/today") return vocabularyReply(request);
    todayCalls++;
    if (todayCalls === 1) return new Promise(resolve => { releaseA = () => resolve({ body: vocabularyLesson }); });
    return { body: lessonB };
  } });
  await openVocabulary(ui);
  await ui.run("logout()");
  await ui.run('appState.currentUser = { id: "account-b" }; showView("vocabulary")');
  await new Promise(resolve => setImmediate(resolve));
  releaseA();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(ui.run("vocabularyState.ownerId"), "account-b");
  assert.equal(ui.run("vocabularyState.lesson.id"), "lesson-b");
  assert.equal(ui.get("vocabulary-word-position").textContent, "1 de 10");
});

test("Vocabulary HTTP 500 keeps the authenticated session and reports a feature error", async () => {
  const ui = await app({ authenticated: true, handle: request => request.path === "/api/v1/vocabulary/today"
    ? { status: 500, body: { message: "Internal error" } } : null });
  await openVocabulary(ui);

  assert.equal(ui.state().currentUser.id, "owner");
  assert.equal(ui.get("app-view").hidden, false);
  assert.equal(ui.get("vocabulary-status").textContent, "Não foi possível concluir a operação.");
  assert.equal(ui.storage.has("englishai_access_token"), true);
});

test("Vocabulary HTTP 401 with failed refresh clears the expired session", async () => {
  const ui = await app({ authenticated: true, handle: request => request.path === "/api/v1/vocabulary/today"
    || request.path === "/api/v1/auth/refresh" ? { status: 401, body: { message: "Unauthorized" } } : null });
  await openVocabulary(ui);

  assert.equal(ui.state().currentUser, null);
  assert.equal(ui.get("app-view").hidden, true);
  assert.equal(ui.storage.has("englishai_access_token"), false);
  assert.equal(ui.storage.has("englishai_refresh_token"), false);
});

test("Reading separates setup and content, and Back preserves the last selection", async () => {
  const ui = await app({ handle: readingReply });
  await ui.click("Leitura");
  assert.equal(ui.get("reading-setup").hidden, false);
  assert.equal(ui.get("reading-result").hidden, true);
  ui.get("reading-difficulty").children[0].children.slice(1).forEach(label => { label.children[0].checked = label.children[0].value === "ADVANCED"; });
  ui.get("reading-topic").value = "TECHNOLOGY";
  await ui.get("reading-generate").click();
  assert.equal(ui.get("reading-setup").hidden, true);
  assert.equal(ui.get("reading-result").hidden, false);
  assert.equal(ui.get("reading-topic-label").textContent, "Tecnologia");
  await ui.get("reading-back").click();
  assert.equal(ui.get("reading-setup").hidden, false);
  assert.equal(ui.get("reading-result").hidden, true);
  assert.equal(ui.get("reading-topic").value, "TECHNOLOGY");
  assert.equal(ui.run("readingState.picker.selected()"), "ADVANCED");
  assert.equal(ui.run("readingState.current"), null);
});

test("Reading Hint remains available while TTS is preparing or playing", async () => {
  let releaseSpeech;
  const speechResponse = new Promise(resolve => { releaseSpeech = () => resolve({ body: {} }); });
  const ui = await app({ handle: req => req.path === "/api/v1/speech" ? speechResponse : readingReply(req) });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  const speaking = ui.get("reading-speak").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("reading-hint").disabled, false);
  const hinting = ui.get("reading-hint").click();
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/reading/hint").length, 1);
  releaseSpeech(); await speaking; await hinting;
  assert.equal(ui.run("currentSpeech.audio.played"), true);
  assert.equal(ui.get("reading-hint").disabled, true);
});

test("Reading Back cancels pending hint/audio and prevents late responses", async () => {
  let releaseHint;
  const ui = await app({ handle: req => req.path === "/api/v1/reading/hint"
    ? new Promise(resolve => { releaseHint = () => resolve(readingReply(req)); }) : readingReply(req) });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  const pendingHint = ui.get("reading-hint").click();
  await ui.get("reading-back").click();
  releaseHint(); await pendingHint;
  assert.equal(ui.get("reading-hints").hidden, true);
  assert.equal(ui.get("reading-hint-items").children.length, 0);
  assert.equal(ui.get("reading-text").textContent, "");
  assert.equal(ui.run("readingState.current"), null);
});

test("Reading allows only one successful Hint request per generated text and retries technical failures", async () => {
  let fail = true;
  const ui = await app({ handle: req => req.path === "/api/v1/reading/hint" && fail ? (fail = false, { status: 503 }) : readingReply(req) });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  await ui.get("reading-hint").click();
  assert.equal(ui.get("reading-hint").disabled, false);
  await ui.get("reading-hint").click();
  assert.equal(ui.get("reading-hint").disabled, true);
  assert.equal(ui.get("reading-hint").textContent, "✓ Dica consultada");
  await ui.get("reading-hint").click();
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/reading/hint").length, 2);
});

test("Reading generates and grades exactly three comprehension questions once", async () => {
  const ui = await app({ handle: readingReply });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  assert.equal(ui.calls.some(r => r.path === "/api/v1/reading/questions"), false);
  await ui.get("reading-questions-action").click();
  assert.equal(ui.get("reading-question-items").children.length, 3);
  assert.equal(ui.get("reading-question-items").children[0].children[1].children.length, 4);
  assert.equal(ui.get("reading-question-items").children[0].children[1].children[0].className, "reading-answer-option");
  assert.equal(ui.get("reading-question-items").children[0].children[1].children[0].children[0].type, "radio");
  assert.equal(ui.get("reading-question-items").children[0].children[1].children[0].children[1].className, "reading-answer-text");
  const first = ui.get("reading-question-items").children[0];
  first.children[1].children[0].children[0].checked = true;
  await first.children[2].click();
  assert.match(first.children[2].textContent, /Respondida/);
  assert.equal(first.children[3].hidden, false);
  assert.equal(first.children[1].children[0].children[0].disabled, true);
  await ui.get("reading-questions-action").click();
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/reading/questions").length, 1);
});

for (const [level, expected] of [["A1", "BEGINNER"], ["A2", "BEGINNER"], ["B1", "INTERMEDIATE"], ["B2", "INTERMEDIATE"], ["C1", "ADVANCED"], ["C2", "ADVANCED"], [null, "INTERMEDIATE"]]) {
  test(`Reading reuses the profile recommendation for ${level}`, async () => {
    const ui = await app({ handle: readingReply });
    await ui.run(`currentProfile = { englishLevel: ${JSON.stringify(level)} }; showView("reading")`);
    assert.equal(ui.run("readingState.picker.selected()"), expected);
    const labels = ui.get("reading-difficulty").children[0].children.slice(1);
    labels.forEach(label => { label.children[0].checked = label.children[0].value === "ADVANCED"; });
    ui.get("reading-topic").value = "CULTURE";
    await ui.get("reading-generate").click();
    assert.deepEqual(ui.calls.find(r => r.path === "/api/v1/reading/generate").body, { difficulty: "ADVANCED", topic: "CULTURE" });
  });
}

test("Reading renders with textContent and only requests default English TTS on click", async () => {
  const unsafe = '<img src=x onerror="alert(1)">';
  const ui = await app({ handle: req => req.path === "/api/v1/reading/generate" ? { body: { ...req.body, text: unsafe } } : null });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  assert.equal(ui.get("reading-text").textContent, unsafe);
  assert.equal(ui.get("reading-text").innerHTML, undefined);
  assert.equal(ui.calls.some(r => r.path === "/api/v1/speech"), false);
  await ui.get("reading-speak").click();
  assert.deepEqual(ui.calls.find(r => r.path === "/api/v1/speech").body, { text: unsafe, language: "en" });
  assert.equal(ui.run("currentSpeech.audio.played"), true);
  const player = ui.run("currentSpeech.audio"), url = ui.run("currentSpeech.url");
  await ui.get("reading-generate").click();
  assert.equal(player.paused, true);
  assert.equal(ui.run("currentSpeech"), null);
  await assert.rejects(fetch(url)); // The shared player revoked its ObjectURL.
});

test("Reading prevents duplicate generation and hint requests with independent loading states", async () => {
  let releaseGenerate, releaseHint;
  const ui = await app({ handle: req => req.path === "/api/v1/reading/generate"
    ? new Promise(resolve => { releaseGenerate = () => resolve(readingReply(req)); })
    : req.path === "/api/v1/reading/hint" ? new Promise(resolve => { releaseHint = () => resolve(readingReply(req)); }) : null });
  await ui.click("Leitura");
  const generating = ui.get("reading-generate").click();
  assert.equal(ui.get("reading-generate").textContent, "Gerando texto...");
  await ui.run("generateReading()");
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/reading/generate").length, 1);
  releaseGenerate(); await generating;
  assert.equal(ui.get("reading-generate").disabled, false);
  const hinting = ui.get("reading-hint").click();
  assert.equal(ui.get("reading-hint").textContent, "Preparando dica...");
  assert.equal(ui.get("reading-generate").disabled, false);
  await ui.run("requestReadingHint()");
  assert.equal(ui.calls.filter(r => r.path === "/api/v1/reading/hint").length, 1);
  releaseHint(); await hinting;
  assert.equal(ui.get("reading-hints").hidden, false);
});

test("Reading hints are safe, use the generated level and are cleared by a new text", async () => {
  const ui = await app({ handle: readingReply });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  ui.get("reading-difficulty").children[0].children.slice(1).forEach(label => { label.children[0].checked = label.children[0].value === "ADVANCED"; });
  await ui.get("reading-hint").click();
  const req = ui.calls.find(r => r.path === "/api/v1/reading/hint");
  assert.deepEqual(req.body, { text: readingText, difficulty: "INTERMEDIATE" });
  const hint = ui.get("reading-hint-items").children[0];
  assert.equal(hint.children[0].textContent, "along the way");
  assert.equal(hint.children[1].textContent, "Significa durante o caminho.");
  assert.equal(hint.innerHTML, undefined);
  await ui.get("reading-generate").click();
  assert.equal(ui.get("reading-hints").hidden, true);
  assert.equal(ui.get("reading-hint-items").children.length, 0);
  assert.equal(ui.run("readingState.current.difficulty"), "ADVANCED");
});

test("Late reading hints cannot repopulate a new reading or a logged-out session", async () => {
  let release;
  const ui = await app({ handle: req => req.path === "/api/v1/reading/hint" ? new Promise(resolve => { release = () => resolve(readingReply(req)); }) : readingReply(req) });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  const pending = ui.get("reading-hint").click();
  await ui.get("reading-generate").click(); release(); await pending;
  assert.equal(ui.get("reading-hints").hidden, true);
  await ui.run("logout()");
  assert.equal(ui.get("reading-text").textContent, "");
  assert.equal(ui.run("readingState.current"), null);
});

test("Leaving Reading discards a late generation response", async () => {
  let release;
  const ui = await app({ handle: req => req.path === "/api/v1/reading/generate" ? new Promise(resolve => { release = () => resolve(readingReply(req)); }) : null });
  await ui.click("Leitura"); const pending = ui.get("reading-generate").click();
  await ui.run('showView("home")'); release(); await pending;
  assert.equal(ui.run("readingState.current"), null);
  assert.equal(ui.get("reading-generate").disabled, false);
});

test("Reading retains text when TTS or hints fail, including malformed hint fallback", async () => {
  const ui = await app({ handle: req => req.path === "/api/v1/speech" ? { status: 503 }
    : req.path === "/api/v1/reading/hint" ? { body: { items: [] } } : readingReply(req) });
  await ui.click("Leitura"); await ui.get("reading-generate").click();
  await ui.get("reading-speak").click();
  assert.equal(ui.get("reading-text").textContent, readingText);
  assert.equal(ui.get("reading-speech-status").hidden, false);
  await ui.get("reading-hint").click();
  assert.equal(ui.get("reading-hints").hidden, true);
  assert.match(ui.get("reading-hint-status").textContent, /tentar novamente/);
  assert.equal(ui.get("reading-text").textContent, readingText);
});

// Runs the complete, unmodified application script and its actual event handlers.
// The DOM and HTTP boundary are fake; no packages, browser credentials or real LLM are needed.
class Element {
  constructor(id = "") {
    Object.assign(this, { id, children: [], dataset: {}, handlers: {}, attributes: {}, value: "", hidden: true, disabled: false, textContent: "" });
    const classes = new Set();
    this.classList = { add: (...x) => x.forEach(c => classes.add(c)), remove: (...x) => x.forEach(c => classes.delete(c)),
      contains: x => classes.has(x), toggle: (x, force) => { if (force ?? !classes.has(x)) classes.add(x); else classes.delete(x); } };
  }
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  replaceWith() {}
  remove() {}
  scrollTo() {}
  focus() {}
  querySelectorAll() { return []; }
  async click() { if (this.disabled) return; if (this.onclick) await this.onclick(); for (const fn of this.handlers.click ?? []) await fn({ preventDefault() {}, currentTarget: this }); }
}
class FakeAudio {
  constructor(url) { this.url = url; this.played = false; this.paused = false; this.onended = null; this.onerror = null; }
  async play() { this.played = true; return undefined; }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() {}
}
async function app({ authenticated = false, handle } = {}) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  const get = key => { assert.ok(elements.has(key), `DOM id exists: ${key}`); return elements.get(key); };
  const nav = [...html.matchAll(/<button\b([^>]*data-view="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)].map(m => {
    const el = new Element(); el.dataset.view = m[2]; el.textContent = m[3].replace(/<[^>]+>/g, "").trim(); return el;
  });
  const pages = [...elements.values()].filter(el => el.id.startsWith("view-"));
  get("chat-language").value = "en";
  get("chat-mode").value = "text";
  const storage = new Map(authenticated ? [["englishai_access_token", "test-access"], ["englishai_refresh_token", "test-refresh"]] : []);
  const calls = [];
  const sandbox = {
    document: { getElementById: get, createElement: () => new Element(), head: new Element(),
      querySelectorAll: selector => selector === ".page-view" ? pages : selector === "[data-view]" ? nav
        : selector.startsWith('[data-view="') ? nav.filter(el => selector === `[data-view="${el.dataset.view}"]`) : [] },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }), confirm: () => true },
    navigator: {}, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    performance, AbortController, FormData, Blob, Event, TextDecoder, TextEncoder, URL, Audio: FakeAudio, setTimeout, clearTimeout, console,
    fetch: async (url, options = {}) => {
      const request = { path: new URL(url).pathname, method: options.method ?? "GET", body: typeof options.body === "string" ? JSON.parse(options.body) : undefined };
      calls.push(request);
      const custom = await handle?.(request);
      if (custom) return new Response(JSON.stringify(custom.body ?? {}), { status: custom.status ?? 200 });
      const bodies = { "/api/v1/users/me": { id: "owner", username: "Learner" }, "/api/v1/users/me/profile": {},
        "/api/v1/avatars": [], "/api/v1/conversation-scenarios": scenarios, "/api/v1/conversations": [conversation("JOB_INTERVIEW")] };
      if (request.path.endsWith("/messages/stream")) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify(bodies[request.path] ?? {}));
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const run = code => vm.runInContext(code, sandbox);
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  if (!authenticated) run('appState.currentUser = { id: "owner" };');
  return { get, nav, calls, run, storage, state: () => run("appState"), click: name => nav.find(el => el.textContent === name).click() };
}

test("Home CTA navigates to Scenarios and never creates a conversation", async () => {
  const ui = await app(); await ui.run('showView("home")'); await ui.click("Começar uma conversa");
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.get("view-chat").hidden, true);
  assert.equal(ui.get("scenario-list").children.length, 3);
  assert.equal(ui.calls.filter(r => r.method === "POST").length, 0);
});

test("Every chat navigation entry redirects without a loaded conversation", async () => {
  const ui = await app();
  for (const button of ui.nav.filter(el => el.dataset.view === "chat")) {
    await button.click(); assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.get("view-chat").hidden, true);
  }
  await ui.run('showView("chat")'); assert.equal(ui.state().currentView, "scenarios");
});

for (const scenario of ["RESTAURANT", "JOB_INTERVIEW", "FREE_TALK"]) {
  test(`${scenario}: scenario button creates once, fetches detail and renders the persisted opening`, async () => {
    const ui = await app({ handle: req => req.method === "POST" && req.path === "/api/v1/conversations"
      ? { body: conversation(scenario) } : req.path === `/api/v1/conversations/${id}` ? { body: detail(scenario) } : null });
    await ui.run('showView("scenarios")');
    const card = ui.get("scenario-list").children[scenarios.findIndex(s => s.id === scenario)];
    await card.children.find(el => el.textContent === "Iniciar conversa").click();
    assert.equal(ui.state().currentView, "chat"); assert.equal(ui.state().currentConversation.scenario, scenario);
    assert.equal(ui.get("chat-messages").children[0].children[1].textContent, "A scenario-specific opening.");
    assert.deepEqual(assistantActionLabels(ui.get("chat-messages").children[0]), ["Traduzir", "Ouvir"]);
    assert.equal(ui.get("chat-assistant-name").textContent, conversation(scenario).assistantDisplayName);
    const writes = ui.calls.filter(req => req.method === "POST"); assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].body, { scenario, language: "en", difficulty: "INTERMEDIATE" });
    assert.ok(ui.calls.some(req => req.path === `/api/v1/conversations/${id}` && req.method === "GET"));
  });
}

test("Conversations reopens an existing detail without POST and restores original language and history", async () => {
  const stored = detail("JOB_INTERVIEW"); stored.conversation.language = "pt";
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: stored } : null });
  await ui.run('showView("conversations")');
  const actions = ui.get("conversation-list").children[0].children.at(-1);
  await actions.children[0].click();
  assert.equal(ui.state().currentView, "chat"); assert.equal(ui.get("chat-messages").children.length, 2);
  assert.equal(ui.get("chat-language").value, "pt"); assert.equal(ui.get("chat-language").disabled, true);
  assert.deepEqual(assistantActionLabels(ui.get("chat-messages").children[0]), ["Traduzir", "Ouvir"]);
  assert.equal(assistantActionLabels(ui.get("chat-messages").children[1]), undefined);
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

test("Completed streamed assistant replies use the same actions renderer as persisted history", async () => {
  const ui = await app({ handle: request => request.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`);
  await ui.run('const streamed=appendChatMessage("assistant", ""); streamed.bubble.textContent="A streamed reply."; renderCompletedReply(streamed, "Hello", "en", { hasCorrection: false }, performance.now(), undefined);');
  const message = ui.get("chat-messages").children.at(-1);
  assert.deepEqual(assistantActionLabels(message), ["Traduzir", "Ouvir"]);
  assert.match(source, /function appendAssistantActions\(item, reply, language\)/);
  assert.equal((source.match(/textContent = "Traduzir"/g) ?? []).length, 1);
});

for (const invalid of [{ status: 404 }, { body: { conversation: { id }, messages: [] } },
  { body: { conversation: conversation("JOB_INTERVIEW") } }]) {
  test(`Invalid or failed detail cannot open chat: ${JSON.stringify(invalid)}`, async () => {
    const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? invalid : null });
    await ui.run(`openConversation("${id}")`);
    assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("view-chat").hidden, true);
    assert.equal(ui.state().currentView, "conversations");
  });
}

test("Successful creation followed by failed detail does not open empty chat or repeat creation", async () => {
  const ui = await app({ handle: req => req.method === "POST" ? { body: conversation("JOB_INTERVIEW") }
    : req.path === `/api/v1/conversations/${id}` ? { status: 404 } : null });
  await ui.run('showView("scenarios")'); await ui.run('createConversation("JOB_INTERVIEW")');
  assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("view-chat").hidden, true);
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 1);
});

test("Logout clears conversation and rendered history immediately, without deleting persistence", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await ui.run("logout()");
  assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("chat-messages").children.length, 0);
  assert.equal(ui.get("view-chat").hidden, true); assert.equal(ui.calls.some(req => req.method === "DELETE"), false);
});

test("Late detail after logout cannot restore previous user's conversation", async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? response : null });
  const opening = ui.run(`openConversation("${id}")`); await ui.run("logout()");
  resolve({ body: detail("JOB_INTERVIEW") }); await opening;
  assert.equal(ui.state().currentConversation, null); assert.equal(ui.get("view-chat").hidden, true);
});

test("Navigating away clears temporary selection, and a late creation cannot force chat navigation", async () => {
  let resolve; const response = new Promise(done => { resolve = done; });
  const ui = await app({ handle: req => req.method === "POST" ? response : null });
  await ui.run('showView("scenarios")'); const creating = ui.run('createConversation("JOB_INTERVIEW")');
  await ui.run('showView("home")'); resolve({ body: conversation("JOB_INTERVIEW") }); await creating;
  assert.equal(ui.state().currentView, "home"); assert.equal(ui.state().currentConversation, null);
});

test("Missing scenario never creates FREE_TALK implicitly", async () => {
  const ui = await app(); await ui.run('showView("scenarios")');
  await ui.run('createConversation(null)'); await ui.run('createConversation("NONEXISTENT")');
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

test("Authenticated browser refresh starts at Scenarios with no invented selection", async () => {
  const ui = await app({ authenticated: true });
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.get("view-chat").hidden, true); assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

test("Sending without a loaded conversation redirects, never using legacy chat", async () => {
  const ui = await app();
  await ui.run('sendChatMessage("Hello", "en", { generation: conversationGeneration })');
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
  assert.equal(source.includes('"/api/v1/chat/stream"'), false);
});

test("New conversation button leaves persisted chat and navigates to scenario choice", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await ui.get("clear-chat").click();
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.calls.some(req => req.method === "DELETE"), false);
});


test("Valid chat sends only to its persistent endpoint and keeps Backend language", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`);
  await ui.run('sendChatMessage("Hello", "pt", { generation: conversationGeneration, voice: false })');
  const writes = ui.calls.filter(req => req.method === "POST");
  assert.equal(writes.length, 1); assert.equal(writes[0].path, `/api/v1/conversations/${id}/messages/stream`);
  assert.deepEqual(writes[0].body, { message: "Hello" });
  assert.equal(ui.get("chat-language").value, "en"); assert.equal(ui.get("chat-language").disabled, true);
});

test("Repeated start clicks while generating cannot issue a second creation", async () => {
  let resolve; const response = new Promise(done => { resolve = done; });
  const ui = await app({ handle: req => req.method === "POST" ? response
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run('showView("scenarios")'); const first = ui.run('createConversation("JOB_INTERVIEW")');
  await ui.run('createConversation("JOB_INTERVIEW")'); resolve({ body: conversation("JOB_INTERVIEW") }); await first;
  assert.equal(ui.calls.filter(req => req.method === "POST").length, 1);
  assert.equal(ui.state().currentView, "chat");
});

test("Profile and Account remain available through the sidebar", async () => {
  const ui = await app();
  await ui.click("Perfil");
  assert.equal(ui.state().currentView, "profile");
  await ui.click("Conta");
  assert.equal(ui.state().currentView, "account");
});

test("Collapsed sidebar still opens Profile", async () => {
  const ui = await app();
  await ui.get("sidebar-toggle").click();
  assert.equal(ui.state().sidebarCollapsed, true);
  await ui.click("Perfil");
  assert.equal(ui.state().currentView, "profile");
});

test("Header profile control opens Profile while logout only clears the session", async () => {
  const ui = await app({ authenticated: true });
  await ui.get("profile-header-link").click();
  assert.equal(ui.state().currentView, "profile");
  await ui.run('showView("home")');
  await ui.get("logout").click();
  assert.equal(ui.get("app-view").hidden, true);
  assert.notEqual(ui.state().currentView, "profile");
  assert.ok(ui.calls.some(request => request.path === "/api/v1/auth/logout"));
});

test("Header profile and logout are independent button controls", () => {
  assert.match(html, /<button id="profile-header-link"[\s\S]*?<\/button><button id="logout"/);
  const profileButton = html.match(/<button id="profile-header-link"[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(profileButton, /type="button"[\s\S]*aria-label="Abrir perfil"/);
  assert.doesNotMatch(profileButton, /id="logout"/);
});

test("Editing Profile preserves current values and Cancel does not persist edits", async () => {
  const ui = await app();
  await ui.run('currentProfile = { preferredName: "Ana", age: 25, englishLevel: "B1", learningGoal: "WORK", avatarKey: "avatar_01", onboardingCompleted: true }; appState.profile = currentProfile; avatarCatalog = [{ key: "avatar_01", displayName: "Ana", imageUrl: "/a" }]; appState.avatars = avatarCatalog; renderProfileSummary(currentProfile); openProfileEdit();');
  assert.equal(ui.get("profile-name").value, "Ana");
  assert.equal(ui.get("profile-age").value, 25);
  assert.equal(ui.get("profile-level").value, "B1");
  assert.equal(ui.get("profile-goal").value, "WORK");
  ui.get("profile-name").value = "Outro nome";
  await ui.get("profile-cancel-button").click();
  assert.equal(ui.state().profile.preferredName, "Ana");
  assert.equal(ui.calls.filter(request => request.method === "PUT").length, 0);
});

test("Profile save updates shared state and commits the selected avatar", async () => {
  const savedProfile = { preferredName: "Ana Maria", age: 26, englishLevel: "B2", learningGoal: "TRAVEL", avatarKey: "avatar_01", onboardingCompleted: true };
  const ui = await app({ handle: request => {
    if (request.path === "/api/v1/users/me/profile" && request.method === "PUT") return { body: savedProfile };
    if (request.path === "/api/v1/users/me/profile/avatar/predefined" && request.method === "PUT") return { body: { ...savedProfile, avatarKey: "avatar_02" } };
    return null;
  }});
  await ui.run('currentProfile = { preferredName: "Ana", age: 25, englishLevel: "B1", learningGoal: "WORK", avatarKey: "avatar_01", onboardingCompleted: true }; appState.profile = currentProfile; avatarCatalog = [{ key: "avatar_01", displayName: "Um", imageUrl: "/one" }, { key: "avatar_02", displayName: "Dois", imageUrl: "/two" }]; appState.avatars = avatarCatalog; openProfileEdit();');
  ui.get("profile-name").value = "Ana Maria";
  ui.get("profile-age").value = "26";
  ui.get("profile-level").value = "B2";
  ui.get("profile-goal").value = "TRAVEL";
  await ui.get("avatar-grid").children[1].click();
  assert.equal(ui.get("avatar-grid").children[1].classList.contains("selected"), true);
  await ui.run("saveProfile({ preventDefault() {} })");
  assert.equal(ui.state().profile.preferredName, "Ana Maria");
  assert.equal(ui.state().profile.avatarKey, "avatar_02");
  assert.equal(ui.get("profile-summary-name").textContent, "Ana Maria");
  assert.equal(ui.get("header-avatar-slot").children[0].src, "http://localhost:8080/two");
  const avatarWrite = ui.calls.find(request => request.path === "/api/v1/users/me/profile/avatar/predefined");
  assert.deepEqual(avatarWrite.body, { avatarKey: "avatar_02" });
});

test("Profile shows the CEFR label and difficulty cards recommend the matching level", async () => {
  const ui = await app({ authenticated: true });
  await ui.run('currentProfile = { preferredName: "Ana", age: 25, englishLevel: "B1", learningGoal: "WORK", avatarKey: "avatar_default", onboardingCompleted: true }; appState.profile = currentProfile; renderProfileSummary(currentProfile); showView("scenarios");');
  assert.equal(ui.get("profile-summary-level").textContent, "B1 — Intermediário");
  const card = ui.get("scenario-list").children[0];
  const picker = card.children.find(child => child.className === "conversation-difficulty-picker");
  const options = picker.children.filter(child => child.className === "difficulty-option");
  assert.equal(options[1].children[0].checked, true);
  assert.match(options[1].children[1].innerHTML, /Recomendado para você/);
  assert.match(options[0].children[1].innerHTML, /Frases mais simples/);
  assert.match(options[2].children[1].innerHTML, /Expressões e phrasal verbs/);
});

test("Missing profile level recommends Intermediate while the user can choose another difficulty", async () => {
  const ui = await app({ authenticated: true });
  await ui.run('currentProfile = { englishLevel: null }; appState.profile = currentProfile; showView("scenarios");');
  const picker = ui.get("scenario-list").children[0].children.find(child => child.className === "conversation-difficulty-picker");
  const options = picker.children.filter(child => child.className === "difficulty-option");
  assert.equal(options[1].children[0].checked, true);
  assert.equal(options[1].children[1].innerHTML.includes("Recomendado para você"), false);
  options[0].children[0].checked = true; options[1].children[0].checked = false;
  assert.equal(ui.run('difficultyForEnglishLevel("C2")'), "ADVANCED");
  assert.equal(ui.run('difficultyForEnglishLevel("A2")'), "BEGINNER");
});

test("Header identity and chat structure retain the independent controls and required regions", () => {
  assert.match(html, /class="topbar-brand" aria-label="EnglishAI"/);
  assert.match(html, /id="chat-assistant"/);
  assert.match(html, /id="chat-messages"/);
  assert.match(html, /id="chat-form" class="chat-composer"/);
  assert.match(source, /validConversation\(appState\.currentConversation\)/);
});

test("Exactly one main view is visible after navigation, and hidden Chat never leaks into another page", async () => {
  const ui = await app();
  const visibleViews = () => [...["home", "profile", "account", "scenarios", "conversations", "translate", "correct", "chat"]]
    .filter(name => !ui.get(`view-${name}`).hidden);
  for (const view of ["home", "profile", "account", "scenarios", "conversations", "translate", "correct"]) {
    await ui.run(`showView("${view}")`);
    assert.deepEqual(visibleViews(), [view]);
    assert.equal(ui.get("view-chat").hidden, true);
  }
  await ui.run('showView("chat")');
  assert.deepEqual(visibleViews(), ["scenarios"]);
  assert.equal(ui.get("view-chat").hidden, true);
});

test("A validated conversation makes Chat the sole visible view with its resolved assistant and history", async () => {
  const ui = await app({ handle: request => request.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`);
  const visible = ["home", "profile", "account", "scenarios", "conversations", "translate", "correct", "chat"]
    .filter(name => !ui.get(`view-${name}`).hidden);
  assert.deepEqual(visible, ["chat"]);
  assert.equal(ui.get("chat-assistant-name").textContent, "Rodrigo");
  assert.equal(ui.get("chat-messages").children.length, 2);
});

test("The hidden attribute remains authoritative over the Chat layout selector", () => {
  assert.match(fs.readFileSync(path.join(__dirname, "styles.css"), "utf8"), /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test("Shared STT flow fills the requested tool field and preserves it on an API error", async () => {
  const ui = await app({ handle: request => request.path === "/api/v1/transcriptions" ? { body: { text: "Texto reconhecido", language: "pt" } } : null });
  await ui.run('const operation={kind:"translation",inputId:"translation-text",statusId:"translation-stt-status",language:"pt",controller:new AbortController()}; recordingOperation=operation; transcribeRecording(operation,new Blob(["audio"],{type:"audio/webm"}));');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("translation-text").value, "Texto reconhecido");
  assert.ok(ui.calls.some(request => request.path === "/api/v1/transcriptions"));

  const failing = await app({ handle: request => request.path === "/api/v1/transcriptions" ? { status: 503 } : null });
  failing.get("correction-text").value = "Manter este texto";
  await failing.run('const operation={kind:"correction",inputId:"correction-text",statusId:"correction-stt-status",language:"en",controller:new AbortController()}; recordingOperation=operation; transcribeRecording(operation,new Blob(["audio"],{type:"audio/webm"}));');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failing.get("correction-text").value, "Manter este texto");
});

test("Translation and correction TTS use the shared authenticated speech endpoint", async () => {
  const ui = await app();
  ui.get("translation-result").value = "Hello";
  ui.get("target-language").value = "en";
  await ui.run('playSpeech($("speak-translation"), $("translation-speech-status"), $("translation-result").value, $("target-language").value, false, undefined, false)');
  const request = ui.calls.find(call => call.path === "/api/v1/speech");
  assert.deepEqual(request.body, { text: "Hello", language: "en" });
  assert.match(source, /stopSpeech\(\);\r?\n  output\.textContent = ""/);
});

test("Translation and correction render structured learning content without empty sections", async () => {
  const ui = await app();
  await ui.run('renderTranslationEnrichment({ usage: "Expressa expectativa futura.", examples: [{ text: "I look forward to the trip.", translation: "Estou ansioso pela viagem." }] });');
  assert.equal(ui.get("translation-enrichment").hidden, false);
  assert.equal(ui.get("translation-examples").children.length, 1);
  await ui.run('renderTranslationEnrichment(null); renderCorrectionLearning({ status: "CORRECT", correctedText: "I do not know.", alternatives: [], examples: [] });');
  assert.equal(ui.get("translation-enrichment").hidden, true);
  assert.equal(ui.get("correction-learning").hidden, true);
  assert.match(ui.get("correction-state").textContent, /correta/);
});

test("Standalone correction uses one response and no longer exposes the second explanation flow", async () => {
  assert.equal(html.includes("explain-correction"), false);
  assert.equal(html.includes("explanation-card"), false);
  assert.equal(source.includes("function explainCorrection"), false);
  const ui = await app({ handle: request => request.path === "/api/v1/correct" ? { body: {
    status: "CORRECTED", correctedText: "I am 25 years old.", explanation: "Usamos to be para idade.", usageTip: "Use I am + idade.", alternatives: [], examples: []
  } } : null });
  ui.get("correction-text").value = "I have 25 years old";
  await ui.run('correct()');
  assert.equal(ui.calls.filter(call => call.path === "/api/v1/correct").length, 1);
  assert.equal(ui.calls.some(call => call.path === "/api/v1/correct/explain"), false);
  assert.equal(ui.get("correction-explanation").textContent, "Usamos to be para idade.");
  assert.equal(ui.get("correction-tip").textContent, "Use I am + idade.");
});

for (const count of [0, 2, 3, 4]) {
  test(`Scenario creation availability follows the Backend list (${count} conversations)`, async () => {
    const ui = await app({ handle: req => req.path === "/api/v1/conversations" && req.method === "GET"
      ? { body: Array.from({ length: count }, () => conversation("FREE_TALK")) } : null });
    await ui.run('showView("scenarios")');
    const buttons = ui.get("scenario-list").children.map(card => card.children.at(-1));
    assert.equal(buttons.length, 3);
    assert.ok(buttons.every(button => button.disabled === (count >= 3)));
    if (count >= 3) {
      assert.equal(ui.get("scenario-status").textContent, "Você atingiu o limite de 3 conversas. Exclua uma conversa para iniciar outra.");
      await ui.run('createConversation("FREE_TALK")');
      assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
    }
  });
}

test("Scenario creation defaults to text mode and does not request automatic TTS for the opening", async () => {
  const ui = await app({ handle: req => req.method === "POST" && req.path === "/api/v1/conversations"
    ? { body: conversation("RESTAURANT") } : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run('showView("scenarios")');
  const card = ui.get("scenario-list").children[0];
  await card.children.find(el => el.textContent === "Iniciar conversa").click();
  assert.equal(ui.get("chat-mode").value, "text");
  assert.equal(ui.calls.some(req => req.path === "/api/v1/speech"), false);
  assert.equal(ui.get("chat-messages").children[0].children[1].hidden, false);
});

test("Scenario creation in voice mode sets VOICE before POST and plays the persisted opening", async () => {
  const ui = await app({ handle: req => req.method === "POST" && req.path === "/api/v1/conversations"
    ? { body: conversation("RESTAURANT") } : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : req.path === "/api/v1/speech" ? { body: new Blob(["wav"], { type: "audio/wav" }) } : null });
  await ui.run('showView("scenarios")');
  const card = ui.get("scenario-list").children[0];
  const modePicker = card.children.find(el => el.className === "conversation-mode-picker");
  modePicker.children[1].children[0].checked = false;
  modePicker.children[2].children[0].checked = true;
  await card.children.find(el => el.textContent === "Iniciar conversa").click();
  assert.equal(ui.get("chat-mode").value, "voice");
  assert.ok(ui.calls.some(req => req.path === "/api/v1/speech"));
  assert.equal(ui.get("chat-messages").children[0].children[1].hidden, false);
  assert.equal(ui.run("currentSpeech?.audio?.played"), true);
});

test("Deleting a conversation frees creation without login and a server conflict disables stale buttons", async () => {
  let count = 3;
  const ui = await app({ handle: req => {
    if (req.method === "DELETE") { count--; return { body: {} }; }
    if (req.path === "/api/v1/conversations") return req.method === "GET"
      ? { body: Array.from({ length: count }, () => conversation("FREE_TALK")) }
      : { status: 409, body: { message: "You can have at most 3 conversations." } };
    return null;
  }});
  await ui.run('showView("scenarios")');
  await ui.run(`deleteConversation("${id}")`);
  assert.equal(ui.state().conversationCount, 2);
  const button = ui.get("scenario-list").children[0].children.at(-1);
  assert.equal(button.disabled, false);
  await button.click();
  assert.equal(ui.state().currentView, "scenarios");
  assert.ok(ui.get("scenario-list").children.every(card => card.children.at(-1).disabled));
  assert.match(ui.get("scenario-status").textContent, /limite de 3 conversas/);
});

test("Assistant speech captures its conversation id while text tools stay generic", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`);
  const opening = ui.get("chat-messages").children[0];
  const actions = opening.children.find(child => child.className === "chat-actions");
  await actions.children.find(button => button.textContent === "Ouvir").click();
  assert.deepEqual(ui.calls.find(req => req.path === "/api/v1/speech").body,
    { text: "A scenario-specific opening.", language: "en", conversationId: id });
});

test("Scenario creation sends only the selected controlled difficulty and reopening preserves it", async () => {
  const selected = conversation("JOB_INTERVIEW", "ADVANCED");
  const ui = await app({ handle: req => {
    if (req.method === "POST" && req.path === "/api/v1/conversations") return { body: selected };
    if (req.path === `/api/v1/conversations/${id}`) return { body: { conversation: selected, messages: [] } };
    return null;
  }});
  await ui.run('showView("scenarios")');
  const card = ui.get("scenario-list").children[1];
  const picker = card.children.find(child => child.className === "conversation-difficulty-picker");
  picker.children[1].children[0].checked = false;
  picker.children[2].children[0].checked = false;
  picker.children[3].children[0].checked = true;
  await card.children.at(-1).click();
  const request = ui.calls.find(call => call.method === "POST" && call.path === "/api/v1/conversations");
  assert.equal(request.body.difficulty, "ADVANCED");
  assert.equal(ui.state().currentConversation.difficulty, "ADVANCED");
  assert.doesNotMatch(JSON.stringify(request.body), /Frases|vocabulário|idioms|instructions/i);
});

function configureStream(ui) {
  return ui.run(`
    let streamIndex = 0;
    authenticatedStream = async () => ({ ok: true, status: 200, body: { getReader: () => ({
      read: async () => streamIndex++ === 0
        ? { done: false, value: new TextEncoder().encode('event: token\\ndata: {"text":"Voice reply"}\\n\\nevent: complete\\ndata: {}\\n\\n') }
        : { done: true, value: new Uint8Array() },
      cancel: async () => {}, releaseLock: () => {}
    }) } });
  `);
}

test("Text chat renders its reply without waiting for TTS", async () => {
  const ui = await app({ handle: request => request.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await new Promise(resolve => setImmediate(resolve));
  await ui.run('authenticatedRequest = async () => { throw new Error("TTS must not be called"); };');
  await configureStream(ui);
  await ui.run('sendChatMessage("Hello", "en", { generation: conversationGeneration, voice: false })');
  const assistant = ui.get("chat-messages").children.at(-1);
  assert.equal(assistant.children[1].textContent, "Voice reply");
});

test("Voice chat keeps the assistant reply hidden until TTS is ready, then reveals and plays it", async () => {
  const ui = await app({ handle: request => request.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await new Promise(resolve => setImmediate(resolve));
  await ui.run('let ttsReady; const ttsPromise = new Promise(resolve => { ttsReady = resolve; }); authenticatedRequest = async path => path === "/api/v1/speech" ? ttsPromise : { response: { ok: true, status: 200 }, body: {} };');
  await configureStream(ui);
  const send = ui.run('$("chat-mode").value = "voice"; sendChatMessage("Hello", "en", { generation: conversationGeneration, voice: true })');
  await new Promise(resolve => setImmediate(resolve));
  const pending = ui.get("chat-messages").children.at(-1);
  assert.equal(pending.children[1].hidden, true);
  assert.equal(pending.getAttribute("aria-busy"), "true");
  const resolveTts = await ui.run("ttsReady");
  resolveTts({ response: { ok: true, status: 200 }, body: new Blob(["wav"], { type: "audio/wav" }) });
  await send;
  assert.equal(pending.children[1].hidden, false);
  assert.equal(pending.children[1].textContent, "Voice reply");
  assert.equal(await ui.run("currentSpeech.audio.played"), true);
});

test("Voice chat reveals the text when TTS fails", async () => {
  const ui = await app({ handle: request => request.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await new Promise(resolve => setImmediate(resolve));
  await ui.run('authenticatedRequest = async path => path === "/api/v1/speech" ? { response: { ok: false, status: 503 }, body: {} } : { response: { ok: true, status: 200 }, body: {} };');
  await configureStream(ui);
  await ui.run('$("chat-mode").value = "voice"; sendChatMessage("Hello", "en", { generation: conversationGeneration, voice: true })');
  const assistant = ui.get("chat-messages").children.at(-1);
  assert.equal(assistant.children[1].hidden, false);
  assert.equal(assistant.children[1].textContent, "Voice reply");
});

test("Cancelling voice chat prevents a late TTS response from revealing or playing the old reply", async () => {
  const ui = await app({ handle: request => request.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await new Promise(resolve => setImmediate(resolve));
  await ui.run('let ttsReady; const ttsPromise = new Promise(resolve => { ttsReady = resolve; }); authenticatedRequest = async path => path === "/api/v1/speech" ? ttsPromise : { response: { ok: true, status: 200 }, body: {} };');
  await configureStream(ui);
  const send = ui.run('$("chat-mode").value = "voice"; sendChatMessage("Hello", "en", { generation: conversationGeneration, voice: true })');
  await new Promise(resolve => setImmediate(resolve));
  await ui.run("cancelConversation(); ttsReady({ response: { ok: true, status: 200 }, body: new Blob([\"wav\"], { type: \"audio/wav\" }) });");
  await send;
  assert.equal(await ui.run("currentSpeech"), null);
  assert.equal(ui.get("chat-messages").children.at(-1).children[1].hidden, true);
});
