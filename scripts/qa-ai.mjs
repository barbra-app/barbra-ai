import fs from "node:fs";
import process from "node:process";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const email = process.env.QA_FIREBASE_EMAIL;
const password = process.env.QA_FIREBASE_PASSWORD;

function readLocalEnv(name) {
  const source = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const match = source.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) throw new Error(`${name} is missing from .env.local`);
  const value = match[1].trim();
  return value.replace(/^['"]|['"]$/g, "");
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${payload.error || response.statusText}`);
  return payload;
}

async function firebaseToken() {
  const apiKey = readLocalEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!email || !password) {
    const credentials = JSON.parse(readLocalEnv("FIREBASE_SERVICE_ACCOUNT_JSON"));
    if (!getApps().length) initializeApp({ credential: cert(credentials) });
    const auth = getAuth();
    const targetEmail = process.env.QA_FIREBASE_EMAIL || "demo@barbra.com.co";
    const profiles = await getFirestore().collection("users").where("email", "==", targetEmail).limit(1).get();
    const profile = profiles.docs[0];
    if (!profile) throw new Error(`QA profile ${targetEmail} was not found in Firestore`);
    const token = await auth.createCustomToken(profile.id);
    const payload = await jsonFetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, returnSecureToken: true }),
      },
    );
    return payload.idToken;
  }
  const payload = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return payload.idToken;
}

function parseDataStream(source) {
  const events = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const value = line.slice(6);
    if (value === "[DONE]") continue;
    try { events.push(JSON.parse(value)); } catch { /* ignore protocol comments */ }
  }
  const inputs = events.filter((event) => event.type === "tool-input-available");
  const outputs = events.filter((event) => event.type === "tool-output-available");
  const text = events.filter((event) => event.type === "text-delta").map((event) => event.delta).join("").trim();
  return { events, inputs, outputs, text };
}

async function ask(token, context, question) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      ...context,
      messages: [{ id: `qa-${Date.now()}`, role: "user", parts: [{ type: "text", text: question }] }],
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body}`);
  return parseDataStream(body);
}

function close(actual, expected, label, tolerance = 1e-6) {
  const scale = Math.max(1, Math.abs(Number(expected)));
  if (Math.abs(Number(actual) - Number(expected)) > tolerance * scale) {
    throw new Error(`${label}: ${actual} != ${expected}`);
  }
}

function metric(snapshot, id) {
  const result = snapshot.metrics.find((item) => item.id === id);
  if (!result) throw new Error(`Reference metric ${id} is missing`);
  return result;
}

function assertCommon(result, expectedTool, expectedPresentation) {
  if (result.inputs.length !== 1 || result.outputs.length !== 1) {
    throw new Error(`Expected exactly one tool call; got ${result.inputs.length} inputs and ${result.outputs.length} outputs`);
  }
  if (result.inputs[0].toolName !== expectedTool) {
    throw new Error(`Expected ${expectedTool}; got ${result.inputs[0].toolName}`);
  }
  const output = result.outputs[0]?.output;
  if (!result.text) throw new Error("The model did not add a conversational explanation after the verified data");
  if (expectedPresentation && result.inputs[0].input.presentation !== expectedPresentation) {
    throw new Error(`Expected presentation=${expectedPresentation}; got ${result.inputs[0].input.presentation}`);
  }
  if (!output?.verifiedInsight) throw new Error("Tool output is missing its deterministic verified insight");
}

function assertSnapshot(result, reference) {
  const output = result.outputs[0].output;
  for (const id of ["spend", "conversions", "cpa", "roas"]) {
    const actual = metric(output, id);
    const expected = metric(reference, id);
    close(actual.value, expected.value, `${id}.value`);
    close(actual.previousValue, expected.previousValue, `${id}.previousValue`);
  }
  if (JSON.stringify(output.trend) !== JSON.stringify(reference.trend)) throw new Error("Trend differs from dashboard BigQuery reference");
  if (!output.trend.length) throw new Error("Trend visual has no verified points");
}

function expectedCampaigns(reference, sortBy) {
  const rows = reference.campaigns.filter((row) => row.spend > 0);
  return [...rows].sort((left, right) => {
    if (sortBy === "cpa") {
      const a = left.conversions > 0 ? left.cpa : Number.POSITIVE_INFINITY;
      const b = right.conversions > 0 ? right.cpa : Number.POSITIVE_INFINITY;
      return a - b;
    }
    return right[sortBy] - left[sortBy];
  });
}

