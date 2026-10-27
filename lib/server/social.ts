import { createHash, randomUUID } from "node:crypto";
import type { TeamMember } from "@/data/media";
import {
  SOCIAL_EMOJIS,
  SOCIAL_VOICE_LIMIT_BYTES,
  SOCIAL_VOICE_LIMIT_SECONDS,
  type SocialContext,
  type SocialMessage,
  type SocialPage,
  type SocialVoice,
} from "@/data/social";
import { isAdministrator, requireAdministrator, requireUser } from "./auth";
import { deleteBlob, putBlob, readBlob } from "./blob-store";
import { database, type Queryable } from "./db";
import {
  assertSameOrigin,
  limitedBody,
  MediaServerError,
  readJson,
  responseHeaders,
} from "./http";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PAGE = 50;
type Row = Record<string, unknown>;
const iso = (value: unknown) =>
  value ? new Date(value as string).toISOString() : null;
function context(value: Record<string, unknown>): SocialContext {
  const scope = String(value.scope || "team"),
    scopeId = String(value.scopeId || "main");
  if (
    !["team", "idea", "company", "category", "workspace", "meeting"].includes(scope) ||
    (scope === "meeting" && !UUID.test(scopeId)) ||
    !ID.test(scopeId) ||
    (["team", "workspace"].includes(scope) && scopeId !== "main")
  )
    throw new MediaServerError(
      "اختر مساحة نقاش صالحة.",
      422,
      "INVALID_CONTEXT",
    );
  return { scope: scope as SocialContext["scope"], scopeId };
}
async function visibleContext(
  q: Queryable,
  location: SocialContext,
  actor: TeamMember,
  writing = false,
) {
  if (location.scope === "team" || location.scope === "workspace") return;
  if (location.scope === "meeting") {
    const meeting = (await q.query<Row>("select status from wasl.meetings where id=$1", [location.scopeId])).rows[0];
    if (!meeting) throw new MediaServerError("الاجتماع غير موجود.", 404, "CONTEXT_NOT_FOUND");
    if (writing && meeting.status === "cancelled") throw new MediaServerError("الاجتماع ملغى.", 409, "CONTEXT_ARCHIVED");
    return;
  }
  const table = { idea: "ideas", company: "companies", category: "categories" }[
    location.scope
  ];
  const row = (
    await q.query<Row>(
      `select id, ${location.scope === "idea" ? "deleted_at" : "active"} from wasl.${table} where id=$1`,
      [location.scopeId],
    )
  ).rows[0];
  if (
    !row ||
    (location.scope === "idea" &&
      row.deleted_at &&
      (!isAdministrator(actor) || writing))
  )
    throw new MediaServerError(
      "مساحة النقاش غير موجودة أو أُرشفت.",
      404,
      "CONTEXT_NOT_FOUND",
    );
  if (writing && location.scope !== "idea" && !row.active)
    throw new MediaServerError(
      "هذه الجهة مؤرشفة. يمكن الرجوع إلى النقاش السابق فقط.",
      409,
      "CONTEXT_ARCHIVED",
    );
}
async function reserveWrite(q: Queryable, actor: TeamMember, kind = "message") {
  const cap = kind === "voice" ? 15 : 90;
  const row = (
    await q.query<{ used: number }>(
      `insert into wasl.social_rate_limits(member_id,kind) values($1,$2)
    on conflict(member_id,kind) do update set used=case when wasl.social_rate_limits.started_at < now()-interval '1 minute' then 1 else wasl.social_rate_limits.used+1 end,
    started_at=case when wasl.social_rate_limits.started_at < now()-interval '1 minute' then now() else wasl.social_rate_limits.started_at end returning used`,
      [actor.id, kind],
    )
  ).rows[0];
  if (row.used > cap)
    throw new MediaServerError(
      "طلبات كثيرة خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.",
      429,
      "SOCIAL_RATE_LIMIT",
    );
}
const SELECT_MESSAGE = `select m.*,a.name as author_name,a.role::text as author_role,a.initials as author_initials,a.color as author_color,
  v.mime as voice_mime,v.size as voice_size,v.duration_seconds as voice_duration,v.removed_at as voice_removed,
  (select count(*)::integer from wasl.social_messages r where r.parent_id=m.id) as reply_count
  from wasl.social_messages m join wasl.members a on a.id=m.author_id left join wasl.social_voices v on v.id=m.voice_id`;
