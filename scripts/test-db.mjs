import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const owner = `cropdoc_test_${randomUUID()}`;
const ids = [];
const claims = [];
function check(error) {
  if (error) throw new Error(error.message);
}
try {
  execFileSync(
    "supabase",
    ["db", "query", "--linked", "--file", "supabase/tests/isolation.sql"],
    { stdio: "pipe" },
  );
  console.log(
    "PASS: RLS, private Storage, field grants, ownership constraints, deletion, zero-cost SQL",
  );
  for (let n = 0; n < 6; n++) {
    const id = randomUUID();
    ids.push(id);
    check(
      (
        await db.from("inspections").insert({
          id,
          owner_id: owner,
          idempotency_key: randomUUID(),
          fingerprint: "test",
          image_count: 1,
          status: "ready",
        })
      ).error,
    );
    check(
      (
        await db.from("inspection_images").insert({
          inspection_id: id,
          owner_id: owner,
          path: `${owner}/${id}/0.jpg`,
          position: 0,
          width: 10,
          height: 10,
          bytes: 10,
        })
      ).error,
    );
  }
  const results = await Promise.all(
    ids.map((id) =>
      db.rpc("claim_openai_analysis", {
        p_owner: owner,
        p_id: id,
        p_retry: false,
      }),
    ),
  );
  results.forEach((r, i) => {
    if (r.data?.acquired)
      claims.push({ id: ids[i], attempt: r.data.attempt_id });
  });
  assert.equal(claims.length, 5);
  const attempts = await db
    .from("analysis_attempts")
    .select("provider,model,charged_microusd")
    .eq("owner_id", owner);
  check(attempts.error);
  assert.equal(attempts.data.length, 5);
  for (const attempt of attempts.data) {
    assert.equal(attempt.provider, "openai");
    assert.equal(attempt.model, "gpt-6-luna");
    assert.equal(attempt.charged_microusd, 50000);
  }
  assert.equal(
    results.filter((r) => r.error?.message.includes("DAILY_QUOTA")).length,
    1,
  );
  const duplicate = await db.rpc("claim_openai_analysis", {
    p_owner: owner,
    p_id: claims[0].id,
    p_retry: false,
  });
  check(duplicate.error);
  assert.equal(duplicate.data.acquired, false);
  console.log("PASS: concurrent daily quota and duplicate processing claim");
  const token = "test-" + randomUUID();
  const made = await db.rpc("create_device_token", {
    p_owner: owner,
    p_name: "Test device",
    p_hash: token,
    p_prefix: "test",
  });
  check(made.error);
  check(
    (
      await db
        .from("device_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", made.data)
    ).error,
  );
  const rejected = await db.rpc("prepare_inspection", {
    p_owner: owner,
    p_key: randomUUID(),
    p_fingerprint: "test",
    p_device: made.data,
    p_crop: "",
    p_location: "",
    p_notes: "",
    p_count: 1,
  });
  assert.match(rejected.error.message, /TOKEN_REVOKED/);
  console.log("PASS: revoked device cannot create uploads");
} finally {
  for (const c of claims)
    check(
      (
        await db.rpc("finish_openai_analysis", {
          p_owner: owner,
          p_id: c.id,
          p_attempt: c.attempt,
          p_report: null,
          p_error_code: "ANALYSIS_FAILED",
          p_error: "Test fixture; no provider call",
        })
      ).error,
    );
  if (ids.length)
    check(
      (
        await db
          .from("inspections")
          .delete()
          .in("id", ids)
          .eq("owner_id", owner)
      ).error,
    );
  for (const table of ["device_tokens", "daily_usage", "analysis_attempts"])
    check((await db.from(table).delete().eq("owner_id", owner)).error);
}
