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
const conversationEvaluation = (status = "SUCCESS") => ({ conversationId: id, status,
  scores: { communication: 82, grammar: 74, vocabulary: 78, fluency: 80, relevance: 80, overall: 79 },
  strengths: ["Você manteve o contexto."], improvements: ["Varie os conectores."], evaluatedAt: "2026-09-16T12:00:00Z" });

for (const mode of ["text", "voice"]) {
  test(`Conversation completion in ${mode} shows persisted scores and blocks new messages`, async () => {
    const ui = await app({ handle: req => req.path.endsWith("/complete") ? { body: conversationEvaluation() }
      : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
    await ui.run(`openConversation("${id}")`);
    await ui.run(`$("chat-mode").value = "${mode}"`);
    assert.equal(ui.get("complete-conversation").disabled, false);
    await ui.get("complete-conversation").click();
    assert.equal(ui.state().currentConversation.endedAt, conversationEvaluation().evaluatedAt);
    assert.equal(ui.get("conversation-evaluation").hidden, false);
    const content = ui.get("conversation-evaluation").children;
    assert.equal(content[2].textContent, "Desempenho geral: 79/100");
    assert.deepEqual(content[3].children.map(el => el.textContent), ["Comunicação", "82", "Gramática", "74", "Vocabulário", "78", "Fluência linguística", "80", "Relevância", "80"]);
    assert.equal(content[5].children[0].textContent, "Você manteve o contexto.");
    assert.equal(content[7].children[0].textContent, "Varie os conectores.");
    assert.equal(ui.get("send-chat").disabled, true);
    assert.equal(ui.get("chat-form").hidden, true);
    assert.equal(ui.get("record-chat").disabled, true);
    await ui.run('sendChatMessage("Hello", "en", { generation: conversationGeneration }); toggleRecording()');
    await ui.get("complete-conversation").click();
    assert.equal(ui.calls.filter(req => req.path.endsWith("/complete")).length, 1);
    assert.equal(ui.calls.some(req => req.path.endsWith("/messages/stream")), false);
  });
}

test("Insufficient conversation remains active and can continue", async () => {
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? { body: { conversationId: id, status: "INSUFFICIENT", minimumUserMessages: 4, currentUserMessages: 2 } }
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`);
  await ui.get("complete-conversation").click();
  assert.match(ui.get("conversation-completion-status").textContent, /2 de 4/);
  assert.equal(ui.get("conversation-evaluation").hidden, true);
  assert.equal(ui.get("send-chat").disabled, false);
  assert.equal(ui.get("chat-form").hidden, false);
  assert.equal(ui.get("complete-conversation").disabled, false);
  assert.equal(ui.state().currentConversation.endedAt, undefined);
});

test("Completion loading prevents duplicate requests and sending while evaluating", async () => {
  let resolve;
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? new Promise(r => resolve = r)
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`);
  const pending = ui.get("complete-conversation").click();
  assert.equal(ui.get("complete-conversation").textContent, "Avaliando sua conversa...");
  assert.equal(ui.get("send-chat").disabled, true);
  await ui.get("complete-conversation").click();
  assert.equal(ui.calls.filter(req => req.path.endsWith("/complete")).length, 1);
  resolve({ body: conversationEvaluation() }); await pending;
});

test("NEEDS_PRACTICE remains constructive and feedback is rendered as text", async () => {
  const result = { ...conversationEvaluation("NEEDS_PRACTICE"), strengths: ["<img src=x onerror=alert(1)>"] };
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? { body: result }
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`); await ui.get("complete-conversation").click();
  assert.match(ui.get("conversation-evaluation").children[1].textContent, /Continue praticando/);
  const item = ui.get("conversation-evaluation").children[5].children[0];
  assert.equal(item.textContent, result.strengths[0]);
  assert.equal(item.children.length, 0);
});

test("Reopening an ended conversation restores history and evaluation without another POST", async () => {
  const stored = detail("RESTAURANT"); stored.conversation.endedAt = conversationEvaluation().evaluatedAt; stored.evaluation = conversationEvaluation();
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: stored } : null });
  await ui.run(`openConversation("${id}")`);
  assert.equal(ui.get("conversation-evaluation").hidden, false);
  assert.equal(ui.get("chat-messages").children.length, 2);
  assert.equal(ui.get("complete-conversation").textContent, "Conversa concluída");
  assert.equal(ui.get("send-chat").disabled, true);
  assert.equal(ui.calls.some(req => req.method === "POST"), false);
  assert.deepEqual(assistantActionLabels(ui.get("chat-messages").children[0]), ["Traduzir", "Ouvir"]);
});

test("Ended conversation evaluation starts expanded and can be collapsed without a request", async () => {
  const stored = detail("RESTAURANT"); stored.conversation.endedAt = conversationEvaluation().evaluatedAt; stored.evaluation = conversationEvaluation();
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: stored } : null });
  await ui.run(`openConversation("${id}")`);
  const evaluation = ui.get("conversation-evaluation"), toggle = evaluation.children[0].children[0], before = ui.calls.length;
  assert.equal(toggle.textContent, "Recolher");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  await toggle.click();
  assert.equal(evaluation.classList.contains("is-collapsed"), true);
  assert.equal(evaluation.children[1].hidden, true);
  assert.equal(toggle.textContent, "Expandir");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(ui.get("chat-messages").children.length, 2);
  await toggle.click();
  assert.equal(evaluation.children[1].hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(ui.calls.length, before);
});

test("Active conversation keeps the composer visible after the layout change", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`);
  assert.equal(ui.get("view-chat").hidden, false);
  assert.equal(ui.get("chat-form").hidden, false);
  assert.ok(ui.get("chat-message"));
  assert.equal(ui.get("send-chat").disabled, false);
  assert.equal(ui.get("record-chat").disabled, false);
  assert.equal(ui.get("conversation-evaluation").hidden, true);
});

