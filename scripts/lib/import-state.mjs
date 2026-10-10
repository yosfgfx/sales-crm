const nullable = (value) => (value === undefined || value === "" ? null : value);

function attachmentRow(file, idea, manifestOwner) {
  const local = /^\/api\/files\/([a-f0-9-]{36})(?:\?inline=1)?$/.exec(file.url)?.[1];
  return {
    id: file.id, idea_id: idea.id, kind: file.kind, channel: nullable(file.channel), name: file.name, size: file.size, mime: file.mime,
    storage: local ? "local" : "external", local_path: local ? `${local}.blob` : null, external_url: local ? null : file.url,
    owner_id: manifestOwner?.(file.id) || idea.ownerId, created_at: file.createdAt || idea.createdAt, linked_at: file.createdAt || idea.createdAt,
  };
}

async function insert(db, table, row, conflict = "id") {
  const keys = Object.keys(row);
  const casts = { channels: "::wasl.channel[]", source_proposal: "::jsonb" };
  const values = keys.map((key, index) => `$${index + 1}${casts[key] || ""}`);
  const result = await db.query(`insert into wasl.${table} (${keys.join(", ")}) values (${values.join(", ")}) on conflict (${conflict}) do nothing returning 1`, keys.map((key) => (key === "source_proposal" && row[key] ? JSON.stringify(row[key]) : key === "channels" ? `{${row[key].join(",")}}` : row[key])));
  return result.rows.length;
}

export async function importState(db, document, options = {}) {
  const { data, authentication } = document;
  const demoIdeaIds = new Set(options.demoIdeaIds || []);
  const inserted = {}, expected = {};
  const add = async (table, row, conflict) => { expected[table] = (expected[table] || 0) + 1; inserted[table] = (inserted[table] || 0) + (await insert(db, table, row, conflict)); };
  await db.query("begin");
  try {
    for (const member of data.members) await add("members", { id: member.id, name: member.name, title: member.title, role: member.role, initials: member.initials, color: member.color, active: member.active });
    for (const account of authentication?.accounts || []) await add("accounts", { member_id: account.memberId, username: account.username, password_hash: account.passwordHash, auth_version: account.authVersion }, "member_id");
    for (const [index, company] of data.companies.entries()) await add("companies", { id: company.id, name: company.name, short_name: company.shortName, initials: company.initials, color: company.color, sort_order: index });
    for (const category of data.categories) await add("categories", { id: category.id, name: category.name, color: category.color, target_per_month: category.targetPerMonth });
    for (const idea of data.ideas) {
      await add("ideas", {
        id: idea.id, code: idea.code, title: idea.title, company_id: idea.companyId, department: idea.department, category_id: idea.categoryId, work_type: idea.workType,
        description: idea.description, content: idea.content, execution_plan: idea.executionPlan, channels: idea.channels, owner_id: idea.ownerId, designer_id: nullable(idea.designerId),
        requested_at: idea.requestedAt, due_date: idea.dueDate, scheduled_at: nullable(idea.scheduledAt), approved_at: nullable(idea.approvedAt), delivered_at: nullable(idea.deliveredAt),
        priority: idea.priority, status: idea.status, needs_quotes: idea.needsQuotes, manager_feedback: idea.managerFeedback, source_proposal: idea.sourceProposal || null,
        is_demo: demoIdeaIds.has(idea.id), created_at: idea.createdAt, updated_at: idea.updatedAt,
      });
      for (const event of idea.history) await add("idea_events", { id: event.id, idea_id: idea.id, at: event.at, actor_id: event.actorId, action: event.action, note: event.note, from_status: nullable(event.from), to_status: nullable(event.to) });
      for (const file of idea.attachments) await add("attachments", attachmentRow(file, idea, options.manifestOwner));
      for (const quote of idea.quotations) await add("quotations", { id: quote.id, idea_id: idea.id, vendor: quote.vendor, amount: quote.amount, scope: quote.scope, days: quote.days, attachment_id: nullable(quote.attachmentId), recommended: quote.recommended });
    }
    for (const notice of data.notifications) await add("notifications", { id: notice.id, recipient_id: notice.recipientId, idea_id: notice.ideaId, type: notice.type, title: notice.title, body: notice.body, created_at: notice.createdAt, read_at: notice.read ? notice.createdAt : null, emailed_at: notice.createdAt });
    await add("settings", { id: true, department_name: data.settings.departmentName, organization_name: data.settings.organizationName });
    const years = new Map();
    for (const idea of data.ideas) {
      const match = /^IC-(\d{4})-(\d+)$/.exec(idea.code);
      if (match) years.set(Number(match[1]), Math.max(years.get(Number(match[1])) || 0, Number(match[2])));
    }
    for (const [year, last] of years) await db.query("insert into wasl.code_counters (year, last_value) values ($1, $2) on conflict (year) do update set last_value = greatest(wasl.code_counters.last_value, excluded.last_value)", [year, last]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  return { expected, inserted };
}

export async function verifyImport(db, document) {
  const { data } = document;
  const source = {
    members: data.members.length, accounts: document.authentication?.accounts.length || 0, companies: data.companies.length, categories: data.categories.length, ideas: data.ideas.length,
    idea_events: data.ideas.reduce((sum, idea) => sum + idea.history.length, 0), attachments: data.ideas.reduce((sum, idea) => sum + idea.attachments.length, 0),
    quotations: data.ideas.reduce((sum, idea) => sum + idea.quotations.length, 0), notifications: data.notifications.length,
  };
  const mismatches = [];
  for (const [table, count] of Object.entries(source)) {
    const actual = Number((await db.query(`select count(*) as n from wasl.${table}`)).rows[0].n);
    if (actual !== count) mismatches.push({ table, source: count, database: actual });
  }
  return { source, mismatches };
}