async function shapeMessages(
  q: Queryable,
  rows: Row[],
): Promise<SocialMessage[]> {
  if (!rows.length) return [];
  const reactions = (
    await q.query<{
      message_id: string;
      emoji: string;
      member_ids: string[];
      count: number;
    }>(
      "select message_id,emoji,array_agg(member_id order by member_id) as member_ids,count(*)::integer as count from wasl.social_reactions where message_id=any($1::uuid[]) group by message_id,emoji",
      [rows.map((row) => row.id)],
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    scope: row.scope as SocialContext["scope"],
    scopeId: String(row.scope_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name),
    authorRole: row.author_role as TeamMember["role"],
    authorInitials: String(row.author_initials),
    authorColor: String(row.author_color),
    text: row.deleted_at ? "" : String(row.body),
    mentions: row.deleted_at ? [] : (row.mention_ids as string[]),
    parentId: row.parent_id ? String(row.parent_id) : null,
    voice:
      row.voice_id && !row.deleted_at && !row.voice_removed
        ? {
            id: String(row.voice_id),
            mime: String(row.voice_mime),
            size: Number(row.voice_size),
            durationSeconds: Number(row.voice_duration),
            url: `/api/social/voice/${row.voice_id}`,
          }
        : null,
    createdAt: iso(row.created_at)!,
    deletedAt: iso(row.deleted_at),
    pinnedAt: iso(row.pinned_at),
    replyCount: Number(row.reply_count),
    reactions: row.deleted_at
      ? []
      : reactions
          .filter((reaction) => reaction.message_id === row.id)
          .map((reaction) => ({
            emoji: reaction.emoji,
            count: reaction.count,
            memberIds: reaction.member_ids,
          })),
  }));
}
async function messageById(q: Queryable, id: string): Promise<SocialMessage> {
  const row = (
    await q.query<Row>(`${SELECT_MESSAGE} where m.id=$1::uuid`, [id])
  ).rows;
  if (!row.length)
    throw new MediaServerError("الرسالة غير موجودة.", 404, "MESSAGE_NOT_FOUND");
  return (await shapeMessages(q, row))[0];
}
export async function getSocialMessage(request: Request, id: string) {
  if (!UUID.test(id))
    throw new MediaServerError("الرسالة غير موجودة.", 404, "MESSAGE_NOT_FOUND");
  const db = database(),
    actor = await requireUser(request, db);
  const message = await messageById(db, id);
  await visibleContext(db, message, actor);
  return { message };
}
function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    if (value.length > 300) throw new Error();
    const row = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof row.at !== "string" ||
      Number.isNaN(Date.parse(row.at)) ||
      !UUID.test(row.id)
    )
      throw new Error();
    return { at: new Date(row.at).toISOString(), id: row.id as string };
  } catch {
    throw new MediaServerError(
      "مؤشر الرسائل غير صالح. أعد فتح النقاش.",
      422,
      "INVALID_CURSOR",
    );
  }
}
export async function listSocialMessages(
  request: Request,
): Promise<SocialPage> {
  const db = database(),
    actor = await requireUser(request, db),
    params = new URL(request.url).searchParams;
  const location = context(Object.fromEntries(params));
  await visibleContext(db, location, actor);
  const cursor = decodeCursor(params.get("before")),
    parentId = params.get("parentId"),
    search = (params.get("q") || "").trim();
  if ((parentId && !UUID.test(parentId)) || search.length > 200)
    throw new MediaServerError(
      "بيانات البحث أو المحادثة غير صالحة.",
      422,
      "INVALID_SEARCH",
    );
  if (parentId) {
    const parent = await messageById(db, parentId);
    if (
      parent.scope !== location.scope ||
      parent.scopeId !== location.scopeId ||
      parent.parentId
    )
      throw new MediaServerError(
        "سلسلة الردود غير موجودة في هذه المساحة.",
        404,
        "THREAD_NOT_FOUND",
      );
  }
  const values: unknown[] = [location.scope, location.scopeId];
  let where = "m.scope=$1 and m.scope_id=$2";
  if (parentId) {
    values.push(parentId);
    where += ` and m.parent_id=$${values.length}::uuid`;
  } else where += " and m.parent_id is null";
  if (cursor) {
    values.push(cursor.at, cursor.id);
    where += ` and (m.created_at,m.id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`;
  }
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    where += ` and m.deleted_at is null and m.body ilike $${values.length}`;
  }
  values.push(PAGE + 1);
  const rows = (
    await db.query<Row>(
      `${SELECT_MESSAGE} where ${where} order by m.created_at desc,m.id desc limit $${values.length}`,
      values,
    )
  ).rows;
  const page = rows.slice(0, PAGE),
    last = page.at(-1);
  const pinnedRows = (
    await db.query<Row>(
      `${SELECT_MESSAGE} where m.scope=$1 and m.scope_id=$2 and m.parent_id is null and m.pinned_at is not null and m.deleted_at is null order by m.pinned_at desc limit 20`,
      [location.scope, location.scopeId],
    )
  ).rows;
  return {
    messages: (await shapeMessages(db, page)).reverse(),
    pinned: await shapeMessages(db, pinnedRows),
    more: rows.length > PAGE,
    nextCursor:
      rows.length > PAGE && last
        ? Buffer.from(
            JSON.stringify({ at: iso(last.created_at), id: last.id }),
          ).toString("base64url")
        : null,
  };
}
async function notifySocial(
  q: Queryable,
  actor: TeamMember,
  message: SocialMessage,
  action: string,
  extra: string[] = [],
) {
  let participants: string[] = [];
  if (
    action === "sent" &&
    (message.scope === "team" || message.scope === "workspace")
  )
    participants = (
      await q.query<{ id: string }>(
        "select id from wasl.members where active=true",
      )
    ).rows.map((row) => row.id);
  else if (message.scope === "idea") {
    const idea = (
      await q.query<{ owner_id: string; designer_id: string | null }>(
        "select owner_id,designer_id from wasl.ideas where id=$1",
        [message.scopeId],
      )
    ).rows[0];
    if (idea)
      participants = [
        idea.owner_id,
        ...(idea.designer_id ? [idea.designer_id] : []),
      ];
  }
  const recipients = (
    await q.query<{ id: string }>(
      "select id from wasl.members where active=true and id<>$1 and (role in ('manager','admin','superadmin') or id=any($2::text[]))",
      [
        actor.id,
        [
          ...new Set([
            ...participants,
            ...extra,
            message.authorId,
            ...(action === "sent" ? message.mentions : []),
          ]),
        ],
      ],
    )
  ).rows;
  const titles: Record<string, string> = {
    sent: "رسالة جديدة",
    reaction: "تفاعل مع رسالة",
    pinned: "رسالة مثبتة",
    unpinned: "إلغاء تثبيت رسالة",
    deleted: "حذف رسالة",
  };
  for (const recipient of recipients) {
    if (message.scope === "meeting" && !(action === "sent" && message.mentions.includes(recipient.id))) continue;
    const mention =
      action === "sent" && message.mentions.includes(recipient.id);
    const text =
      action === "sent"
        ? message.text.slice(0, 240) || "رسالة صوتية"
        : titles[action];
    await q.query(
      `insert into wasl.notifications(id,recipient_id,idea_id,type,title,body,actor_id,actor_name,entity_type,entity_id,action)
      values($1,$2,$3,$4::wasl.notification_type,$5,$6,$7,$8,'chat',$9,$10)`,
      [
        randomUUID(),
        recipient.id,
        message.scope === "idea" ? message.scopeId : null,
        mention ? "mention" : action === "sent" ? "chat" : "activity",
        mention ? "أشار إليك في النقاش" : titles[action],
        `${actor.name} — ${text}`,
        actor.id,
        actor.name,
        message.id,
        `chat_${action}`,
      ],
    );
  }
}
export async function createSocialMessage(request: Request) {
  assertSameOrigin(request);
  const db = database(),
    actor = await requireUser(request, db),
    input = (await readJson(request, 16 * 1024)) as Record<string, unknown>;
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new MediaServerError(
      "بيانات الرسالة غير صالحة.",
      422,
      "INVALID_MESSAGE",
    );
  const location = context(input),
    text = typeof input.text === "string" ? input.text.trim() : "",
    voiceId = input.voiceId ? String(input.voiceId) : null,
    parentId = input.parentId ? String(input.parentId) : null;
  const mentions = Array.isArray(input.mentionIds)
    ? [...new Set(input.mentionIds)]
    : [];
  const nonce =
    input.clientNonce === undefined ? null : String(input.clientNonce);
  if (
    text.length > 4000 ||
    text.includes("\0") ||
    (!text && !voiceId) ||
    (voiceId && !UUID.test(voiceId)) ||
    (parentId && !UUID.test(parentId)) ||
    mentions.length > 30 ||
    (input.mentionIds !== undefined && !Array.isArray(input.mentionIds)) ||
    mentions.some((id) => typeof id !== "string" || !ID.test(id)) ||
    (nonce !== null && !UUID.test(nonce))
  )
    throw new MediaServerError(
      "أرسل نصاً حتى ٤٠٠٠ حرف أو رسالة صوتية صالحة.",
      422,
      "INVALID_MESSAGE",
    );
  await reserveWrite(db, actor);
  return db.transaction(async (tx) => {
    await visibleContext(tx, location, actor, true);
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          "socialMessage",
          location,
          text,
          voiceId,
          parentId,
          [...mentions].sort(),
        ]),
      )
      .digest("hex");
    if (nonce) {
      await tx.query(
        "insert into wasl.operation_receipts(request_id,actor_id,request_hash) values($1::uuid,$2,$3) on conflict(request_id) do nothing",
        [nonce, actor.id, hash],
      );
      const receipt = (
        await tx.query<{
          actor_id: string;
          request_hash: string;
          result: { socialMessageId?: string } | null;
        }>(
          "select actor_id,request_hash,result from wasl.operation_receipts where request_id=$1::uuid for update",
          [nonce],
        )
      ).rows[0];
      if (receipt.actor_id !== actor.id || receipt.request_hash !== hash)
        throw new MediaServerError(
          "معرّف إرسال مستخدم لرسالة مختلفة. ابدأ إرسالاً جديداً.",
          409,
          "REQUEST_ID_CONFLICT",
        );
      if (receipt.result?.socialMessageId)
        return {
          message: await messageById(tx, receipt.result.socialMessageId),
        };
    }
    if (parentId) {
      const parent = await messageById(tx, parentId);
      if (
        parent.scope !== location.scope ||
        parent.scopeId !== location.scopeId ||
        parent.parentId ||
        parent.deletedAt
      )
        throw new MediaServerError(
          "لا يمكن الرد على هذه الرسالة في المساحة الحالية.",
          409,
          "INVALID_THREAD",
        );
    }
    if (mentions.length) {
      const active = (
        await tx.query<{ id: string }>(
          "select id from wasl.members where active=true and id=any($1::text[])",
          [mentions],
        )
      ).rows;
      if (active.length !== mentions.length)
        throw new MediaServerError(
          "أحد الأشخاص المشار إليهم غير مفعّل.",
          422,
          "INVALID_MENTION",
        );
    }
    if (voiceId) {
      const voice = (
        await tx.query<Row>(
          "select owner_id,linked_at,removed_at,created_at from wasl.social_voices where id=$1::uuid for update",
          [voiceId],
        )
      ).rows[0];
      if (
        !voice ||
        voice.owner_id !== actor.id ||
        voice.linked_at ||
        voice.removed_at ||
        Date.now() - new Date(String(voice.created_at)).getTime() > 86400000
      )
        throw new MediaServerError(
          "المقطع الصوتي غير صالح أو استُخدم سابقاً. سجله مجدداً.",
          422,
          "INVALID_VOICE",
        );
    }
    const id = randomUUID();
    await tx.query(
      "insert into wasl.social_messages(id,scope,scope_id,author_id,body,mention_ids,parent_id,voice_id) values($1::uuid,$2,$3,$4,$5,$6::text[],$7::uuid,$8::uuid)",
      [
        id,
        location.scope,
        location.scopeId,
        actor.id,
        text,
        mentions,
        parentId,
        voiceId,
      ],
    );
    if (voiceId)
      await tx.query(
        "update wasl.social_voices set linked_at=now() where id=$1::uuid",
        [voiceId],
      );
    const message = await messageById(tx, id);
    const parentAuthor = parentId
      ? (await messageById(tx, parentId)).authorId
      : null;
    await notifySocial(
      tx,
      actor,
      message,
      "sent",
      parentAuthor ? [parentAuthor] : [],
    );
    if (nonce)
      await tx.query(
        "update wasl.operation_receipts set result=$2::jsonb where request_id=$1::uuid",
        [nonce, JSON.stringify({ socialMessageId: id })],
      );
    return { message };
  });
}
export async function mutateSocialMessage(request: Request, id: string) {
  assertSameOrigin(request);
  if (!UUID.test(id))
    throw new MediaServerError("الرسالة غير موجودة.", 404, "MESSAGE_NOT_FOUND");
  const db = database(),
    actor = await requireUser(request, db),
    input =
      request.method === "DELETE"
        ? null
        : ((await readJson(request, 4096)) as Record<string, unknown>);
  await reserveWrite(db, actor, "interaction");
  let removedBlob: { storage: string; key: string } | null = null;
  const result = await db.transaction(async (tx) => {
    const row = (
      await tx.query<Row>(
        "select * from wasl.social_messages where id=$1::uuid for update",
        [id],
      )
    ).rows[0];
    if (!row)
      throw new MediaServerError(
        "الرسالة غير موجودة.",
        404,
        "MESSAGE_NOT_FOUND",
      );
    const message = await messageById(tx, id);
    await visibleContext(tx, message, actor);
    let action: string;
    if (request.method === "DELETE") {
      if (message.authorId !== actor.id && !isAdministrator(actor))
        throw new MediaServerError(
          "يمكن لصاحب الرسالة أو مدير النظام حذفها فقط.",
          403,
          "MESSAGE_PERMISSION",
        );
      if (isAdministrator(actor)) requireAdministrator(actor);
      if (message.deletedAt) return { message };
      await tx.query(
        "update wasl.social_messages set deleted_at=now(),deleted_by=$2,pinned_at=null,pinned_by=null where id=$1::uuid",
        [id, actor.id],
      );
      if (row.voice_id) {
        const voice = (
          await tx.query<Row>(
            "update wasl.social_voices set removed_at=now() where id=$1::uuid returning storage,storage_key",
            [row.voice_id],
          )
        ).rows[0];
        if (voice)
          removedBlob = {
            storage: String(voice.storage),
            key: String(voice.storage_key),
          };
      }
      action = "deleted";
    } else {
      if (message.deletedAt)
        throw new MediaServerError(
          "هذه الرسالة محذوفة.",
          409,
          "MESSAGE_DELETED",
        );
      if (input?.operation === "reaction") {
        const emoji = String(input.emoji || "");
        if (!(SOCIAL_EMOJIS as readonly string[]).includes(emoji))
          throw new MediaServerError(
            "اختر تفاعلاً متاحاً.",
            422,
            "INVALID_REACTION",
          );
        const deleted = (
          await tx.query(
            "delete from wasl.social_reactions where message_id=$1::uuid and member_id=$2 and emoji=$3 returning message_id",
            [id, actor.id, emoji],
          )
        ).rows;
        if (!deleted.length)
          await tx.query(
            "insert into wasl.social_reactions(message_id,member_id,emoji) values($1::uuid,$2,$3)",
            [id, actor.id, emoji],
          );
        action = "reaction";
      } else if (
        input?.operation === "pin" &&
        typeof input.pinned === "boolean"
      ) {
        requireAdministrator(actor);
        if (message.parentId)
          throw new MediaServerError(
            "ثبّت الرسالة الأساسية للسلسلة.",
            422,
            "INVALID_PIN",
          );
        if (Boolean(message.pinnedAt) === input.pinned) return { message };
        if (input.pinned) {
          await tx.query(
            "select id from wasl.change_cursor where id=true for update",
          );
          const count = Number(
            (
              await tx.query<{ count: string }>(
                "select count(*) as count from wasl.social_messages where scope=$1 and scope_id=$2 and pinned_at is not null and deleted_at is null",
                [message.scope, message.scopeId],
              )
            ).rows[0].count,
          );
          if (count >= 20)
            throw new MediaServerError(
              "الحد الأقصى ٢٠ رسالة مثبتة في المساحة. ألغ تثبيت رسالة أولاً.",
              409,
              "PIN_LIMIT",
            );
        }
        await tx.query(
          "update wasl.social_messages set pinned_at=case when $2 then now() else null end,pinned_by=case when $2 then $3 else null end where id=$1::uuid",
          [id, input.pinned, actor.id],
        );
        action = input.pinned ? "pinned" : "unpinned";
      } else
        throw new MediaServerError(
          "إجراء الرسالة غير صالح.",
          422,
          "INVALID_MESSAGE_OPERATION",
        );
    }
    const updated = await messageById(tx, id);
    await notifySocial(tx, actor, message, action);
    return { message: updated };
  });
  if (removedBlob) {
    const blob = removedBlob as { storage: string; key: string };
    await deleteBlob(blob.storage, blob.key);
  }
  return result;
}

