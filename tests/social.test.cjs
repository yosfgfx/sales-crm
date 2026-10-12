/* eslint-disable @typescript-eslint/no-require-imports -- The isolated PostgreSQL harness loads TypeScript modules. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createHarness } = require("./helpers/harness.cjs");
const social = require("../lib/server/social.ts");
const realtime = require("../lib/server/realtime.ts");
// Genuine 0.5 s mono recordings: Opus 20 kbps and AAC 24 kbps, including streamed containers.
const ENCODED_VOICES = {
  "sample.webm":
    "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAALhEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1OsggLL7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS4xMDJEiYhAf8AAAAAAABZUrmvxrgEAAAAAAABo14EBc8WIwE/Aqac/ciqcgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEQVe6BAGOik09wdXNIZWFkAQE4AYC7AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDJzc9ZjwItjxYjAT8Cppz9yKmfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDIgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuNTA4MDAwMDAwAB9DtnVA+eeBAKOHgQAAgPj//qOHgQAVgPj//qOHgQApgPj//qOHgQA9gPj//qOHgQBRgPj//qOHgQBlgPj//qOHgQB5gPj//qOHgQCNgPj//qOHgQChgPj//qOHgQC1gPj//qOHgQDJgPj//qOHgQDdgPj//qOHgQDxgPj//qOHgQEFgPj//qOHgQEZgPj//qOHgQEtgPj//qOHgQFBgPj//qOHgQFVgPj//qOHgQFpgPj//qOHgQF9gPj//qOHgQGRgPj//qOHgQGlgPj//qOHgQG5gPj//qOHgQHNgPj//qOHgQHhgPj//qCToYeBAfUA+P/+m4EHdaKEAM3+YBxTu2uRu4+zgQC3iveBAfGCAczwgQM=",
  "sample.ogg":
    "T2dnUwACAAAAAAAAAADs12TkAAAAANEr83YBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAOzXZOQBAAAAHirkCgE8T3B1c1RhZ3MMAAAATGF2ZjYzLjEuMTAyAQAAABwAAABlbmNvZGVyPUxhdmM2My4xLjEwMiBsaWJvcHVzT2dnUwAE+F4AAAAAAADs12TkAgAAADPBZXYaAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwP4//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//74//4=",
  "sample.m4a":
    "AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAAAe21kYXTcAExhdmM2My4xLjEwMgACMEAOARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHAAADXm1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAu4AAAF3AAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAKJdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAF3AAAAAAAAAAAAAAAABAQAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAABdwAAABAAAAQAAAAACAW1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAu4AAAGHAVcQAAAAAAC1oZGxyAAAAAAAAAABzb3VuAAAAAAAAAAAAAAAAU291bmRIYW5kbGVyAAAAAaxtaW5mAAAAEHNtaGQAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAXBzdGJsAAAAanN0c2QAAAAAAAAAAQAAAFptcDRhAAAAAAAAAAEAAAAAAAAAAAABABAAAAAAu4AAAAAAADZlc2RzAAAAAAOAgIAlAAEABICAgBdAFQAAAAAAXcAAAAbkBYCAgAURiFblAAaAgIABAgAAACBzdHRzAAAAAAAAAAIAAAAYAAAEAAAAAAEAAAHAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAZAAAAAQAAAHhzdHN6AAAAAAAAAAAAAAAZAAAAEwAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAABRzdGNvAAAAAAAAAAEAAAAsAAAAGnNncGQBAAAAcm9sbAAAAAIAAAAB//8AAAAcc2JncAAAAAByb2xsAAAAAQAAABkAAAABAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2My4xLjEwMg==",
  "fragmented.mp4":
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc282aXNvMm1wNDEAAAK8bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAC7gAAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAb90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAFbbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAC7gAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAABBm1pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAynN0YmwAAAB+c3RzZAAAAAAAAAABAAAAbm1wNGEAAAAAAAAAAQAAAAAAAAAAAAEAEAAAAAC7gAAAAAAANmVzZHMAAAAAA4CAgCUAAQAEgICAF0AVAAAAAABdwAAAXcAFgICABRGIVuUABoCAgAECAAAAFGJ0cnQAAAAAAABdwAAAXcAAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAChtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAyAAABNG1vb2YAAAAQbWZoZAAAAAAAAAABAAABHHRyYWYAAAAkdGZoZAAAADkAAAABAAAAAAAAAtwAAAQAAAAAEwIAAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAANx0cnVuAAADAQAAABkAAAE8AAAEAAAAABMAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAAEAAAAAAQAAAQAAAAABAAABAAAAAAEAAABwAAAAAQAAAB7bWRhdNwATGF2YzYzLjEuMTAyAAIwQA4BGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcAAABDbWZyYQAAACt0ZnJhAQAAAAAAAAEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAtwBAQEAAAAQbWZybwAAAAAAAABD",
  "stream.webm":
    "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggFI7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS4xMDJEiYhAf0AAAAAAABZUrmvtrgEAAAAAAABk14EBc8WI5PuE80r/uTKcgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQOdwAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBgLsAAAAAABJUw2fXc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2My4xLjEwMnNzsmPAi2PFiOT7hPNK/7kyZ8ihRaOHRU5DT0RFUkSHlExhdmM2My4xLjEwMiBsaWJvcHVzH0O2dUD554EAo4eBAACA+P/+o4eBABWA+P/+o4eBACmA+P/+o4eBAD2A+P/+o4eBAFGA+P/+o4eBAGWA+P/+o4eBAHmA+P/+o4eBAI2A+P/+o4eBAKGA+P/+o4eBALWA+P/+o4eBAMmA+P/+o4eBAN2A+P/+o4eBAPGA+P/+o4eBAQWA+P/+o4eBARmA+P/+o4eBAS2A+P/+o4eBAUGA+P/+o4eBAVWA+P/+o4eBAWmA+P/+o4eBAX2A+P/+o4eBAZGA+P/+o4eBAaWA+P/+o4eBAbmA+P/+o4eBAc2A+P/+o4eBAeGA+P/+oJOhh4EB9QD4//6bgQd1ooQAzf5g",
};
let h;
before(async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.WASL_REQUIRE_ADMIN_MFA = "false";
  h = await createHarness();
});
after(async () => h?.close());
const status = (n) => (error) => error.status === n;
const post = (who, body) =>
  social.createSocialMessage(
    h.jsonRequest(
      "/api/social",
      { scope: "team", scopeId: "main", ...body },
      { cookie: h.cookies[who] },
    ),
  );
const get = (who, query = "scope=team&scopeId=main") =>
  social.listSocialMessages(
    h.getRequest(`/api/social?${query}`, h.cookies[who]),
  );
const mutate = (who, id, body, method = "PATCH") =>
  social.mutateSocialMessage(
    h.jsonRequest(`/api/social/${id}`, body || {}, {
      cookie: h.cookies[who],
      method,
    }),
    id,
  );
function oggPage(packet, sequence, type = 0) {
  const page = Buffer.alloc(28 + packet.length);
  page.write("OggS");
  page[5] = type;
  page.writeUInt32LE(7, 14);
  page.writeUInt32LE(sequence, 18);
  page[26] = 1;
  page[27] = packet.length;
  packet.copy(page, 28);
  return page;
}
function oggVoice(packets = 3) {
  const head = Buffer.alloc(19);
  head.write("OpusHead");
  head[8] = 1;
  head[9] = 1;
  head.writeUInt32LE(48000, 12);
  return Buffer.concat([
    oggPage(head, 0, 2),
    ...Array.from({ length: packets }, (_, i) =>
      oggPage(
        Buffer.from([0xf8, 0xff, 0xfe]),
        i + 1,
        i === packets - 1 ? 4 : 0,
      ),
    ),
  ]);
}
function voiceRequest(who, bytes = oggVoice(), duration = 0.06) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "audio/ogg;codecs=opus" }),
    "voice.ogg",
  );
  form.append("durationSeconds", String(duration));
  return new Request(`${h.ORIGIN}/api/social/voice`, {
    method: "POST",
    headers: { cookie: h.cookies[who], origin: h.ORIGIN },
    body: form,
  });
}

test("social endpoints require a live authenticated session and reject cross-site writes", async () => {
  await assert.rejects(
    social.listSocialMessages(h.getRequest("/api/social")),
    status(401),
  );
  await assert.rejects(
    social.createSocialMessage(
      h.jsonRequest(
        "/api/social",
        { text: "forged" },
        { cookie: h.cookies.noura, origin: "https://outside.example" },
      ),
    ),
    status(403),
  );
  await assert.rejects(
    realtime.openEventStream(h.getRequest("/api/events")),
    status(401),
  );
});

test("every context validates existing IDs and archived ideas preserve administrator access only", async () => {
  for (const body of [
    { scope: "idea", scopeId: "idea-003" },
    { scope: "company", scopeId: "hayyen" },
    { scope: "category", scopeId: "culture" },
    { scope: "workspace", scopeId: "main" },
  ]) {
    const result = await post("noura", { ...body, text: `نقاش ${body.scope}` });
    assert.equal(result.message.scopeId, body.scopeId);
    assert.equal(
      (await get("sara", `scope=${body.scope}&scopeId=${body.scopeId}`))
        .messages.length,
      1,
    );
  }
  await assert.rejects(
    post("noura", { scope: "workspace", scopeId: "private-room", text: "bad" }),
    status(422),
  );
  await assert.rejects(
    post("noura", { scope: "company", scopeId: "unknown", text: "bad" }),
    status(404),
  );
  await h.pg.query(
    "update wasl.ideas set deleted_at=now(),deleted_by='root' where id='idea-003'",
  );
  await assert.rejects(
    get("noura", "scope=idea&scopeId=idea-003"),
    status(404),
  );
  assert.equal(
    (await get("root", "scope=idea&scopeId=idea-003")).messages.length,
    1,
  );
  await assert.rejects(
    post("root", {
      scope: "idea",
      scopeId: "idea-003",
      text: "can't write deleted",
    }),
    status(404),
  );
  await h.pg.query(
    "update wasl.ideas set deleted_at=null,deleted_by=null where id='idea-003'",
  );
});

test("mentions and manager notices use authenticated actor identity and one notice per recipient", async () => {
  const { message } = await post("noura", {
    text: "مرحباً بالفريق @محمد",
    mentionIds: ["manager", "sara", "manager"],
  });
  const notices = (
    await h.pg.query(
      "select recipient_id,type::text,actor_id,actor_name,entity_type,entity_id,action from wasl.notifications where entity_id=$1",
      [message.id],
    )
  ).rows;
  assert.equal(
    new Set(notices.map((n) => n.recipient_id)).size,
    notices.length,
  );
  assert.equal(
    notices.find((n) => n.recipient_id === "manager").type,
    "mention",
  );
  assert.ok(
    notices.every(
      (n) =>
        n.actor_id === "noura" &&
        n.actor_name === h.data.members.find((m) => m.id === "noura").name &&
        n.entity_type === "chat" &&
        n.action === "chat_sent",
    ),
  );
  assert.ok(!notices.some((n) => n.recipient_id === "noura"));
  await assert.rejects(
    post("noura", { text: "inactive mention", mentionIds: ["not-a-member"] }),
    status(422),
  );
});

test("stable clientNonce prevents duplicate messages, voices and notifications on retry", async () => {
  const clientNonce = randomUUID(),
    input = { text: "إرسال يمكن إعادة محاولته", clientNonce };
  const first = await post("sara", input);
  const noticesBefore = Number(
    (
      await h.pg.query(
        "select count(*) as count from wasl.notifications where entity_id=$1",
        [first.message.id],
      )
    ).rows[0].count,
  );
  const repeat = await post("sara", input);
  assert.equal(repeat.message.id, first.message.id);
  assert.equal(
    Number(
      (
        await h.pg.query(
          "select count(*) as count from wasl.notifications where entity_id=$1",
          [first.message.id],
        )
      ).rows[0].count,
    ),
    noticesBefore,
  );
  await assert.rejects(
    post("sara", { ...input, text: "محتوى مختلف" }),
    status(409),
  );
  await assert.rejects(post("noura", input), status(409));
});

test("thread replies stay in their scope, preserve deleted roots, and forbid nested replies", async () => {
  const root = (await post("noura", { text: "بداية سلسلة الردود" })).message;
  const reply = (await post("sara", { text: "رد الفريق", parentId: root.id }))
    .message;
  assert.equal(
    (
      await social.getSocialMessage(
        h.getRequest(`/api/social/${root.id}`, h.cookies.sara),
        root.id,
      )
    ).message.replyCount,
    1,
  );
  assert.equal(
    (await get("sara", `scope=team&scopeId=main&parentId=${root.id}`))
      .messages[0].id,
    reply.id,
  );
  await assert.rejects(
    post("sara", { text: "رد متداخل", parentId: reply.id }),
    status(409),
  );
  await assert.rejects(
    post("sara", {
      scope: "company",
      scopeId: "hayyen",
      text: "مكان خاطئ",
      parentId: root.id,
    }),
    status(409),
  );
  await mutate("noura", root.id, null, "DELETE");
  const deleted = (
    await social.getSocialMessage(
      h.getRequest(`/api/social/${root.id}`, h.cookies.sara),
      root.id,
    )
  ).message;
  assert.equal(deleted.text, "");
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.replyCount, 1);
  assert.equal(
    (await get("sara", `scope=team&scopeId=main&parentId=${root.id}`))
      .messages[0].text,
    "رد الفريق",
  );
});

test("reactions toggle once per member and emoji; only administrator can pin and author or admin delete", async () => {
  const message = (await post("noura", { text: "رسالة للتفاعل والتثبيت" }))
    .message;
  assert.equal(
    (await mutate("sara", message.id, { operation: "reaction", emoji: "🎉" }))
      .message.reactions[0].count,
    1,
  );
  assert.equal(
    (await mutate("sara", message.id, { operation: "reaction", emoji: "🎉" }))
      .message.reactions.length,
    0,
  );
  await assert.rejects(
    mutate("sara", message.id, { operation: "reaction", emoji: "<script>" }),
    status(422),
  );
  await assert.rejects(
    mutate("manager", message.id, { operation: "pin", pinned: true }),
    status(403),
  );
  assert.ok(
    (await mutate("admin", message.id, { operation: "pin", pinned: true }))
      .message.pinnedAt,
  );
  assert.ok((await get("sara")).pinned.some((m) => m.id === message.id));
  await assert.rejects(mutate("sara", message.id, null, "DELETE"), status(403));
  assert.ok(
    (await mutate("root", message.id, null, "DELETE")).message.deletedAt,
  );
  assert.ok(!(await get("sara")).pinned.some((m) => m.id === message.id));
  await assert.rejects(
    mutate("sara", message.id, { operation: "reaction", emoji: "🎉" }),
    status(409),
  );
});

test("pinned messages have a durable per-context bound", async () => {
  for (let i = 0; i < 20; i++)
    await h.pg.query(
      "insert into wasl.social_messages(id,scope,scope_id,author_id,body,pinned_at,pinned_by) values($1,'workspace','main','root',$2,now(),'root')",
      [randomUUID(), `مثبت ${i}`],
    );
  const candidate = (
    await post("sara", {
      scope: "workspace",
      scopeId: "main",
      text: "رسالة إضافية",
    })
  ).message;
  await assert.rejects(
    mutate("root", candidate.id, { operation: "pin", pinned: true }),
    status(409),
  );
});

test("cursor pagination has no duplicates and search treats wildcard characters as literal text", async () => {
  const ids = [];
  for (let i = 0; i < 55; i++) {
    const id = randomUUID();
    ids.push(id);
    await h.pg.query(
      "insert into wasl.social_messages(id,scope,scope_id,author_id,body,created_at) values($1,'category','learning','noura',$2,$3::timestamptz)",
      [
        id,
        i === 12 ? "البحث عن 100%_نص" : `عنصر ${i}`,
        new Date(Date.now() + i).toISOString(),
      ],
    );
  }
  const first = await get("noura", "scope=category&scopeId=learning");
  assert.equal(first.messages.length, 50);
  assert.equal(first.more, true);
  assert.ok(first.nextCursor);
  const last = await get(
    "noura",
    `scope=category&scopeId=learning&before=${first.nextCursor}`,
  );
  assert.equal(last.messages.length, 5);
  assert.equal(last.more, false);
  assert.equal(
    new Set([...first.messages, ...last.messages].map((m) => m.id)).size,
    55,
  );
  assert.equal(
    (
      await get(
        "noura",
        `scope=category&scopeId=learning&q=${encodeURIComponent("100%_")}`,
      )
    ).messages.length,
    1,
  );
  await assert.rejects(get("noura", "before=invalid"), status(422));
});

test("real Opus WebM and Ogg, AAC MP4 and fragmented Safari-style AAC are accepted", () => {
  for (const [name, encoded] of Object.entries(ENCODED_VOICES)) {
    const data = Buffer.from(encoded, "base64"),
      metadata = social.inspectVoice(data, 0.5);
    assert.equal(
      metadata.mime,
      name.endsWith(".webm")
        ? "audio/webm"
        : name.endsWith(".ogg")
          ? "audio/ogg"
          : "audio/mp4",
    );
    assert.ok(metadata.durationSeconds > 0.4 && metadata.durationSeconds < 0.6);
    assert.ok(data.length < 2048);
  }
});

test("voice uploads validate real Opus duration, file size and safe audio containers", async () => {
  assert.equal(social.inspectVoice(oggVoice(), 0.06).mime, "audio/ogg");
  assert.equal(social.inspectVoice(oggVoice(), 0.06).durationSeconds, 0.06);
  await assert.rejects(
    social.uploadSocialVoice(
      voiceRequest("noura", Buffer.from("%PDF-1.4 not audio")),
    ),
    status(422),
  );
  await assert.rejects(
    social.uploadSocialVoice(
      voiceRequest("noura", Buffer.alloc(1024 * 1024 + 1)),
    ),
    status(413),
  );
  await assert.rejects(
    social.uploadSocialVoice(voiceRequest("noura", oggVoice(), 121)),
    status(422),
  );
  await assert.rejects(
    social.uploadSocialVoice(voiceRequest("noura", oggVoice(6100), 120)),
    status(422),
  );
});

test("voice drafts are private, protected playback supports ranges, and published audio is removed with its message", async () => {
  const uploaded = await social.uploadSocialVoice(voiceRequest("noura"));
  assert.equal(uploaded.voice.durationSeconds, 0.06);
  assert.ok(uploaded.voice.url.startsWith("/api/social/voice/"));
  await assert.rejects(
    social.downloadSocialVoice(
      h.getRequest(uploaded.voice.url, h.cookies.sara),
      uploaded.voice.id,
    ),
    status(403),
  );
  await assert.rejects(
    post("sara", { voiceId: uploaded.voice.id }),
    status(422),
  );
  const published = await post("noura", {
    voiceId: uploaded.voice.id,
    clientNonce: randomUUID(),
  });
  assert.equal(published.message.voice.id, uploaded.voice.id);
  assert.equal(
    (
      await social.downloadSocialVoice(
        h.getRequest(uploaded.voice.url, h.cookies.sara),
        uploaded.voice.id,
      )
    ).status,
    200,
  );
  const part = await social.downloadSocialVoice(
    new Request(`${h.ORIGIN}${uploaded.voice.url}`, {
      headers: { cookie: h.cookies.sara, range: "bytes=0-3" },
    }),
    uploaded.voice.id,
  );
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 4);
  await assert.rejects(
    post("noura", { voiceId: uploaded.voice.id }),
    status(422),
  );
  await assert.rejects(
    social.deleteSocialVoice(
      h.jsonRequest(
        uploaded.voice.url,
        {},
        { cookie: h.cookies.noura, method: "DELETE" },
      ),
      uploaded.voice.id,
    ),
    status(403),
  );
  await mutate("noura", published.message.id, null, "DELETE");
  await assert.rejects(
    social.downloadSocialVoice(
      h.getRequest(uploaded.voice.url, h.cookies.noura),
      uploaded.voice.id,
    ),
    status(404),
  );
  const row = (
    await h.pg.query(
      "select storage_key,removed_at from wasl.social_voices where id=$1",
      [uploaded.voice.id],
    )
  ).rows[0];
  assert.ok(row.removed_at);
  assert.ok(!fs.existsSync(path.join(h.temporary, "files", row.storage_key)));
});

test("discarding an unlinked recording deletes its private bytes and prevents later attachment", async () => {
  const { voice } = await social.uploadSocialVoice(voiceRequest("sara"));
  const deletion = h.jsonRequest(
    voice.url,
    {},
    { cookie: h.cookies.sara, method: "DELETE" },
  );
  await social.deleteSocialVoice(deletion, voice.id);
  await assert.rejects(post("sara", { voiceId: voice.id }), status(422));
  await assert.rejects(
    social.downloadSocialVoice(
      h.getRequest(voice.url, h.cookies.sara),
      voice.id,
    ),
    status(404),
  );
});

test("abandoned recordings are expired and pruned without deleting published audio", async () => {
  const draft = (await social.uploadSocialVoice(voiceRequest("sara"))).voice;
  await h.pg.query(
    "update wasl.social_voices set created_at=now()-interval '2 days' where id=$1",
    [draft.id],
  );
  const row = (
    await h.pg.query("select storage_key from wasl.social_voices where id=$1", [
      draft.id,
    ])
  ).rows[0];
  assert.equal(await social.pruneSocialVoiceDrafts(h.database), 1);
  assert.ok(!fs.existsSync(path.join(h.temporary, "files", row.storage_key)));
  await assert.rejects(
    social.downloadSocialVoice(
      h.getRequest(draft.url, h.cookies.sara),
      draft.id,
    ),
    status(404),
  );
});

test("social send rate limits are persisted and enforced across requests", async () => {
  await h.pg.query(
    "insert into wasl.social_rate_limits(member_id,kind,used) values('omar','message',90) on conflict(member_id,kind) do update set used=90,started_at=now()",
  );
  await assert.rejects(
    post("omar", { text: "Too many messages" }),
    status(429),
  );
  assert.equal(
    (
      await h.pg.query(
        "select used from wasl.social_rate_limits where member_id='omar' and kind='message'",
      )
    ).rows[0].used,
    91,
  );
});

test("SSE sends only durable change cursors across database writers and closes on abort", async () => {
  const abort = new AbortController();
  const request = new Request(`${h.ORIGIN}/api/events`, {
    headers: { cookie: h.cookies.sara },
    signal: abort.signal,
  });
  const response = await realtime.openEventStream(request, {
    pollMs: 5,
    heartbeatMs: 100,
  });
  assert.equal(
    response.headers.get("content-type"),
    "text/event-stream; charset=utf-8",
  );
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), /event: ready/);
  await h.pg.query(
    "update wasl.settings set organization_name=organization_name where id=true",
  );
  const next = await Promise.race([
    reader.read(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Missing database invalidation")),
        1000,
      ),
    ),
  ]);
  const event = decoder.decode(next.value);
  assert.match(event, /event: update/);
  assert.match(event, /"cursor":"\d+"/);
  assert.ok(
    !event.includes("organization") &&
      !event.includes("author") &&
      !event.includes("password"),
  );
  abort.abort();
  assert.equal((await reader.read()).done, true);
});

test("SSE rechecks session revisions and administrator MFA during an open connection", async () => {
  const request = new Request(`${h.ORIGIN}/api/events`, {
    headers: { cookie: h.cookies.faisal },
  });
  const response = await realtime.openEventStream(request, {
    pollMs: 5,
    heartbeatMs: 15,
  });
  const reader = response.body.getReader();
  await reader.read();
  await h.pg.query(
    "update wasl.accounts set auth_version=auth_version+1 where member_id='faisal'",
  );
  let closed = false;
  for (let i = 0; i < 5; i++) {
    const next = await Promise.race([
      reader.read(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Session stream not revoked")), 1000),
      ),
    ]);
    if (next.done) {
      closed = true;
      break;
    }
  }
  assert.equal(closed, true);
  process.env.WASL_REQUIRE_ADMIN_MFA = "true";
  await assert.rejects(
    realtime.openEventStream(h.getRequest("/api/events", h.cookies.root)),
    status(403),
  );
  process.env.WASL_REQUIRE_ADMIN_MFA = "false";
});

test("new social tables and cursor are private with forced RLS and no anon table grants", async () => {
  const rows = (
    await h.pg.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='wasl' and relname in ('social_messages','social_reactions','social_voices','change_cursor','operation_receipts')",
    )
  ).rows;
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
  const grants = (
    await h.pg.query(
      "select grantee from information_schema.role_table_grants where table_schema='wasl' and table_name='social_messages' and grantee in ('anon','authenticated','PUBLIC')",
    )
  ).rows;
  assert.equal(grants.length, 0);
});
