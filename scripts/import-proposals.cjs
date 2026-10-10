/* eslint-disable @typescript-eslint/no-require-imports -- Offline import runner loads the repository's TypeScript modules. */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

const workspace = path.resolve(__dirname, "..");
require.extensions[".ts"] = function loadTypeScript(module, filename) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(compiled, filename);
};
const {
  PROPOSAL_BATCH_ID,
  PROPOSAL_REQUEST_DATE,
  parseProposalTable,
  buildProposalIdeas,
  proposalImportSummary,
  appendProposalImport,
} = require(path.join(workspace, "lib/proposal-import.ts"));

function argumentsFrom(values) {
  const options = {
    source: "",
    state: path.join(workspace, ".media-data/state.json"),
    review: path.join(workspace, "tmp/media-tests/proposals/review.json"),
    today: PROPOSAL_REQUEST_DATE,
    apply: false,
    serverStopped: false,
  };
  const valueKeys = {
    "--source": "source",
    "--state": "state",
    "--review": "review",
    "--today": "today",
  };
  for (let index = 0; index < values.length; index++) {
    const argument = values[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--server-stopped") options.serverStopped = true;
    else if (valueKeys[argument]) {
      const value = values[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`حدد قيمة ${argument}.`);
      options[valueKeys[argument]] = value;
    } else throw new Error(`خيار غير معروف: ${argument}`);
  }
  if (!options.source)
    throw new Error(
      "حدد ملف المصدر عبر --source. الوضع الافتراضي يجهز ملف مراجعة فقط.",
    );
  if (options.apply && !options.serverStopped)
    throw new Error(
      "أوقف الخادم أولاً، ثم أضف --apply --server-stopped لتطبيق الاستيراد دون تعارض مع طلبات العمل.",
    );
  options.source = path.resolve(options.source);
  options.state = path.resolve(options.state);
  options.review = path.resolve(options.review);
  if (options.review === options.state || options.review === options.source)
    throw new Error(
      "يجب أن يكون ملف المراجعة مستقلاً عن ملف المصدر وحالة النظام.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.today) ||
    new Date(`${options.today}T12:00:00Z`).toISOString().slice(0, 10) !==
      options.today
  )
    throw new Error("حدد تاريخ الطلب بصيغة YYYY-MM-DD وتاريخ صالح.");
  return options;
}

async function readDocument(statePath) {
  const bytes = await fsp.readFile(statePath);
  const document = JSON.parse(bytes.toString("utf8"));
  if (
    !document ||
    typeof document !== "object" ||
    !Number.isSafeInteger(document.version) ||
    document.version < 0 ||
    !document.data ||
    !Array.isArray(document.data.members) ||
    !Array.isArray(document.data.ideas)
  )
    throw new Error("ملف حالة النظام غير صالح؛ لم يتم تغييره.");
  return { document, bytes };
}

async function writePrivateJson(filename, value) {
  await fsp.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  const handle = await fsp.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fsp.rename(temporary, filename);
    const directory = await fsp.open(path.dirname(filename), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await fsp.rm(temporary, { force: true });
    throw error;
  }
}

async function makeReview(options, source, document) {
  const rows = parseProposalTable(source),
    proposals = buildProposalIdeas(rows, document.data, options.today);
  const summary = proposalImportSummary(proposals);
  const missingAssignees = ["root", "sara"].filter(
    (memberId) =>
      !document.data.members.some(
        (member) => member.id === memberId && member.active,
      ),
  );
  await writePrivateJson(options.review, {
    batchId: PROPOSAL_BATCH_ID,
    sourceFilename: path.basename(options.source),
    sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
    requestedAt: options.today,
    stateVersionAtReview: document.version,
    missingAssignees,
    summary,
    proposals,
  });
  return { proposals, summary };
}

(async () => {
  const options = argumentsFrom(process.argv.slice(2));
  const source = await fsp.readFile(options.source, "utf8");
  const first = await readDocument(options.state);
  let { proposals, summary } = await makeReview(
    options,
    source,
    first.document,
  );
  if (!options.apply) {
    console.log(
      JSON.stringify(
        {
          mode: "review-only",
          batchId: PROPOSAL_BATCH_ID,
          review: options.review,
          count: summary.count,
          authors: summary.authors,
          missingAuthors: summary.missingAuthors,
          requiresQuotations: summary.requiresQuotations,
        },
        null,
        2,
      ),
    );
    return;
  }
  const lock = path.join(path.dirname(options.state), ".write-lock");
  try {
    await fsp.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "حالة النظام مشغولة بقفل كتابة؛ لم يُنفذ الاستيراد. لا تحذف قفل عملية تعمل.",
      );
    throw error;
  }
  try {
    const latest = await readDocument(options.state);
    ({ proposals, summary } = await makeReview(
      options,
      source,
      latest.document,
    ));
    const result = appendProposalImport(latest.document.data, proposals);
    if (result.added.length) {
      const current = await fsp.readFile(options.state);
      if (!current.equals(latest.bytes))
        throw new Error(
          "تغيرت حالة النظام أثناء التحضير؛ لم يُكتب فوق أي تعديل. أعد المراجعة بعد إيقاف الخادم.",
        );
      // Spread the complete private envelope, including authentication and future keys.
      const saved = {
        ...latest.document,
        version: latest.document.version + 1,
        data: result.data,
      };
      await writePrivateJson(options.state, saved);
    }
    console.log(
      JSON.stringify(
        {
          mode: "applied",
          batchId: PROPOSAL_BATCH_ID,
          added: result.added.length,
          skipped: result.skipped.length,
          version: latest.document.version + (result.added.length ? 1 : 0),
          authors: summary.authors,
          review: options.review,
        },
        null,
        2,
      ),
    );
  } finally {
    await fsp.rm(lock, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "تعذر إعداد استيراد الأفكار.",
  );
  process.exitCode = 1;
});