test("Ended conversation keeps evaluation and its scores visible above the fold", async () => {
  const stored = detail("RESTAURANT"); stored.conversation.endedAt = conversationEvaluation().evaluatedAt; stored.evaluation = conversationEvaluation();
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: stored } : null });
  await ui.run(`openConversation("${id}")`);
  const evaluation = ui.get("conversation-evaluation");
  assert.equal(evaluation.hidden, false);
  assert.equal(evaluation.children[0].children[0].textContent, "Recolher");
  assert.match(evaluation.children[3].children.map(element => element.textContent).join(" "), /Comunicação/);
  assert.match(evaluation.children[3].children.map(element => element.textContent).join(" "), /Gramática/);
  assert.match(evaluation.children[3].children.map(element => element.textContent).join(" "), /Vocabulário/);
  assert.match(evaluation.children[3].children.map(element => element.textContent).join(" "), /Fluência linguística/);
  assert.match(evaluation.children[3].children.map(element => element.textContent).join(" "), /Relevância/);
  assert.equal(ui.get("chat-form").hidden, true);
});

test("Active conversation has no evaluation toggle and switching conversations resets visual state", async () => {
  const otherId = "22222222-2222-4222-8222-222222222222";
  const ended = detail("RESTAURANT"); ended.conversation.endedAt = conversationEvaluation().evaluatedAt; ended.evaluation = conversationEvaluation();
  const active = detail("FREE_TALK"); active.conversation.id = otherId;
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: ended }
    : req.path === `/api/v1/conversations/${otherId}` ? { body: active } : null });
  await ui.run(`openConversation("${id}")`);
  const toggle = ui.get("conversation-evaluation").children[0].children[0]; await toggle.click();
  await ui.run(`openConversation("${otherId}")`);
  assert.equal(ui.get("conversation-evaluation").children.length, 0);
  assert.equal(ui.get("conversation-evaluation").hidden, true);
  assert.equal(ui.get("chat-messages").children.length, 2);
  assert.equal(ui.get("conversation-evaluation").querySelectorAll("button").length, 0);
});

test("Conversation messages keep a viewport-based internal scroll region", async () => {
  assert.match(fs.readFileSync(path.join(__dirname, "styles.css"), "utf8"), /\.chat-messages[^}]*overflow-y:\s*auto/);
  assert.match(fs.readFileSync(path.join(__dirname, "styles.css"), "utf8"), /#view-chat \.chat-card[^}]*min-height:\s*0/);
  assert.equal(fs.readFileSync(path.join(__dirname, "styles.css"), "utf8").includes(".chat-messages { min-height: clamp"), false);
  assert.match(fs.readFileSync(path.join(__dirname, "styles.css"), "utf8"), /\.conversation-evaluation[^}]*max-height:\s*min\(/);
});

test("Login hero uses the provided photo and no longer includes the decorative chat card", () => {
  const styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.equal(html.includes('class="auth-preview"'), false);
  assert.equal(html.includes("What would you like to talk about today?"), false);
  assert.match(html, /class="brand-panel"/);
  for (const text of ["EnglishAI", "PRATIQUE INGLÊS COM CONFIANÇA", "Converse. Aprenda. Evolua."]) assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const text of ["PALAVRAS QUE ABREM CAMINHOS", "Mais confiança.", "Um espaço para praticar, experimentar e aprender inglês com a ajuda da IA.", "Converse. Descubra. Vá mais longe."]) assert.equal(html.includes(text), false);
  assert.match(html, /id="login-form"/);
  assert.match(styles, /\.brand-panel[^}]*background-image:\s*url\("assets\/login-hero\.png"\)/);
  assert.match(styles, /\.brand-panel[^}]*background-size:\s*cover/);
  assert.match(styles, /\.brand-panel[^}]*background-position:\s*58%\s+center/);
  assert.doesNotMatch(styles, /\.brand-panel::before\s*\{/);
  assert.doesNotMatch(styles, /\.brand-story::before[^}]*radial-gradient/);
  assert.match(styles, /\.brand-story[^}]*max-width:\s*290px/);
  assert.match(styles, /\.brand-message[^}]*font-size:\s*1\.15rem/);
  assert.doesNotMatch(styles, /\.auth-preview\s*\{/);
});

test("Historical evaluation without relevance renders a dash", async () => {
  const stored = detail("RESTAURANT"); stored.conversation.endedAt = conversationEvaluation().evaluatedAt;
  stored.evaluation = conversationEvaluation(); delete stored.evaluation.scores.relevance;
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: stored } : null });
  await ui.run(`openConversation("${id}")`);
  assert.equal(ui.get("conversation-evaluation").children[3].children[9].textContent, "—");
});

test("Failed evaluation keeps session and history and permits retry", async () => {
  let attempts = 0;
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? ++attempts === 1 ? { status: 503 } : { body: conversationEvaluation() }
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`); await ui.get("complete-conversation").click();
  assert.equal(ui.state().currentUser.id, "owner");
  assert.equal(ui.get("chat-messages").children.length, 2);
  assert.equal(ui.get("send-chat").disabled, false);
  assert.match(ui.get("conversation-completion-status").textContent, /tentar novamente/);
  await ui.get("complete-conversation").click();
  assert.equal(ui.get("conversation-evaluation").hidden, false);
});

test("Pending stream or recording blocks completion without cancelling the turn", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`);
  for (const state of ['activeChat = { controller: new AbortController() }', 'activeChat = null; recordingOperation = { kind: "chat" }']) {
    await ui.run(state + '; updateConversationControls()');
    assert.equal(ui.get("complete-conversation").disabled, true);
    await ui.get("complete-conversation").click();
  }
  assert.equal(ui.calls.some(req => req.path.endsWith("/complete")), false);
});

