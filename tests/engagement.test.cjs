/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createHarness } = require("./helpers/harness.cjs");

let h, engagement;
const act = (who, body) => engagement.engagementAction(h.jsonRequest("/api/engagement", body, { cookie: h.cookies[who] }));
const state = (who) => engagement.loadEngagement(h.getRequest("/api/engagement", h.cookies[who]));
const profile = (who, id) => engagement.loadProfile(h.getRequest(`/api/engagement?profile=${id}`, h.cookies[who]), id);

before(async () => { h = await createHarness(); engagement = require(path.join(h.root, "lib/server/engagement.ts")); });
after(async () => h.close());

test("heartbeats mark members online and accumulate active minutes without bumping the shared cursor", async () => {
  const cursor = (await h.pg.query("select version from wasl.change_cursor")).rows[0].version;
  const first = await act("sara", { action: "heartbeat" });
  assert.ok(first.online.some((entry) => entry.memberId === "sara"));
  await h.pg.query("update wasl.member_presence set last_seen_at = now() - interval '2 minutes' where member_id = 'sara'");
  await act("sara", { action: "heartbeat" });
  const seconds = (await h.pg.query("select active_seconds from wasl.member_activity where member_id = 'sara'")).rows[0].active_seconds;
  assert.ok(seconds >= 118 && seconds <= 120, `active seconds ${seconds}`);
  await act("sara", { action: "heartbeat" });
  assert.ok((await h.pg.query("select active_seconds from wasl.member_activity where member_id = 'sara'")).rows[0].active_seconds <= 122);
  assert.equal((await h.pg.query("select version from wasl.change_cursor")).rows[0].version, cursor);
});

test("personal tasks, day plans and focus sessions stay private to their owner", async () => {
  const id = randomUUID();
  await act("sara", { action: "addTask", id, title: "مراجعة النص النهائي" });
  await assert.rejects(act("noura", { action: "toggleTask", id, done: true }), (error) => error.status === 404);
  await act("sara", { action: "toggleTask", id, done: true });
  await act("sara", { action: "startSession", taskId: id, label: "مراجعة" });
  await assert.rejects(act("sara", { action: "startSession", taskId: randomUUID() }), (error) => error.status === 404);
  await act("sara", { action: "startSession", label: "بحث" });
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.work_sessions where member_id = 'sara' and ended_at is null")).rows[0].n, 1);
  const mine = await state("sara");
  assert.ok(mine.session); assert.ok(mine.tasks.some((task) => task.id === id && task.doneAt));
  assert.ok(!(await state("noura")).tasks.some((task) => task.id === id));
  await act("sara", { action: "stopSession" });
  const idea = (await h.pg.query("select id from wasl.ideas where designer_id = 'faisal' and owner_id <> 'manager' and deleted_at is null limit 1")).rows[0];
  if (idea) {
    await act("faisal", { action: "planIdea", ideaId: idea.id, day: "2026-10-15" });
    await act("faisal", { action: "planIdea", ideaId: idea.id, day: "2026-10-18" });
    assert.equal((await h.pg.query("select count(*)::int as n from wasl.tasks where member_id = 'faisal' and source = 'plan'")).rows[0].n, 1);
    await assert.rejects(act("manager", { action: "planIdea", ideaId: idea.id, day: "2026-10-15" }), (error) => error.status === 403);
  }
});

test("meetings: managers create them, everyone gets notified, action items become the assignee's tasks", async () => {
  await assert.rejects(act("sara", { action: "createMeeting", id: randomUUID(), title: "اجتماع", startsAt: new Date(Date.now() + 3600_000).toISOString() }), (error) => error.status === 403);
  const id = randomUUID();
  const created = await act("manager", { action: "createMeeting", id, title: "اجتماع الفريق الأسبوعي", startsAt: new Date(Date.now() + 10 * 60_000).toISOString(), teamsUrl: "https://teams.microsoft.com/l/meetup-join/abc", agenda: [{ text: "أعمال الأسبوع" }] });
  assert.equal(created.meeting.items.length, 1);
  await assert.rejects(act("manager", { action: "createMeeting", id: randomUUID(), title: "x", startsAt: new Date().toISOString(), teamsUrl: "javascript:alert(1)" }), (error) => error.status === 422);
  assert.ok((await h.pg.query("select 1 from wasl.notifications where recipient_id = 'sara' and type = 'meeting' and entity_id = $1", [id])).rows.length);
  await act("sara", { action: "joinMeeting", meetingId: id });
  await assert.rejects(act("sara", { action: "addMeetingItem", meetingId: id, kind: "action", text: "مهمة لزميل", assigneeId: "noura" }), (error) => error.status === 403);
  assert.equal(engagement.mergeNotes("أ\nب", "أ", "أ\nج"), "أ\nب\nج");
  assert.equal(engagement.mergeNotes("أ", "أ", "أ\nد"), "أ\nد");
  await act("sara", { action: "updateMeeting", id, notes: "ملاحظات" });
  await assert.rejects(act("sara", { action: "updateMeeting", id, title: "تغيير" }), (error) => error.status === 403);
  const withAction = await act("manager", { action: "addMeetingItem", meetingId: id, kind: "action", text: "إرسال صورة المشهد الثالث", assigneeId: "sara" });
  const item = withAction.meeting.items.find((entry) => entry.kind === "action");
  assert.ok(item.taskId);
  assert.ok((await state("sara")).tasks.some((task) => task.id === item.taskId && task.source === "meeting"));
  await act("sara", { action: "toggleTask", id: item.taskId, done: true });
  assert.equal((await h.pg.query("select done from wasl.meeting_items where id = $1", [item.id])).rows[0].done, true);
  const reminded = await engagement.runMeetingReminders(h.database);
  assert.equal(reminded, 1);
  assert.equal(await engagement.runMeetingReminders(h.database), 0);
  const chat = require(path.join(h.root, "lib/server/social.ts"));
  const message = await chat.createSocialMessage(h.jsonRequest("/api/social", { scope: "meeting", scopeId: id, text: "نبدأ بالبند الأول" }, { cookie: h.cookies.manager }));
  assert.equal(message.message.scope, "meeting");
});