function opusDuration(packet: Uint8Array) {
  if (!packet.length)
    throw new MediaServerError(
      "المقطع الصوتي غير مكتمل.",
      422,
      "INVALID_AUDIO",
    );
  const config = packet[0] >> 3,
    code = packet[0] & 3;
  const frame =
    config >= 16
      ? [2.5, 5, 10, 20][config & 3]
      : config >= 12
        ? [10, 20][config & 1]
        : [10, 20, 40, 60][config & 3];
  const count = code === 0 ? 1 : code === 3 ? (packet[1] || 0) & 63 : 2;
  if (!count || frame * count > 120)
    throw new MediaServerError(
      "ترميز المقطع الصوتي غير صالح.",
      422,
      "INVALID_AUDIO",
    );
  return (frame * count) / 1000;
}
function audioError(): never {
  throw new MediaServerError(
    "ارفع تسجيلاً صوتياً مضغوطاً بصيغة Opus WebM أو Ogg، أو AAC MP4.",
    422,
    "INVALID_AUDIO",
  );
}
function oggDuration(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  let offset = 0,
    head = false,
    total = 0,
    packet: number[] = [],
    serial: number | undefined,
    packets = 0;
  while (offset < b.length) {
    if (
      offset + 27 > b.length ||
      b.subarray(offset, offset + 4).toString() !== "OggS" ||
      b[offset + 4] !== 0
    )
      audioError();
    const currentSerial = b.readUInt32LE(offset + 14);
    if (serial !== undefined && serial !== currentSerial) audioError();
    serial = currentSerial;
    const segments = b[offset + 26],
      start = offset + 27,
      end = start + segments;
    if (end > b.length) audioError();
    let at = end;
    for (let i = 0; i < segments; i++) {
      const length = b[start + i];
      if (at + length > b.length) audioError();
      for (const value of b.subarray(at, at + length)) packet.push(value);
      at += length;
      if (packet.length > 65536) audioError();
      if (length < 255) {
        const p = Uint8Array.from(packet);
        const signature = Buffer.from(p.subarray(0, 8)).toString();
        if (!head) {
          if (signature !== "OpusHead" || p.length < 19 || p[9] < 1 || p[9] > 2)
            audioError();
          head = true;
        } else if (signature !== "OpusTags") {
          total += opusDuration(p);
          packets++;
        }
        packet = [];
      }
    }
    offset = at;
  }
  if (!head || packet.length || !packets) audioError();
  return total;
}
function vint(b: Buffer, at: number, id = false) {
  if (at >= b.length || b[at] === 0) audioError();
  let length = 1,
    mask = 128;
  while (!(b[at] & mask)) {
    length++;
    mask >>= 1;
  }
  if (length > 8 || at + length > b.length) audioError();
  let value = id ? b[at] : b[at] & (mask - 1),
    unknown = !id && (b[at] & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[at + i];
    unknown = unknown && b[at + i] === 255;
  }
  if (!Number.isSafeInteger(value) && !unknown) audioError();
  return { length, value, unknown };
}
function webmDuration(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  let scale = 1000000,
    cluster = 0,
    min = Infinity,
    max = 0,
    opus = false,
    audioTracks = 0,
    elements = 0;
  const uint = (start: number, end: number) => {
    let n = 0;
    if (end - start > 8) audioError();
    for (let i = start; i < end; i++) n = n * 256 + b[i];
    return n;
  };
  const walk = (start: number, end: number, depth: number) => {
    if (depth > 10) audioError();
    let at = start;
    while (at < end) {
      if (++elements > 30000) audioError();
      const tag = vint(b, at, true);
      at += tag.length;
      const size = vint(b, at);
      at += size.length;
      const next = size.unknown ? end : at + size.value;
      if (next > end || next <= at) audioError();
      if (tag.value === 0x2ad7b1) scale = uint(at, next);
      else if (tag.value === 0xe7) cluster = uint(at, next);
      else if (tag.value === 0x83) {
        if (uint(at, next) !== 2) audioError();
        audioTracks++;
      } else if (tag.value === 0x86) {
        if (b.subarray(at, next).toString() !== "A_OPUS") audioError();
        opus = true;
      } else if (tag.value === 0x9f) {
        const channels = uint(at, next);
        if (channels < 1 || channels > 2) audioError();
      } else if (tag.value === 0xa3 || tag.value === 0xa1) {
        const track = vint(b, at);
        const block = at + track.length;
        if (block + 3 >= next || (b[block + 2] & 6) !== 0) audioError();
        const time = ((cluster + b.readInt16BE(block)) * scale) / 1e9;
        const duration = opusDuration(b.subarray(block + 3, next));
        min = Math.min(min, time);
        max = Math.max(max, time + duration);
      } else if (
        [
          0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe1,
          0x1f43b675, 0xa0,
        ].includes(tag.value)
      )
        walk(at, next, depth + 1);
      at = next;
    }
  };
  walk(0, b.length, 0);
  if (
    !opus ||
    audioTracks !== 1 ||
    !Number.isFinite(min) ||
    scale <= 0 ||
    max <= min
  )
    audioError();
  return max - min;
}
function mp4Duration(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  let duration = 0,
    sound = 0,
    video = false,
    aac = false,
    elements = 0,
    timeScale = 0,
    fragmentTicks = 0,
    defaultDuration = 0,
    trackDefaultDuration = 0;
  const walk = (start: number, end: number, depth: number) => {
    if (depth > 10) audioError();
    let at = start;
    while (at + 8 <= end) {
      if (++elements > 10000) audioError();
      let size = b.readUInt32BE(at),
        header = 8;
      const name = b.subarray(at + 4, at + 8).toString();
      if (size === 1) {
        if (at + 16 > end) audioError();
        size = Number(b.readBigUInt64BE(at + 8));
        header = 16;
      }
      if (size === 0) size = end - at;
      if (size < header || at + size > end || !Number.isSafeInteger(size))
        audioError();
      const body = at + header,
        next = at + size;
      if (name === "hdlr") {
        if (body + 12 > next) audioError();
        const kind = b.subarray(body + 8, body + 12).toString();
        if (kind === "soun") sound++;
        else if (kind === "vide") video = true;
      }
      if (name === "mdhd") {
        const version = b[body],
          scaleAt = body + (version === 1 ? 20 : 12),
          durationAt = scaleAt + 4;
        if (durationAt + (version === 1 ? 8 : 4) > next) audioError();
        const scale = b.readUInt32BE(scaleAt),
          ticks =
            version === 1
              ? Number(b.readBigUInt64BE(durationAt))
              : b.readUInt32BE(durationAt);
        if (!scale || !Number.isSafeInteger(ticks)) audioError();
        timeScale = scale;
        duration = Math.max(duration, ticks / scale);
      }
      if (name === "stsd") {
        if (body + 16 > next) audioError();
        aac = b.subarray(body + 12, body + 16).toString() === "mp4a";
      }
      // Safari may record fragmented AAC: mdhd is zero and trun carries sample duration.
      if (name === "trex") {
        if (body + 20 > next) audioError();
        trackDefaultDuration = b.readUInt32BE(body + 12);
      }
      if (name === "tfhd") {
        if (body + 8 > next) audioError();
        const flags = b.readUIntBE(body + 1, 3);
        let position = body + 8;
        if (flags & 1) position += 8;
        if (flags & 2) position += 4;
        defaultDuration = trackDefaultDuration;
        if (flags & 8) {
          if (position + 4 > next) audioError();
          defaultDuration = b.readUInt32BE(position);
        }
      }
      if (name === "trun") {
        if (body + 8 > next) audioError();
        const flags = b.readUIntBE(body + 1, 3),
          count = b.readUInt32BE(body + 4);
        if (count > 10000) audioError();
        let position = body + 8;
        if (flags & 1) position += 4;
        if (flags & 4) position += 4;
        for (let sample = 0; sample < count; sample++) {
          let ticks = defaultDuration;
          if (flags & 0x100) {
            if (position + 4 > next) audioError();
            ticks = b.readUInt32BE(position);
            position += 4;
          }
          if (flags & 0x200) position += 4;
          if (flags & 0x400) position += 4;
          if (flags & 0x800) position += 4;
          if (!ticks || position > next) audioError();
          fragmentTicks += ticks;
        }
      }
      if (
        [
          "moov",
          "trak",
          "mdia",
          "minf",
          "stbl",
          "mvex",
          "moof",
          "traf",
        ].includes(name)
      )
        walk(body, next, depth + 1);
      at = next;
    }
  };
  walk(0, b.length, 0);
  if (fragmentTicks && timeScale)
    duration = Math.max(duration, fragmentTicks / timeScale);
  if (sound !== 1 || video || !aac || !duration) audioError();
  return duration;
}
export function inspectVoice(
  bytes: Uint8Array,
  claimed: number,
): { mime: string; durationSeconds: number } {
  const b = Buffer.from(bytes);
  let mime: string, duration: number;
  if (b.subarray(0, 4).toString() === "OggS") {
    mime = "audio/ogg";
    duration = oggDuration(bytes);
  } else if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) {
    mime = "audio/webm";
    duration = webmDuration(bytes);
  } else if (b.subarray(4, 8).toString() === "ftyp") {
    mime = "audio/mp4";
    duration = mp4Duration(bytes);
  } else return audioError();
  if (
    !Number.isFinite(claimed) ||
    claimed <= 0 ||
    claimed > SOCIAL_VOICE_LIMIT_SECONDS ||
    duration <= 0 ||
    duration > SOCIAL_VOICE_LIMIT_SECONDS + 0.25 ||
    Math.abs(duration - claimed) > Math.max(2, claimed * 0.05)
  )
    throw new MediaServerError(
      "يجب أن يكون التسجيل حتى دقيقتين وأن تطابق مدته الملف المرسل.",
      422,
      "VOICE_DURATION",
    );
  return {
    mime,
    durationSeconds: Math.min(
      SOCIAL_VOICE_LIMIT_SECONDS,
      Math.round(duration * 1000) / 1000,
    ),
  };
}
export async function uploadSocialVoice(request: Request) {
  assertSameOrigin(request);
  const db = database(),
    actor = await requireUser(request, db);
  await reserveWrite(db, actor, "voice");
  await pruneSocialVoiceDrafts(db);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data"))
    throw new MediaServerError(
      "اختر التسجيل الصوتي.",
      415,
      "INVALID_CONTENT_TYPE",
    );
  const bytes = await limitedBody(
    request,
    SOCIAL_VOICE_LIMIT_BYTES + 64 * 1024,
  );
  let form: FormData;
  try {
    form = await new Response(bytes as BodyInit, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new MediaServerError(
      "تعذّر قراءة التسجيل الصوتي.",
      422,
      "INVALID_AUDIO",
    );
  }
  const file = form.get("file");
  if (
    !file ||
    typeof file === "string" ||
    form.getAll("file").length !== 1 ||
    file.size < 1 ||
    file.size > SOCIAL_VOICE_LIMIT_BYTES
  )
    throw new MediaServerError(
      "حجم التسجيل يجب ألا يتجاوز ١ ميجابايت.",
      413,
      "VOICE_TOO_LARGE",
    );
  const audio = new Uint8Array(await file.arrayBuffer()),
    metadata = inspectVoice(audio, Number(form.get("durationSeconds"))),
    id = randomUUID();
  const stored = await putBlob(id, audio, metadata.mime);
  try {
    await db.query(
      "insert into wasl.social_voices(id,owner_id,mime,size,duration_seconds,storage,storage_key,sha256) values($1::uuid,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        actor.id,
        metadata.mime,
        audio.length,
        metadata.durationSeconds,
        stored.storage,
        stored.key,
        createHash("sha256").update(audio).digest("hex"),
      ],
    );
  } catch (error) {
    await deleteBlob(stored.storage, stored.key);
    throw error;
  }
  const voice: SocialVoice = {
    id,
    ...metadata,
    size: audio.length,
    url: `/api/social/voice/${id}`,
  };
  return { voice };
}
/** Bounded cleanup removes abandoned recordings after a day, including their private bytes. */
export async function pruneSocialVoiceDrafts(db = database()) {
  const expired = await db.transaction(async (tx) => {
    const rows = (
      await tx.query<Row>(
        "select id,storage,storage_key from wasl.social_voices where linked_at is null and created_at<now()-interval '1 day' order by created_at limit 20 for update skip locked",
      )
    ).rows;
    if (rows.length)
      await tx.query(
        "update wasl.social_voices set removed_at=coalesce(removed_at,now()) where id=any($1::uuid[])",
        [rows.map((row) => row.id)],
      );
    return rows;
  });
  for (const row of expired) {
    await deleteBlob(String(row.storage), String(row.storage_key));
    await db.query(
      "delete from wasl.social_voices where id=$1::uuid and linked_at is null and removed_at is not null",
      [row.id],
    );
  }
  return expired.length;
}
export async function downloadSocialVoice(request: Request, id: string) {
  if (!UUID.test(id))
    throw new MediaServerError("التسجيل غير موجود.", 404, "VOICE_NOT_FOUND");
  const db = database(),
    actor = await requireUser(request, db);
  const row = (
    await db.query<Row>(
      "select v.*,m.scope,m.scope_id,m.deleted_at as message_deleted from wasl.social_voices v left join wasl.social_messages m on m.voice_id=v.id where v.id=$1::uuid and v.removed_at is null",
      [id],
    )
  ).rows[0];
  if (!row || row.message_deleted)
    throw new MediaServerError("التسجيل غير موجود.", 404, "VOICE_NOT_FOUND");
  if (row.scope)
    await visibleContext(
      db,
      {
        scope: row.scope as SocialContext["scope"],
        scopeId: String(row.scope_id),
      },
      actor,
    );
  else if (row.owner_id !== actor.id)
    throw new MediaServerError(
      "لا يمكن فتح مسودة تسجيل مستخدم آخر.",
      403,
      "VOICE_PERMISSION",
    );
  const bytes = await readBlob(String(row.storage), String(row.storage_key));
  const headers = {
    ...responseHeaders,
    "Content-Type": String(row.mime),
    "Content-Disposition": 'inline; filename="voice"',
    "Accept-Ranges": "bytes",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };
  const match = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
  if (match) {
    const start = Number(match[1]),
      end = Math.min(
        match[2] ? Number(match[2]) : bytes.length - 1,
        bytes.length - 1,
      );
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= bytes.length ||
      end < start
    )
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
      });
    const part = bytes.subarray(start, end + 1);
    return new Response(part as BodyInit, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.length),
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      },
    });
  }
  return new Response(bytes as BodyInit, {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
export async function deleteSocialVoice(request: Request, id: string) {
  assertSameOrigin(request);
  if (!UUID.test(id))
    throw new MediaServerError("التسجيل غير موجود.", 404, "VOICE_NOT_FOUND");
  const db = database(),
    actor = await requireUser(request, db);
  const row = await db.transaction(async (tx) => {
    const voice = (
      await tx.query<Row>(
        "select * from wasl.social_voices where id=$1::uuid for update",
        [id],
      )
    ).rows[0];
    if (!voice || voice.owner_id !== actor.id || voice.linked_at)
      throw new MediaServerError(
        "يمكن حذف مسودة التسجيل الخاصة بك فقط. احذف الرسالة لإزالة تسجيل منشور.",
        403,
        "VOICE_PERMISSION",
      );
    if (!voice.removed_at)
      await tx.query(
        "update wasl.social_voices set removed_at=now() where id=$1::uuid",
        [id],
      );
    return voice;
  });
  await deleteBlob(String(row.storage), String(row.storage_key));
  return { deleted: true };
}