test("Logout and another account discard pending evaluation and old result", async () => {
  let resolve;
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? new Promise(r => resolve = r)
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`);
  const pending = ui.get("complete-conversation").click();
  await ui.run('showLogin(); appState.currentUser = { id: "another-owner" };');
  resolve({ body: conversationEvaluation() }); await pending;
  assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.get("conversation-evaluation").hidden, true);
  assert.equal(ui.get("conversation-evaluation").children.length, 0);
  assert.equal(ui.run("conversationCompletion"), null);
});

test("Completing a conversation stops shared TTS and releases its ObjectURL", async () => {
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? { body: conversationEvaluation() }
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`);
  await ui.run('globalThis.completionAudio = new Audio("blob:test"); globalThis.completionController = new AbortController(); currentSpeech = { controller: completionController, audio: completionAudio, url: "blob:test", button: $("send-chat"), voice: true, generation: conversationGeneration };');
  await ui.get("complete-conversation").click();
  assert.equal(ui.run("completionAudio.paused"), true);
  assert.equal(ui.run("completionController.signal.aborted"), true);
  assert.equal(ui.run("currentSpeech"), null);
});

test("Completion authentication failure clears account and evaluation state", async () => {
  const ui = await app({ handle: req => req.path.endsWith("/complete") ? { status: 401 }
    : req.path === `/api/v1/conversations/${id}` ? { body: detail("RESTAURANT") } : null });
  await ui.run(`openConversation("${id}")`); await ui.get("complete-conversation").click();
  assert.equal(ui.state().currentUser, null);
  assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.get("conversation-evaluation").children.length, 0);
});

