import { describe, expect, it, vi } from "vitest";
import { withEphemeralVerificationScope } from "./ephemeral-verification-scope.mjs";

function fixture() {
  const users = new Map([["existing", "ilgamcheck.verify.a+older@example.com"]]);
  const codes = new Set(["VERIFYA_OLDER", "VERIFYB_OTHER_RUN"]);
  let nextId = 0;
  const admin = {
    auth: { admin: {
      createUser: vi.fn(async ({ email }) => {
        const id = `created-${++nextId}`;
        users.set(id, email);
        return { data: { user: { id } }, error: null };
      }),
      deleteUser: vi.fn(async (id) => { users.delete(id); return { error: null }; }),
    } },
    from: vi.fn(() => ({
      insert: vi.fn(async (rows) => {
        rows.forEach(({ code }) => codes.add(code));
        return { error: null };
      }),
      delete: () => ({ in: async (column, values) => {
        expect(column).toBe("code");
        values.forEach((code) => codes.delete(code));
        return { error: null };
      } }),
    })),
  };
  return { admin, users, codes };
}

describe("ephemeral verification ownership", () => {
  it("cleans only users and codes created by this run, preserving older/concurrent runs", async () => {
    const { admin, users, codes } = fixture();
    const result = await withEphemeralVerificationScope(admin, async (scope) => {
      await scope.createUser("a@example.com");
      await scope.createUser("b@example.com");
      await scope.createCodes([{ code: "VERIFYA_THIS_RUN" }, { code: "VERIFYB_THIS_RUN" }]);
      return "verified";
    });
    expect(result).toBe("verified");
    expect([...users.keys()]).toEqual(["existing"]);
    expect([...codes]).toEqual(["VERIFYA_OLDER", "VERIFYB_OTHER_RUN"]);
    expect(admin.auth.admin.deleteUser.mock.calls).toEqual([["created-1"], ["created-2"]]);
  });

  it("cleans already-created users when later creation fails", async () => {
    const { admin, users } = fixture();
    admin.auth.admin.createUser.mockImplementationOnce(async ({ email }) => {
      users.set("partial", email);
      return { data: { user: { id: "partial" } }, error: null };
    }).mockResolvedValueOnce({ data: { user: null }, error: { message: "creation failed" } });
    await expect(withEphemeralVerificationScope(admin, async (scope) => {
      await scope.createUser("a@example.com");
      await scope.createUser("b@example.com");
    })).rejects.toThrow("creation failed");
    expect([...users.keys()]).toEqual(["existing"]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("never deletes a conflicting code when insertion fails", async () => {
    const { admin, codes } = fixture();
    admin.from.mockReturnValue({ insert: async () => ({ error: { message: "duplicate key" } }) });
    await expect(withEphemeralVerificationScope(admin, scope =>
      scope.createCodes([{ code: "VERIFYA_OLDER" }]),
    )).rejects.toThrow("duplicate key");
    expect([...codes]).toContain("VERIFYA_OLDER");
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it("attempts all cleanup and fails closed when code deletion rejects", async () => {
    const { admin, users } = fixture();
    admin.from.mockReturnValue({
      insert: async () => ({ error: null }),
      delete: () => ({ in: async () => { throw new Error("cleanup disconnected"); } }),
    });
    await expect(withEphemeralVerificationScope(admin, async (scope) => {
      await scope.createUser("a@example.com");
      await scope.createCodes([{ code: "VERIFYA_THIS_RUN" }]);
    })).rejects.toThrow("cleanup disconnected");
    expect([...users.keys()]).toEqual(["existing"]);
  });

  it("preserves both verification and cleanup errors", async () => {
    const { admin } = fixture();
    admin.auth.admin.deleteUser.mockResolvedValue({ error: { message: "delete failed" } });
    await expect(withEphemeralVerificationScope(admin, async (scope) => {
      await scope.createUser("a@example.com");
      throw new Error("verification failed");
    })).rejects.toThrow(/verification failed.*delete failed/);
  });
});
