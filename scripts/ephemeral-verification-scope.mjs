export async function withEphemeralVerificationScope(admin, verify) {
  const userIds = [];
  const codes = [];
  const scope = {
    async createUser(email) {
      const result = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (result.error || !result.data?.user?.id) {
        throw new Error(`임시 검증 계정 생성 실패: ${result.error?.message ?? "user 없음"}`);
      }
      userIds.push(result.data.user.id);
      return result.data.user;
    },
    async createCodes(rows) {
      const result = await admin.from("invite_codes").insert(rows);
      if (result.error) throw new Error(`임시 베타 코드 생성 실패: ${result.error.message}`);
      codes.push(...rows.map(({ code }) => code));
    },
  };
  let result;
  let verificationError;
  try {
    result = await verify(scope);
  } catch (error) {
    verificationError = error;
  }

  // Never scan by email/code prefix. Other runs (including interrupted ones)
  // own their data. Only successful creates in this invocation are ours.
  const cleanup = [];
  if (codes.length) cleanup.push({
    label: "이번 실행의 베타 코드 삭제",
    run: () => admin.from("invite_codes").delete().in("code", codes),
  });
  for (const id of userIds) cleanup.push({
    label: `이번 실행의 임시 계정 ${id} 삭제`,
    run: () => admin.auth.admin.deleteUser(id),
  });
  const outcomes = await Promise.allSettled(cleanup.map(({ run }) => Promise.resolve().then(run)));
  const cleanupErrors = outcomes.flatMap((outcome, index) => {
    const error = outcome.status === "rejected" ? outcome.reason : outcome.value?.error;
    return error ? [new Error(`${cleanup[index].label}: ${error.message ?? String(error)}`)] : [];
  });
  if (cleanupErrors.length) {
    const errors = verificationError ? [verificationError, ...cleanupErrors] : cleanupErrors;
    throw new AggregateError(errors, errors.map(error => error.message ?? String(error)).join("; "));
  }
  if (verificationError) throw verificationError;
  return result;
}