function progressReply(request) {
  if (request.path === "/api/v1/progress") return { body: progressData("ALL_TIME") };
  if (request.path === "/api/v1/progress/timeline") return { body: progressTimeline };
  return null;
}
test("Meu Progresso opens with ALL_TIME and renders the three read-only areas", async () => {
  const ui=await app({handle:progressReply}); await ui.click("Meu Progresso"); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.state().currentView,"progress"); assert.equal(ui.get("view-progress").hidden,false); assert.equal(ui.get("progress-content").hidden,false);
  assert.equal(ui.get("progress-conversations").textContent,"8"); assert.equal(ui.get("progress-readings").textContent,"10"); assert.equal(ui.get("progress-new-words").textContent,"37"); assert.equal(ui.get("progress-mastered").textContent,"28");
  assert.equal(ui.get("progress-conversation-difficulty").children.length,2); assert.equal(ui.get("progress-reading-difficulty").children.length,1); assert.equal(ui.get("progress-timeline").children.length,6);
  assert.equal(ui.calls.filter(r=>r.path==="/api/v1/progress").length,1); assert.equal(ui.calls.filter(r=>r.path==="/api/v1/progress/timeline").length,1);
});
test("Loading rápido não produz flash e termina com a região livre", async () => {
  const ui = await app({ handle: progressReply });
  await ui.click("Meu Progresso");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-loading").hidden, true);
  assert.equal(ui.get("progress-loading").getAttribute("aria-busy"), "false");
  assert.equal(ui.get("progress-content").hidden, false);
});
test("Loading lento do Progress aparece e desaparece após os dados", async () => {
  let release;
  const ui = await app({ handle: req => req.path === "/api/v1/progress" ? new Promise(resolve => { release = resolve; }) : progressReply(req) });
  const opening = ui.click("Meu Progresso");
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(ui.get("progress-loading").hidden, false);
  assert.equal(ui.get("progress-loading").getAttribute("aria-busy"), "true");
  assert.equal(ui.get("progress-content").hidden, true);
  release({ body: progressData("ALL_TIME") });
  await opening; await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-loading").hidden, true);
  assert.equal(ui.get("progress-loading").getAttribute("aria-busy"), "false");
  assert.equal(ui.get("progress-content").hidden, false);
});
test("Falha do Progress encerra o loading e mostra erro", async () => {
  const ui = await app({ handle: req => req.path === "/api/v1/progress" ? { status: 503 } : progressReply(req) });
  await ui.click("Meu Progresso");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-loading").hidden, true);
  assert.equal(ui.get("progress-loading").getAttribute("aria-busy"), "false");
  assert.match(ui.get("progress-status").textContent, /temporariamente indisponível|Não foi possível/);
});
test("Troca de view encerra o loading antigo e ignora o Progress tardio", async () => {
  let release;
  const ui = await app({ handle: req => req.path === "/api/v1/progress" ? new Promise(resolve => { release = resolve; }) : progressReply(req) });
  const opening = ui.click("Meu Progresso");
  await new Promise(resolve => setTimeout(resolve, 220));
  await ui.run('showView("home")');
  assert.equal(ui.get("progress-loading").hidden, true);
  assert.equal(ui.get("progress-loading").getAttribute("aria-busy"), "false");
  release({ body: progressData("ALL_TIME") });
  await opening;
  assert.equal(ui.state().currentView, "home");
  assert.equal(ui.get("progress-content").hidden, true);
});
test("Progress period filters are explicit and backend remains the authority", async () => {
  const ui=await app({handle:progressReply});
  await ui.click("Meu Progresso"); await new Promise(resolve=>setImmediate(resolve));
  await ui.run('document.querySelectorAll = () => []; progressPeriod = "CURRENT_MONTH"; loadProgress()'); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.run("progressPeriod"),"CURRENT_MONTH"); assert.equal(ui.get("progress-content").hidden,false);
});
test("Progress empty data keeps sections visible, uses em dash, and shows no alert", async () => {
  const empty={period:"ALL_TIME",periodStart:null,periodEnd:"2026-09-16T12:00:00Z",overview:{conversationsCompleted:0,readingsCompleted:0,wordsFirstSeen:0,wordsMasteredCurrent:0},conversation:{totalEvaluated:0,successCount:0,needsPracticeCount:0,successRate:null,averageOverall:null,averageCommunication:null,averageGrammar:null,averageVocabulary:null,averageFluency:null,byDifficulty:[]},reading:{totalCompleted:0,successCount:0,needsPracticeCount:0,successRate:null,averageComprehension:null,byDifficulty:[]},vocabulary:{totalWords:0,newCount:0,learningCount:0,reviewingCount:0,masteredCount:0,dueForReview:0,wordsFirstSeenInPeriod:0,wordsReviewedInPeriod:0}};
  const ui=await app({handle:req=>req.path==="/api/v1/progress"?{body:empty}:progressReply(req)}); await ui.click("Meu Progresso"); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.get("progress-conversations").textContent, "0"); assert.equal(ui.get("progress-readings").textContent, "0"); assert.equal(ui.get("progress-word-count").textContent, "0"); assert.equal(ui.get("progress-conversation-average").textContent,"—"); assert.equal(ui.get("progress-reading-average").textContent,"—"); assert.equal(ui.state().currentUser.id,"owner");
  assert.equal(ui.get("progress-status").textContent, "");
});
test("Progress request failure still shows the real error", async () => {
  const ui = await app({ handle: req => { if (req.path === "/api/v1/progress") throw new Error("network"); return progressReply(req); } });
  await ui.click("Meu Progresso"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-status").textContent, "Não foi possível carregar seu progresso. Tente novamente.");
});
test("Progress render failure still shows the real error", async () => {
  const ui = await app({ handle: progressReply });
  await ui.run('renderProgress = () => { throw new Error("render"); }; showView("progress")'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-status").textContent, "Não foi possível carregar seu progresso. Tente novamente.");
});
test("Progress accepts null comparison and empty timeline metrics from a successful API response", async () => {
  const empty={period:"ALL_TIME",periodStart:null,periodEnd:"2026-09-16T12:00:00Z",overview:{conversationsCompleted:0,readingsCompleted:0,wordsFirstSeen:0,wordsMasteredCurrent:0},conversation:{totalEvaluated:0,successCount:0,needsPracticeCount:0,successRate:null,averageOverall:null,averageCommunication:null,averageGrammar:null,averageVocabulary:null,averageFluency:null,byDifficulty:null},reading:{totalCompleted:0,successCount:0,needsPracticeCount:0,successRate:null,averageComprehension:null,byDifficulty:null},vocabulary:{totalWords:0,newCount:0,learningCount:0,reviewingCount:0,masteredCount:0,dueForReview:0,wordsFirstSeenInPeriod:0,wordsReviewedInPeriod:0},comparison:null};
  const ui=await app({handle:req=>req.path==="/api/v1/progress"?{body:empty}:{body:{points:[{period:"2026-09",conversation:null,reading:null,vocabulary:null}]}}}); await ui.click("Meu Progresso"); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.get("progress-content").hidden,false); assert.equal(ui.get("progress-timeline").children.length,1); assert.match(ui.get("progress-timeline").children[0].children[1].textContent,/Conversação: — \(0\)/);
});
test("Sidebar exposes learning tools and uses an internal scroll region", () => {
  for (const view of ["home","chat","reading","vocabulary","translate","correct","scenarios","conversations","progress","profile"]) assert.match(html, new RegExp(`data-view="${view}"`));
  assert.equal(html.includes('data-view="account"'), false); assert.match(fs.readFileSync(path.join(__dirname,"styles.css"),"utf8"),/\.sidebar nav[^}]*overflow-y:\s*auto/);
});
test("Stale progress response cannot replace a newer account or filter", async () => {
  let release; const ui=await app({handle:req=>req.path==="/api/v1/progress"?new Promise(resolve=>release=resolve):progressReply(req)});
  const opening=ui.click("Meu Progresso"); await ui.run('appState.currentUser = { id: "other" }; resetProgress(); showView("home")'); release({body:progressData()}); await opening;
  assert.equal(ui.state().currentView,"home"); assert.equal(ui.get("progress-content").hidden,true); assert.equal(ui.run("progressRequest"),null);
});
test("Progress renders mixed persisted data when conversation is absent", async () => {
  const payload={period:"ALL_TIME",periodStart:null,periodEnd:"2026-09-17T06:00:11Z",overview:{conversationsCompleted:0,readingsCompleted:1,wordsFirstSeen:20,wordsMasteredCurrent:0},conversation:{totalEvaluated:0,successCount:0,needsPracticeCount:0,successRate:null,averageOverall:null,averageCommunication:null,averageGrammar:null,averageVocabulary:null,averageFluency:null,byDifficulty:[{difficulty:"BEGINNER",count:0,successCount:0,averageOverall:null,averageCommunication:null,averageGrammar:null,averageVocabulary:null,averageFluency:null},{difficulty:"INTERMEDIATE",count:0,successCount:0,averageOverall:null,averageCommunication:null,averageGrammar:null,averageVocabulary:null,averageFluency:null},{difficulty:"ADVANCED",count:0,successCount:0,averageOverall:null,averageCommunication:null,averageGrammar:null,averageVocabulary:null,averageFluency:null}]},reading:{totalCompleted:1,successCount:0,needsPracticeCount:1,successRate:0,averageComprehension:33,byDifficulty:[{difficulty:"BEGINNER",count:1,successCount:0,averageComprehension:33},{difficulty:"INTERMEDIATE",count:0,successCount:0,averageComprehension:null},{difficulty:"ADVANCED",count:0,successCount:0,averageComprehension:null}]},vocabulary:{totalWords:20,newCount:15,learningCount:4,reviewingCount:1,masteredCount:0,dueForReview:0,wordsFirstSeenInPeriod:20,wordsReviewedInPeriod:0},comparison:null};
  const ui=await app({handle:req=>req.path==="/api/v1/progress"?{body:payload}:{body:{points:[{period:"2026-09",conversation:null,reading:{count:1,average:33},vocabulary:{wordsFirstSeen:20}}]}}});
  await ui.click("Meu Progresso"); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.get("progress-content").hidden,false); assert.equal(ui.get("progress-conversation-average").textContent,"—"); assert.equal(ui.get("progress-reading-average").textContent,"33%"); assert.equal(ui.get("progress-conversation-difficulty").children.length,3); assert.equal(ui.get("progress-status").textContent, "");
});