function assertCampaigns(result, reference, sortBy, minimumRows = 4) {
  const input = result.inputs[0].input;
  const output = result.outputs[0].output;
  if (input.sortBy !== sortBy || output.sortBy !== sortBy) throw new Error(`Expected campaign sortBy=${sortBy}`);
  const expected = expectedCampaigns(reference, sortBy).slice(0, output.rows.length);
  if (output.rows.length < minimumRows) throw new Error(`Campaign visual needs at least ${minimumRows} row(s)`);
  output.rows.forEach((row, index) => {
    const truth = expected[index];
    if (!truth || row.id !== truth.id || row.name !== truth.name) throw new Error(`Campaign rank ${index + 1} differs from BigQuery reference`);
    for (const key of ["spend", "conversions", "cpa", "roas"]) close(row[key], truth[key], `campaign.${row.id}.${key}`);
  });
  const winnerName = expected[0]?.name;
  if (winnerName && !output.verifiedInsight.toLocaleLowerCase("es").includes(winnerName.toLocaleLowerCase("es").split(" · ")[0])) {
    throw new Error(`Verified insight does not identify the leading campaign: ${winnerName}`);
  }
}

function assertChannels(result, reference) {
  const output = result.outputs[0].output;
  if (output.rows.length !== reference.channelMix.length) throw new Error("Channel count differs from BigQuery reference");
  const totalSpend = reference.channelMix.reduce((sum, row) => sum + row.spend, 0);
  const totalConversions = reference.channelMix.reduce((sum, row) => sum + row.conversions, 0);
  output.rows.forEach((row) => {
    const truth = reference.channelMix.find((item) => item.channel === row.channel);
    if (!truth) throw new Error(`Unexpected channel ${row.channel}`);
    close(row.spend, truth.spend, `${row.channel}.spend`);
    close(row.conversions, truth.conversions, `${row.channel}.conversions`);
    close(row.cpa, truth.conversions > 0 ? truth.spend / truth.conversions : 0, `${row.channel}.cpa`);
    close(row.spendShare, totalSpend > 0 ? truth.spend / totalSpend : 0, `${row.channel}.spendShare`);
    close(row.conversionShare, totalConversions > 0 ? truth.conversions / totalConversions : 0, `${row.channel}.conversionShare`);
  });
  if (output.rows.length === 1 && !/(solo|único|solamente|no hay datos|aún no)/i.test(output.verifiedInsight)) {
    throw new Error("Single-channel narrative does not explain that other channels have no normalized data");
  }
}

const cases = [
  {
    name: "KPIs exactos",
    question: "¿Cuánto invertimos y cuál fue el ROAS?",
    tool: "get_dashboard_snapshot",
    visual: "KPI cards + area trend",
    presentation: "compact",
    validate: assertSnapshot,
  },
  {
    name: "Tendencia verificada",
    question: "Muéstrame la tendencia de inversión y revenue.",
    tool: "get_dashboard_snapshot",
    visual: "Dual area chart",
    presentation: "visual",
    validate: assertSnapshot,
  },
  {
    name: "Candidata para escala",
    question: "¿Qué campaña es candidata para escalar?",
    tool: "get_campaign_performance",
    visual: "ROAS bar ranking + details",
    presentation: "visual",
    sortBy: "roas",
    validate: (result, reference) => {
      assertCampaigns(result, reference, "roas");
      const output = result.outputs[0].output;
      const candidate = output.summary?.scaleCandidate;
      if (!candidate || !output.verifiedInsight.toLocaleLowerCase("es").includes(candidate.name.toLocaleLowerCase("es").split(" · ")[0])) {
        throw new Error("Scale narrative does not use the verified active scaleCandidate");
      }
      if (!/(candidat|validar|revisar)/i.test(output.verifiedInsight) || /debe escalar/i.test(output.verifiedInsight)) {
        throw new Error("Scale answer is too definitive or omits validation language");
      }
    },
  },
  {
    name: "CPA por campaña",
    question: "¿Cuál campaña tiene el CPA más bajo?",
    tool: "get_campaign_performance",
    visual: "CPA bar ranking + details",
    presentation: "compact",
    sortBy: "cpa",
    validate: (result, reference) => assertCampaigns(result, reference, "cpa"),
  },
  {
    name: "Volumen por campaña",
    question: "Ordena las campañas por volumen de conversiones.",
    tool: "get_campaign_performance",
    visual: "Conversions bar ranking + details",
    presentation: "visual",
    sortBy: "conversions",
    validate: (result, reference) => assertCampaigns(result, reference, "conversions"),
  },
  {
    name: "Eficiencia por canal",
    question: "Compara la eficiencia por canal.",
    tool: "get_channel_mix",
    visual: "Channel shares chart + breakdown",
    presentation: "visual",
    validate: assertChannels,
  },
  {
    name: "Contexto de campaña",
    question: "Resume el rendimiento de la campaña seleccionada.",
    tool: "get_dashboard_snapshot",
    visual: "Campaign-scoped KPIs + area trend",
    presentation: "compact",
    scope: "campaign",
    validate: assertSnapshot,
  },
  {
    name: "Rango personalizado",
    question: "Analiza la tendencia del rango seleccionado.",
    tool: "get_dashboard_snapshot",
    visual: "Custom-range KPIs + area trend",
    presentation: "visual",
    scope: "custom",
    validate: assertSnapshot,
  },
  {
    name: "Mejor campaña histórica",
    question: "¿Cuál ha sido la mejor campaña de todos los tiempos?",
    tool: "get_campaign_performance",
    visual: "All-time ROAS ranking + details",
    presentation: "visual",
    scope: "all",
    sortBy: "roas",
    validate: (result, reference) => {
      if (result.inputs[0].input.range !== "all") throw new Error("The model did not request all available history");
      assertCampaigns(result, reference, "roas", 1);
    },
  },
  {
    name: "Conversación sin datos",
    question: "Hola, ¿qué tipo de preguntas puedo hacerte?",
    tool: null,
    visual: "Conversational answer",
    validate: (result) => {
      if (result.inputs.length || result.outputs.length) throw new Error("A capability question should not query analytics");
      if (!result.text || result.text.length < 20) throw new Error("Conversational answer is missing or too short");
    },
  },
];

