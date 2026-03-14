import { describe, expect, it } from "bun:test";
import {
  getCompactAdminUsersSectionOrder,
  resolveSelectedAdminUserId
} from "./portal-admin-users-panel.tsx";

const adaUser = {
  userId: "user-ada"
};

const linUser = {
  userId: "user-lin"
};

describe("resolveSelectedAdminUserId", () => {
  it("keeps the current selection when it remains visible", () => {
    expect(
      resolveSelectedAdminUserId("user-ada", [
        adaUser,
        linUser
      ])
    ).toBe("user-ada");
  });

  it("switches to the first visible user when the current selection is filtered out", () => {
    expect(
      resolveSelectedAdminUserId("user-ada", [
        linUser
      ])
    ).toBe("user-lin");
  });

  it("clears the selection when the current filter slice is empty", () => {
    expect(resolveSelectedAdminUserId("user-ada", [])).toBeNull();
  });
});

describe("getCompactAdminUsersSectionOrder", () => {
  it("shows the directory before filters on compact layouts", () => {
    expect(getCompactAdminUsersSectionOrder()).toEqual([
      "userList",
      "filterFields"
    ]);
  });
});