test("honor board: scores follow the weights, details stay with managers, and the winner is announced once", async () => {
  await h.pg.query("insert into wasl.member_activity (member_id, day, active_seconds) values ('faisal', '2026-08-10', 7200) on conflict do nothing");
  assert.ok((await h.pg.query("select 1 from wasl.job_runs where key = 'honor:2026-09'")).rows.length, "the month before launch is never announced");
  const ranking = await engagement.computeHonor(h.database, "2026-09", new Date("2026-09-30T20:00:00Z"));
  for (const entry of ranking) assert.ok(entry.score >= 0 && entry.score <= 100);
  assert.ok(!ranking.some((entry) => entry.memberId === "manager" || entry.memberId === "root"));
  assert.equal((await state("sara")).honor.ranking, undefined);
  assert.ok(Array.isArray((await state("manager")).honor.ranking));
  assert.equal(await h.database.transaction((tx) => engagement.announceHonor(tx, "2026-10-01")), null);
  await h.pg.query("update wasl.ideas set status = 'delivered', requested_at = '2026-08-01', scheduled_at = '2026-08-05', approved_at = '2026-08-03', delivered_at = '2026-08-12', due_date = '2026-08-20', designer_id = 'faisal' where id = (select id from wasl.ideas where deleted_at is null order by id limit 1)");
  const winner = await h.database.transaction((tx) => engagement.announceHonor(tx, "2026-09-01"));
  assert.ok(winner);
  assert.ok((await h.pg.query("select 1 from wasl.honor_awards where month = '2026-08'")).rows.length);
  assert.equal(await h.database.transaction((tx) => engagement.announceHonor(tx, "2026-09-02")), null);
  await assert.rejects(act(winner.memberId, { action: "cheer", month: "2026-08" }), (error) => error.code === "SELF_CHEER");
  const fan = ["sara", "noura", "faisal"].find((id) => id !== winner.memberId);
  await act(fan, { action: "cheer", month: "2026-08" });
  await act(fan, { action: "cheer", month: "2026-08" });
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.honor_cheers where month = '2026-08'")).rows[0].n, 1);
});

test("profiles are limited to the administrator and the department manager", async () => {
  await assert.rejects(profile("sara", "faisal"), (error) => error.status === 403);
  await assert.rejects(profile("sara", "sara"), (error) => error.status === 403);
  const seen = await profile("manager", "sara");
  assert.equal(seen.memberId, "sara"); assert.equal(seen.heatmap.length, 35);
  assert.ok((await profile("admin", "faisal")).workDays > 0);
});

test("push subscriptions queue important notifications only, and the address form is set by administrators", async () => {
  await act("noura", { action: "subscribePush", subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BKey", auth: "auth" } } });
  await assert.rejects(act("noura", { action: "subscribePush", subscription: { endpoint: "https://attacker.example/hook", keys: { p256dh: "x", auth: "y" } } }), (error) => error.status === 422);
  await assert.rejects(act("noura", { action: "subscribePush", subscription: { endpoint: "http://insecure", keys: { p256dh: "x", auth: "y" } } }), (error) => error.status === 422);
  const before = (await h.pg.query("select count(*)::int as n from wasl.push_outbox where member_id = 'noura'")).rows[0].n;
  await h.pg.query("insert into wasl.notifications (id, recipient_id, type, title, body) values ($1, 'noura', 'activity', 'نشاط', 'x'), ($2, 'noura', 'assignment', 'إسناد', 'y'), ($3, 'noura', 'chat', 'رسالة', 'z')", [randomUUID(), randomUUID(), randomUUID()]);
  assert.equal((await h.pg.query("select count(*)::int as n from wasl.push_outbox where member_id = 'noura'")).rows[0].n, before + 1);
  await assert.rejects(act("sara", { action: "setAddressForm", memberId: "sara", form: "f" }), (error) => error.status === 403);
  await act("admin", { action: "setAddressForm", memberId: "sara", form: "f" });
  assert.equal((await h.pg.query("select address_form from wasl.members where id = 'sara'")).rows[0].address_form, "f");
  const welcome = await state("sara");
  assert.equal(welcome.welcome.show, true);
  await act("sara", { action: "dismissWelcome" });
  assert.equal((await state("sara")).welcome.show, false);
});