async function main() {
  const token = await firebaseToken();
  const auth = { authorization: `Bearer ${token}` };
  const workspacePayload = await jsonFetch(`${baseUrl}/api/workspace`, { headers: auth });
  const workspace = workspacePayload.data;
  const organization = workspace.organizations[0];
  const project = workspace.projects.find((item) => item.organizationId === organization?.id);
  if (!organization || !project) throw new Error("QA user has no organization/project context");

  const baseContext = { organizationId: organization.id, projectId: project.id, campaignId: null, range: "30d" };
  const dashboardPayload = await jsonFetch(`${baseUrl}/api/dashboard?organizationId=${encodeURIComponent(organization.id)}&projectId=${encodeURIComponent(project.id)}&range=30d`, { headers: auth });
  if (dashboardPayload.provider !== "bigquery") throw new Error("Dashboard reference is not backed by BigQuery");
  const baseReference = dashboardPayload.data;

  async function scopedReference(testCase) {
    if (!testCase.scope) return { context: baseContext, reference: baseReference };
    const context = { ...baseContext };
    if (testCase.scope === "campaign") {
      context.campaignId = workspace.campaigns.find((campaign) =>
        baseReference.campaigns.some((row) => row.name === campaign.name),
      )?.id;
      if (!context.campaignId) throw new Error("No campaign is available for scoped QA");
    }
    if (testCase.scope === "custom") {
      context.range = "custom";
      context.startDate = baseReference.trend.at(-14)?.date || baseReference.trend[0]?.date;
      context.endDate = baseReference.trend.at(-1)?.date;
      if (!context.startDate || !context.endDate) throw new Error("No trend dates are available for custom-range QA");
    }
    const referenceContext = testCase.scope === "all" ? { ...context, range: "all" } : context;
    const params = new URLSearchParams({
      organizationId: referenceContext.organizationId,
      projectId: referenceContext.projectId,
      range: referenceContext.range,
    });
    if (referenceContext.campaignId) params.set("campaignId", referenceContext.campaignId);
    if (referenceContext.startDate) params.set("startDate", referenceContext.startDate);
    if (referenceContext.endDate) params.set("endDate", referenceContext.endDate);
    const payload = await jsonFetch(`${baseUrl}/api/dashboard?${params}`, { headers: auth });
    if (payload.provider !== "bigquery") throw new Error("Scoped dashboard reference is not backed by BigQuery");
    return { context, reference: payload.data };
  }

  const report = [];
  for (const testCase of cases) {
    const startedAt = Date.now();
    try {
      const { context, reference } = await scopedReference(testCase);
      const result = await ask(token, context, testCase.question);
      if (testCase.tool) assertCommon(result, testCase.tool, testCase.presentation);
      testCase.validate(result, reference);
      report.push({ case: testCase.name, tool: testCase.tool, visual: testCase.visual, result: "PASS", ms: Date.now() - startedAt });
    } catch (error) {
      report.push({ case: testCase.name, tool: testCase.tool, visual: testCase.visual, result: `FAIL: ${error.message}`, ms: Date.now() - startedAt });
    }
  }

  console.table(report);
  const failures = report.filter((item) => item.result !== "PASS");
  console.log(`BigQuery reference: ${baseReference.query.organizationId}/${baseReference.query.projectId}, ${baseReference.periodLabel}, ${baseReference.campaigns.length} campaigns, ${baseReference.channelMix.length} channels.`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