test("Progress renders the current backend payload with nullable averages", async () => {
  const payload = { ...progressData(), periodStart: null, overview: { conversationsCompleted: 0, readingsCompleted: 1, wordsFirstSeen: 20, wordsMasteredCurrent: 0 }, conversation: { totalEvaluated: 0, successCount: 0, needsPracticeCount: 0, successRate: null, averageOverall: null, averageCommunication: null, averageGrammar: null, averageVocabulary: null, averageFluency: null, byDifficulty: [{ difficulty: "ADVANCED", count: 0, successCount: 0, averageOverall: null }, { difficulty: "BEGINNER", count: 0, successCount: 0, averageOverall: null }, { difficulty: "INTERMEDIATE", count: 0, successCount: 0, averageOverall: null }] }, reading: { totalCompleted: 1, successCount: 0, needsPracticeCount: 1, successRate: 0, averageComprehension: 33.0, byDifficulty: [{ difficulty: "ADVANCED", count: 0, successCount: 0, averageComprehension: null }, { difficulty: "BEGINNER", count: 1, successCount: 0, averageComprehension: 33.0 }, { difficulty: "INTERMEDIATE", count: 0, successCount: 0, averageComprehension: null }] }, vocabulary: { totalWords: 20, newCount: 15, learningCount: 4, reviewingCount: 1, masteredCount: 0, dueForReview: 0, wordsFirstSeenInPeriod: 20, wordsReviewedInPeriod: 0 }, comparison: null };
  const timeline = { points: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map(period => ({ period, conversation: { count: 0, average: null }, reading: { count: period === "2026-09" ? 1 : 0, average: period === "2026-09" ? 33.0 : null }, vocabulary: { wordsFirstSeen: period === "2026-09" ? 20 : 0 } })) };
  const ui = await app({ handle: req => req.path === "/api/v1/progress" ? { body: payload } : { body: timeline } });
  await ui.click("Meu Progresso"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-content").hidden, false); assert.equal(ui.get("progress-reading-average").textContent, "33%"); assert.equal(ui.get("progress-conversation-average").textContent, "—"); assert.equal(ui.get("progress-timeline").children.length, 6);
});
test("Progress reset preserves the real DOM structure and allows reopening", async () => {
  const ui = await app({ handle: progressReply });
  const required = ["progress-content", "progress-conversations", "progress-readings", "progress-vocabulary", "progress-timeline", "progress-status"];
  await ui.click("Meu Progresso"); await new Promise(resolve => setImmediate(resolve));
  await ui.run('showView("home")');
  assert.ok(required.every(id => ui.run(`document.getElementById("${id}")`) !== null));
  assert.equal(ui.get("progress-conversations").textContent, "");
  assert.equal(ui.get("progress-timeline").children.length, 0);
  await ui.click("Meu Progresso"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.get("progress-content").hidden, false);
  assert.equal(ui.get("progress-conversations").textContent, "8");
});
test("Repeated Progress navigation keeps all required elements available", async () => {
  const ui = await app({ handle: progressReply });
  for (let i = 0; i < 3; i++) {
    await ui.click("Meu Progresso"); await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.get("progress-conversations").textContent, "8");
    await ui.run('showView("home")');
    assert.ok(ui.run('document.getElementById("progress-conversations") !== null'));
  }
});
test("Progress renderer IDs exist in the real index HTML", () => {
  const expected = [...html.matchAll(/progressElement\("([^"]+)"\)|\bset\("(progress-[^"]+)"/g)].map(match => match[1] || match[2]);
  const actual = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual([...new Set(expected)].filter(id => !actual.has(id)), []);
});

const assistantActionLabels = item => item.children.find(child => child.className === "chat-actions")?.children.map(child => child.textContent);

function refreshedResponse(request) {
  if (request.path === "/api/v1/auth/refresh") return { body: { accessToken: "renewed-access", refreshToken: "renewed-refresh" } };
  return null;
}

test("Progress keeps its view when an expired access token is refreshed", async () => {
  let expired = true;
  const ui = await app({ authenticated: true, handle: request => {
    if (request.path === "/api/v1/progress" && expired) { expired = false; return { status: 401 }; }
    if (request.path === "/api/v1/progress" || request.path === "/api/v1/progress/timeline") return progressReply(request);
    return refreshedResponse(request);
  }});
  await ui.click("Meu Progresso"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.state().currentView, "progress");
  assert.equal(ui.calls.filter(request => request.path === "/api/v1/auth/refresh").length, 1);
  assert.equal(ui.get("progress-content").hidden, false);
});

test("Reading keeps its view when an expired access token is refreshed", async () => {
  let expired = true;
  const ui = await app({ authenticated: true, handle: request => {
    if (request.path === "/api/v1/reading/generate" && expired) { expired = false; return { status: 401 }; }
    if (request.path === "/api/v1/reading/generate") return { body: { text: readingText, difficulty: "INTERMEDIATE", topic: "DAILY_LIFE" } };
    return refreshedResponse(request);
  }});
  await ui.click("Leitura"); await ui.run('generateReading()'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.state().currentView, "reading");
  assert.equal(ui.calls.filter(request => request.path === "/api/v1/auth/refresh").length, 1);
});

test("Conversation keeps its view when an expired access token is refreshed", async () => {
  let expired = true;
  const ui = await app({ authenticated: true, handle: request => {
    if (request.path === `/api/v1/conversations/${id}` && expired) { expired = false; return { status: 401 }; }
    if (request.path === `/api/v1/conversations/${id}`) return { body: detail("JOB_INTERVIEW") };
    return refreshedResponse(request);
  }});
  await ui.run('appState.currentUser = { id: "owner" };'); await ui.run(`openConversation("${id}")`);
  assert.equal(ui.state().currentView, "chat");
  assert.equal(ui.calls.filter(request => request.path === "/api/v1/auth/refresh").length, 1);
});

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

const progressData = period => ({ period: period || "ALL_TIME", periodStart: "2026-01-01T00:00:00Z", periodEnd: "2026-09-16T12:00:00Z", overview: { conversationsCompleted: 8, readingsCompleted: 10, wordsFirstSeen: 37, wordsMasteredCurrent: 28 }, conversation: { totalEvaluated: 8, successCount: 6, needsPracticeCount: 2, successRate: 75, averageOverall: 78, averageCommunication: 82, averageGrammar: 72, averageVocabulary: 77, averageFluency: 80, byDifficulty: [{ difficulty: "BEGINNER", count: 0, successCount: 0, averageOverall: null }, { difficulty: "INTERMEDIATE", count: 8, successCount: 6, averageOverall: 78 }] }, reading: { totalCompleted: 10, successCount: 8, needsPracticeCount: 2, successRate: 80, averageComprehension: 82, byDifficulty: [{ difficulty: "BEGINNER", count: 10, successCount: 8, averageComprehension: 82 }] }, vocabulary: { totalWords: 184, newCount: 42, learningCount: 51, reviewingCount: 63, masteredCount: 28, dueForReview: 12, wordsFirstSeenInPeriod: 37, wordsReviewedInPeriod: 24 } });
const progressTimeline = { points: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map(period => ({ period, conversation: { count: period === "2026-06" ? 0 : 2, average: period === "2026-06" ? null : 70 }, reading: { count: 1, average: 75 }, vocabulary: { wordsFirstSeen: 3 } })) };

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

test("Reading submit sends the activity request through the authenticated helper", async () => {
  const questionIds = ["21111111-1111-4111-8111-111111111111", "31111111-1111-4111-8111-111111111111", "41111111-1111-4111-8111-111111111111"];
  const ui = await app({ authenticated: true, handle: req => req.path.endsWith("/submit")
    ? { body: { activityId: id, correctAnswers: 3, totalQuestions: 3, percentage: 100, status: "SUCCESS", difficulty: "INTERMEDIATE" } } : readingReply(req) });
  await ui.run(`readingState.current = { activityId: "${id}", text: "Reading", difficulty: "INTERMEDIATE" }; readingState.questions = ${JSON.stringify(questionIds.map((questionId, index) => ({ id: questionId, question: `Q${index}`, options: ["A", "B", "C", "D"], correctOption: 0, explanation: "ok" })))}; readingState.answers = new Map([[0, 0], [1, 0], [2, 0]]);`);
  await ui.run("submitReadingActivity()");
  const submit = ui.calls.find(req => req.path.endsWith("/submit"));
  assert.ok(submit);
  assert.equal(submit.headers.Authorization, "Bearer test-access");
  assert.equal(submit.body.answers.length, 3);
});

test("Reading submit retries once after an expired access token using refresh", async () => {
  let submits = 0;
  const ui = await app({ authenticated: true, handle: req => {
    if (req.path.endsWith("/submit")) return ++submits === 1 ? { status: 401 } : { body: { activityId: id, correctAnswers: 2, totalQuestions: 3, percentage: 67, status: "SUCCESS", difficulty: "INTERMEDIATE" } };
    if (req.path === "/api/v1/auth/refresh") return { body: { accessToken: "renewed-access", refreshToken: "renewed-refresh" } };
    return readingReply(req);
  }});
  await ui.run(`readingState.current = { activityId: "${id}", text: "Reading", difficulty: "INTERMEDIATE" }; readingState.questions = ${JSON.stringify([1, 2, 3].map((n, index) => ({ id: `${n}1111111-1111-4111-8111-111111111111`, question: `Q${index}`, options: ["A", "B", "C", "D"], correctOption: 0, explanation: "ok" })))}; readingState.answers = new Map([[0, 0], [1, 0], [2, 0]]);`);
  await ui.run("submitReadingActivity()");
  assert.equal(submits, 2);
  assert.equal(ui.storage.get("englishai_access_token"), "renewed-access");
  assert.equal(ui.state().currentUser.id, "owner");
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
    Object.assign(this, { id, children: [], parentElement: null, detached: false, dataset: {}, handlers: {}, attributes: {}, value: "", hidden: true, disabled: false, textContent: "" });
    const classes = new Set();
    this.classList = { add: (...x) => x.forEach(c => classes.add(c)), remove: (...x) => x.forEach(c => classes.delete(c)),
      contains: x => classes.has(x), toggle: (x, force) => { if (force ?? !classes.has(x)) classes.add(x); else classes.delete(x); } };
  }
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(...children) { children.forEach(child => { child.parentElement = this; child.detached = false; this.children.push(child); }); }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children.forEach(child => child.detach()); this.children = []; this.append(...children); }
  detach() { this.detached = true; this.children.forEach(child => child.detach()); this.parentElement = null; }
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
  const progressStructure = [...elements.keys()].filter(id => id.startsWith("progress-") && id !== "progress-content");
  get("progress-content").append(...progressStructure.map(get));
  const nav = [...html.matchAll(/<button\b([^>]*data-view="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)].map(m => {
    const el = new Element(); el.dataset.view = m[2]; el.textContent = m[3].replace(/<[^>]+>/g, "").trim(); return el;
  });
  const pages = [...elements.values()].filter(el => el.id.startsWith("view-"));
  get("chat-language").value = "en";
  get("chat-mode").value = "text";
  const storage = new Map(authenticated ? [["englishai_access_token", "test-access"], ["englishai_refresh_token", "test-refresh"]] : []);
  const calls = [];
  const sandbox = {
    document: { getElementById: id => { const element = elements.get(id); return element?.detached ? null : element; }, createElement: () => new Element(), head: new Element(),
      querySelectorAll: selector => selector === ".page-view" ? pages : selector === "[data-view]" ? nav
        : selector.startsWith('[data-view="') ? nav.filter(el => selector === `[data-view="${el.dataset.view}"]`) : [] },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }), confirm: () => true },
    navigator: {}, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    performance, AbortController, FormData, Blob, Event, TextDecoder, TextEncoder, URL, Audio: FakeAudio, setTimeout, clearTimeout, console,
    fetch: async (url, options = {}) => {
      const request = { path: new URL(url).pathname, method: options.method ?? "GET", headers: options.headers || {}, body: typeof options.body === "string" ? JSON.parse(options.body) : undefined };
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
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
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

test("Authenticated browser refresh starts at Home with no invented selection", async () => {
  const ui = await app({ authenticated: true });
  assert.equal(ui.state().currentView, "home"); assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.get("view-chat").hidden, true); assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
});

