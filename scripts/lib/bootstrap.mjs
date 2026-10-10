import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(24);
  return `scrypt:${salt.toString("hex")}:${(await derive(password, salt, 64)).toString("hex")}`;
}

export function checkOwnerPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new Error("كلمة مرور المالك يجب أن تكون من 12 إلى 256 حرفاً.");
  if (new Set(password).size < 5) throw new Error("كلمة المرور سهلة التخمين. استخدم حروفاً ورموزاً متنوعة.");
}

export async function bootstrapRoot(db, { name, password, departmentName, organizationName, companies, categories }) {
  checkOwnerPassword(password);
  const existing = Number((await db.query("select count(*) as n from wasl.members")).rows[0].n);
  if (existing > 0) throw new Error("قاعدة البيانات تحتوي أعضاء بالفعل. التهيئة تعمل على قاعدة فارغة فقط، ولا تضيف بيانات تجريبية.");
  const ownerName = (name || "مالك النظام").trim();
  await db.query("begin");
  try {
    await db.query("insert into wasl.members (id, name, title, role, initials, color, active) values ('root', $1, '', 'superadmin', $2, '#4338ca', true)", [ownerName, ownerName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")]);
    await db.query("insert into wasl.accounts (member_id, username, password_hash) values ('root', 'root', $1)", [await hashPassword(password)]);
    for (const [index, company] of companies.entries()) await db.query("insert into wasl.companies (id, name, short_name, initials, color, sort_order) values ($1, $2, $3, $4, $5, $6)", [company.id, company.name, company.shortName, company.initials, company.color, index]);
    for (const category of categories) await db.query("insert into wasl.categories (id, name, color, target_per_month) values ($1, $2, $3, $4)", [category.id, category.name, category.color, category.targetPerMonth]);
    await db.query("insert into wasl.settings (id, department_name, organization_name) values (true, $1, $2) on conflict (id) do nothing", [departmentName || "إدارة التواصل الداخلي", organizationName || ""]);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
  return { username: "root", companies: companies.length, categories: categories.length, ideas: 0 };
}
