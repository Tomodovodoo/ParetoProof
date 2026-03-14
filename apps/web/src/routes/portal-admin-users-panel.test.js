import { describe, expect, it } from "bun:test";
import {
  getCompactAdminUsersSectionOrder,
  isSelectedAdminUserDetailCurrent,
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

describe("isSelectedAdminUserDetailCurrent", () => {
  it("returns false when the currently loaded detail belongs to a different user", () => {
    expect(
      isSelectedAdminUserDetailCurrent(
        {
          userId: "user-ada"
        },
        "user-lin"
      )
    ).toBe(false);
  });

  it("returns true when the loaded detail matches the active selection", () => {
    expect(
      isSelectedAdminUserDetailCurrent(
        {
          userId: "user-ada"
        },
        "user-ada"
      )
    ).toBe(true);
  });
});