test("A normal authenticated entry also starts at Home", async () => {
  const ui = await app();
  ui.storage.set("englishai_access_token", "new-login-access"); ui.storage.set("englishai_refresh_token", "new-login-refresh");
  await ui.run("showHome()");
  assert.equal(ui.state().currentView, "home");
  assert.equal(ui.state().currentConversation, null);
});

test("Sidebar separates new conversation from conversation history", async () => {
  const ui = await app({ authenticated: true });
  assert.equal(ui.nav.filter(button => button.dataset.view === "chat").length, 2); // Home content CTAs only; the sidebar has no chat destination.
  assert.ok(ui.nav.some(button => button.dataset.view === "scenarios" && button.textContent.includes("Nova conversa")));
  await ui.click("Nova conversa");
  assert.equal(ui.state().currentView, "scenarios");
  await ui.click("Conversas");
  assert.equal(ui.state().currentView, "conversations");
});

test("New conversation clears the previous conversation without deleting it", async () => {
  const ui = await app({ authenticated: true, handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run('appState.currentUser = { id: "owner" };');
  await ui.run(`openConversation("${id}")`);
  assert.equal(ui.state().currentConversation.id, id);
  await ui.click("Nova conversa"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.state().currentView, "scenarios");
  assert.equal(ui.calls.filter(request => request.method === "DELETE").length, 0);
});

test("Conversation opened from history keeps history active", async () => {
  const ui = await app({ authenticated: true, handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run('showView("conversations")');
  await ui.get("conversation-list").children[0].children.at(-1).children[0].click();
  assert.equal(ui.state().currentView, "chat");
  assert.equal(ui.nav.find(button => button.dataset.view === "conversations").classList.contains("active"), true);
  assert.equal(ui.nav.find(button => button.dataset.view === "scenarios").classList.contains("active"), false);
});

test("Conversation history distinguishes active and ended entries and hides ended deletion", async () => {
  const active = { ...conversation("FREE_TALK"), id: "active-id", updatedAt: "2026-09-17T12:00:00Z" };
  const ended = { ...conversation("JOB_INTERVIEW"), id: "ended-id", endedAt: "2026-09-16T12:00:00Z" };
  const ui = await app({ handle: req => req.path === "/api/v1/conversations" ? { body: [active, ended] }
    : req.path === "/api/v1/conversations/active-id" ? { body: { ...detail("FREE_TALK"), conversation: active } }
    : req.path === "/api/v1/conversations/ended-id" ? { body: { ...detail("JOB_INTERVIEW"), conversation: ended, evaluation: conversationEvaluation() } } : null });
  await ui.run('showView("conversations")');
  const cards = ui.get("conversation-list").children;
  assert.equal(cards.length, 2);
  assert.match(cards[0].className, /conversation-active/);
  assert.equal(cards[0].children.find(el => el.className === "conversation-state").textContent, "● Ativa");
  assert.ok(cards[0].children.at(-1).children.some(button => button.textContent === "Excluir"));
  assert.match(cards[1].className, /conversation-ended/);
  assert.equal(cards[1].children.find(el => el.className === "conversation-state").textContent, "✓ Encerrada");
  assert.equal(cards[1].children.at(-1).children.some(button => button.textContent === "Excluir"), false);
  await cards[1].children.at(-1).children[0].click();
  assert.equal(ui.get("delete-conversation").hidden, true);
});

test("Conversation created from new conversation keeps new conversation active", async () => {
  const ui = await app({ authenticated: true, handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run('appState.currentUser = { id: "owner" };');
  await ui.run('appState.conversationNavigationContext = "new"; showView("scenarios");');
  await ui.run(`openConversation("${id}", undefined, { navigationContext: "new" })`);
  assert.equal(ui.state().currentView, "chat");
  assert.equal(ui.nav.find(button => button.dataset.view === "scenarios").classList.contains("active"), true);
});

test("Sending without a loaded conversation redirects, never using legacy chat", async () => {
  const ui = await app();
  await ui.run('sendChatMessage("Hello", "en", { generation: conversationGeneration })');
  assert.equal(ui.state().currentView, "scenarios"); assert.equal(ui.calls.filter(req => req.method === "POST").length, 0);
  assert.equal(source.includes('"/api/v1/chat/stream"'), false);
});

test("Active conversation offers Excluir conversa and not Limpar", async () => {
  const ui = await app({ handle: req => req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`);
  assert.equal(ui.get("delete-conversation").hidden, false);
  assert.equal(html.includes('id="clear-chat"'), false);
  assert.match(html, /id="delete-conversation"[^>]*>[\s\S]*<span>Excluir conversa<\/span>/);
});

test("Canceling conversation deletion does not call DELETE", async () => {
  const ui = await app({ handle: req => req.method === "GET" && req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") } : null });
  await ui.run(`openConversation("${id}")`); await ui.run(`window.confirm = () => false; deleteConversation("${id}", { navigateToNew: true })`);
  assert.equal(ui.calls.some(req => req.method === "DELETE"), false);
  assert.equal(ui.state().currentConversation.id, id);
});

test("Confirming conversation deletion uses the existing endpoint and opens New conversation", async () => {
  const ui = await app({ handle: req => req.method === "GET" && req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") }
    : req.method === "DELETE" && req.path === `/api/v1/conversations/${id}` ? { status: 200 } : null });
  await ui.run(`openConversation("${id}")`); await ui.run(`deleteConversation("${id}", { navigateToNew: true })`);
  assert.equal(ui.calls.filter(req => req.method === "DELETE").length, 1);
  assert.equal(ui.calls.find(req => req.method === "DELETE").path, `/api/v1/conversations/${id}`);
  assert.equal(ui.state().currentConversation, null);
  assert.equal(ui.state().currentView, "scenarios");
  assert.equal(ui.state().conversationNavigationContext, "new");
});

test("Failed conversation deletion keeps the conversation and messages", async () => {
  const ui = await app({ handle: req => req.method === "GET" && req.path === `/api/v1/conversations/${id}` ? { body: detail("JOB_INTERVIEW") }
    : req.method === "DELETE" && req.path === `/api/v1/conversations/${id}` ? { status: 500 } : null });
  await ui.run(`openConversation("${id}")`); await ui.run(`deleteConversation("${id}", { navigateToNew: true, statusId: "conversation-completion-status" })`);
  assert.equal(ui.state().currentConversation.id, id);
  assert.equal(ui.state().currentView, "chat");
  assert.equal(ui.get("chat-messages").children.length, 2);
  assert.equal(ui.get("conversation-completion-status").textContent, "Não foi possível concluir a operação.");
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

test("Profile includes account information and the sidebar has no separate Account page", async () => {
  const ui = await app();
  await ui.click("Perfil");
  assert.equal(ui.state().currentView, "profile");
  assert.equal(html.includes('data-view="account"'), false);
  assert.ok(ui.get("account-logout"));
  assert.ok(ui.get("account-email"));
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
  const visibleViews = () => [...["home", "profile", "progress", "vocabulary", "reading", "scenarios", "conversations", "translate", "correct", "chat"]]
    .filter(name => !ui.get(`view-${name}`).hidden);
  for (const view of ["home", "profile", "progress", "vocabulary", "reading", "scenarios", "conversations", "translate", "correct"]) {
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
  const visible = ["home", "profile", "progress", "vocabulary", "reading", "scenarios", "conversations", "translate", "correct", "chat"]
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
test("Translate renders only response.translation in the main field", async () => {
  const ui = await app({ handle: req => req.path === "/api/v1/translate" ? { body: { translation: "Texto traduzido", inputLanguage: "en", enrichment: null } } : null });
  await ui.run('$("translation-text").value = "Hello"; $("source-language").value = "en"; $("target-language").value = "pt"; translate()');
  assert.equal(ui.get("translation-result").value, "Texto traduzido");
  assert.equal(ui.get("translation-result").value.includes("translation"), false);
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
      assert.equal(ui.get("scenario-status").textContent, "Você já possui 3 conversas ativas. Encerre ou exclua uma delas para iniciar outra.");
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
  assert.match(ui.get("scenario-status").textContent, /3 conversas ativas/);
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
